// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

/*
Based on Convex Finance's Vested Escrow
found at https://github.com/convex-eth/platform/blob/main/contracts/contracts/VestedEscrow.sol

Changes:
- add setStartTime function
- add cancel function
*/
import "./helper/MathUtil.sol";
import "./Interfaces/IRewards.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


contract VestedEscrow is ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public rewardToken;
    address public admin;
    address public fundAdmin;
    address public stakeContract;

    uint256 public startTime;
    uint256 public endTime;
    uint256 public totalTime;
    uint256 public initialLockedSupply;
    uint256 public unallocatedSupply;

    mapping(address => uint256) public initialLocked;
    mapping(address => uint256) public totalClaimed;

    address[] public extraRewards;

    event Fund(address indexed recipient, uint256 reward);
    event Claim(address indexed user, uint256 amount);

    constructor(
        address rewardToken_,
        uint256 starttime_,
        uint256 endtime_,
        address stakeContract_,
        address fundAdmin_
    ) {
        require(starttime_ >= block.timestamp, "start must be future");
        require(endtime_ > starttime_, "end must be greater");

        rewardToken = IERC20(rewardToken_);
        startTime = starttime_;
        endTime = endtime_;
        totalTime = endTime.sub(startTime);
        admin = msg.sender;
        fundAdmin = fundAdmin_;
        stakeContract = stakeContract_;
    }

    function setAdmin(address _admin) external {
        require(msg.sender == admin, "!auth");
        require(_admin != address(0), "!zero address");
        admin = _admin;
    }

    function setFundAdmin(address _fundadmin) external {
        require(msg.sender == admin, "!auth");
        require(_fundadmin != address(0), "!zero address");
        fundAdmin = _fundadmin;
    }

    function setStartTime(uint64 _startTime) external {
        require(msg.sender == admin, "!auth");
        require(_startTime >= block.timestamp, "start must be future");
        require(startTime > block.timestamp, "vesting already started");
        startTime = _startTime;
        endTime = startTime + totalTime;
    }

    function addTokens(uint256 _amount) external returns (bool){
        require(msg.sender == admin, "!auth");

        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
        unallocatedSupply = unallocatedSupply.add(_amount);
        return true;
    }

    function fund(address[] calldata _recipient, uint256[] calldata _amount) external nonReentrant returns (bool){
        require(msg.sender == fundAdmin || msg.sender == admin, "!auth");
        require(_recipient.length == _amount.length && _recipient.length != 0 && _amount.length != 0, "!arr");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _recipient.length; i++) {
            uint256 amount = _amount[i];

            require(amount != 0, "!zero amount");

            initialLocked[_recipient[i]] = initialLocked[_recipient[i]].add(amount);
            totalAmount = totalAmount.add(amount);
            emit Fund(_recipient[i], amount);
        }

        initialLockedSupply = initialLockedSupply.add(totalAmount);
        unallocatedSupply = unallocatedSupply.sub(totalAmount);
        return true;
    }

    function cancel(address _recipient) external nonReentrant {
        require(msg.sender == admin || msg.sender == fundAdmin, "!auth");
        require(initialLocked[_recipient] != 0, "!funding");

        _claim(_recipient);

        uint256 delta = lockedOf(_recipient);

        if (delta != 0) {
            rewardToken.safeTransfer(admin, delta);
        }

        initialLocked[_recipient] = 0;
    }

    function _totalVestedOf(address _recipient, uint256 _time) internal view returns (uint256){
        if (_time < startTime) {
            return 0;
        }
        uint256 locked = initialLocked[_recipient];
        uint256 elapsed = _time.sub(startTime);
        uint256 total = MathUtil.min(locked * elapsed / totalTime, locked);
        return total;
    }

    function _totalVested() internal view returns (uint256){
        uint256 _time = block.timestamp;
        if (_time < startTime) {
            return 0;
        }
        uint256 locked = initialLockedSupply;
        uint256 elapsed = _time.sub(startTime);
        uint256 total = MathUtil.min(locked * elapsed / totalTime, locked);
        return total;
    }

    function vestedSupply() external view returns (uint256){
        return _totalVested();
    }

    function lockedSupply() external view returns (uint256){
        return initialLockedSupply.sub(_totalVested());
    }

    function vestedOf(address _recipient) external view returns (uint256){
        return _totalVestedOf(_recipient, block.timestamp);
    }

    function balanceOf(address _recipient) external view returns (uint256){
        uint256 vested = _totalVestedOf(_recipient, block.timestamp);
        return vested.sub(totalClaimed[_recipient]);
    }

    function lockedOf(address _recipient) public view returns (uint256){
        uint256 vested = _totalVestedOf(_recipient, block.timestamp);
        return initialLocked[_recipient].sub(vested);
    }

    function claimFor(address _recipient) public nonReentrant {
        _claim(_recipient);
    }

    function _claim(address _recipient) internal{
        uint256 vested = _totalVestedOf(_recipient, block.timestamp);
        uint256 claimable = vested.sub(totalClaimed[_recipient]);

        totalClaimed[_recipient] = totalClaimed[_recipient].add(claimable);
        rewardToken.safeTransfer(_recipient, claimable);

        emit Claim(msg.sender, claimable);
    }

    function claim() external {
        claimFor(msg.sender);
    }

    function claimAndStake(address _recipient) internal nonReentrant {
        require(stakeContract != address(0), "no staking contract");
        require(IRewards(stakeContract).stakingToken() == address(rewardToken), "stake token mismatch");

        uint256 vested = _totalVestedOf(_recipient, block.timestamp);
        uint256 claimable = vested.sub(totalClaimed[_recipient]);

        totalClaimed[_recipient] = totalClaimed[_recipient].add(claimable);

        rewardToken.safeApprove(stakeContract, 0);
        rewardToken.safeApprove(stakeContract, claimable);
        IRewards(stakeContract).stakeFor(_recipient, claimable);

        emit Claim(_recipient, claimable);
    }

    function claimAndStake() external {
        claimAndStake(msg.sender);
    }
}
