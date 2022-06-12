// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Interfaces/IStaker.sol";
import "./Interfaces/ITokenMinter.sol";
import "./Interfaces/IRewards.sol";

contract VeAssetDepositor {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    uint256 private constant WEEK = 7 * 86400;

    uint256 public lockIncentive = 10; //incentive to users who spend gas to lock veAsset
    uint256 public constant FEE_DENOMINATOR = 10000;

    address public immutable veAsset;
    address public immutable escrow;
    address public feeManager;
    address public immutable staker;
    address public immutable minter;
    uint256 public incentiveVeAsset = 0;
    uint256 public unlockTime;
    uint256 private maxTime;

    event FeeManagerUpdated(address indexed feeManager);
    event FeesUpdated(uint256 lockIncentive);
    event InitialLockCreated(uint256 veAssetBalanceStaker, uint256 unlockInWeeks);
    event LockUpdated(uint256 veAssetBalanceStaker, uint256 unlockInWeeks);
    event Deposited(address indexed user, uint256 amount, bool lock);

    constructor(
        address _staker,
        address _minter,
        address _veAsset,
        address _escrow,
        uint256 _maxTime
    ) {
        staker = _staker;
        minter = _minter;
        veAsset = _veAsset;
        escrow = _escrow;
        feeManager = msg.sender;
        maxTime = _maxTime;
    }

    function setFeeManager(address _feeManager) external {
        require(msg.sender == feeManager, "!auth");
        feeManager = _feeManager;
        emit FeeManagerUpdated(_feeManager);
    }

    function setFees(uint256 _lockIncentive) external {
        require(msg.sender == feeManager, "!auth");

        if (_lockIncentive >= 0 && _lockIncentive <= 30) {
            lockIncentive = _lockIncentive;
            emit FeesUpdated(_lockIncentive);
        }
    }

    function initialLock() external {
        require(msg.sender == feeManager, "!auth");

        uint256 veVeAsset = IERC20(escrow).balanceOf(staker);
        if (veVeAsset == 0) {
            uint256 unlockAt = block.timestamp + maxTime;
            uint256 unlockInWeeks = (unlockAt / WEEK) * WEEK;

            //release old lock if exists
            IStaker(staker).release();
            //create new lock
            uint256 veAssetBalanceStaker = IERC20(veAsset).balanceOf(staker);
            IStaker(staker).createLock(veAssetBalanceStaker, unlockAt);
            unlockTime = unlockInWeeks;
            emit InitialLockCreated(veAssetBalanceStaker, unlockInWeeks);
        }
    }

    //lock veAsset
    function _lockVeAsset() internal {
        uint256 veAssetBalance = IERC20(veAsset).balanceOf(address(this));
        if (veAssetBalance > 0) {
            IERC20(veAsset).safeTransfer(staker, veAssetBalance);
        }

        //increase ammount
        uint256 veAssetBalanceStaker = IERC20(veAsset).balanceOf(staker);
        if (veAssetBalanceStaker == 0) {
            return;
        }

        //increase amount
        IStaker(staker).increaseAmount(veAssetBalanceStaker);

        uint256 unlockAt = block.timestamp + maxTime;
        uint256 unlockInWeeks = (unlockAt / WEEK) * WEEK;

        //increase time too if over 2 week buffer
        if (unlockInWeeks.sub(unlockTime) > 2) {
            IStaker(staker).increaseTime(unlockAt);
            unlockTime = unlockInWeeks;
        }
        emit LockUpdated(veAssetBalanceStaker, unlockTime);
    }

    function lockVeAsset() external {
        _lockVeAsset();

        //mint incentives
        if (incentiveVeAsset > 0) {
            ITokenMinter(minter).mint(msg.sender, incentiveVeAsset);
            incentiveVeAsset = 0;
        }
    }

    //deposit veAsset for ve3Token
    //can locking immediately or defer locking to someone else by paying a fee.
    //while users can choose to lock or defer, this is mostly in place so that
    //the vetoken reward contract isnt costly to claim rewards
    function deposit(
        uint256 _amount,
        bool _lock,
        address _stakeAddress
    ) public {
        require(_amount > 0, "!>0");

        if (_lock) {
            //lock immediately, transfer directly to staker to skip an erc20 transfer
            IERC20(veAsset).safeTransferFrom(msg.sender, staker, _amount);
            _lockVeAsset();
            if (incentiveVeAsset > 0) {
                //add the incentive tokens here so they can be staked together
                _amount = _amount.add(incentiveVeAsset);
                incentiveVeAsset = 0;
            }
        } else {
            //move tokens here
            IERC20(veAsset).safeTransferFrom(msg.sender, address(this), _amount);
            //defer lock cost to another user
            uint256 callIncentive = _amount.mul(lockIncentive).div(FEE_DENOMINATOR);
            _amount = _amount.sub(callIncentive);

            //add to a pool for lock caller
            incentiveVeAsset = incentiveVeAsset.add(callIncentive);
        }

        bool depositOnly = _stakeAddress == address(0);
        if (depositOnly) {
            //mint for msg.sender
            ITokenMinter(minter).mint(msg.sender, _amount);
        } else {
            //mint here
            ITokenMinter(minter).mint(address(this), _amount);
            //stake for msg.sender
            IERC20(minter).safeApprove(_stakeAddress, _amount);
            IRewards(_stakeAddress).stakeFor(msg.sender, _amount);
        }

        emit Deposited(msg.sender, _amount, _lock);
    }

    function deposit(uint256 _amount, bool _lock) external {
        deposit(_amount, _lock, address(0));
    }

    function depositAll(bool _lock, address _stakeAddress) external {
        uint256 veAssetBal = IERC20(veAsset).balanceOf(msg.sender);
        deposit(veAssetBal, _lock, _stakeAddress);
    }
}
