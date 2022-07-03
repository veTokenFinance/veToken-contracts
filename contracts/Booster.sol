// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./Interfaces/IFeeDistro.sol";
import "./Interfaces/IRewardFactory.sol";
import "./Interfaces/ITokenFactory.sol";
import "./Interfaces/IStaker.sol";
import "./Interfaces/IRewards.sol";
import "./Interfaces/ITokenMinter.sol";
import "./Interfaces/IStash.sol";
import "./Interfaces/IStashFactory.sol";
import "./Interfaces/IVoteEscrow.sol";
import "./Interfaces/IGauge.sol";

contract Booster is ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address;
    using SafeMath for uint256;

    // ve3Token reward pool
    uint256 public lockIncentive; //incentive to veAsset stakers
    // veToken reward pool
    uint256 public stakerIncentive; //incentive to native token stakers
    // veToken locking reward pool xVE3D
    uint256 public stakerLockIncentive;
    // caller reward
    uint256 public earmarkIncentive; //incentive to users who spend gas to make calls
    // platoform fee
    uint256 public platformFee; //possible fee to build treasury
    uint256 public constant MaxFees = 2000;
    uint256 public constant FEE_DENOMINATOR = 10000;

    uint256 public lockFeesIncentive; //ve3Token veVeAsset fees percentage
    uint256 public stakerLockFeesIncentive; //xVE3D veVeAsset fees percentage

    address public owner;
    address public feeManager;
    address public poolManager;
    address public staker;
    address public minter;
    address public veAsset;
    address public feeDistro;
    address public rewardFactory;
    address public stashFactory;
    address public tokenFactory;
    address public rewardArbitrator;
    address public voteDelegate;
    address public treasury;
    address public stakerRewards; //vetoken rewards
    address public stakerLockRewards; // veToken lock rewards xVE3D
    address public lockRewards; //ve3Token rewards(veAsset)
    address public lockFees; //ve3Token veVeAsset fees
    address public feeToken;

    bool public isShutdown;

    struct PoolInfo {
        address lptoken;
        address token;
        address gauge;
        address veAssetRewards;
        address stash;
        bool shutdown;
    }

    //index(pid) -> pool
    PoolInfo[] public poolInfo;
    mapping(address => bool) public gaugeMap;
    mapping(address => bool) public gaugeTokenMap;

    event Deposited(address indexed user, uint256 indexed poolid, uint256 amount);
    event Withdrawn(address indexed user, uint256 indexed poolid, uint256 amount);
    event OwnerUpdated(address indexed owner);
    event FeeManagerUpdated(address indexed feeM);
    event PoolManagerUpdated(address indexed poolM);
    event FactoriesUpdated(address indexed rfactory, address indexed tfactory);
    event ArbitratorUpdated(address indexed arb);
    event VoteDelegateUpdated(address indexed voteDelegate);
    event RewardContractsUpdated(
        address indexed rewards,
        address indexed stakerRewards,
        address indexed stakerLockRewards
    );
    event FeesUpdated(
        uint256 lockFees,
        uint256 stakerFees,
        uint256 stakerLockFee,
        uint256 callerFees,
        uint256 platform
    );
    event TreasuryUpdated(address indexed treasury);
    event PoolAdded(
        address indexed lptoken,
        address indexed gauge,
        address indexed token,
        address rewardPool
    );
    event PoolShuttedDown(uint256 indexed pid);
    event SystemShuttedDown();
    event Voted(uint256 indexed voteId, address indexed votingAddress, bool support);

    function __Booster_init(
        address _staker,
        address _minter,
        address _veAsset,
        address _feeDistro
    ) external initializer {
        isShutdown = false;
        staker = _staker;
        owner = msg.sender;
        voteDelegate = msg.sender;
        feeManager = msg.sender;
        poolManager = msg.sender;
        minter = _minter;
        veAsset = _veAsset;
        feeDistro = _feeDistro;
        lockIncentive = 1000;
        stakerIncentive = 450;
        earmarkIncentive = 50;
        lockFeesIncentive = 10000;
    }

    /// SETTER SECTION ///

    function setOwner(address _owner) external {
        require(msg.sender == owner, "!auth");
        owner = _owner;
        emit OwnerUpdated(_owner);
    }

    function setFeeManager(address _feeM) external {
        require(msg.sender == owner, "!auth");
        feeManager = _feeM;
        emit FeeManagerUpdated(_feeM);
    }

    function setPoolManager(address _poolM) external {
        require(msg.sender == owner, "!auth");
        poolManager = _poolM;
        emit PoolManagerUpdated(_poolM);
    }

    function setFactories(
        address _rfactory,
        address _sfactory,
        address _tfactory
    ) external {
        require(msg.sender == owner, "!auth");

        //reward factory only allow this to be called once even if owner
        //removes ability to inject malicious staking contracts
        //token factory can also be immutable
        if (rewardFactory == address(0)) {
            rewardFactory = _rfactory;
            tokenFactory = _tfactory;
            emit FactoriesUpdated(_rfactory, _tfactory);
        }

        //stash factory should be considered more safe to change
        //updating may be required to handle new types of gauges
        stashFactory = _sfactory;
    }

    function setArbitrator(address _arb) external {
        require(msg.sender == owner, "!auth");
        rewardArbitrator = _arb;
        emit ArbitratorUpdated(_arb);
    }

    function setVoteDelegate(address _voteDelegate) external {
        require(msg.sender == owner, "!auth");
        voteDelegate = _voteDelegate;
        emit VoteDelegateUpdated(_voteDelegate);
    }

    function setRewardContracts(
        address _rewards,
        address _stakerRewards,
        address _stakerLockRewards
    ) external {
        require(msg.sender == owner, "!auth");

        //reward contracts are immutable or else the owner
        //has a means to redeploy and mint cvx via rewardClaimed()
        if (lockRewards == address(0) && _rewards != address(0)) {
            lockRewards = _rewards;
        }
        if (stakerRewards == address(0) && _stakerRewards != address(0)) {
            stakerRewards = _stakerRewards;
        }
        if (stakerLockRewards == address(0) && _stakerLockRewards != address(0)) {
            stakerLockRewards = _stakerLockRewards;
        }

        emit RewardContractsUpdated(_rewards, _stakerRewards, _stakerLockRewards);
    }

    // Set reward token and claim contract, get from Curve's registry
    function setFeeInfo(uint256 _lockFeesIncentive, uint256 _stakerLockFeesIncentive) external {
        require(msg.sender == feeManager, "!auth");
        require(_lockFeesIncentive.add(_stakerLockFeesIncentive) == FEE_DENOMINATOR);

        lockFeesIncentive = _lockFeesIncentive;
        stakerLockFeesIncentive = _stakerLockFeesIncentive;

        address _feeToken = IFeeDistro(feeDistro).token();
        if (feeToken != _feeToken) {
            //create a new reward contract for the new token
            lockFees = IRewardFactory(rewardFactory).CreateTokenRewards(_feeToken, lockRewards);

            if (_feeToken != veAsset) {
                IRewards(stakerLockRewards).addReward(
                    _feeToken,
                    address(0),
                    address(0),
                    address(0),
                    address(this),
                    false
                );
            }

            feeToken = _feeToken;
        }
    }

    function setFees(
        uint256 _lockFees,
        uint256 _stakerFees,
        uint256 _stakerLockIncentiveFee,
        uint256 _callerFees,
        uint256 _platform
    ) external {
        require(msg.sender == feeManager, "!auth");

        uint256 total = _lockFees.add(_stakerFees).add(_callerFees).add(_platform).add(
            _stakerLockIncentiveFee
        );
        require(total <= MaxFees, ">MaxFees");

        //values must be within certain ranges

        lockIncentive = _lockFees;
        stakerIncentive = _stakerFees;
        stakerLockIncentive = _stakerLockIncentiveFee;
        earmarkIncentive = _callerFees;
        platformFee = _platform;
        emit FeesUpdated(_lockFees, _stakerFees, _stakerLockIncentiveFee, _callerFees, _platform);
    }

    function setTreasury(address _treasury) external {
        require(msg.sender == feeManager, "!auth");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// END SETTER SECTION ///

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    //create a new pool
    function addPool(
        address _lptoken,
        address _gauge,
        uint256 _stashVersion
    ) external returns (bool) {
        require(msg.sender == poolManager && !isShutdown, "!add");
        require(_gauge != address(0) && _lptoken != address(0), "!param");

        //the next pool's pid
        uint256 pid = poolInfo.length;

        //create a tokenized deposit
        address token = ITokenFactory(tokenFactory).CreateDepositToken(_lptoken);
        //create a reward contract for veAsset rewards
        address newRewardPool = IRewardFactory(rewardFactory).CreateVeAssetRewards(pid, token);

        //create a stash to handle extra incentives
        address stash = IStashFactory(stashFactory).CreateStash(
            pid,
            veAsset,
            _gauge,
            staker,
            _stashVersion
        );

        //add the new pool
        poolInfo.push(
            PoolInfo({
                lptoken: _lptoken,
                token: token,
                gauge: _gauge,
                veAssetRewards: newRewardPool,
                stash: stash,
                shutdown: false
            })
        );
        gaugeMap[_gauge] = true;
        gaugeTokenMap[_lptoken] = true;

        //give stashes access to rewardfactory and voteproxy
        //   voteproxy so it can grab the incentive tokens off the contract after claiming rewards
        //   reward factory so that stashes can make new extra reward contracts if a new incentive is added to the gauge
        if (stash != address(0)) {
            poolInfo[pid].stash = stash;
            IStaker(staker).setStashAccess(stash, true);
            IRewardFactory(rewardFactory).setAccess(stash, true);
        }
        emit PoolAdded(_lptoken, _gauge, token, newRewardPool);

        return true;
    }

    //shutdown pool
    function shutdownPool(uint256 _pid) external returns (bool) {
        require(msg.sender == poolManager, "!auth");
        PoolInfo storage pool = poolInfo[_pid];

        //withdraw from gauge
        try IStaker(staker).withdrawAll(pool.lptoken, pool.gauge) {} catch {}

        pool.shutdown = true;
        gaugeMap[pool.gauge] = false;
        gaugeTokenMap[pool.lptoken] = false;

        emit PoolShuttedDown(_pid);
        return true;
    }

    //deposit lp tokens and stake
    function deposit(
        uint256 _pid,
        uint256 _amount,
        bool _stake
    ) public nonReentrant returns (bool) {
        require(!isShutdown, "shutdown");
        PoolInfo storage pool = poolInfo[_pid];
        require(pool.shutdown == false, "pool is closed");

        //send to proxy to stake
        address lptoken = pool.lptoken;
        uint256 balanceBefore = IERC20Upgradeable(lptoken).balanceOf(address(staker));
        IERC20Upgradeable(lptoken).safeTransferFrom(msg.sender, staker, _amount);
        uint256 balanceAfter = IERC20Upgradeable(lptoken).balanceOf(address(staker));
        _amount = balanceAfter.sub(balanceBefore);

        //stake
        address gauge = pool.gauge;
        require(gauge != address(0), "!gauge setting");
        IStaker(staker).deposit(lptoken, gauge);

        //some gauges claim rewards when depositing, stash them in a seperate contract until next claim
        address stash = pool.stash;
        if (stash != address(0)) {
            IStash(stash).stashRewards();
        }

        address token = pool.token;
        if (_stake) {
            //mint here and send to rewards on user behalf
            ITokenMinter(token).mint(address(this), _amount);
            address rewardContract = pool.veAssetRewards;
            IERC20Upgradeable(token).safeApprove(rewardContract, 0);
            IERC20Upgradeable(token).safeApprove(rewardContract, _amount);
            IRewards(rewardContract).stakeFor(msg.sender, _amount);
        } else {
            //add user balance directly
            ITokenMinter(token).mint(msg.sender, _amount);
        }

        emit Deposited(msg.sender, _pid, _amount);
        return true;
    }

    //deposit all lp tokens and stake
    function depositAll(uint256 _pid, bool _stake) external returns (bool) {
        address lptoken = poolInfo[_pid].lptoken;
        uint256 balance = IERC20Upgradeable(lptoken).balanceOf(msg.sender);
        deposit(_pid, balance, _stake);
        return true;
    }

    //withdraw lp tokens
    function _withdraw(
        uint256 _pid,
        uint256 _amount,
        address _from,
        address _to
    ) internal nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        address lptoken = pool.lptoken;
        address gauge = pool.gauge;

        //remove lp balance
        address token = pool.token;
        ITokenMinter(token).burn(_from, _amount);

        //pull from gauge if not shutdown
        // if shutdown tokens will be in this contract
        if (!pool.shutdown) {
            IStaker(staker).withdraw(lptoken, gauge, _amount);
        }

        //some gauges claim rewards when withdrawing, stash them in a seperate contract until next claim
        //do not call if shutdown since stashes wont have access
        address stash = pool.stash;
        if (stash != address(0) && !isShutdown && !pool.shutdown) {
            IStash(stash).stashRewards();
        }
        //@dev handle staking factor for Angle
        // if (IVoteEscrow(staker).escrowModle() == IVoteEscrow.EscrowModle.ANGLE) {
        //     _amount = (_amount * 10**18) / IGauge(gauge)._scaling_factor();
        // }
        //return lp tokens
        IERC20Upgradeable(lptoken).safeTransfer(_to, _amount);

        emit Withdrawn(_to, _pid, _amount);
    }

    //withdraw lp tokens
    function withdraw(uint256 _pid, uint256 _amount) public returns (bool) {
        _withdraw(_pid, _amount, msg.sender, msg.sender);
        return true;
    }

    //withdraw all lp tokens
    function withdrawAll(uint256 _pid) public returns (bool) {
        address token = poolInfo[_pid].token;
        uint256 userBal = IERC20Upgradeable(token).balanceOf(msg.sender);
        withdraw(_pid, userBal);
        return true;
    }

    //allow reward contracts to send here and withdraw to user
    function withdrawTo(
        uint256 _pid,
        uint256 _amount,
        address _to
    ) external returns (bool) {
        address rewardContract = poolInfo[_pid].veAssetRewards;
        require(msg.sender == rewardContract, "!auth");

        _withdraw(_pid, _amount, msg.sender, _to);
        return true;
    }

    /**
     * @notice set valid vote hash on VoterProxy
     */
    function setVote(bytes32 _hash, bool valid) external returns (bool) {
        require(msg.sender == voteDelegate, "!auth");

        IStaker(staker).setVote(_hash, valid);
        return true;
    }

    function voteGaugeWeight(address[] calldata _gauge, uint256[] calldata _weight)
        external
        returns (bool)
    {
        require(msg.sender == voteDelegate, "!auth");

        IStaker(staker).voteGaugeWeight(_gauge, _weight);

        return true;
    }

    function claimRewards(uint256 _pid, address _gauge) external nonReentrant returns (bool) {
        address stash = poolInfo[_pid].stash;
        require(msg.sender == stash, "!auth");

        IStaker(staker).claimRewards(_gauge);
        return true;
    }

    function setGaugeRedirect(uint256 _pid) external returns (bool) {
        address stash = poolInfo[_pid].stash;
        require(msg.sender == stash, "!auth");
        address gauge = poolInfo[_pid].gauge;
        bytes memory data = abi.encodeWithSelector(
            bytes4(keccak256("set_rewards_receiver(address)")),
            stash
        );
        IStaker(staker).execute(gauge, uint256(0), data);
        return true;
    }

    //claim veAsset and extra rewards and disperse to reward contracts
    function _earmarkRewards(uint256 _pid) internal {
        PoolInfo storage pool = poolInfo[_pid];
        require(pool.shutdown == false, "pool is closed");
        address stash = pool.stash;
        address gauge = pool.gauge;

        if (
            stash != address(0) &&
            IVoteEscrow(staker).escrowModle() == IVoteEscrow.EscrowModle.ANGLE
        ) {
            _claimStashReward(stash);
        }

        //claim veAsset
        IStaker(staker).claimVeAsset(gauge);

        //check if there are extra rewards

        if (stash != address(0)) {
            _claimStashReward(stash);
        }

        //veAsset balance
        uint256 veAssetBal = IERC20Upgradeable(veAsset).balanceOf(address(this));

        if (veAssetBal > 0) {
            uint256 _lockIncentive = veAssetBal.mul(lockIncentive).div(FEE_DENOMINATOR);
            uint256 _stakerIncentive = veAssetBal.mul(stakerIncentive).div(FEE_DENOMINATOR);
            uint256 _stakerLockIncentive = veAssetBal.mul(stakerLockIncentive).div(
                FEE_DENOMINATOR
            );
            uint256 _callIncentive = veAssetBal.mul(earmarkIncentive).div(FEE_DENOMINATOR);

            //send treasury
            if (treasury != address(0) && treasury != address(this) && platformFee > 0) {
                //only subtract after address condition check
                uint256 _platform = veAssetBal.mul(platformFee).div(FEE_DENOMINATOR);
                veAssetBal = veAssetBal.sub(_platform);
                IERC20Upgradeable(veAsset).safeTransfer(treasury, _platform);
            }

            //remove incentives from balance
            veAssetBal = veAssetBal
                .sub(_lockIncentive)
                .sub(_callIncentive)
                .sub(_stakerIncentive)
                .sub(_stakerLockIncentive);

            //send incentives for calling
            if (_callIncentive > 0) {
                IERC20Upgradeable(veAsset).safeTransfer(msg.sender, _callIncentive);
            }

            //send veAsset to lp provider reward contract
            address rewardContract = pool.veAssetRewards;
            IERC20Upgradeable(veAsset).safeTransfer(rewardContract, veAssetBal);
            IRewards(rewardContract).queueNewRewards(veAssetBal);

            //send lockers' share of veAsset to reward contract
            if (_lockIncentive > 0) {
                IERC20Upgradeable(veAsset).safeTransfer(lockRewards, _lockIncentive);
                IRewards(lockRewards).queueNewRewards(_lockIncentive);
            }
            //send stakers's share of veAsset to VE3D reward contract
            if (_stakerIncentive > 0) {
                IERC20Upgradeable(veAsset).safeTransfer(stakerRewards, _stakerIncentive);
                IRewards(stakerRewards).queueNewRewards(veAsset, _stakerIncentive);
            }

            //send stakers's lock share of veAsset to VE3D locker reward contract
            if (_stakerLockIncentive > 0) {
                IERC20Upgradeable(veAsset).safeTransfer(stakerLockRewards, _stakerLockIncentive);
                IRewards(stakerLockRewards).queueNewRewards(veAsset, _stakerLockIncentive);
            }
        }
    }

    function _claimStashReward(address stash) internal {
        //claim extra rewards
        IStash(stash).claimRewards();
        //process extra rewards
        IStash(stash).processStash();
    }

    function earmarkRewards(uint256 _pid) external returns (bool) {
        require(!isShutdown, "shutdown");
        _earmarkRewards(_pid);
        return true;
    }

    //claim fees from fee distro contract, put in lockers' reward contract
    function earmarkFees() external returns (bool) {
        //claim fee rewards
        IStaker(staker).claimFees(feeDistro, feeToken);
        //send fee rewards to reward contract
        uint256 _balance = IERC20Upgradeable(feeToken).balanceOf(address(this));

        uint256 _lockFeesIncentive = _balance.mul(lockFeesIncentive).div(FEE_DENOMINATOR);
        uint256 _stakerLockFeesIncentive = _balance.mul(stakerLockFeesIncentive).div(
            FEE_DENOMINATOR
        );
        if (_lockFeesIncentive > 0) {
            IERC20Upgradeable(feeToken).safeTransfer(lockFees, _lockFeesIncentive);
            IRewards(lockFees).queueNewRewards(_lockFeesIncentive);
        }
        if (_stakerLockFeesIncentive > 0) {
            IERC20Upgradeable(feeToken).safeTransfer(stakerLockRewards, _stakerLockFeesIncentive);
            IRewards(stakerLockRewards).queueNewRewards(feeToken, _stakerLockFeesIncentive);
        }
        return true;
    }

    //callback from reward contract when veAsset is received.
    function rewardClaimed(
        uint256 _pid,
        address _address,
        uint256 _amount
    ) external returns (bool) {
        address rewardContract = poolInfo[_pid].veAssetRewards;
        require(msg.sender == rewardContract || msg.sender == lockRewards, "!auth");
        ITokenMinter veTokenMinter = ITokenMinter(minter);
        //calc the amount of veAssetEarned
        uint256 _veAssetEarned = _amount.mul(veTokenMinter.veAssetWeights(address(this))).div(
            veTokenMinter.totalWeight()
        );
        //mint reward tokens
        ITokenMinter(minter).mint(_address, _veAssetEarned);

        return true;
    }

    function recoverUnusedRewardFromPools(uint256 _pid) external {
        require(msg.sender == owner, "!Auth");
        address rewardContract = poolInfo[_pid].veAssetRewards;
        if (rewardContract != address(0)) {
            IRewards(rewardContract).recoverUnuserReward(owner);
        }
    }

    function recoverUnusedRewardFromLockPool() external {
        require(msg.sender == owner, "!Auth");

        IRewards(lockRewards).recoverUnuserReward(owner);
    }

    function recoverUnusedClaimedReward(address _token, address _destination) external {
        require(msg.sender == owner, "!Auth");

        uint256 _amount = IERC20Upgradeable(_token).balanceOf(address(this));
        if (_amount > 0) {
            IERC20Upgradeable(_token).safeTransfer(_destination, _amount);
        }
    }
}
