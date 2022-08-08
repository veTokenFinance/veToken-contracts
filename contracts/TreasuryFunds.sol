// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

//receive treasury funds. operator can withdraw
//allow execute so that certain funds could be staked etc
//allow treasury ownership to be transfered during the vesting stage
contract TreasuryFunds is Ownable{
    using SafeERC20 for IERC20;
    using Address for address;

    event WithdrawTo(address indexed user, uint256 amount);

    function withdrawTo(IERC20 _asset, uint256 _amount, address _to) external onlyOwner{
        _asset.safeTransfer(_to, _amount);
        emit WithdrawTo(_to, _amount);
    }

    function execute(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external onlyOwner returns (bool, bytes memory) {

        (bool success, bytes memory result) = _to.call{value:_value}(_data);

        return (success, result);
    }

}
