const { getContract } = require("./helper/addContracts");
const { logTransaction } = require("./helper/logger.js");
const Booster = artifacts.require("Booster");
const PoolManager = artifacts.require("PoolManager");
const IERC20 = artifacts.require("IERC20");
const BigNumber = require("bignumber.js");
const gaugeControllerABI = require("./helper/gaugeControllerABI.json");
function toBN(number) {
  return new BigNumber(number);
}

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
  const gaugeController = "0xaC69078141f76A1e257Ee889920d02Cc547d632f";
  const contractList = getContract();
  const admin = accounts[0];
  const poolManager = await PoolManager.at(contractList.system.poolManager);
  const boosterAdd = contractList.system.idle_booster;
  const booster = await Booster.at(contractList.system.idle_booster);

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
    "0x442aea0fd2afbd3391dae768f7046f132f0a6300",
    "0xe4e69ef860d3018b61a25134d60678be8628f780",
  ];

  await fundLpToken(lp_tokens, lp_tokens_users, admin);

  const gaugeControllerContract = new web3.eth.Contract(gaugeControllerABI, gaugeController);
  const gaguesCount = toBN(await gaugeControllerContract.methods.n_gauges().call()).toNumber();
  console.log("idle gagues count " + gaguesCount);

  for (var i = 0; i < gaguesCount; i++) {
    // a workaround to add second pool in the first position for testing purpose
    if (i == 0) continue;
    let gauge = (await gaugeControllerContract.methods.gauges(i).call()).toString();

    const gauge_type = (await gaugeControllerContract.methods.gauge_types(gauge).call()).toString();
    if (gauge_type != "0") continue;

    logTransaction(await poolManager.addPool(gauge, boosterAdd, 3, 3), "add gauge " + gauge);
    if (i == gaguesCount - 1) {
      gauge = (await gaugeControllerContract.methods.gauges(0).call()).toString();
      logTransaction(await poolManager.addPool(gauge, boosterAdd, 3, 3), "add gauge " + gauge);
    }
  }

  // fund minter contract with veasset
  logTransaction(await idle.transfer(idleMintr, web3.utils.toWei("1000"), { from: admin }), "fund idle to minter");
  // fund gauge with stash token
  logTransaction(
    await stashToken.transfer((await booster.poolInfo(0)).gauge, web3.utils.toWei("1000"), {
      from: "0x09f82ccd6bae2aebe46ba7dd2cf08d87355ac430",
    }),
    "fund stash token to gauge"
  );
};
