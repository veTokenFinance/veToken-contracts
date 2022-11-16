const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const { addContract, getContract } = require("./helper/addContracts");
const escrowABI = require("./helper/escrowABI.json");
const uniswapV2FactoryABI = require("./helper/uniswapV2Factory.json");

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
const ClaimZap = artifacts.require("ClaimZap");
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
  let smartWalletWhitelistAddress = "0xAa241Ccd398feC742f463c534a610529dCC5888E";
  let angle = await IERC20.at("0x31429d1856aD1377A8A0079410B297e1a9e214c2");
  let checkerAdmin = "0xdC4e6DFe07EFCa50a197DF15D9200883eF4Eb1c8";
  let angleAdmin = "0xdC4e6DFe07EFCa50a197DF15D9200883eF4Eb1c8";
  const feeDistro = "0x7F82ff050128e29Fd89D85d01b93246F744E62A0";
  const feeDistroAdmin = "0xdC4e6DFe07EFCa50a197DF15D9200883eF4Eb1c8";
  const feeToken = await IERC20.at("0x9C215206Da4bf108aE5aEEf9dA7caD3352A36Dad");
  const feeTokenHolder = "0xea51ccb352aea7641ff4d88536f0f06fd052ef8f";

  const veANGLE = "0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5";

  const gaugeController = "0x9aD7e7b0877582E14c17702EecF49018DD6f2367";

  const angleUser = "0x2Fc443960971e53FD6223806F0114D5fAa8C7C4e";
  const lp_tokens = [
    "0x7B8E89b0cE7BAC2cfEC92A371Da899eA8CBdb450",
    "0x9C215206Da4bf108aE5aEEf9dA7caD3352A36Dad",
    "0xb3B209Bb213A5Da5B947C56f2C770b3E1015f1FE",
    "0xEDECB43233549c51CC3268b5dE840239787AD56c",
    "0x857E0B2eD0E82D5cDEB015E77ebB873C47F99575",
  ];
  const lp_tokens_users = [
    "0x5aB0e4E355b08e692933c1F6f85fd0bE56aD18A6",
    "0xea51ccb352aea7641ff4d88536f0f06fd052ef8f",
    "0xa2dee32662f6243da539bf6a8613f9a9e39843d3",
    "0x5be876ed0a9655133226be302ca6f5503e3da569",
    "0x5be876ed0a9655133226be302ca6f5503e3da569",
  ];

  const MAXTiME = toBN(4 * 365 * 86400);

  let admin = accounts[0];

  const rFactory = await RewardFactory.deployed();
  const tFactory = await TokenFactory.deployed();
  const sFactory = await StashFactory.deployed();
  const ve3dRewardPool = await VE3DRewardPool.at(contractList.system.vetokenRewards);
  const ve3dLocker = await VE3DLocker.at(contractList.system.ve3dLocker);

  await fundEth(admin, [checkerAdmin, angleUser, angleAdmin, feeDistroAdmin, feeTokenHolder]);
  await fundEth(admin, lp_tokens_users);

  const voter = await deployProxy(VoterProxyV2, ["angleVoterProxy"], {
    deployer,
    initializer: "__VoterProxyV2_init",
    unsafeAllow: ["constructor", "state-variable-immutable"],
    constructorArgs: [angle.address, veANGLE, gaugeController, constants.ZERO_ADDRESS, 4],
  });

  // whitelist the voter proxy
  const whitelist = await SmartWalletWhitelist.at(smartWalletWhitelistAddress);
  logTransaction(await whitelist.approveWallet(voter.address, { from: checkerAdmin }), "whitelist voter proxy");

  // fund admint angle tokens
  logTransaction(
    await angle.transfer(admin, (await angle.balanceOf(angleUser)).toString(), { from: angleUser }),
    "fund admin angle"
  );
  // fund voter proxy angle token
  logTransaction(await angle.transfer(voter.address, web3.utils.toWei("1000"), { from: admin }), "fund voter angle");
  // fund fee token to admin
  logTransaction(
    await feeToken.transfer(admin, web3.utils.toWei("10000", "mwei"), { from: feeTokenHolder }),
    "fund admin fee token"
  );
  // vetoken
  addContract("system", "angle_address", angle.address);
  addContract("system", "angle_escrow", veANGLE);
  addContract("system", "angle_feedistro", feeDistro);
  addContract("system", "angle_feedistro_admin", feeDistroAdmin);
  addContract("system", "angle_lptoken", lp_tokens[0]);
  addContract("system", "angle_voterProxy", voter.address);

  // booster
  const booster = await deployProxy(Booster, {
    deployer,
    initializer: "__Booster_init",
    unsafeAllow: ["constructor", "state-variable-immutable"],
    constructorArgs: [voter.address, contractList.system.vetokenMinter, angle.address, feeDistro],
  });
  addContract("system", "angle_booster", booster.address);
  logTransaction(await voter.setOperator(booster.address), "voter setOperator");

  // VE3Token
  await deployer.deploy(VE3Token, "VeToken Finance veANGLE", "ve3ANGLE");
  const ve3Token = await VE3Token.deployed();
  addContract("system", "ve3_angle", ve3Token.address);

  // Depositer
  const depositor = await deployProxy(VeAssetDepositor, {
    deployer,
    initializer: "__VeAssetDepositor_init",
    unsafeAllow: ["constructor", "state-variable-immutable"],
    constructorArgs: [voter.address, ve3Token.address, angle.address, veANGLE],
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
    await vetokenMinter.addOperator(booster.address, toBN(10).pow(25).times(15)),
    "vetokenMinter addOperator"
  );

  // check whether a pair exists on SushiSwap, if not create the pair
  const sushiV2FactoryAddress = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";
  const sushiV2Factory = new web3.eth.Contract(uniswapV2FactoryABI, sushiV2FactoryAddress);

  let exchangeAddress = await sushiV2Factory.methods.getPair(angle.address, ve3Token.address).call();

  if (exchangeAddress === constants.ZERO_ADDRESS) {
    const createPairTx = sushiV2Factory.methods.createPair(angle.address, ve3Token.address);
    const gasUsed = await createPairTx.estimateGas();
    let newExchangeResult = await createPairTx.send({ from: angleAdmin, gas: gasUsed });
    exchangeAddress = newExchangeResult.events.PairCreated.returnValues.pair;
  }

  // ClaimZap setup
  await deployer.deploy(
    ClaimZap,
    angle.address,
    contractList.system.vetoken,
    ve3Token.address,
    depositor.address,
    ve3TokenRewardPool.address,
    ve3dRewardPool.address,
    exchangeAddress,
    ve3dLocker.address
  );
  const claimZap = await ClaimZap.deployed();
  await claimZap.setApprovals();
  addContract("system", "angle_claimZap", claimZap.address);
};
