const BigNumber = require("bignumber.js");
var jsonfile = require("jsonfile");
var contractList = jsonfile.readFileSync("../contracts.json");
const gaugeControllerABI = require("../migrations/helper/gaugeControllerABI.json");
const angleDistributorABI = require("../migrations/helper/angleDistributor.json");

const Booster = artifacts.require("Booster");
const idle_gaugeController = "0xaC69078141f76A1e257Ee889920d02Cc547d632f";
const angle_gaugeController = "0x9aD7e7b0877582E14c17702EecF49018DD6f2367";
const angleDistributor = "0x4f91F01cE8ec07c9B1f6a82c18811848254917Ab";

function toBN(number) {
  return new BigNumber(number);
}

module.exports = async (deployer, network) => {
  //idle

  console.log("check new idle gauges");
  let booster = await Booster.at(contractList.system.idle_booster);
  let gaugeControllerContract = new web3.eth.Contract(gaugeControllerABI, idle_gaugeController);

  let gaugesCount = toBN(await gaugeControllerContract.methods.n_gauges().call()).toNumber();

  let index = 0;
  for (var i = 0; i < gaugesCount; i++) {
    let gauge = (await gaugeControllerContract.methods.gauges(i).call()).toString();
    const gauge_type = (await gaugeControllerContract.methods.gauge_types(gauge).call()).toString();

    if (gauge_type != "0") continue;

    if (!(await booster.gaugeMap(gauge))) {
      console.log("idle new gauge " + gauge);
      index += 1;
    }
  }
  console.log("idle new gauges count" + index);
  console.log();
  console.log("check new angle gauges");
  //angle
  booster = await Booster.at(contractList.system.angle_booster);
  gaugeControllerContract = new web3.eth.Contract(gaugeControllerABI, angle_gaugeController);
  const angleDistributorContract = new web3.eth.Contract(angleDistributorABI, angleDistributor);
  gaugesCount = toBN(await gaugeControllerContract.methods.n_gauges().call()).toNumber();

  index = 0;
  for (var i = 0; i < gaugesCount; i++) {
    let gauge = (await gaugeControllerContract.methods.gauges(i).call()).toString();
    const gauge_type = (await gaugeControllerContract.methods.gauge_types(gauge).call()).toString();

    if (gauge_type != "0") continue;
    if (await angleDistributorContract.methods.killedGauges(gauge).call()) {
      console.log("killed gauge " + gauge);
    }

    if (!(await booster.gaugeMap(gauge))) {
      console.log("angle new gauge " + gauge);
      index += 1;
    }
  }
  console.log("angle new gauges count " + index);
  process.exit(1);
};
