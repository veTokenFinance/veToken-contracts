// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Ve3dVestedEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;

    address public admin;
    address public funder;

    uint64 public startTime;
    uint64 public immutable totalTime;

    bool public initialised = false;

    mapping(address => uint256) public totalLocked;
    mapping(address => uint256) public totalClaimed;

    event Funded(address indexed recipient, uint256 reward);
    event Cancelled(address indexed recipient);
    event Claim(address indexed user, uint256 amount);
    event AdminChanged(address indexed newAdmin);
    event FunderChanged(address indexed newFunder);
    event StartTimeChanged(uint64 newStartTime);

    /**
     * @param rewardToken_    Reward token (VE3D)
     * @param admin_          Admin to cancel rewards
     * @param funder_         Funder to fund rewards
     * @param startTime_      Timestamp when claim starts
     * @param totalTime_      Total vesting period
     */
    constructor(
        address rewardToken_,
        address admin_,
        address funder_,
        uint64 startTime_,
        uint64 totalTime_
    ) {
        require(startTime_ >= block.timestamp, "start must be future");
        require(totalTime_ >= 16 weeks, "!short");
        require(
            rewardToken_ != address(0) &&
                admin_ != address(0) &&
                funder_ != address(0),
            "!zero address"
        );

        rewardToken = IERC20(rewardToken_);
        admin = admin_;
        funder = funder_;

        startTime = startTime_;
        totalTime = totalTime_;
    }

    /***************************************
                    SETUP
    ****************************************/

    /**
     * @notice Change contract admin
     * @param _admin New admin address
     */
    function setAdmin(address _admin) external {
        require(msg.sender == admin, "!auth");
        require(_admin != address(0), "!zero address");
        admin = _admin;
        emit AdminChanged(_admin);
    }

    /**
     * @notice Change funder
     * @param _funder New funder address
     */
    function setFunder(address _funder) external {
        require(msg.sender == admin, "!auth");
        require(_funder != address(0), "!zero address");
        funder = _funder;
        emit FunderChanged(_funder);
    }

    /**
     * @notice Change start time
     * @param _startTime New start time
     */
    function setStartTime(uint64 _startTime) external {
        require(msg.sender == admin, "!auth");
        require(_startTime >= block.timestamp, "start must be future");
        startTime = _startTime;
        emit StartTimeChanged(_startTime);
    }

    /**
     * @notice Fund recipients with rewardTokens
     * @param _recipient  Array of recipients to vest rewardTokens for
     * @param _amount     Arrary of amount of rewardTokens to vest
     */
    function fund(address[] calldata _recipient, uint256[] calldata _amount)
        external
        nonReentrant
    {
        uint256 len = _recipient.length;
        require(len == _amount.length && len != 0, "!arr");
        require(!initialised, "initialised already");
        require(msg.sender == funder, "!funder");
        require(block.timestamp < startTime, "already started");

        uint256 totalAmount;
        for (uint256 i = 0; i < len; i++) {
            uint256 amount = _amount[i];

            require(amount != 0, "!zero amount");

            totalLocked[_recipient[i]] += amount;
            totalAmount += amount;

            emit Funded(_recipient[i], amount);
        }
        rewardToken.safeTransferFrom(msg.sender, address(this), totalAmount);
        initialised = true;
    }

    /**
     * @notice Cancel recipients vesting rewardTokens
     * @param _recipient Recipient address
     */
    function cancel(address _recipient) external nonReentrant {
        require(msg.sender == admin, "!auth");
        require(totalLocked[_recipient] != 0, "!funding");

        _claim(_recipient);

        uint256 delta = remaining(_recipient);

        if (delta != 0) {
            rewardToken.safeTransfer(admin, delta);
        }

        totalLocked[_recipient] = 0;

        emit Cancelled(_recipient);
    }

    /***************************************
                    VIEWS
    ****************************************/

    /**
     * @notice Available amount to claim
     * @param _recipient Recipient to lookup
     */
    function available(address _recipient) public view returns (uint256) {
        uint256 vested = _totalVestedOf(_recipient, block.timestamp);
        return vested - totalClaimed[_recipient];
    }

    /**
     * @notice Total remaining vested amount
     * @param _recipient Recipient to lookup
     */
    function remaining(address _recipient) public view returns (uint256) {
        uint256 vested = _totalVestedOf(_recipient, block.timestamp);
        return totalLocked[_recipient] - vested;
    }

    /**
     * @notice Get total amount vested for this timestamp
     * @param _recipient  Recipient to lookup
     * @param _time       Timestamp to check vesting amount for
     */
    function _totalVestedOf(address _recipient, uint256 _time)
        internal
        view
        returns (uint256 total)
    {
        if (_time < startTime) {
            return 0;
        }
        uint256 locked = totalLocked[_recipient];
        uint256 elapsed = _time - startTime;
        total = Math.min((locked * elapsed) / totalTime, locked);
    }

    /***************************************
                    CLAIM
    ****************************************/

    function claim() external nonReentrant {
        require(_claim(msg.sender), "no reward");
    }

    /**
     * @dev Claim reward token (VE3D).
     * @param _recipient  Address to receive rewards.
     * @return success Indicates success or failure
     */
    function _claim(address _recipient) internal returns (bool success) {
        uint256 claimable = available(_recipient);

        success = claimable != 0;

        if (success) {
            totalClaimed[_recipient] += claimable;
            rewardToken.safeTransfer(_recipient, claimable);
            emit Claim(_recipient, claimable);
        }
    }
}
