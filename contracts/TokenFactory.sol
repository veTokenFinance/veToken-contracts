// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./DepositToken.sol";

contract TokenFactory is Ownable {
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet internal operators;

    function addOperator(address _newOperator) public onlyOwner {
        operators.add(_newOperator);
    }

    function removeOperator(address _operator) public onlyOwner {
        operators.remove(_operator);
    }

    function CreateDepositToken(address _lptoken) external returns (address) {
        require(operators.contains(_msgSender()), "!authorized");

        DepositToken dtoken = new DepositToken(_msgSender(), _lptoken);
        return address(dtoken);
    }
}
