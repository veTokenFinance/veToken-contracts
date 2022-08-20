// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IPools {
    function addPool(
        address _lptoken,
        address _gauge,
        uint256 _stashVersion
    ) external returns (bool);

    function addPool(address _lptoken, address _gauge) external returns (bool);

    function shutdownPool(uint256 _pid) external returns (bool);

    function updatePool(uint256 _pid) external returns (bool);

    function poolInfo(uint256)
        external
        view
        returns (
            address,
            address,
            address,
            address,
            address,
            bool
        );

    function poolLength() external view returns (uint256);

    function gaugeMap(address) external view returns (bool);

    function gaugeTokenMap(address) external view returns (bool);

    function setPoolManager(address _poolM) external;
}
