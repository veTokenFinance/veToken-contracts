// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Interfaces/IGauge.sol";
import "./Interfaces/IRewardFactory.sol";
import "./Interfaces/IStaker.sol";
import "./Interfaces/IDeposit.sol";
import "./Interfaces/IRewards.sol";

contract ExtraRewardStashV3 {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    uint256 private constant maxRewards = 8;
    uint256 private constant WEEK = 7 * 86400;

    uint256 public immutable pid;
    address public immutable veAsset;
    address public immutable operator;
    address public immutable staker;
    address public immutable gauge;
    address public immutable rewardFactory;

    mapping(address => uint256) public historicalRewards;
    bool public hasRedirected;

    struct TokenInfo {
        address token;
        address rewardAddress;
    }
    uint256 public tokenCount;
    TokenInfo[maxRewards] public tokenInfo;

    constructor(
        uint256 _pid,
        address _veAsset,
        address _operator,
        address _staker,
        address _gauge,
        address _rFactory
    ) {
        pid = _pid;
        veAsset = _veAsset;
        operator = _operator;
        staker = _staker;
        gauge = _gauge;
        rewardFactory = _rFactory;
    }

    function getName() external pure returns (string memory) {
        return "ExtraRewardStashV3";
    }

    //try claiming if there are reward tokens registered
    function claimRewards() external returns (bool) {
        require(msg.sender == operator, "!authorized");

        //this is updateable from v2 gauges now so must check each time.
        checkForNewRewardTokens();

        //make sure we're redirected
        if (!hasRedirected) {
            IDeposit(operator).setGaugeRedirect(pid);
            hasRedirected = true;
        }

        uint256 length = tokenCount;
        if (length > 0) {
            //claim rewards on gauge for staker
            //using reward_receiver so all rewards will be moved to this stash
            IDeposit(operator).claimRewards(pid, gauge);
        }
        return true;
    }

    //check if gauge rewards have changed
    function checkForNewRewardTokens() internal {
        for (uint256 i = 0; i < maxRewards; i++) {
            address token = IGauge(gauge).reward_tokens(i);
            if (token == address(0)) {
                if (i != tokenCount) {
                    tokenCount = i;
                }
                break;
            }
            setToken(i, token);
        }
    }

    //replace a token on token list
    function setToken(uint256 _tid, address _token) internal {
        TokenInfo storage t = tokenInfo[_tid];
        address currentToken = t.token;
        if (currentToken != _token) {
            //set token address
            t.token = _token;

            //create new reward contract
            (, , , address mainRewardContract, , ) = IDeposit(operator).poolInfo(pid);
            address rewardContract = IRewardFactory(rewardFactory).CreateTokenRewards(
                _token,
                mainRewardContract
            );
            t.rewardAddress = rewardContract;
        }
    }

    //pull assigned tokens from staker to stash
    function stashRewards() external pure returns (bool) {
        //after depositing/withdrawing, extra incentive tokens are claimed
        //but from v3 this is default to off, and this stash is the reward receiver too.

        return true;
    }

    //send all extra rewards to their reward contracts
    function processStash() external returns (bool) {
        require(msg.sender == operator, "!authorized");

        for (uint256 i = 0; i < tokenCount; i++) {
            TokenInfo storage t = tokenInfo[i];
            address token = t.token;
            if (token == address(0)) continue;

            uint256 amount = IERC20(token).balanceOf(address(this));
            if (amount > 0) {
                historicalRewards[token] = historicalRewards[token].add(amount);
                if (token == veAsset) {
                    //if veAsset, send back to booster to distribute
                    IERC20(token).safeTransfer(operator, amount);
                    continue;
                }
                //add to reward contract
                address rewards = t.rewardAddress;
                if (rewards == address(0)) continue;
                IERC20(token).safeTransfer(rewards, amount);
                IRewards(rewards).queueNewRewards(amount);
            }
        }
        return true;
    }
}
