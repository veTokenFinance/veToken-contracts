const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const RewardFactory = artifacts.require("RewardFactory");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
const VestedEscrow = artifacts.require('VestedEscrow');
const TreasuryFunds = artifacts.require('TreasuryFunds');
const VeToken = artifacts.require("VeToken");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const { addContract } = require("./helper/addContracts");
const VE3DLocker = artifacts.require("VE3DLocker");

module.exports = async function (deployer, network, accounts) {
  global.created = false;
  const veTokenAddress = "0x1F209ed40DD77183e9B69c72106F043e0B51bf24";
  const vetokenOperator = "0xa2a379a34cc30c69ab5597bb1c4b6c5c8b23d87e";
  const admin = accounts[0];
  web3.eth.sendTransaction({ from: admin, to: vetokenOperator, value: web3.utils.toWei("10") });
  // vetoken minter
  let vetokenMinter = await deployProxy(VeTokenMinter, [veTokenAddress], {
    deployer,
    initializer: "__VeTokenMinter_init",
  });

  addContract("system", "vetokenMinter", vetokenMinter.address);
  global.created = true;
  //mint vetoke to minter contract
  const vetoken = await VeToken.at(veTokenAddress);
  await vetoken.mint(vetokenMinter.address, web3.utils.toWei("30000000"), { from: vetokenOperator });
  addContract("system", "vetoken", veTokenAddress);

  // reward factory
  await deployer.deploy(RewardFactory);
  const rFactory = await RewardFactory.deployed();
  addContract("system", "rFactory", rFactory.address);

  // token factory
  await deployer.deploy(TokenFactory);
  const tFactory = await TokenFactory.deployed();
  addContract("system", "tFactory", tFactory.address);

  //stash factory
  await deployer.deploy(StashFactory, rFactory.address);
  const sFactory = await StashFactory.deployed();
  addContract("system", "sFactory", sFactory.address);

  // pool manager
  const poolManager = await deployProxy(PoolManager, {
    deployer,
    initializer: "__PoolManager_init",
  });

  addContract("system", "poolManager", poolManager.address);

  // VE3DRewardPool
  const ve3dRewardPool = await deployProxy(VE3DRewardPool, [veTokenAddress, admin], {
    deployer,
    initializer: "__VE3DRewardPool_init",
  });
  addContract("system", "vetokenRewards", ve3dRewardPool.address);

  // xVE3D Reward Pool
  const ve3dLocker = await deployProxy(VE3DLocker, [veTokenAddress], {
    deployer,
    initializer: "__VE3DLocker_init",
  });
  addContract("system", "ve3dLocker", ve3dLocker.address);

  // VestedEscrow
  const TOTAL_TIME = 1.5 * 365 * 86400; // 1,5 years
  const startTime = Math.floor(Date.now() / 1000) + 1000; // start time is within 1000 seconds, can be configured here or be updated in the contract later
  const endTime = startTime + TOTAL_TIME;
  await deployer.deploy(VestedEscrow,
      veTokenAddress,
      startTime,
      endTime,
      ve3dRewardPool.address,
      vetokenOperator,
  );
  const vestedEscrow = await VestedEscrow.deployed();
  addContract("system", "vestedEscrow", vestedEscrow.address);

  // TreasuryFunds
  await deployer.deploy(TreasuryFunds, admin);
  const treasuryFunds = await TreasuryFunds.deployed();
  addContract("system", "treasuryFunds", treasuryFunds.address);
};
