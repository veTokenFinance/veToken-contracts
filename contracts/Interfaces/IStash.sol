// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IStash {
    function stashRewards() external returns (bool);

    function processStash() external returns (bool);

    function claimRewards() external returns (bool);
}
