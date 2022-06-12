// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IVeAssetDeposit {
    function deposit(uint256, bool) external;

    function lockIncentive() external view returns (uint256);
}
