// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./Interfaces/IPools.sol";
import "./Interfaces/IRegistry.sol";
import "./Interfaces/IVoteEscrow.sol";

contract PoolManager is OwnableUpgradeable {
    using AddressUpgradeable for address;
    using SafeMath for uint256;

    function __PoolManager_init() external initializer {
        __Ownable_init();
    }

    //add a new veAsset pool to the system.
    //gauge must be on veAsset's gaugeProxy, thus anyone can call
    // use by pickle
    function addPool(
        address _gauge,
        address _pools,
        uint256 _stashVersion,
        IVoteEscrow.EscrowModle _escrowModle
    ) external onlyOwner returns (bool) {
        require(_gauge != address(0), "gauge is 0");
        require(_pools != address(0), "pools is 0");

        bool gaugeExists = IPools(_pools).gaugeMap(_gauge);
        require(!gaugeExists, "already registered");
        address _lpToken;
        if (_escrowModle == IVoteEscrow.EscrowModle.PICKLE) {
            _lpToken = IRegistry(_gauge).TOKEN();
        } else if (_escrowModle == IVoteEscrow.EscrowModle.IDLE) {
            _lpToken = IRegistry(_gauge).staking_token();
        } else {
            _lpToken = IRegistry(_gauge).lp_token();
        }
        bool gaugeTokenExists = IPools(_pools).gaugeTokenMap(_lpToken);
        require(!gaugeTokenExists, "gauge token already registered");

        IPools(_pools).addPool(_lpToken, _gauge, _stashVersion);

        return true;
    }

    function shutdownPool(address _pools, uint256 _pid) external onlyOwner returns (bool) {
        IPools(_pools).shutdownPool(_pid);
        return true;
    }
}
