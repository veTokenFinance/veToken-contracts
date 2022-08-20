const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const RewardFactory = artifacts.require("RewardFactory");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
const VestedEscrow = artifacts.require("VestedEscrow");
const TreasuryFunds = artifacts.require("TreasuryFunds");
const VeToken = artifacts.require("VeToken");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");

const VE3DLocker = artifacts.require("VE3DLocker");

module.exports = async function (deployer, network, accounts) {
  const veTokenAddress = "0x1F209ed40DD77183e9B69c72106F043e0B51bf24";

  // vetoken minter
  let vetokenMinter = await deployProxy(VeTokenMinter, [veTokenAddress], {
    deployer,
    initializer: "__VeTokenMinter_init",
  });

  //mint vetoke to minter contract
  const vetokenMinterContract = await VeTokenMinter.at(vetokenMinter.address);
  // await vetoken.mint(vetokenMinter.address, web3.utils.toWei("95249999"), { from: vetokenOperator });
  await vetokenMinterContract.deposit(web3.utils.toWei("95249999"));

  // reward factory
  await deployer.deploy(RewardFactory);
  const rFactory = await RewardFactory.deployed();

  // token factory
  await deployer.deploy(TokenFactory);
  const tFactory = await TokenFactory.deployed();

  //stash factory
  await deployer.deploy(StashFactory, rFactory.address);
  const sFactory = await StashFactory.deployed();

  // pool manager
  const poolManager = await deployProxy(PoolManager, {
    deployer,
    initializer: "__PoolManager_init",
  });

  // VE3DRewardPool
  const ve3dRewardPool = await deployProxy(VE3DRewardPool, [veTokenAddress, admin], {
    deployer,
    initializer: "__VE3DRewardPool_init",
  });

  // xVE3D Reward Pool
  const ve3dLocker = await deployProxy(VE3DLocker, [veTokenAddress], {
    deployer,
    initializer: "__VE3DLocker_init",
  });

  // VestedEscrow
  const TOTAL_TIME = 1.5 * 365 * 86400; // 1,5 years
  const startTime = Math.floor(Date.now() / 1000) + 1000; // start time is within 1000 seconds, can be configured here or be updated in the contract later
  const endTime = startTime + TOTAL_TIME;
  await deployer.deploy(VestedEscrow, veTokenAddress, startTime, endTime, ve3dRewardPool.address, vetokenOperator);
  const vestedEscrow = await VestedEscrow.deployed();
  addContract("system", "vestedEscrow", vestedEscrow.address);

  // TreasuryFunds
  await deployer.deploy(TreasuryFunds, admin);
  const treasuryFunds = await TreasuryFunds.deployed();
  addContract("system", "treasuryFunds", treasuryFunds.address);
};
