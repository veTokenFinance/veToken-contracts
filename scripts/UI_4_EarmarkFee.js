const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

var jsonfile = require("jsonfile");
var contractList = jsonfile.readFileSync("../contracts.json");

const Booster = artifacts.require("Booster");

module.exports = async (deployer, network) => {
  //idle
  let booster = await Booster.at(contractList.system.idle_booster);
  await booster.earmarkFees();
  console.log("idle earmark fee complete");
  //angle
  booster = await Booster.at(contractList.system.angle_booster);
  await booster.earmarkFees();
  console.log("angle earmark fee complete");
  process.exit(1);
};
