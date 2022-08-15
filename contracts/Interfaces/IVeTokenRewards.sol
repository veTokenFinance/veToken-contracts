// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IVeTokenRewards {
    function getReward(address _account, bool _claimExtras, bool _stake) external;
}
