// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract VeTokenMinter is Ownable {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public constant maxSupply = 30 * 1000000 * 1e18; //30mil
    ERC20 public veToken;
    EnumerableSet.AddressSet internal operators;
    uint256 public totalCliffs;
    uint256 public reductionPerCliff;
    uint256 public totalSupply;
    mapping(address => uint256) public veAssetWeights;
    uint256 public totalWeight;

    event Withdraw(address destination, uint256 amount);

    constructor(address veTokenAddress) {
        veToken = ERC20(veTokenAddress);
        totalCliffs = 1000;
        reductionPerCliff = maxSupply.div(totalCliffs);
    }

    function addOperator(address _newOperator) public onlyOwner {
        operators.add(_newOperator);
    }

    function removeOperator(address _operator) public onlyOwner {
        operators.remove(_operator);
    }

    ///@dev weight is 10**25 precision
    function updateveAssetWeight(address veAssetOperator, uint256 newWeight) external onlyOwner {
        require(operators.contains(veAssetOperator), "not an veAsset operator");
        totalWeight -= veAssetWeights[veAssetOperator];
        veAssetWeights[veAssetOperator] = newWeight;
        totalWeight += newWeight;
    }

    function mint(address _to, uint256 _amount) external {
        require(operators.contains(_msgSender()), "not an operator");

        uint256 supply = totalSupply;

        //use current supply to gauge cliff
        //this will cause a bit of overflow into the next cliff range
        //but should be within reasonable levels.
        //requires a max supply check though
        uint256 cliff = supply.div(reductionPerCliff);
        //mint if below total cliffs
        if (cliff < totalCliffs) {
            //for reduction% take inverse of current cliff
            uint256 reduction = totalCliffs.sub(cliff);
            //reduce
            _amount = _amount.mul(reduction).div(totalCliffs);

            //supply cap check
            uint256 amtTillMax = maxSupply.sub(supply);
            if (_amount > amtTillMax) {
                _amount = amtTillMax;
            }

            //mint
            veToken.safeTransfer(_to, _amount);
            totalSupply += _amount;
        }
    }

    function withdraw(address _destination, uint256 _amount) external onlyOwner {
        veToken.safeTransfer(_destination, _amount);

        emit Withdraw(_destination, _amount);
    }
}
