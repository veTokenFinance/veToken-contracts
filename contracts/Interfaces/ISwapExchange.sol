// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface ISwapExchange {
    function exchange(
        int128,
        int128,
        uint256,
        uint256
    ) external returns (uint256);
}
