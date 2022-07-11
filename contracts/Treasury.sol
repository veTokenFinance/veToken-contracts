// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Treasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;

    address public admin;
    address public funder;

    uint64 public immutable startTime;
    uint64 public immutable totalTime;

    uint256 public totalLocked;
    uint256 public totalClaimed;

    event Funded(uint256 reward);
    event Claim(address indexed user, uint256 amount);
    event AdminChanged(address indexed newAdmin);
    event FunderChanged(address indexed newFunder);

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
     * @notice Fund vested amount
     * @param _amount     Vested amount
     */
    function fund(uint256 _amount) external nonReentrant {
        require(totalLocked == 0, "initialised already");
        require(msg.sender == funder, "!funder");
        require(block.timestamp < startTime, "already started");
        require(_amount != 0, "!zero amount");

        emit Funded(_amount);

        totalLocked = _amount;

        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
    }

    /***************************************
                    VIEWS
    ****************************************/

    /**
     * @notice Available amount to claim
     */
    function available() public view returns (uint256) {
        uint256 vested = _totalVestedOf(block.timestamp);
        return vested - totalClaimed;
    }

    /**
     * @notice Total remaining vested amount
     */
    function remaining() public view returns (uint256) {
        uint256 vested = _totalVestedOf(block.timestamp);
        return totalLocked - vested;
    }

    /**
     * @notice Get total amount vested for this timestamp
     * @param _time       Timestamp to check vesting amount for
     */
    function _totalVestedOf(uint256 _time)
        internal
        view
        returns (uint256 total)
    {
        if (_time < startTime) {
            return 0;
        }
        uint256 locked = totalLocked;
        uint256 elapsed = _time - startTime;
        total = Math.min((locked * elapsed) / totalTime, locked);
    }

    /***************************************
                    CLAIM
    ****************************************/

    function claim() external nonReentrant {
        require(msg.sender == admin, "!auth");
        require(_claim(), "no reward");
    }

    /**
     * @dev Claim reward token (VE3D).
     * @return success Indicates success or failure
     */
    function _claim() internal returns (bool success) {
        uint256 claimable = available();

        success = claimable != 0;

        if (success) {
            totalClaimed += claimable;
            rewardToken.safeTransfer(admin, claimable);
            emit Claim(admin, claimable);
        }
    }
}
