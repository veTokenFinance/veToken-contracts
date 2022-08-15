// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IVe3dLocker {
    function getReward(address _account, bool _stake) external;
    function lock(address _account, uint256 _amount) external;
}
