// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract VeTokenMinter is OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public constant maxTotalSupply = 100 * 1000000 * 1e18; //30mil

    uint256 public maxSupply;
    IERC20Upgradeable public veToken;
    EnumerableSet.AddressSet internal operators;
    uint256 public totalCliffs;
    uint256 public reductionPerCliff;
    uint256 public totalSupply;
    mapping(address => uint256) public veAssetWeights;
    uint256 public totalWeight;

    event Deposit(uint256 amount);
    event Withdraw(address destination, uint256 amount);

    function __VeTokenMinter_init(address veTokenAddress) external initializer {
        __Ownable_init();
        veToken = IERC20Upgradeable(veTokenAddress);
        totalCliffs = 1000;
        reductionPerCliff = maxTotalSupply.div(totalCliffs);
    }

    ///@dev weight is 10**25 precision
    function addOperator(address _newOperator, uint256 _newWeight) public onlyOwner {
        require(_newWeight > 0 && _newWeight <= 100 * 10**25, "Invalid weight");
        operators.add(_newOperator);
        totalWeight = totalWeight.sub(veAssetWeights[_newOperator]);
        veAssetWeights[_newOperator] = _newWeight;
        totalWeight = totalWeight.add(_newWeight);
    }

    function removeOperator(address _operator) public onlyOwner {
        totalWeight = totalWeight.sub(veAssetWeights[_operator]);
        veAssetWeights[_operator] = 0;
        operators.remove(_operator);
    }

    function mint(address _to, uint256 _amount) external {
        require(operators.contains(_msgSender()), "not an operator");

        uint256 supply = totalSupply.add(_getActualTotalSupply());

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
            uint256 amtTillMax = maxTotalSupply.sub(supply);
            if (_amount > amtTillMax) {
                _amount = amtTillMax;
            }

            //mint
            veToken.safeTransfer(_to, _amount);
            totalSupply = totalSupply.add(_amount);
        }
    }

    function earned(uint256 _amount) external view returns (uint256 _earned) {
        require(operators.contains(_msgSender()), "not an operator");

        uint256 supply = totalSupply.add(_getActualTotalSupply());

        uint256 cliff = supply.div(reductionPerCliff);

        if (cliff < totalCliffs) {
            uint256 reduction = totalCliffs.sub(cliff);

            _amount = _amount.mul(reduction).div(totalCliffs);

            uint256 amtTillMax = maxTotalSupply.sub(supply);
            if (_amount > amtTillMax) {
                _amount = amtTillMax;
            }
            _earned = _amount;
        }
    }

    function _getActualTotalSupply() internal view returns (uint256) {
        return veToken.totalSupply().sub(maxSupply);
    }

    function withdraw(address _destination, uint256 _amount) external onlyOwner {
        require(totalSupply >= _amount, "Not enough liquidity");

        maxSupply = maxSupply.sub(_amount);

        veToken.safeTransfer(_destination, _amount);

        emit Withdraw(_destination, _amount);
    }

    function deposit(uint256 _amount) external onlyOwner {
        maxSupply = maxSupply.add(_amount);

        emit Deposit(_amount);
    }
}
