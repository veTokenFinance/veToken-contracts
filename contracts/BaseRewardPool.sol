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

* Synthetix: BaseRewardPool.sol
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
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./Interfaces/IRewards.sol";
import "./Interfaces/IDeposit.sol";

contract BaseRewardPool is ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    IERC20 public rewardToken;
    IERC20 public stakingToken;
    uint256 public constant duration = 7 days;
    uint256 constant BLOCKS_PER_DAY = 6450;
    uint256 constant BLOCKS_PER_YEAR = BLOCKS_PER_DAY * 365;
    uint256 constant EXTRA_REWARD_POOLS = 8;

    address public operator;
    address public rewardManager;

    uint256 public pid;
    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public queuedRewards = 0;
    uint256 public currentRewards = 0;
    uint256 public historicalRewards = 0;
    uint256 public constant newRewardRatio = 830;
    uint256 private _totalSupply;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) private _balances;

    EnumerableSet.AddressSet internal extraRewards;

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event ExtraRewardAdded(address indexed reward);
    event ExtraRewardCleared();
    event RewardUpdated(
        address indexed user,
        uint256 reward,
        uint256 rewardPerTokenStored,
        uint256 lastUpdateTime
    );
    event Donated(uint256 queuedRewards);

    constructor(
        uint256 pid_,
        address stakingToken_,
        address rewardToken_,
        address operator_,
        address rewardManager_
    ) {
        pid = pid_;
        stakingToken = IERC20(stakingToken_);
        rewardToken = IERC20(rewardToken_);
        operator = operator_;
        rewardManager = rewardManager_;
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

    function addExtraReward(address _reward) external returns (bool) {
        require(msg.sender == rewardManager, "!authorized");
        require(_reward != address(0), "!reward setting");
        require(extraRewards.length() < EXTRA_REWARD_POOLS, "!extra reward pools exceed");

        extraRewards.add(_reward);
        emit ExtraRewardAdded(_reward);
        return true;
    }

    function clearExtraRewards() external {
        require(msg.sender == rewardManager, "!authorized");
        uint256 length = extraRewards.length();
        for (uint256 i = 0; i < length; i++) {
            extraRewards.remove(extraRewards.at(i));
        }
        emit ExtraRewardCleared();
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        emit RewardUpdated(account, rewards[account], rewardPerTokenStored, lastUpdateTime);
        _;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastTimeRewardApplicable().sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(
                    totalSupply()
                )
            );
    }

    function earned(address account) public view returns (uint256) {
        return
            balanceOf(account)
                .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
                .div(1e18)
                .add(rewards[account]);
    }

    function stake(uint256 _amount) public nonReentrant updateReward(msg.sender) returns (bool) {
        require(_amount > 0, "RewardPool : Cannot stake 0");

        //also stake to linked rewards
        for (uint256 i = 0; i < extraRewards.length(); i++) {
            IRewards(extraRewards.at(i)).stake(msg.sender, _amount);
        }

        _totalSupply = _totalSupply.add(_amount);
        _balances[msg.sender] = _balances[msg.sender].add(_amount);

        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);

        return true;
    }

    function stakeAll() external nonReentrant returns (bool) {
        uint256 balance = stakingToken.balanceOf(msg.sender);
        stake(balance);
        return true;
    }

    function stakeFor(address _for, uint256 _amount)
        public
        nonReentrant
        updateReward(_for)
        returns (bool)
    {
        require(_amount > 0, "RewardPool : Cannot stake 0");
        require(_for != address(0), "Not allowed!");
        //also stake to linked rewards
        for (uint256 i = 0; i < extraRewards.length(); i++) {
            IRewards(extraRewards.at(i)).stake(_for, _amount);
        }

        //give to _for
        _totalSupply = _totalSupply.add(_amount);
        _balances[_for] = _balances[_for].add(_amount);

        //take away from sender
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit Staked(_for, _amount);

        return true;
    }

    function withdraw(uint256 amount, bool claim)
        public
        nonReentrant
        updateReward(msg.sender)
        returns (bool)
    {
        require(amount > 0, "RewardPool : Cannot withdraw 0");

        //also withdraw from linked rewards
        for (uint256 i = 0; i < extraRewards.length(); i++) {
            IRewards(extraRewards.at(i)).withdraw(msg.sender, amount);
        }

        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = _balances[msg.sender].sub(amount);

        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);

        if (claim) {
            getReward(msg.sender, true);
        }

        return true;
    }

    function withdrawAll(bool claim) external {
        withdraw(_balances[msg.sender], claim);
    }

    function withdrawAndUnwrap(uint256 amount, bool claim)
        public
        nonReentrant
        updateReward(msg.sender)
        returns (bool)
    {
        //also withdraw from linked rewards
        for (uint256 i = 0; i < extraRewards.length(); i++) {
            IRewards(extraRewards.at(i)).withdraw(msg.sender, amount);
        }

        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = _balances[msg.sender].sub(amount);

        //tell operator to withdraw from here directly to user
        IDeposit(operator).withdrawTo(pid, amount, msg.sender);
        emit Withdrawn(msg.sender, amount);

        //get rewards too
        if (claim) {
            getReward(msg.sender, true);
        }
        return true;
    }

    function withdrawAllAndUnwrap(bool claim) external {
        withdrawAndUnwrap(_balances[msg.sender], claim);
    }

    function getReward(address _account, bool _claimExtras)
        public
        nonReentrant
        updateReward(_account)
        returns (bool)
    {
        uint256 reward = earned(_account);
        if (reward > 0) {
            rewards[_account] = 0;
            rewardToken.safeTransfer(_account, reward);
            IDeposit(operator).rewardClaimed(pid, _account, reward);
            emit RewardPaid(_account, reward);
        }

        //also get rewards from linked rewards
        if (_claimExtras) {
            for (uint256 i = 0; i < extraRewards.length(); i++) {
                IRewards(extraRewards.at(i)).getReward(_account);
            }
        }
        return true;
    }

    function getReward() external returns (bool) {
        getReward(msg.sender, true);
        return true;
    }

    function donate(uint256 _amount) external {
        uint256 balanceBefore = IERC20(rewardToken).balanceOf(address(this));
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), _amount);
        uint256 balanceAfter = IERC20(rewardToken).balanceOf(address(this));
        _amount = balanceAfter.sub(balanceBefore);
        queuedRewards = queuedRewards.add(_amount);
        emit Donated(queuedRewards);
    }

    function queueNewRewards(uint256 _rewards) external returns (bool) {
        require(msg.sender == operator, "!authorized");

        _rewards = _rewards.add(queuedRewards);

        if (block.timestamp >= periodFinish) {
            queuedRewards = notifyRewardAmount(_rewards);
            return true;
        }

        //et = now - (finish-duration)
        uint256 elapsedTime = block.timestamp.sub(periodFinish.sub(duration));
        //current at now: rewardRate * elapsedTime
        uint256 currentAtNow = rewardRate * elapsedTime;
        uint256 queuedRatio = currentAtNow.mul(1000).div(_rewards);

        //uint256 queuedRatio = currentRewards.mul(1000).div(_rewards);
        if (queuedRatio < newRewardRatio) {
            queuedRewards = notifyRewardAmount(_rewards);
        } else {
            queuedRewards = _rewards;
        }
        return true;
    }

    function notifyRewardAmount(uint256 reward)
        internal
        updateReward(address(0))
        returns (uint256 _extraAmount)
    {
        historicalRewards = historicalRewards.add(reward);
        if (block.timestamp >= periodFinish) {
            rewardRate = reward.div(duration);
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardRate);
            reward = reward.add(leftover);
            rewardRate = reward.div(duration);
        }

        uint256 _actualReward = rewardRate.mul(duration);
        if (reward > _actualReward) {
            _extraAmount = reward.sub(_actualReward);
        }

        uint256 balance = rewardToken.balanceOf(address(this));
        require(rewardRate <= balance.div(duration), "Provided reward too high");

        currentRewards = reward;
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(duration);
        emit RewardAdded(reward);
    }

    function recoverUnuserReward(address _destination) external updateReward(address(0)) {
        require(msg.sender == operator, "!authorized");
        require(address(rewardToken) != address(stakingToken), "Cannot withdraw staking token");
        require(block.timestamp > periodFinish, "Cannot withdraw active reward");

        uint256 _amount = rewardToken.balanceOf(address(this));
        if (_amount > 0) {
            rewardToken.safeTransfer(_destination, _amount);
        }
    }
}
