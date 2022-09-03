const { getContract } = require("./helper/addContracts");
const { logTransaction } = require("./helper/logger.js");
const Booster = artifacts.require("Booster");
const PoolManager = artifacts.require("PoolManager");
const IERC20 = artifacts.require("IERC20");
const BigNumber = require("bignumber.js");
const gaugeControllerABI = require("./helper/gaugeControllerABI.json");
const angleDistributorABI = require("./helper/angleDistributor.json");
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
  const contractList = getContract();
  const gaugeController = "0x9aD7e7b0877582E14c17702EecF49018DD6f2367";
  const angleDistributor = "0x4f91F01cE8ec07c9B1f6a82c18811848254917Ab";
  const admin = accounts[0];
  const poolManager = await PoolManager.at(contractList.system.poolManager);
  const boosterAdd = contractList.system.angle_booster;
  const booster = await Booster.at(contractList.system.angle_booster);
  const angle = await IERC20.at(contractList.system.angle_address);

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
  await fundLpToken(lp_tokens, lp_tokens_users, admin);

  const gaugeControllerContract = new web3.eth.Contract(gaugeControllerABI, gaugeController);
  const gaugesCount = toBN(await gaugeControllerContract.methods.n_gauges().call()).toNumber();
  console.log("angle gauges count " + gaugesCount);

  const angleDistributorContract = new web3.eth.Contract(angleDistributorABI, angleDistributor);

  for (var i = 0; i < gaugesCount; i++) {
    // a workaround to add second pool in the first position for testing purpose
    if (i == 0) continue;
    let gauge = (await gaugeControllerContract.methods.gauges(i).call()).toString();

    const gauge_type = (await gaugeControllerContract.methods.gauge_types(gauge).call()).toString();

    if (gauge_type != "0" || (await angleDistributorContract.methods.killedGauges(gauge).call())) continue;

    logTransaction(await poolManager.addPool(gauge, boosterAdd, 3, 4), "add gauge " + gauge);
    if (i == 2) {
      gauge = (await gaugeControllerContract.methods.gauges(0).call()).toString();
      logTransaction(await poolManager.addPool(gauge, boosterAdd, 3, 4), "add gauge " + gauge);
    }
  }

  // fund gauge with veasset
  logTransaction(
    await angle.transfer((await booster.poolInfo(0)).gauge, web3.utils.toWei("1000"), { from: admin }),
    "fund angle to gauge"
  );
};
