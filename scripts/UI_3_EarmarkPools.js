const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

var jsonfile = require("jsonfile");
var contractList = jsonfile.readFileSync("../contracts.json");

const Booster = artifacts.require("Booster");

module.exports = async (deployer, network) => {
  //idle
  let booster = await Booster.at(contractList.system.idle_booster);
  let poolCount = await booster.poolLength();

  for (var i = 0; i < poolCount; i++) {
    await booster.earmarkRewards(i);
    console.log("idle earmark pool " + i + " complete");
  }
  //angle
  booster = await Booster.at(contractList.system.angle_booster);
  poolCount = await booster.poolLength();

  for (var i = 0; i < poolCount; i++) {
    await booster.earmarkRewards(i);
    console.log("angle earmark pool " + i + " complete");
  }
  process.exit(1);
};
