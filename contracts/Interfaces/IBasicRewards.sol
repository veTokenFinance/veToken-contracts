// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IBasicRewards{
    function getReward(address _account, bool _claimExtras) external;
    function getReward(address _account) external;
    function getReward(address _account, address _token) external;
    function stakeFor(address, uint256) external;
}
