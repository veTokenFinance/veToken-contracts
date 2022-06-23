const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const RewardFactory = artifacts.require("RewardFactory");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
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
  await deployer.deploy(VeTokenMinter, veTokenAddress);
  let vetokenMinter = await VeTokenMinter.deployed();
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
  await deployer.deploy(PoolManager);
  const poolManager = await PoolManager.deployed();
  addContract("system", "poolManager", poolManager.address);

  // VE3DRewardPool
  await deployer.deploy(VE3DRewardPool, veTokenAddress, admin);
  const ve3dRewardPool = await VE3DRewardPool.deployed();
  addContract("system", "vetokenRewards", ve3dRewardPool.address);

  // xVE3D Reward Pool
  await deployer.deploy(VE3DLocker, veTokenAddress);
  const ve3dLocker = await VE3DLocker.deployed();
  addContract("system", "ve3dLocker", ve3dLocker.address);
};
