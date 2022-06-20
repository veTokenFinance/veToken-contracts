// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;
/**
 *Submitted for verification at Etherscan.io on 2020-07-17
 */

/*
   ____            __   __        __   _
  / __/__ __ ___  / /_ / /  ___  / /_ (_)__ __
 _\ \ / // // _ \/ __// _ \/ -_)/ __// / \ \ /
/___/ \_, //_//_/\__//_//_/\__/ \__//_/ /_\_\
     /___/

* Synthetix: vetokenRewardPool.sol
*
* Docs: https://docs.synthetix.io/
*
*
* MIT License
* ===========
*
* Copyright (c) 2020 Synthetix
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
*/

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./Interfaces/IVeAssetDeposit.sol";
import "./Interfaces/IRewards.sol";

contract VE3DRewardPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    IERC20 public immutable stakingToken;
    uint256 public constant duration = 7 days;
    uint256 public constant FEE_DENOMINATOR = 10000;

    address public immutable rewardManager;

    uint256 public constant newRewardRatio = 830;
    uint256 constant EXTRA_REWARD_POOLS = 8;
    uint256 constant MAX_REWARD_TOKEN = 8;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    // reward token => reward token info
    mapping(address => RewardTokenInfo) public rewardTokenInfo;
    // list of reward tokens
    EnumerableSet.AddressSet internal rewardTokens;
    EnumerableSet.AddressSet internal operators;

    EnumerableSet.AddressSet internal extraRewards;

    struct RewardTokenInfo {
        address veAssetDeposits;
        address ve3TokenRewards;
        address ve3Token;
        uint256 queuedRewards;
        uint256 rewardRate;
        uint256 historicalRewards;
        uint256 rewardPerTokenStored;
        uint256 currentRewards;
        uint256 periodFinish;
        uint256 lastUpdateTime;
        mapping(address => uint256) userRewardPerTokenPaid;
        mapping(address => uint256) rewards;
    }

    event RewardTokenAdded(
        address indexed rewardToken,
        address indexed veAssetDeposits,
        address indexed ve3Token,
        address ve3TokenRewards
    );
    event RewardTokenRemoved(address indexed rewardsToken);
    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event Recovered(address _token, uint256 _amount);

    constructor(address stakingToken_, address rewardManager_) {
        stakingToken = IERC20(stakingToken_);

        rewardManager = rewardManager_;
    }

    function addReward(
        address _rewardToken,
        address _veAssetDeposits,
        address _ve3TokenRewards,
        address _ve3Token
    ) external onlyOwner {
        require(address(stakingToken) != _rewardToken, "Incorrect reward token");
        require(rewardTokens.length() < MAX_REWARD_TOKEN, "!max reward token exceed");
        rewardTokenInfo[_rewardToken].veAssetDeposits = _veAssetDeposits;
        rewardTokenInfo[_rewardToken].ve3TokenRewards = _ve3TokenRewards;
        rewardTokenInfo[_rewardToken].ve3Token = _ve3Token;
        rewardTokens.add(_rewardToken);
        emit RewardTokenAdded(_rewardToken, _veAssetDeposits, _ve3TokenRewards, _ve3Token);
    }

    function removeReward(address _rewardToken) external onlyOwner {
        require(
            block.timestamp > rewardTokenInfo[_rewardToken].periodFinish,
            "Cannot remove active reward"
        );
        rewardTokens.remove(_rewardToken);
        emit RewardTokenRemoved(_rewardToken);
    }

    function addOperator(address _newOperator) public onlyOwner {
        operators.add(_newOperator);
    }

    function removeOperator(address _operator) public onlyOwner {
        operators.remove(_operator);
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function extraRewardsLength() external view returns (uint256) {
        return extraRewards.length();
    }

    function addExtraReward(address _reward) external {
        require(msg.sender == rewardManager, "!authorized");
        require(_reward != address(0), "!reward setting");
        require(extraRewards.length() < EXTRA_REWARD_POOLS, "!extra reward pools exceed");

        extraRewards.add(_reward);
    }

    function clearExtraRewards() external {
        require(msg.sender == rewardManager, "!authorized");
        uint256 length = extraRewards.length();
        for (uint256 i = 0; i < length; i++) {
            extraRewards.remove(extraRewards.at(i));
        }
    }

    modifier updateReward(address account) {
        address _rewardToken;
        for (uint256 i = 0; i < rewardTokens.length(); i++) {
            _rewardToken = rewardTokens.at(i);
            rewardTokenInfo[_rewardToken].rewardPerTokenStored = rewardPerToken(_rewardToken);
            rewardTokenInfo[_rewardToken].lastUpdateTime = lastTimeRewardApplicable(_rewardToken);
            if (account != address(0)) {
                rewardTokenInfo[_rewardToken].rewards[account] = earnedReward(
                    _rewardToken,
                    account
                );
                rewardTokenInfo[_rewardToken].userRewardPerTokenPaid[account] = rewardTokenInfo[
                    _rewardToken
                ].rewardPerTokenStored;
            }
        }

        _;
    }

    function lastTimeRewardApplicable(address _rewardToken) public view returns (uint256) {
        return Math.min(block.timestamp, rewardTokenInfo[_rewardToken].periodFinish);
    }

    function rewardPerToken(address _rewardToken) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return rewardTokenInfo[_rewardToken].rewardPerTokenStored;
        }
        return
            rewardTokenInfo[_rewardToken].rewardPerTokenStored.add(
                lastTimeRewardApplicable(_rewardToken)
                    .sub(rewardTokenInfo[_rewardToken].lastUpdateTime)
                    .mul(rewardTokenInfo[_rewardToken].rewardRate)
                    .mul(1e18)
                    .div(supply)
            );
    }

    function earnedReward(address _rewardToken, address account) internal view returns (uint256) {
        return
            balanceOf(account)
                .mul(
                    rewardPerToken(_rewardToken).sub(
                        rewardTokenInfo[_rewardToken].userRewardPerTokenPaid[account]
                    )
                )
                .div(1e18)
                .add(rewardTokenInfo[_rewardToken].rewards[account]);
    }

    function earned(address _rewardToken, address account) external view returns (uint256) {
        uint256 depositFeeRate = IVeAssetDeposit(rewardTokenInfo[_rewardToken].veAssetDeposits)
            .lockIncentive();

        uint256 r = earnedReward(_rewardToken, account);
        uint256 fees = r.mul(depositFeeRate).div(FEE_DENOMINATOR);

        //fees dont apply until whitelist+veVeAsset lock begins so will report
        //slightly less value than what is actually received.
        return r.sub(fees);
    }

    function stake(uint256 _amount) public nonReentrant updateReward(msg.sender) {
        require(_amount > 0, "RewardPool : Cannot stake 0");

        //also stake to linked rewards
        uint256 length = extraRewards.length();
        for (uint256 i = 0; i < length; i++) {
            IRewards(extraRewards.at(i)).stake(msg.sender, _amount);
        }

        //add supply
        _totalSupply = _totalSupply.add(_amount);
        //add to sender balance sheet
        _balances[msg.sender] = _balances[msg.sender].add(_amount);
        //take tokens from sender
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Staked(msg.sender, _amount);
    }

    function stakeAll() external nonReentrant {
        uint256 balance = stakingToken.balanceOf(msg.sender);
        stake(balance);
    }

    function stakeFor(address _for, uint256 _amount) public nonReentrant updateReward(_for) {
        require(_amount > 0, "RewardPool : Cannot stake 0");
        require(_for != address(0), "Not allowed!");

        //also stake to linked rewards
        uint256 length = extraRewards.length();
        for (uint256 i = 0; i < length; i++) {
            IRewards(extraRewards.at(i)).stake(_for, _amount);
        }

        //add supply
        _totalSupply = _totalSupply.add(_amount);
        //add to _for's balance sheet
        _balances[_for] = _balances[_for].add(_amount);
        //take tokens from sender
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Staked(msg.sender, _amount);
    }

    function withdraw(uint256 _amount, bool claim) public nonReentrant updateReward(msg.sender) {
        require(_amount > 0, "RewardPool : Cannot withdraw 0");

        //also withdraw from linked rewards
        uint256 length = extraRewards.length();
        for (uint256 i = 0; i < length; i++) {
            IRewards(extraRewards.at(i)).withdraw(msg.sender, _amount);
        }

        _totalSupply = _totalSupply.sub(_amount);
        _balances[msg.sender] = _balances[msg.sender].sub(_amount);
        stakingToken.safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _amount);

        if (claim) {
            getReward(msg.sender, true, false);
        }
    }

    function withdrawAll(bool claim) external {
        withdraw(_balances[msg.sender], claim);
    }

    function getReward(
        address _account,
        bool _claimExtras,
        bool _stake
    ) public nonReentrant updateReward(_account) {
        address _rewardToken;
        for (uint256 i = 0; i < rewardTokens.length(); i++) {
            _rewardToken = rewardTokens.at(i);

            uint256 reward = earnedReward(_rewardToken, _account);
            if (reward > 0) {
                rewardTokenInfo[_rewardToken].rewards[_account] = 0;
                IERC20(_rewardToken).safeApprove(rewardTokenInfo[_rewardToken].veAssetDeposits, 0);
                IERC20(_rewardToken).safeApprove(
                    rewardTokenInfo[_rewardToken].veAssetDeposits,
                    reward
                );
                IVeAssetDeposit(rewardTokenInfo[_rewardToken].veAssetDeposits).deposit(
                    reward,
                    false
                );

                uint256 ve3TokenBalance = IERC20(rewardTokenInfo[_rewardToken].ve3Token).balanceOf(
                    address(this)
                );
                if (_stake) {
                    IERC20(rewardTokenInfo[_rewardToken].ve3Token).safeApprove(
                        rewardTokenInfo[_rewardToken].ve3TokenRewards,
                        0
                    );
                    IERC20(rewardTokenInfo[_rewardToken].ve3Token).safeApprove(
                        rewardTokenInfo[_rewardToken].ve3TokenRewards,
                        ve3TokenBalance
                    );
                    IRewards(rewardTokenInfo[_rewardToken].ve3TokenRewards).stakeFor(
                        _account,
                        ve3TokenBalance
                    );
                } else {
                    IERC20(rewardTokenInfo[_rewardToken].ve3Token).safeTransfer(
                        _account,
                        ve3TokenBalance
                    );
                }
                emit RewardPaid(_account, ve3TokenBalance);
            }
        }

        //also get rewards from linked rewards
        if (_claimExtras) {
            uint256 length = extraRewards.length();
            for (uint256 i = 0; i < length; i++) {
                IRewards(extraRewards.at(i)).getReward(_account);
            }
        }
    }

    function getReward(bool _stake) external {
        getReward(msg.sender, true, _stake);
    }

    function donate(address _rewardToken, uint256 _amount) external {
        IERC20(_rewardToken).safeTransferFrom(msg.sender, address(this), _amount);
        rewardTokenInfo[_rewardToken].queuedRewards = rewardTokenInfo[_rewardToken]
            .queuedRewards
            .add(_amount);
    }

    function queueNewRewards(address _rewardToken, uint256 _rewards) external {
        require(operators.contains(_msgSender()), "!authorized");

        _rewards = _rewards.add(rewardTokenInfo[_rewardToken].queuedRewards);

        if (block.timestamp >= rewardTokenInfo[_rewardToken].periodFinish) {
            rewardTokenInfo[_rewardToken].queuedRewards = notifyRewardAmount(
                _rewardToken,
                _rewards
            );
            return;
        }

        //et = now - (finish-duration)
        uint256 elapsedTime = block.timestamp.sub(
            rewardTokenInfo[_rewardToken].periodFinish.sub(duration)
        );
        //current at now: rewardRate * elapsedTime
        uint256 currentAtNow = rewardTokenInfo[_rewardToken].rewardRate * elapsedTime;
        uint256 queuedRatio = currentAtNow.mul(1000).div(_rewards);
        if (queuedRatio < newRewardRatio) {
            rewardTokenInfo[_rewardToken].queuedRewards = notifyRewardAmount(
                _rewardToken,
                _rewards
            );
        } else {
            rewardTokenInfo[_rewardToken].queuedRewards = _rewards;
        }
    }

    function notifyRewardAmount(address _rewardToken, uint256 reward)
        internal
        updateReward(address(0))
        returns (uint256 _extraAmount)
    {
        rewardTokenInfo[_rewardToken].historicalRewards += reward;
        if (block.timestamp >= rewardTokenInfo[_rewardToken].periodFinish) {
            rewardTokenInfo[_rewardToken].rewardRate = reward.div(duration);
        } else {
            uint256 remaining = rewardTokenInfo[_rewardToken].periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardTokenInfo[_rewardToken].rewardRate);
            reward = reward.add(leftover);
            rewardTokenInfo[_rewardToken].rewardRate = reward.div(duration);
        }
        uint256 _actualReward = rewardTokenInfo[_rewardToken].rewardRate.mul(duration);
        if (reward > _actualReward) {
            _extraAmount = reward.sub(_actualReward);
        }

        uint256 balance = IERC20(_rewardToken).balanceOf(address(this));
        require(
            rewardTokenInfo[_rewardToken].rewardRate <= balance.div(duration),
            "Provided reward too high"
        );

        rewardTokenInfo[_rewardToken].currentRewards = reward;
        rewardTokenInfo[_rewardToken].lastUpdateTime = block.timestamp;
        rewardTokenInfo[_rewardToken].periodFinish = block.timestamp.add(duration);
        emit RewardAdded(reward);
    }

    function recoverUnuserReward(address _rewardToken)
        external
        onlyOwner
        updateReward(address(0))
    {
        require(_rewardToken != address(stakingToken), "Cannot withdraw staking token");
        require(
            block.timestamp > rewardTokenInfo[_rewardToken].periodFinish,
            "Cannot withdraw active reward"
        );
        uint256 _amount = IERC20(_rewardToken).balanceOf(address(this));

        if (_amount > 0) {
            IERC20(_rewardToken).safeTransfer(owner(), _amount);
        }
    }
}
