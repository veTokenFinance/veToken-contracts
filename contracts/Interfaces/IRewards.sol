// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IRewards {
    function stake(address, uint256) external;

    function stakeFor(address, uint256) external;

    function withdraw(address, uint256) external;

    function exit(address) external;

    function getReward(address) external;

    function queueNewRewards(uint256) external;

    function queueNewRewards(address, uint256) external;

    function addExtraReward(address) external;

    function addReward(
        address _rewardsToken,
        address _veAssetDeposits,
        address _ve3Token,
        address _ve3TokenStaking,
        address _distributor,
        bool _isVeAsset
    ) external;

    function stakingToken() external view returns (address);

    function rewardToken() external view returns (address);

    function earned(address account) external view returns (uint256);
}
