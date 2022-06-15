// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./helper/MathUtil.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';


interface IBasicRewards{
    function getReward(address _account, bool _claimExtras) external;
    function getReward(address _account) external;
    function getReward(address _account, address _token) external;
    function stakeFor(address, uint256) external;
}

interface IVeTokenRewards {
    function getReward(address _account, bool _claimExtras, bool _stake) external;
}

// ToDo: delete when we confirm it's obsolete
//interface IChefRewards{
//    function claim(uint256 _pid, address _account) external;
//}

interface IVe3TokenDeposit {
    function deposit(uint256, bool) external;
}

interface ISwapExchange {

    function exchange(
        int128,
        int128,
        uint256,
        uint256
    ) external returns (uint256);
}

interface IVE3DLocker {
    function getReward(address _account, bool _stake) external;
    function lock(address _account, uint256 _amount) external;
}

contract ClaimZap{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address public veAsset;
    address public veToken;
    address public ve3Token;
    address public veAssetDeposit;
    address public ve3TokenRewards;
    address public ve3dRewards;

    address public exchange;

    address public locker;

    address public immutable owner;

    enum Options{
        ClaimVeToken, //1
        ClaimVeTokenAndStake, //2
        ClaimVe3Token, //4
        ClaimLockedVeToken, //8
        ClaimLockedVeTokenStake, //16
        LockVeAssetDeposit, //32
        UseAllWalletFunds, //64
        LockVeToken //128
    }

    constructor(
        address _veAsset,
        address _veToken,
        address _ve3Token,
        address _veAssetDeposit,
        address _ve3TokenRewards,
        address _ve3dRewards,
        address _exchange,
        address _locker
    ) {
        veAsset = _veAsset;
        veToken = _veToken;
        ve3Token = _ve3Token;
        veAssetDeposit = _veAssetDeposit;
        ve3TokenRewards = _ve3TokenRewards;
        ve3dRewards = _ve3dRewards;
        exchange = _exchange;
        locker = _locker;
        owner = msg.sender;
    }

    function getName() external pure returns (string memory) {
        return "ClaimZap V2.0";
    }

    function setApprovals() external {
        require(msg.sender == owner, "!auth");
        IERC20(veAsset).safeApprove(veAssetDeposit, 0);
        IERC20(veAsset).safeApprove(veAssetDeposit, type(uint256).max);
        IERC20(veAsset).safeApprove(exchange, 0);
        IERC20(veAsset).safeApprove(exchange, type(uint256).max);

        IERC20(veToken).safeApprove(ve3dRewards, 0);
        IERC20(veToken).safeApprove(ve3dRewards, type(uint256).max);

        IERC20(ve3Token).safeApprove(ve3TokenRewards, 0);
        IERC20(ve3Token).safeApprove(ve3TokenRewards, type(uint256).max);

        IERC20(veToken).safeApprove(locker, 0);
        IERC20(veToken).safeApprove(locker, type(uint256).max);
    }

    function CheckOption(uint256 _mask, uint256 _flag) internal pure returns(bool){
        return (_mask & (1<<_flag)) != 0;
    }

    function claimRewards(
        address[] calldata rewardContracts,
        address[] calldata extraRewardContracts,
        address[] calldata tokenRewardContracts,
        address[] calldata tokenRewardTokens,
        uint256 depositVeAssetMaxAmount,
        uint256 minAmountOut,
        uint256 depositVeTokenMaxAmount,
        uint256 options
    ) external{
        uint256 veAssetBalance = IERC20(veAsset).balanceOf(msg.sender);
        uint256 veTokenBalance = IERC20(veToken).balanceOf(msg.sender);

        //claim from main curve LP pools
        for(uint256 i = 0; i < rewardContracts.length; i++){
            IBasicRewards(rewardContracts[i]).getReward(msg.sender,true);
        }
        //claim from extra rewards
        for(uint256 i = 0; i < extraRewardContracts.length; i++){
            IBasicRewards(extraRewardContracts[i]).getReward(msg.sender);
        }
        //claim from multi reward token contract
        for(uint256 i = 0; i < tokenRewardContracts.length; i++){
            IBasicRewards(tokenRewardContracts[i]).getReward(msg.sender,tokenRewardTokens[i]);
        }

        //claim others/deposit/lock/stake
        _claimExtras(depositVeAssetMaxAmount,minAmountOut, depositVeTokenMaxAmount, veAssetBalance, veTokenBalance,options);
    }

    function _claimExtras(
        uint256 depositVeAssetMaxAmount,
        uint256 minAmountOut,
        uint256 depositVeTokenMaxAmount,
        uint256 removeVeAssetBalance,
        uint256 removeVeTokenBalance,
        uint256 options
    ) internal{

        //claim (and stake) from veToken rewards
        if(CheckOption(options,uint256(Options.ClaimVeTokenAndStake))){
            IVeTokenRewards(ve3dRewards).getReward(msg.sender,true,true);
        }else if(CheckOption(options,uint256(Options.ClaimVeToken))){
            IVeTokenRewards(ve3dRewards).getReward(msg.sender,true,false);
        }

        //claim from ve3Token rewards
        if(CheckOption(options,uint256(Options.ClaimVe3Token))){
            IBasicRewards(ve3TokenRewards).getReward(msg.sender,true);
        }

        //claim from locker
        if(CheckOption(options,uint256(Options.ClaimLockedVeToken))){
            IVE3DLocker(locker).getReward(msg.sender,CheckOption(options,uint256(Options.ClaimLockedVeTokenStake)));
        }

        //reset remove balances if we want to also stake/lock funds already in our wallet
        if(CheckOption(options,uint256(Options.UseAllWalletFunds))){
            removeVeAssetBalance = 0;
            removeVeTokenBalance = 0;
        }

        //lock upto given amount of veAsset and stake
        if(depositVeAssetMaxAmount > 0){
            uint256 veAssetBalance = IERC20(veAsset).balanceOf(msg.sender).sub(removeVeAssetBalance);
            veAssetBalance = MathUtil.min(veAssetBalance, depositVeAssetMaxAmount);
            if(veAssetBalance > 0){
                //pull veAsset
                IERC20(veAsset).safeTransferFrom(msg.sender, address(this), veAssetBalance);
                if(minAmountOut > 0){
                    //swap
                    ISwapExchange(exchange).exchange(0,1, veAssetBalance,minAmountOut);
                }else{
                    //deposit
                    IVe3TokenDeposit(veAssetDeposit).deposit(veAssetBalance,CheckOption(options,uint256(Options.LockVeAssetDeposit)));
                }
                //get ve3Token amount
                uint256 ve3TokenBalance = IERC20(ve3Token).balanceOf(address(this));
                //stake for msg.sender
                IBasicRewards(ve3TokenRewards).stakeFor(msg.sender, ve3TokenBalance);
            }
        }

        //stake up to given amount of veToken
        if(depositVeTokenMaxAmount > 0){
            uint256 veTokenBalance = IERC20(veToken).balanceOf(msg.sender).sub(removeVeTokenBalance);
            veTokenBalance = MathUtil.min(veTokenBalance, depositVeTokenMaxAmount);
            if(veTokenBalance > 0){
                //pull veToken
                IERC20(veToken).safeTransferFrom(msg.sender, address(this), veTokenBalance);
                if(CheckOption(options,uint256(Options.LockVeToken))){
                    IVE3DLocker(locker).lock(msg.sender, veTokenBalance);
                }else{
                    //stake for msg.sender
                    IBasicRewards(ve3dRewards).stakeFor(msg.sender, veTokenBalance);
                }
            }
        }
    }

}