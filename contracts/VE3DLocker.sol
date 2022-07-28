// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./helper/MathUtil.sol";
import "./helper/BoringMath.sol";
import "./helper/DecimalsConverter.sol";

import "./Interfaces/IVeAssetDeposit.sol";
import "./Interfaces/IRewards.sol";

/*
VE3D Locking contract for https://www.convexfinance.com/
VE3D locked in this contract will be entitled to voting rights for the Vetoken Finance platform
Based on EPS Staking contract for http://ellipsis.finance/
Based on SNX MultiRewards by iamdefinitelyahuman - https://github.com/iamdefinitelyahuman/multi-rewards

V2:
- change locking mechanism to lock to a future epoch instead of current
- pending lock getter
- relocking allocates weight to the current epoch instead of future,
    thus allows keeping voting weight in the same epoch a lock expires by relocking before a vote begins
- balanceAtEpoch and supplyAtEpoch return proper values for future epochs
- do not allow relocking directly to a new address
*/
contract VE3DLocker is ReentrancyGuardUpgradeable, OwnableUpgradeable {
    using BoringMath for uint256;
    using BoringMath224 for uint224;
    using BoringMath112 for uint112;
    using BoringMath32 for uint32;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 constant MAX_REWARD_TOKEN = 8;

    /* ========== STATE VARIABLES ========== */

    struct Reward {
        bool isVeAsset;
        uint256 tokenDecimals;
        uint40 periodFinish;
        uint208 rewardRate;
        uint40 lastUpdateTime;
        uint208 rewardPerTokenStored;
        uint256 queuedRewards;
        address ve3Token;
        address ve3TokenStaking;
        address veAssetDeposits;
    }
    struct Balances {
        uint112 locked;
        uint32 nextUnlockIndex;
    }
    struct LockedBalance {
        uint112 amount;
        uint64 unlockTime;
    }
    struct EarnedData {
        address token;
        uint256 amount;
    }
    struct Epoch {
        uint224 supply;
        uint32 date; //epoch start date
    }

    //token
    IERC20Upgradeable public stakingToken; //VE3D

    //rewards
    EnumerableSet.AddressSet internal rewardTokens;
    mapping(address => Reward) public rewardData;

    EnumerableSet.AddressSet internal operators;

    // Duration that rewards are streamed over
    uint256 public constant rewardsDuration = 86400 * 7;

    // Duration of lock/earned penalty period
    uint256 public constant lockDuration = rewardsDuration * 16;

    // reward token -> distributor -> is approved to add rewards
    mapping(address => mapping(address => bool)) public rewardDistributors;

    // user -> reward token -> amount
    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256)) public rewards;

    //supplies and epochs
    uint256 public lockedSupply;
    Epoch[] public epochs;

    //mappings for balance data
    mapping(address => Balances) public balances;
    mapping(address => LockedBalance[]) public userLocks;

    uint256 public constant denominator = 10000;

    //management
    uint256 public kickRewardPerEpoch;
    uint256 public kickRewardEpochDelay;

    //shutdown
    bool public isShutdown;

    //erc20-like interface
    string private _name;
    string private _symbol;
    uint8 private _decimals;

    /* ========== CONSTRUCTOR ========== */

    function __VE3DLocker_init(address _stakingToken) external initializer {
        __Ownable_init();

        _name = "Vote Locked Vetoken Token";
        _symbol = "xVE3D";
        _decimals = 18;
        isShutdown = false;

        kickRewardPerEpoch = 100;
        kickRewardEpochDelay = 4;

        stakingToken = IERC20Upgradeable(_stakingToken);

        uint256 currentEpoch = block.timestamp.div(rewardsDuration).mul(rewardsDuration);
        epochs.push(Epoch({supply: 0, date: uint32(currentEpoch)}));
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function version() public pure returns (uint256) {
        return 2;
    }

    /* ========== ADMIN CONFIGURATION ========== */

    // Add a new reward token to be distributed to stakers
    function addReward(
        address _rewardsToken,
        address _veAssetDeposits,
        address _ve3Token,
        address _ve3TokenStaking,
        address _distributor,
        bool _isVeAsset
    ) external {
        require(_rewardsToken != address(0) && _distributor != address(0), "Not allowed!");
        require(address(stakingToken) != _rewardsToken, "Incorrect reward token");
        require(_msgSender() == owner() || operators.contains(_msgSender()), "!Auth");
        require(rewardData[_rewardsToken].lastUpdateTime == 0, "Already added");
        require(_rewardsToken != address(stakingToken));
        require(rewardTokens.length() < MAX_REWARD_TOKEN, "!max reward token exceed");
        rewardTokens.add(_rewardsToken);

        rewardData[_rewardsToken].tokenDecimals = ERC20Upgradeable(_rewardsToken).decimals();
        rewardData[_rewardsToken].lastUpdateTime = uint40(block.timestamp);
        rewardData[_rewardsToken].periodFinish = uint40(block.timestamp);
        rewardDistributors[_rewardsToken][_distributor] = true;

        rewardData[_rewardsToken].isVeAsset = _isVeAsset;
        // if reward is veAsset
        if (_isVeAsset) {
            require(_ve3Token != address(0));
            require(_ve3TokenStaking != address(0));
            require(_veAssetDeposits != address(0));
            rewardData[_rewardsToken].ve3Token = _ve3Token;
            rewardData[_rewardsToken].ve3TokenStaking = _ve3TokenStaking;
            rewardData[_rewardsToken].veAssetDeposits = _veAssetDeposits;
        }

        emit RewardTokenAdded(
            _rewardsToken,
            _veAssetDeposits,
            _ve3Token,
            _ve3TokenStaking,
            _distributor,
            _isVeAsset
        );
    }

    function removeReward(address _rewardToken) external onlyOwner {
        require(
            block.timestamp > rewardData[_rewardToken].periodFinish,
            "Cannot remove active reward"
        );

        rewardTokens.remove(_rewardToken);
        emit RewardTokenRemoved(_rewardToken);
    }

    // Modify approval for an address to call notifyRewardAmount
    function approveRewardDistributor(
        address _rewardsToken,
        address _distributor,
        bool _approved
    ) external onlyOwner {
        require(rewardData[_rewardsToken].lastUpdateTime > 0);
        rewardDistributors[_rewardsToken][_distributor] = _approved;
    }

    //set kick incentive
    function setKickIncentive(uint256 _rate, uint256 _delay) external onlyOwner {
        require(_rate <= 500, "over max rate"); //max 5% per epoch
        require(_delay >= 2, "min delay"); //minimum 2 epochs of grace
        kickRewardPerEpoch = _rate;
        kickRewardEpochDelay = _delay;
    }

    //shutdown the contract. unstake all tokens. release all locks
    function shutdown() external onlyOwner {
        isShutdown = true;
    }

    function addOperator(address _newOperator) public onlyOwner {
        operators.add(_newOperator);
    }

    function removeOperator(address _operator) public onlyOwner {
        operators.remove(_operator);
    }

    //set approvals for locking veAsset and staking VE3Token
    function setApprovals() external {
        for (uint256 i; i < rewardTokens.length(); i++) {
            address _rewardsToken = rewardTokens.at(i);
            if (rewardData[_rewardsToken].isVeAsset) {
                // set approve for staking VE3Token
                IERC20Upgradeable(rewardData[_rewardsToken].ve3Token).safeApprove(
                    rewardData[_rewardsToken].ve3TokenStaking,
                    0
                );
                IERC20Upgradeable(rewardData[_rewardsToken].ve3Token).safeApprove(
                    rewardData[_rewardsToken].ve3TokenStaking,
                    type(uint256).max
                );

                // set approve for locking veAsset
                IERC20Upgradeable(_rewardsToken).safeApprove(
                    rewardData[_rewardsToken].veAssetDeposits,
                    0
                );
                IERC20Upgradeable(_rewardsToken).safeApprove(
                    rewardData[_rewardsToken].veAssetDeposits,
                    type(uint256).max
                );
            }
        }
    }

    /* ========== VIEWS ========== */

    function _rewardPerToken(address _rewardsToken) internal view returns (uint256) {
        if (lockedSupply == 0) {
            return rewardData[_rewardsToken].rewardPerTokenStored;
        }
        return
            uint256(rewardData[_rewardsToken].rewardPerTokenStored).add(
                _lastTimeRewardApplicable(rewardData[_rewardsToken].periodFinish)
                    .sub(rewardData[_rewardsToken].lastUpdateTime)
                    .mul(rewardData[_rewardsToken].rewardRate)
                    .mul(1e18)
                    .div(lockedSupply)
            );
    }

    function _earned(
        address _user,
        address _rewardsToken,
        uint256 _balance
    ) internal view returns (uint256) {
        return
            _balance
                .mul(
                    _rewardPerToken(_rewardsToken).sub(
                        userRewardPerTokenPaid[_user][_rewardsToken]
                    )
                )
                .div(1e18)
                .add(rewards[_user][_rewardsToken]);
    }

    function _lastTimeRewardApplicable(uint256 _finishTime) internal view returns (uint256) {
        return Math.min(block.timestamp, _finishTime);
    }

    function lastTimeRewardApplicable(address _rewardsToken) public view returns (uint256) {
        return _lastTimeRewardApplicable(rewardData[_rewardsToken].periodFinish);
    }

    function rewardPerToken(address _rewardsToken) external view returns (uint256) {
        return _rewardPerToken(_rewardsToken);
    }

    function getRewardForDuration(address _rewardsToken) external view returns (uint256) {
        return uint256(rewardData[_rewardsToken].rewardRate).mul(rewardsDuration);
    }

    // Address and claimable amount of all reward tokens for the given account
    function claimableRewards(address _account)
        external
        view
        returns (EarnedData[] memory userRewards)
    {
        userRewards = new EarnedData[](rewardTokens.length());
        Balances storage userBalance = balances[_account];
        for (uint256 i = 0; i < userRewards.length; i++) {
            address token = rewardTokens.at(i);
            userRewards[i].token = token;
            userRewards[i].amount = _earned(_account, token, userBalance.locked);
        }
        return userRewards;
    }

    // total token balance of an account, including unlocked but not withdrawn tokens
    function lockedBalanceOf(address _user) external view returns (uint256 amount) {
        return balances[_user].locked;
    }

    //balance of an account which only includes properly locked tokens as of the most recent eligible epoch
    function balanceOf(address _user) external view returns (uint256 amount) {
        return balanceAtEpochOf(findEpochId(block.timestamp), _user);
    }

    //balance of an account which only includes properly locked tokens at the given epoch
    function balanceAtEpochOf(uint256 _epoch, address _user) public view returns (uint256 amount) {
        LockedBalance[] storage locks = userLocks[_user];

        //get timestamp of given epoch index
        uint256 epochTime = epochs[_epoch].date;
        //get timestamp of first non-inclusive epoch
        uint256 cutoffEpoch = epochTime.sub(lockDuration);

        //need to add up since the range could be in the middle somewhere
        //traverse inversely to make more current queries more gas efficient
        for (uint256 i = locks.length; i > 0; i--) {
            uint256 lockEpoch = uint256(locks[i - 1].unlockTime).sub(lockDuration);
            //lock epoch must be less or equal to the epoch we're basing from.
            if (lockEpoch <= epochTime) {
                if (lockEpoch > cutoffEpoch) {
                    amount = amount.add(locks[i - 1].amount);
                } else {
                    //stop now as no futher checks matter
                    break;
                }
            }
        }

        return amount;
    }

    //return currently locked but not active balance
    function pendingLockOf(address _user) external view returns (uint256 amount) {
        LockedBalance[] storage locks = userLocks[_user];

        uint256 locksLength = locks.length;

        //return amount if latest lock is in the future
        uint256 currentEpoch = block.timestamp.div(rewardsDuration).mul(rewardsDuration);
        if (
            locksLength > 0 &&
            uint256(locks[locksLength - 1].unlockTime).sub(lockDuration) > currentEpoch
        ) {
            return locks[locksLength - 1].amount;
        }

        return 0;
    }

    function pendingLockAtEpochOf(uint256 _epoch, address _user)
        external
        view
        returns (uint256 amount)
    {
        LockedBalance[] storage locks = userLocks[_user];

        //get next epoch from the given epoch index
        uint256 nextEpoch = uint256(epochs[_epoch].date).add(rewardsDuration);

        //traverse inversely to make more current queries more gas efficient
        for (uint256 i = locks.length; i > 0; i--) {
            uint256 lockEpoch = uint256(locks[i - 1].unlockTime).sub(lockDuration);

            //return the next epoch balance
            if (lockEpoch == nextEpoch) {
                return locks[i - 1].amount;
            } else if (lockEpoch < nextEpoch) {
                //no need to check anymore
                break;
            }
        }

        return 0;
    }

    //supply of all properly locked balances at most recent eligible epoch
    function totalSupply() external view returns (uint256 supply) {
        uint256 currentEpoch = block.timestamp.div(rewardsDuration).mul(rewardsDuration);
        uint256 cutoffEpoch = currentEpoch.sub(lockDuration);
        uint256 epochindex = epochs.length;

        //do not include next epoch's supply
        if (uint256(epochs[epochindex - 1].date) > currentEpoch) {
            epochindex--;
        }

        //traverse inversely to make more current queries more gas efficient
        for (uint256 i = epochindex; i > 0; i--) {
            Epoch storage e = epochs[i - 1];
            if (uint256(e.date) <= cutoffEpoch) {
                break;
            }
            supply = supply.add(e.supply);
        }

        return supply;
    }

    //supply of all properly locked balances at the given epoch
    function totalSupplyAtEpoch(uint256 _epoch) external view returns (uint256 supply) {
        uint256 epochStart = uint256(epochs[_epoch].date).div(rewardsDuration).mul(
            rewardsDuration
        );
        uint256 cutoffEpoch = epochStart.sub(lockDuration);

        //traverse inversely to make more current queries more gas efficient
        for (uint256 i = _epoch; i > 0; i--) {
            Epoch storage e = epochs[i - 1];
            if (uint256(e.date) <= cutoffEpoch) {
                break;
            }
            supply = supply.add(e.supply);
        }

        return supply;
    }

    //find an epoch index based on timestamp
    function findEpochId(uint256 _time) public view returns (uint256 epoch) {
        uint256 max = epochs.length - 1;
        uint256 min = 0;

        //convert to start point
        _time = _time.div(rewardsDuration).mul(rewardsDuration);

        for (uint256 i = 0; i < 128; i++) {
            if (min >= max) break;

            uint256 mid = (min + max + 1) / 2;
            uint256 midEpochBlock = epochs[mid].date;
            if (midEpochBlock == _time) {
                //found
                return mid;
            } else if (midEpochBlock < _time) {
                min = mid;
            } else {
                max = mid - 1;
            }
        }
        return min;
    }

    // Information on a user's locked balances
    function lockedBalances(address _user)
        external
        view
        returns (
            uint256 total,
            uint256 unlockable,
            uint256 locked,
            LockedBalance[] memory lockData
        )
    {
        LockedBalance[] storage locks = userLocks[_user];
        Balances storage userBalance = balances[_user];
        uint256 nextUnlockIndex = userBalance.nextUnlockIndex;
        uint256 idx;
        for (uint256 i = nextUnlockIndex; i < locks.length; i++) {
            if (locks[i].unlockTime > block.timestamp) {
                if (idx == 0) {
                    lockData = new LockedBalance[](locks.length - i);
                }
                lockData[idx] = locks[i];
                idx++;
                locked = locked.add(locks[i].amount);
            } else {
                unlockable = unlockable.add(locks[i].amount);
            }
        }
        return (userBalance.locked, unlockable, locked, lockData);
    }

    //number of epochs
    function epochCount() external view returns (uint256) {
        return epochs.length;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function checkpointEpoch() external {
        _checkpointEpoch();
    }

    //insert a new epoch if needed. fill in any gaps
    function _checkpointEpoch() internal {
        //create new epoch in the future where new non-active locks will lock to
        uint256 nextEpoch = block.timestamp.div(rewardsDuration).mul(rewardsDuration).add(
            rewardsDuration
        );
        uint256 epochindex = epochs.length;

        //first epoch add in constructor, no need to check 0 length

        //check to add
        if (epochs[epochindex - 1].date < nextEpoch) {
            //fill any epoch gaps
            while (epochs[epochs.length - 1].date != nextEpoch) {
                uint256 nextEpochDate = uint256(epochs[epochs.length - 1].date).add(
                    rewardsDuration
                );
                epochs.push(Epoch({supply: 0, date: uint32(nextEpochDate)}));
            }
        }
    }

    // Locked tokens cannot be withdrawn for lockDuration and are eligible to receive stakingReward rewards
    function lock(address _account, uint256 _amount) external nonReentrant updateReward(_account) {
        //pull tokens
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        //lock
        _lock(_account, _amount, false);
    }

    //lock tokens
    function _lock(
        address _account,
        uint256 _amount,
        bool _isRelock
    ) internal {
        require(_amount > 0, "Cannot stake 0");
        require(!isShutdown, "shutdown");

        Balances storage bal = balances[_account];

        //must try check pointing epoch first
        _checkpointEpoch();

        //add user balances
        uint112 lockAmount = _amount.to112();
        bal.locked = bal.locked.add(lockAmount);

        //add to total supplies
        lockedSupply = lockedSupply.add(lockAmount);

        //add user lock records or add to current
        uint256 lockEpoch = block.timestamp.div(rewardsDuration).mul(rewardsDuration);
        //if a fresh lock, add on an extra duration period
        if (!_isRelock) {
            lockEpoch = lockEpoch.add(rewardsDuration);
        }
        uint256 unlockTime = lockEpoch.add(lockDuration);
        uint256 idx = userLocks[_account].length;

        //if the latest user lock is smaller than this lock, always just add new entry to the end of the list
        if (idx == 0 || userLocks[_account][idx - 1].unlockTime < unlockTime) {
            userLocks[_account].push(
                LockedBalance({amount: lockAmount, unlockTime: uint32(unlockTime)})
            );
        } else {
            //else add to a current lock

            //if latest lock is further in the future, lower index
            //this can only happen if relocking an expired lock after creating a new lock
            if (userLocks[_account][idx - 1].unlockTime > unlockTime) {
                idx--;
            }

            //if idx points to the epoch when same unlock time, update
            //(this is always true with a normal lock but maybe not with relock)
            if (userLocks[_account][idx - 1].unlockTime == unlockTime) {
                LockedBalance storage userL = userLocks[_account][idx - 1];
                userL.amount = userL.amount.add(lockAmount);
            } else {
                //can only enter here if a relock is made after a lock and there's no lock entry
                //for the current epoch.
                //ex a list of locks such as "[...][older][current*][next]" but without a "current" lock
                //length - 1 is the next epoch
                //length - 2 is a past epoch
                //thus need to insert an entry for current epoch at the 2nd to last entry
                //we will copy and insert the tail entry(next) and then overwrite length-2 entry

                //reset idx
                idx = userLocks[_account].length;

                //get current last item
                LockedBalance storage userL = userLocks[_account][idx - 1];

                //add a copy to end of list
                userLocks[_account].push(
                    LockedBalance({amount: userL.amount, unlockTime: userL.unlockTime})
                );

                //insert current epoch lock entry by overwriting the entry at length-2
                userL.amount = lockAmount;
                userL.unlockTime = uint32(unlockTime);
            }
        }

        //update epoch supply, epoch checkpointed above so safe to add to latest
        uint256 eIndex = epochs.length - 1;
        //if relock, epoch should be current and not next, thus need to decrease index to length-2
        if (_isRelock) {
            eIndex--;
        }
        Epoch storage e = epochs[eIndex];
        e.supply = e.supply.add(uint224(lockAmount));

        emit Staked(_account, lockEpoch, _amount, lockAmount);
    }

    // Withdraw all currently locked tokens where the unlock time has passed
    function _processExpiredLocks(
        address _account,
        bool _relock,
        address _withdrawTo,
        address _rewardAddress,
        uint256 _checkDelay
    ) internal updateReward(_account) {
        LockedBalance[] storage locks = userLocks[_account];
        Balances storage userBalance = balances[_account];
        uint112 locked;
        uint256 length = locks.length;
        uint256 reward = 0;

        if (isShutdown || locks[length - 1].unlockTime <= block.timestamp.sub(_checkDelay)) {
            //if time is beyond last lock, can just bundle everything together
            locked = userBalance.locked;

            //dont delete, just set next index
            userBalance.nextUnlockIndex = length.to32();

            //check for kick reward
            //this wont have the exact reward rate that you would get if looped through
            //but this section is supposed to be for quick and easy low gas processing of all locks
            //we'll assume that if the reward was good enough someone would have processed at an earlier epoch
            if (_checkDelay > 0) {
                uint256 currentEpoch = block.timestamp.sub(_checkDelay).div(rewardsDuration).mul(
                    rewardsDuration
                );
                uint256 epochsover = currentEpoch.sub(uint256(locks[length - 1].unlockTime)).div(
                    rewardsDuration
                );
                uint256 rRate = MathUtil.min(kickRewardPerEpoch.mul(epochsover + 1), denominator);
                reward = uint256(locks[length - 1].amount).mul(rRate).div(denominator);
            }
        } else {
            //use a processed index(nextUnlockIndex) to not loop as much
            //deleting does not change array length
            uint32 nextUnlockIndex = userBalance.nextUnlockIndex;
            for (uint256 i = nextUnlockIndex; i < length; i++) {
                //unlock time must be less or equal to time
                if (locks[i].unlockTime > block.timestamp.sub(_checkDelay)) break;

                //add to cumulative amounts
                locked = locked.add(locks[i].amount);

                //check for kick reward
                //each epoch over due increases reward
                if (_checkDelay > 0) {
                    uint256 currentEpoch = block
                        .timestamp
                        .sub(_checkDelay)
                        .div(rewardsDuration)
                        .mul(rewardsDuration);
                    uint256 epochsover = currentEpoch.sub(uint256(locks[i].unlockTime)).div(
                        rewardsDuration
                    );
                    uint256 rRate = MathUtil.min(
                        kickRewardPerEpoch.mul(epochsover + 1),
                        denominator
                    );
                    reward = reward.add(uint256(locks[i].amount).mul(rRate).div(denominator));
                }
                //set next unlock index
                nextUnlockIndex++;
            }
            //update next unlock index
            userBalance.nextUnlockIndex = nextUnlockIndex;
        }
        require(locked > 0, "no exp locks");

        //update user balances and total supplies
        userBalance.locked = userBalance.locked.sub(locked);
        lockedSupply = lockedSupply.sub(locked);

        emit Withdrawn(_account, locked, _relock);

        //send process incentive
        if (reward > 0) {
            //reduce return amount by the kick reward
            locked = locked.sub(reward.to112());

            //transfer reward
            stakingToken.safeTransfer(_rewardAddress, reward);

            emit KickReward(_rewardAddress, _account, reward);
        }

        //relock or return to user
        if (_relock) {
            _lock(_withdrawTo, locked, true);
        } else {
            stakingToken.safeTransfer(_withdrawTo, locked);
        }
    }

    // withdraw expired locks to a different address
    function withdrawExpiredLocksTo(address _withdrawTo) external nonReentrant {
        _processExpiredLocks(msg.sender, false, _withdrawTo, msg.sender, 0);
    }

    // Withdraw/relock all currently locked tokens where the unlock time has passed
    function processExpiredLocks(bool _relock) external nonReentrant {
        _processExpiredLocks(msg.sender, _relock, msg.sender, msg.sender, 0);
    }

    function kickExpiredLocks(address _account) external nonReentrant {
        //allow kick after grace period of 'kickRewardEpochDelay'
        _processExpiredLocks(
            _account,
            false,
            _account,
            msg.sender,
            rewardsDuration.mul(kickRewardEpochDelay)
        );
    }

    // claim all pending rewards
    function getReward(address _account) external {
        getReward(_account, false);
    }

    // Claim all pending rewards
    function getReward(address _account, bool _stake) public updateReward(_account) {
        for (uint256 i; i < rewardTokens.length(); i++) {
            address _rewardsToken = rewardTokens.at(i);
            _getReward(_account, _rewardsToken, _stake);
        }
    }

    function getReward(
        address _account,
        bool _stake,
        address[] calldata _rewardsTokens
    ) public updateReward(_account) {
        for (uint256 i; i < _rewardsTokens.length; i++) {
            address _rewardsToken = _rewardsTokens[i];

            if (!rewardTokens.contains(_rewardsToken)) {
                continue;
            }
            _getReward(_account, _rewardsToken, _stake);
        }
    }

    function _getReward(
        address _account,
        address _rewardsToken,
        bool _stake
    ) internal nonReentrant returns (bool status) {
        uint256 reward = rewards[_account][_rewardsToken];
        if (reward > 0) {
            rewards[_account][_rewardsToken] = 0;
            if (rewardData[_rewardsToken].isVeAsset) {
                try
                    IVeAssetDeposit(rewardData[_rewardsToken].veAssetDeposits).deposit(
                        reward,
                        false
                    )
                {} catch {
                    return false;
                }

                uint256 _ve3TokenBalance = IERC20Upgradeable(rewardData[_rewardsToken].ve3Token)
                    .balanceOf(address(this));

                if (_stake) {
                    IRewards(rewardData[_rewardsToken].ve3TokenStaking).stakeFor(
                        _account,
                        _ve3TokenBalance
                    );
                } else {
                    IERC20Upgradeable(rewardData[_rewardsToken].ve3Token).safeTransfer(
                        _account,
                        _ve3TokenBalance
                    );
                }
                reward = _ve3TokenBalance;
                _rewardsToken = rewardData[_rewardsToken].ve3Token;
            } else {
                reward = DecimalsConverter.convertFrom18(
                    reward,
                    rewardData[_rewardsToken].tokenDecimals
                );
                IERC20Upgradeable(_rewardsToken).safeTransfer(_account, reward);
            }
            emit RewardPaid(_account, _rewardsToken, reward);
            return true;
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function _notifyReward(address _rewardsToken, uint256 _reward)
        internal
        returns (uint256 _extraAmount)
    {
        Reward storage rdata = rewardData[_rewardsToken];

        if (block.timestamp >= rdata.periodFinish) {
            rdata.rewardRate = _reward.div(rewardsDuration).to208();
        } else {
            uint256 remaining = uint256(rdata.periodFinish).sub(block.timestamp);
            uint256 leftover = remaining.mul(rdata.rewardRate);
            rdata.rewardRate = _reward.add(leftover).div(rewardsDuration).to208();
        }

        uint256 _actualReward = uint256(rdata.rewardRate).mul(rewardsDuration);
        if (_reward > _actualReward) {
            _extraAmount = _reward.sub(_actualReward);
        }

        uint256 balance = DecimalsConverter.convertTo18(
            IERC20Upgradeable(_rewardsToken).balanceOf(address(this)),
            rewardData[_rewardsToken].tokenDecimals
        );

        require(
            rdata.rewardRate <= balance.div(rewardsDuration).to208(),
            "Provided reward too high"
        );

        rdata.lastUpdateTime = block.timestamp.to40();
        rdata.periodFinish = block.timestamp.add(rewardsDuration).to40();
    }

    function queueNewRewards(address _rewardsToken, uint256 _reward)
        external
        updateReward(address(0))
    {
        require(rewardDistributors[_rewardsToken][msg.sender], "Auth!");
        require(_reward > 0, "No reward");

        _reward = DecimalsConverter.convertTo18(_reward, rewardData[_rewardsToken].tokenDecimals);

        _reward = _reward.add(rewardData[_rewardsToken].queuedRewards);

        rewardData[_rewardsToken].queuedRewards = _notifyReward(_rewardsToken, _reward);

        emit RewardAdded(_rewardsToken, _reward);
    }

    // Added to support recovering LP Rewards from other systems such as BAL to be distributed to holders
    function recoverERC20(address _tokenAddress) external onlyOwner {
        require(_tokenAddress != address(stakingToken), "Cannot withdraw staking token");
        require(
            block.timestamp > rewardData[_tokenAddress].periodFinish,
            "Cannot withdraw active reward"
        );
        uint256 _amount = rewardData[_tokenAddress].queuedRewards;
        if (_amount > 0) {
            IERC20Upgradeable(_tokenAddress).safeTransfer(owner(), _amount);
            emit Recovered(_tokenAddress, _amount);
        }
    }

    /* ========== MODIFIERS ========== */

    modifier updateReward(address _account) {
        {
            //stack too deep
            Balances storage userBalance = balances[_account];

            for (uint256 i = 0; i < rewardTokens.length(); i++) {
                address token = rewardTokens.at(i);
                rewardData[token].rewardPerTokenStored = _rewardPerToken(token).to208();
                rewardData[token].lastUpdateTime = _lastTimeRewardApplicable(
                    rewardData[token].periodFinish
                ).to40();
                if (_account != address(0)) {
                    rewards[_account][token] = _earned(_account, token, userBalance.locked);
                    userRewardPerTokenPaid[_account][token] = rewardData[token]
                        .rewardPerTokenStored;
                }
            }
        }
        _;
    }

    /* ========== EVENTS ========== */
    event RewardTokenAdded(
        address indexed rewardsToken,
        address indexed veAssetDeposits,
        address indexed ve3Token,
        address ve3TokenStaking,
        address distributor,
        bool isVeAsset
    );
    event RewardTokenRemoved(address indexed rewardsToken);
    event RewardAdded(address indexed _token, uint256 _reward);
    event Staked(
        address indexed _user,
        uint256 indexed _epoch,
        uint256 _paidAmount,
        uint256 _lockedAmount
    );
    event Withdrawn(address indexed _user, uint256 _amount, bool _relocked);
    event KickReward(address indexed _user, address indexed _kicked, uint256 _reward);
    event RewardPaid(address indexed _user, address indexed _rewardsToken, uint256 _reward);
    event Recovered(address _token, uint256 _amount);
}
