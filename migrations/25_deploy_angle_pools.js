const { getContract } = require("./helper/addContracts");
const { logTransaction } = require("./helper/logger.js");

const PoolManager = artifacts.require("PoolManager");
const IERC20 = artifacts.require("IERC20");

module.exports = async function (deployer, network, accounts) {
  const contractList = getContract();
  const admin = accounts[0];
  const poolManager = await PoolManager.at(contractList.system.poolManager);
  const boosterAdd = contractList.system.angle_booster;
  const angle = await IERC20.at(contractList.system.angle_address);

  logTransaction(
    await poolManager.addPool(
      "0x7B8E89b0cE7BAC2cfEC92A371Da899eA8CBdb450",
      "0x8E2c0CbDa6bA7B65dbcA333798A3949B07638026",
      boosterAdd,
      3
    ),
    "add gauge sanDAI_EUR"
  );

  // funcd account[0] with lp token AA_idleCvxalUSD3CRV-f
  const sanDAI_EUR = await IERC20.at("0x7B8E89b0cE7BAC2cfEC92A371Da899eA8CBdb450");
  logTransaction(
    await sanDAI_EUR.transfer(accounts[0], web3.utils.toWei("1000"), {
      from: "0x5aB0e4E355b08e692933c1F6f85fd0bE56aD18A6",
    }),
    "funcd account[0] with lp token sanDAI_EUR"
  );
  // fund gauge with veasset
  logTransaction(
    await angle.transfer("0x8E2c0CbDa6bA7B65dbcA333798A3949B07638026", web3.utils.toWei("1000"), { from: admin }),
    "fund angle to gauge"
  );

  logTransaction(
    await poolManager.addPool(
      "0x9C215206Da4bf108aE5aEEf9dA7caD3352A36Dad",
      "0x51fE22abAF4a26631b2913E417c0560D547797a7",
      boosterAdd,
      3
    ),
    "add gauge sanUSDC_EUR"
  );

  logTransaction(
    await poolManager.addPool(
      "0x5d8D3Ac6D21C016f9C935030480B7057B21EC804",
      "0x7c0fF11bfbFA3cC2134Ce62034329a4505408924",
      boosterAdd,
      3
    ),
    "add gauge sanFEI_EUR"
  );

  logTransaction(
    await poolManager.addPool(
      "0xb3B209Bb213A5Da5B947C56f2C770b3E1015f1FE",
      "0xb40432243E4F317cE287398e72Ab8f0312fc2FE8",
      boosterAdd,
      3
    ),
    "add gauge sanFRAX_EUR"
  );

  logTransaction(
    await poolManager.addPool(
      "0xEDECB43233549c51CC3268b5dE840239787AD56c",
      "0xEB7547a8a734b6fdDBB8Ce0C314a9E6485100a3C",
      boosterAdd,
      3
    ),
    "add gauge Gelato Uni-V3 agEUR/USDC"
  );

  logTransaction(
    await poolManager.addPool(
      "0x857E0B2eD0E82D5cDEB015E77ebB873C47F99575",
      "0x3785Ce82be62a342052b9E5431e9D3a839cfB581",
      boosterAdd,
      3
    ),
    "add gauge Gelato Uni-V3 agEUR/wETH"
  );

  logTransaction(
    await poolManager.addPool(
      "0x1f4c763BdE1D4832B3EA0640e66Da00B98831355",
      "0xBa625B318483516F7483DD2c4706aC92d44dBB2B",
      boosterAdd,
      3
    ),
    "add gauge SushiSwap agEUR/ANGLE"
  );

  logTransaction(
    await poolManager.addPool(
      "0xF89CE5eD65737dA8440411544b0499c9FaD323B2",
      "0xd6282C5aEAaD4d776B932451C44b8EB453E44244",
      boosterAdd,
      3
    ),
    "add gauge Uni-V2 agEUR/FEI"
  );
};
