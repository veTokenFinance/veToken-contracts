const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const { addContract, getContract } = require("./helper/addContracts");
const escrowABI = require("./helper/escrowABI.json");
const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const VoterProxyV2 = artifacts.require("VoterProxyV2");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const RewardFactory = artifacts.require("RewardFactory");
const VE3Token = artifacts.require("VE3Token");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const Booster = artifacts.require("Booster");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VE3DLocker = artifacts.require("VE3DLocker");
const IERC20 = artifacts.require("IERC20");
const SmartWalletWhitelist = artifacts.require("SmartWalletWhitelist");
const BigNumber = require("bignumber.js");
const { logTransaction } = require("./helper/logger");

function toBN(number) {
  return new BigNumber(number);
}

async function fundEth(admin, users) {
  for (var i = 0; i < users.length; i++) {
    await web3.eth.sendTransaction({ from: admin, to: users[i], value: web3.utils.toWei("1") });
  }
}

module.exports = async function (deployer, network, accounts) {
  global.created = true;
  const contractList = getContract();
  //todo review
  const angle = await IERC20.at("0x31429d1856aD1377A8A0079410B297e1a9e214c2");
  const angle_voterProxy = "0x9f598a12d57AB1aFc393CDF3a93bcE86Abf466bD";

  const feeDistro = "0x7F82ff050128e29Fd89D85d01b93246F744E62A0";

  const veANGLE = "0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5";

  const gaugeController = "0x9aD7e7b0877582E14c17702EecF49018DD6f2367";

  const MAXTiME = toBN(4 * 365 * 86400);

  let admin = accounts[0];

  const rFactory = await RewardFactory.deployed();
  const tFactory = await TokenFactory.deployed();
  const sFactory = await StashFactory.deployed();
  const ve3dRewardPool = await VE3DRewardPool.at(contractList.system.vetokenRewards);
  const ve3dLocker = await VE3DLocker.at(contractList.system.ve3dLocker);
  const voter = await VoterProxyV2.at(angle_voterProxy);

  // vetoken
  addContract("system", "angle_address", angle.address);
  addContract("system", "angle_escrow", veANGLE);
  addContract("system", "angle_feedistro", feeDistro);
  addContract("system", "angle_voterProxy", voter.address);

  // todo fund voter proxy with angle token

  // booster
  const booster = await deployProxy(
    Booster,
    [voter.address, contractList.system.vetokenMinter, angle.address, feeDistro],
    { deployer, initializer: "__Booster_init" }
  );
  addContract("system", "angle_booster", booster.address);
  logTransaction(await voter.setOperator(booster.address), "voter setOperator");

  //todo review
  // VE3Token
  await deployer.deploy(VE3Token, "VeToken Finance veANGLE", "ve3ANGLE");
  const ve3Token = await VE3Token.deployed();
  addContract("system", "ve3_angle", ve3Token.address);

  // Depositer
  const depositor = await deployProxy(VeAssetDepositor, [voter.address, ve3Token.address, angle.address, veANGLE], {
    deployer,
    initializer: "__VeAssetDepositor_init",
  });
  addContract("system", "angle_depositor", depositor.address);

  // base reward pool for VE3Token
  await deployer.deploy(BaseRewardPool, 0, ve3Token.address, angle.address, booster.address, rFactory.address);
  const ve3TokenRewardPool = await BaseRewardPool.deployed();
  addContract("system", "angle_ve3TokenRewardPool", ve3TokenRewardPool.address);

  // configurations
  logTransaction(await ve3Token.setOperator(depositor.address), "ve3Token setOperator");

  logTransaction(await voter.setDepositor(depositor.address), "voter setDepositor");

  logTransaction(await depositor.setLockMaxTime(MAXTiME), "set max time");

  logTransaction(await depositor.initialLock(), "initial Lock created on veANGLE");

  logTransaction(await rFactory.addOperator(booster.address, angle.address), "rFactory addOperator");
  logTransaction(await tFactory.addOperator(booster.address), "tFactory addOperator");
  logTransaction(await sFactory.addOperator(booster.address), "sFactory addOperator");
  logTransaction(await ve3dRewardPool.addOperator(booster.address), "ve3dRewardPool add operator");
  logTransaction(await ve3dLocker.addOperator(booster.address), "ve3dLocker add operator");
  //add rewardToken to the pool
  logTransaction(
    await ve3dRewardPool.addReward(angle.address, depositor.address, ve3TokenRewardPool.address, ve3Token.address),
    "ve3dRewardPool addRewardToken"
  );

  //add rewardToken to the ve3dLocker
  logTransaction(
    await ve3dLocker.addReward(
      angle.address,
      depositor.address,
      ve3Token.address,
      ve3TokenRewardPool.address,
      booster.address,
      true
    ),
    "ve3dLocker addRewardToken"
  );
  //todo set treasury
  logTransaction(await booster.setTreasury(depositor.address), "booster setTreasury");

  logTransaction(
    await booster.setRewardContracts(ve3TokenRewardPool.address, ve3dRewardPool.address, ve3dLocker.address),
    "booster setRewardContracts"
  );
  logTransaction(await booster.setPoolManager(contractList.system.poolManager), "booster setPoolManager");
  logTransaction(
    await booster.setFactories(rFactory.address, sFactory.address, tFactory.address),
    "booster setFactories"
  );
  //todo fee info
  logTransaction(await booster.setFeeInfo(toBN(10000), toBN(0)), "booster setFeeInfo");

  //vetoken minter setup
  const vetokenMinter = await VeTokenMinter.at(contractList.system.vetokenMinter);
  //todo weight // fake weight
  logTransaction(
    await vetokenMinter.addOperator(booster.address, toBN(10).pow(25).times(15)),
    "vetokenMinter addOperator"
  );
};
