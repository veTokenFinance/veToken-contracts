const { getContract } = require("./helper/addContracts");
const { logTransaction } = require("./helper/logger.js");

const PoolManager = artifacts.require("PoolManager");
const IERC20 = artifacts.require("IERC20");

async function fundLpToken(lp_tokens, lp_tokens_users, to) {
  for (var i = 0; i < lp_tokens_users.length; i++) {
    const lpToken = await IERC20.at(lp_tokens[i]);
    logTransaction(
      await lpToken.transfer(to, (await lpToken.balanceOf(lp_tokens_users[i])).toString(), {
        from: lp_tokens_users[i],
      }),
      "funcd account[0] with lp token"
    );
  }
}

module.exports = async function (deployer, network, accounts) {
  const idleMintr = "0x074306BC6a6Fc1bD02B425dd41D742ADf36Ca9C6";
  const contractList = getContract();
  const admin = accounts[0];
  const poolManager = await PoolManager.at(contractList.system.poolManager);
  const boosterAdd = contractList.system.idle_booster;

  const idle = await IERC20.at(contractList.system.idle_address);
  const stashToken = await IERC20.at(contractList.system.idle_stashtoken);

  const lp_tokens = [
    "0x2688FC68c4eac90d9E5e1B94776cF14eADe8D877",
    "0x790E38D85a364DD03F682f5EcdC88f8FF7299908",
    "0x15794DA4DCF34E674C18BbFAF4a67FF6189690F5",
    "0xFC96989b3Df087C96C806318436B16e44c697102",
    "0x158e04225777BBEa34D2762b5Df9eBD695C158D2",
  ];
  const lp_tokens_users = [
    "0xc22bc5f7e5517d7a5df9273d66e254d4b549523c",
    "0xe4e69ef860d3018b61a25134d60678be8628f780",
    "0x4eacf42d898b977973f1fd8448f6035dc44ce4d0",
    "0x1bd658c933d592519d57fd728a1afb659f474d3b",
    "0xe4e69ef860d3018b61a25134d60678be8628f780",
  ];

  logTransaction(
    await poolManager.addPool("0x675eC042325535F6e176638Dd2d4994F645502B9", boosterAdd, 3, 3),
    "add gauge AATranche_lido"
  );

  await fundLpToken(lp_tokens, lp_tokens_users, admin);

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
