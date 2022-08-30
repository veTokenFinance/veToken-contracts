const { getContract } = require("./helper/addContracts");
const { logTransaction } = require("./helper/logger.js");

const PoolManager = artifacts.require("PoolManager");
const IERC20 = artifacts.require("IERC20");

module.exports = async function (deployer, network, accounts) {
  const contractList = getContract();

  const poolManager = await PoolManager.at(contractList.system.poolManager);
  const boosterAdd_idle = contractList.system.idle_booster;
  const boosterAdd_angle = contractList.system.angle_booster;

  //todo check pools
  //idle pools
  logTransaction(
    await poolManager.addPool("0x675eC042325535F6e176638Dd2d4994F645502B9", boosterAdd_idle, 3, 3),
    "add gauge AATranche_lido"
  );

  logTransaction(
    await poolManager.addPool("0x21dDA17dFF89eF635964cd3910d167d562112f57", boosterAdd_idle, 3, 3),
    "add gauge AATranche_crvALUSD"
  );

  logTransaction(
    await poolManager.addPool("0x7ca919Cf060D95B3A51178d9B1BCb1F324c8b693", boosterAdd_idle, 3, 3),
    "add gauge AATranche_frax"
  );

  logTransaction(
    await poolManager.addPool("0x8cC001dd6C9f8370dB99c1e098e13215377Ecb95", boosterAdd_idle, 3, 3),
    "add gauge AATranche_mim"
  );

  logTransaction(
    await poolManager.addPool("0xDfB27F2fd160166dbeb57AEB022B9EB85EA4611C", boosterAdd_idle, 3, 3),
    "add gauge AATranche_3eur"
  );

  logTransaction(
    await poolManager.addPool("0x30a047d720f735Ad27ad384Ec77C36A4084dF63E", boosterAdd_idle, 3, 3),
    "add gauge AATranche_stecrv"
  );

  logTransaction(
    await poolManager.addPool("0xAbd5e3888ffB552946Fc61cF4C816A73feAee42E", boosterAdd_idle, 3, 3),
    "add gauge AATranche_musd"
  );

  logTransaction(
    await poolManager.addPool("0x41653c7AF834F895Db778B1A31EF4F68Be48c37c", boosterAdd_idle, 3, 3),
    "add gauge AATranche_mstable"
  );

  //angle pools
  logTransaction(
    await poolManager.addPool("0x8E2c0CbDa6bA7B65dbcA333798A3949B07638026", boosterAdd_angle, 3, 4),
    "add gauge sanDAI_EUR"
  );

  logTransaction(
    await poolManager.addPool("0x51fE22abAF4a26631b2913E417c0560D547797a7", boosterAdd_angle, 3, 4),
    "add gauge sanUSDC_EUR"
  );

  logTransaction(
    await poolManager.addPool("0x7c0fF11bfbFA3cC2134Ce62034329a4505408924", boosterAdd_angle, 3, 4),
    "add gauge sanFEI_EUR"
  );

  logTransaction(
    await poolManager.addPool("0xb40432243E4F317cE287398e72Ab8f0312fc2FE8", boosterAdd_angle, 3, 4),
    "add gauge sanFRAX_EUR"
  );

  logTransaction(
    await poolManager.addPool("0xEB7547a8a734b6fdDBB8Ce0C314a9E6485100a3C", boosterAdd_angle, 3, 4),
    "add gauge Gelato Uni-V3 agEUR/USDC"
  );

  logTransaction(
    await poolManager.addPool("0x3785Ce82be62a342052b9E5431e9D3a839cfB581", boosterAdd_angle, 3, 4),
    "add gauge Gelato Uni-V3 agEUR/wETH"
  );

  logTransaction(
    await poolManager.addPool("0xBa625B318483516F7483DD2c4706aC92d44dBB2B", boosterAdd_angle, 3, 4),
    "add gauge SushiSwap agEUR/ANGLE"
  );

  logTransaction(
    await poolManager.addPool("0xd6282C5aEAaD4d776B932451C44b8EB453E44244", boosterAdd_angle, 3, 4),
    "add gauge Uni-V2 agEUR/FEI"
  );
};
