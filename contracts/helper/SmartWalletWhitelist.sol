/**
 *Submitted for verification at Etherscan.io on 2020-08-24
 */

// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

interface SmartWalletChecker {
    function check(address) external view returns (bool);
}

interface IExchange {
    function swapExactTokensForTokens(
        uint256,
        uint256,
        address[] calldata,
        address,
        uint256
    ) external;
}

contract SmartWalletWhitelist {
    mapping(address => bool) public wallets;
    address public dao;
    address public checker;
    address public future_checker;

    event ApproveWallet(address);
    event RevokeWallet(address);

    constructor(address _dao) {
        dao = _dao;
        wallets[0xF147b8125d2ef93FB6965Db97D6746952a133934] = true;
        emit ApproveWallet(0xF147b8125d2ef93FB6965Db97D6746952a133934);
    }

    function commitSetChecker(address _checker) external {
        require(msg.sender == dao, "!dao");
        future_checker = _checker;
    }

    function applySetChecker() external {
        require(msg.sender == dao, "!dao");
        checker = future_checker;
    }

    function approveWallet(address _wallet) public {
        require(msg.sender == dao, "!dao");
        wallets[_wallet] = true;

        emit ApproveWallet(_wallet);
    }

    function revokeWallet(address _wallet) external {
        require(msg.sender == dao, "!dao");
        wallets[_wallet] = false;

        emit RevokeWallet(_wallet);
    }

    function check(address _wallet) external view returns (bool) {
        bool _check = wallets[_wallet];
        if (_check) {
            return _check;
        } else {
            if (checker != address(0)) {
                return SmartWalletChecker(checker).check(_wallet);
            }
        }
        return false;
    }
}
