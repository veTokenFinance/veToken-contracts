// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./BaseRewardPool.sol";
import "./VirtualBalanceRewardPool.sol";

contract RewardFactory is Ownable {
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(address => bool) private rewardAccess;
    mapping(address => uint256[]) public rewardActiveList;
    // operator => veAsset token
    mapping(address => address) public veAssets;
    EnumerableSet.AddressSet internal operators;

    function addOperator(address _newOperator, address _veAsset) public onlyOwner {
        operators.add(_newOperator);
        veAssets[_newOperator] = _veAsset;
    }

    function removeOperator(address _operator) public onlyOwner {
        operators.remove(_operator);
        veAssets[_operator] = address(0);
    }

    //Get active count function
    function activeRewardCount(address _reward) external view returns (uint256) {
        return rewardActiveList[_reward].length;
    }

    function addActiveReward(address _reward, uint256 _pid) external returns (bool) {
        require(rewardAccess[msg.sender] == true, "!auth");
        if (_reward == address(0)) {
            return true;
        }

        uint256[] storage activeList = rewardActiveList[_reward];
        uint256 pid = _pid + 1; //offset by 1 so that we can use 0 as empty

        uint256 length = activeList.length;
        for (uint256 i = 0; i < length; i++) {
            if (activeList[i] == pid) return true;
        }
        activeList.push(pid);
        return true;
    }

    function removeActiveReward(address _reward, uint256 _pid) external returns (bool) {
        require(rewardAccess[msg.sender] == true, "!auth");
        if (_reward == address(0)) {
            return true;
        }

        uint256[] storage activeList = rewardActiveList[_reward];
        uint256 pid = _pid + 1; //offset by 1 so that we can use 0 as empty

        uint256 length = activeList.length;
        for (uint256 i = 0; i < length; i++) {
            if (activeList[i] == pid) {
                if (i != length - 1) {
                    activeList[i] = activeList[length - 1];
                }
                activeList.pop();
                break;
            }
        }
        return true;
    }

    //stash contracts need access to create new Virtual balance pools for extra gauge incentives(ex. snx)
    function setAccess(address _stash, bool _status) external {
        require(operators.contains(_msgSender()), "!auth");
        rewardAccess[_stash] = _status;
    }

    //Create a Managed Reward Pool to handle distribution of all veAsset mined in a pool
    function CreateVeAssetRewards(uint256 _pid, address _depositToken) external returns (address) {
        require(operators.contains(_msgSender()), "!auth");

        //operator = booster(deposit) contract so that new veAsset can be added and distributed
        //reward manager = this factory so that extra incentive tokens(ex. snx) can be linked to the main managed reward pool
        BaseRewardPool rewardPool = new BaseRewardPool(
            _pid,
            _depositToken,
            veAssets[_msgSender()],
            _msgSender(),
            address(this)
        );
        return address(rewardPool);
    }

    //create a virtual balance reward pool that mimicks the balance of a pool's main reward contract
    //used for extra incentive tokens(ex. snx) as well as veVeAsset fees
    function CreateTokenRewards(address _token, address _mainRewards) external returns (address) {
        require(operators.contains(_msgSender()) || rewardAccess[_msgSender()] == true, "!auth");

        //create new pool, use main pool for balance lookup
        VirtualBalanceRewardPool rewardPool = new VirtualBalanceRewardPool(
            _mainRewards,
            _token,
            _msgSender()
        );
        address rAddress = address(rewardPool);
        //add the new pool to main pool's list of extra rewards, assuming this factory has "reward manager" role
        IRewards(_mainRewards).addExtraReward(rAddress);
        //return new pool's address
        return rAddress;
    }
}
