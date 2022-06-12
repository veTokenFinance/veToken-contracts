// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./ExtraRewardStashV1.sol";
import "./ExtraRewardStashV2.sol";
import "./ExtraRewardStashV3.sol";

contract StashFactory is Ownable {
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes4 private constant rewarded_token = 0x16fa50b1; //rewarded_token()
    bytes4 private constant reward_tokens = 0x54c49fe9; //reward_tokens(uint256)
    bytes4 private constant rewards_receiver = 0x01ddabf1; //rewards_receiver(address)

    address public rewardFactory;
    EnumerableSet.AddressSet internal operators;

    constructor(address _rewardFactory) {
        rewardFactory = _rewardFactory;
    }

    function addOperator(address _newOperator) public onlyOwner {
        operators.add(_newOperator);
    }

    function removeOperator(address _operator) public onlyOwner {
        operators.remove(_operator);
    }

    //Create a stash contract for the given gauge.
    //function calls are different depending on the version of curve gauges so determine which stash type is needed
    function CreateStash(
        uint256 _pid,
        address _veAsset,
        address _gauge,
        address _staker,
        uint256 _stashVersion
    ) external returns (address) {
        address operator = _msgSender();

        require(operators.contains(operator), "!authorized");

        if (_stashVersion == uint256(3) && IsV3(_gauge)) {
            //v3
            ExtraRewardStashV3 stash = new ExtraRewardStashV3(
                _pid,
                _veAsset,
                operator,
                _staker,
                _gauge,
                rewardFactory
            );
            return address(stash);
        } else if (_stashVersion == uint256(1) && IsV1(_gauge)) {
            //v1
            ExtraRewardStashV1 stash = new ExtraRewardStashV1(
                _pid,
                operator,
                _staker,
                _gauge,
                rewardFactory
            );
            return address(stash);
        } else if (_stashVersion == uint256(2) && !IsV3(_gauge) && IsV2(_gauge)) {
            //v2
            ExtraRewardStashV2 stash = new ExtraRewardStashV2(
                _pid,
                _veAsset,
                operator,
                _staker,
                _gauge,
                rewardFactory
            );
            return address(stash);
        }
        bool isV1 = IsV1(_gauge);
        bool isV2 = IsV2(_gauge);
        bool isV3 = IsV3(_gauge);
        require(!isV1 && !isV2 && !isV3, "stash version mismatch");
        return address(0);
    }

    function IsV1(address _gauge) private returns (bool) {
        bytes memory data = abi.encode(rewarded_token);
        (bool success, ) = _gauge.call(data);
        return success;
    }

    function IsV2(address _gauge) private returns (bool) {
        bytes memory data = abi.encodeWithSelector(reward_tokens, uint256(0));
        (bool success, ) = _gauge.call(data);
        return success;
    }

    function IsV3(address _gauge) private returns (bool) {
        bytes memory data = abi.encodeWithSelector(rewards_receiver, address(0));
        (bool success, ) = _gauge.call(data);
        return success;
    }
}
