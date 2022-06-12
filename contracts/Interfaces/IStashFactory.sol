// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IStashFactory {
    function CreateStash(
        uint256,
        address,
        address,
        address,
        uint256
    ) external returns (address);
}
