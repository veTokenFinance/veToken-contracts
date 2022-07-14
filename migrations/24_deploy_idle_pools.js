const { getContract } = require("./helper/addContracts");
const { logTransaction } = require("./helper/logger.js");

const PoolManager = artifacts.require("PoolManager");
const IERC20 = artifacts.require("IERC20");

module.exports = async function (deployer, network, accounts) {
  const idleMintr = "0x074306BC6a6Fc1bD02B425dd41D742ADf36Ca9C6";
  const contractList = getContract();
  const admin = accounts[0];
  const poolManager = await PoolManager.at(contractList.system.poolManager);
  const boosterAdd = contractList.system.idle_booster;

  const idle = await IERC20.at(contractList.system.idle_address);
  const stashToken = await IERC20.at(contractList.system.idle_stashtoken);

  logTransaction(
    await poolManager.addPool("0x675eC042325535F6e176638Dd2d4994F645502B9", boosterAdd, 3, 3),
    "add gauge AATranche_lido"
  );

  // funcd account[0] with lp token AA_wstETH
  const AA_wstETH = await IERC20.at("0x2688FC68c4eac90d9E5e1B94776cF14eADe8D877");
  logTransaction(
    await AA_wstETH.transfer(accounts[0], web3.utils.toWei("40"), {
      from: "0xefe1a7b147ac4c0b761da878f6a315923441ca54",
    }),
    "funcd account[0] with lp token AA_wstETH"
  );

  // fund minter contract with veasset
  logTransaction(await idle.transfer(idleMintr, web3.utils.toWei("1000"), { from: admin }), "fund idle to minter");
  // fund gauge with stash token
  logTransaction(
    await stashToken.transfer("0x675eC042325535F6e176638Dd2d4994F645502B9", web3.utils.toWei("1000"), {
      from: "0x09f82ccd6bae2aebe46ba7dd2cf08d87355ac430",
    }),
    "fund stash token to gauge"
  );

  logTransaction(
    await poolManager.addPool("0x21dDA17dFF89eF635964cd3910d167d562112f57", boosterAdd, 3, 3),
    "add gauge AATranche_crvALUSD"
  );

  logTransaction(
    await poolManager.addPool("0x7ca919Cf060D95B3A51178d9B1BCb1F324c8b693", boosterAdd, 3, 3),
    "add gauge AATranche_frax"
  );

  logTransaction(
    await poolManager.addPool("0x8cC001dd6C9f8370dB99c1e098e13215377Ecb95", boosterAdd, 3, 3),
    "add gauge AATranche_mim"
  );

  logTransaction(
    await poolManager.addPool("0xDfB27F2fd160166dbeb57AEB022B9EB85EA4611C", boosterAdd, 3, 3),
    "add gauge AATranche_3eur"
  );

  logTransaction(
    await poolManager.addPool("0x30a047d720f735Ad27ad384Ec77C36A4084dF63E", boosterAdd, 3, 3),
    "add gauge AATranche_stecrv"
  );

  logTransaction(
    await poolManager.addPool("0xAbd5e3888ffB552946Fc61cF4C816A73feAee42E", boosterAdd, 3, 3),
    "add gauge AATranche_musd"
  );

  logTransaction(
    await poolManager.addPool("0x41653c7AF834F895Db778B1A31EF4F68Be48c37c", boosterAdd, 3, 3),
    "add gauge AATranche_mstable"
  );
};
