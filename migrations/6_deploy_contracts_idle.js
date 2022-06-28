const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const { addContract, getContract } = require("./helper/addContracts");
const escrowABI = require("./helper/escrowABI.json");
const { deployProxy } = require("@openzeppelin/truffle-upgrades");

const VoterProxy = artifacts.require("VoterProxy");
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

module.exports = async function (deployer, network, accounts) {
  global.created = true;
  const contractList = getContract();
  let smartWalletWhitelistAddress = "0x2D8b5b65c6464651403955aC6D71f9c0204169D3";
  let idle = await IERC20.at("0x875773784Af8135eA0ef43b5a374AaD105c5D39e");
  let checkerAdmin = "0xFb3bD022D5DAcF95eE28a6B07825D4Ff9C5b3814";
  let idleAdmin = "0xd6dabbc2b275114a2366555d6c481ef08fdc2556";
  const feeDistro = "0xbabb82456c013fd7e3f25857e0729de8207f80e2";
  const feeDistroAdmin = "0xe8eA8bAE250028a8709A3841E0Ae1a44820d677b";
  const stkIDLE = "0xaac13a116ea7016689993193fce4badc8038136f";

  const gaugeController = "0xaC69078141f76A1e257Ee889920d02Cc547d632f";
  const idleMintr = "0x074306BC6a6Fc1bD02B425dd41D742ADf36Ca9C6";
  const idleUser = "0x3675D2A334f17bCD4689533b7Af263D48D96eC72";
  const AA_wstETHUser = "0xefe1a7b147ac4c0b761da878f6a315923441ca54";
  const AA_wstETH = "0x2688FC68c4eac90d9E5e1B94776cF14eADe8D877";
  const stashRewardToken = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
  const stashRewardTokenUser = "0x09f82ccd6bae2aebe46ba7dd2cf08d87355ac430";
  const MAXTiME = toBN(4 * 365 * 86400);

  let admin = accounts[0];

  const rFactory = await RewardFactory.deployed();
  const tFactory = await TokenFactory.deployed();
  const sFactory = await StashFactory.deployed();
  const ve3dRewardPool = await VE3DRewardPool.at(contractList.system.vetokenRewards);
  const ve3dLocker = await VE3DLocker.at(contractList.system.ve3dLocker);

  await web3.eth.sendTransaction({ from: admin, to: checkerAdmin, value: web3.utils.toWei("1") });

  await web3.eth.sendTransaction({ from: admin, to: idleUser, value: web3.utils.toWei("1") });

  await web3.eth.sendTransaction({ from: admin, to: idleAdmin, value: web3.utils.toWei("1") });

  await web3.eth.sendTransaction({ from: admin, to: AA_wstETHUser, value: web3.utils.toWei("1") });
  await web3.eth.sendTransaction({ from: admin, to: feeDistroAdmin, value: web3.utils.toWei("1") });
  await web3.eth.sendTransaction({ from: admin, to: stashRewardTokenUser, value: web3.utils.toWei("1") });

  // voter proxy
  await deployer.deploy(VoterProxy, "idleVoterProxy", idle.address, stkIDLE, gaugeController, idleMintr, 3);
  const voter = await VoterProxy.deployed();

  // set wallet checker in escrow
  // const escrow = new web3.eth.Contract(escrowABI, stkIDLE);

  // await escrow.methods.commit_smart_wallet_checker(smartWalletWhitelistAddress).send({ from: idleAdmin });

  // await escrow.methods.apply_smart_wallet_checker().send({ from: idleAdmin });

  // whitelist the voter proxy
  const whitelist = await SmartWalletWhitelist.at(smartWalletWhitelistAddress);
  logTransaction(await whitelist.toggleAddress(voter.address, true, { from: checkerAdmin }), "whitelist voter proxy");

  // fund admint idle tokens
  logTransaction(await idle.transfer(admin, web3.utils.toWei("100000"), { from: idleUser }), "fund admin idle");
  // fund voter proxy idle token
  logTransaction(await idle.transfer(voter.address, web3.utils.toWei("1000"), { from: admin }), "fund voter idle");
  // vetoken
  addContract("system", "idle_address", idle.address);
  addContract("system", "idle_escrow", stkIDLE);
  addContract("system", "idle_feedistro", feeDistro);
  addContract("system", "idle_feedistro_admin", feeDistroAdmin);
  addContract("system", "idle_lptoken", AA_wstETH);
  addContract("system", "idle_stashtoken", stashRewardToken);
  addContract("system", "idle_voterProxy", voter.address);

  // booster
  const booster = await deployProxy(
    Booster,
    [voter.address, contractList.system.vetokenMinter, idle.address, feeDistro],
    { deployer, initializer: "__Booster_init" }
  );

  addContract("system", "idle_booster", booster.address);
  logTransaction(await voter.setOperator(booster.address), "voter setOperator");

  // VE3Token
  await deployer.deploy(VE3Token, "VeToken Finance stkIDLE", "ve3RBN");
  const ve3Token = await VE3Token.deployed();
  addContract("system", "ve3_idle", ve3Token.address);

  // Depositer
  const depositor = await deployProxy(VeAssetDepositor, [voter.address, ve3Token.address, idle.address, stkIDLE], {
    deployer,
    initializer: "__VeAssetDepositor_init",
  });

  addContract("system", "idle_depositor", depositor.address);

  // base reward pool for VE3Token
  await deployer.deploy(BaseRewardPool, 0, ve3Token.address, idle.address, booster.address, rFactory.address);
  const ve3TokenRewardPool = await BaseRewardPool.deployed();
  addContract("system", "idle_ve3TokenRewardPool", ve3TokenRewardPool.address);

  // configurations
  logTransaction(await ve3Token.setOperator(depositor.address), "ve3Token setOperator");

  logTransaction(await voter.setDepositor(depositor.address), "voter setDepositor");

  logTransaction(await depositor.setLockMaxTime(MAXTiME), "set max time");

  logTransaction(await depositor.initialLock(), "initial Lock created on stkIDLE");

  logTransaction(await rFactory.addOperator(booster.address, idle.address), "rFactory addOperator");
  logTransaction(await tFactory.addOperator(booster.address), "tFactory addOperator");
  logTransaction(await sFactory.addOperator(booster.address), "sFactory addOperator");
  logTransaction(await ve3dRewardPool.addOperator(booster.address), "ve3dRewardPool add operator");
  logTransaction(await ve3dLocker.addOperator(booster.address), "ve3dLocker add operator");
  //add rewardToken to the pool
  logTransaction(
    await ve3dRewardPool.addReward(idle.address, depositor.address, ve3TokenRewardPool.address, ve3Token.address),
    "ve3dRewardPool addRewardToken"
  );

  //add rewardToken to the ve3dLocker
  logTransaction(
    await ve3dLocker.addReward(
      idle.address,
      depositor.address,
      ve3Token.address,
      ve3TokenRewardPool.address,
      booster.address,
      true
    ),
    "ve3dLocker addRewardToken"
  );

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
  logTransaction(await booster.setFeeInfo(toBN(10000), toBN(0)), "booster setFeeInfo");
  //vetoken minter setup
  const vetokenMinter = await VeTokenMinter.at(contractList.system.vetokenMinter);
  logTransaction(
    await vetokenMinter.addOperator(booster.address, toBN(10).pow(25).times(10)),
    "vetokenMinter addOperator"
  );
};
