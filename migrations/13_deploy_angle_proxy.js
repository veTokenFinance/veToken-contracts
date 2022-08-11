const VoterProxyV2 = artifacts.require("VoterProxyV2");
const { logTransaction, logAddress } = require("./helper/logger");
const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const { upgradeProxy } = require("@openzeppelin/truffle-upgrades");

module.exports = async function (deployer) {
  const angle = "0x31429d1856aD1377A8A0079410B297e1a9e214c2";
  const veANGLE = "0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5";
  const gaugeController_angle = "0x9aD7e7b0877582E14c17702EecF49018DD6f2367";
  const angle_multisig = "0x963712cf1B229984D129A1602dEAf497b3727b38";

  const voter_angle = await deployProxy(
    VoterProxyV2,
    ["ANGLEVoterProxy", angle, veANGLE, gaugeController_angle, constants.ZERO_ADDRESS, 4],
    { deployer, initializer: "__VoterProxyV2_init" }
  );

  logAddress("angle voter proxy", voter_angle.address);

  // change the owner addres to mulitsig wallet
  logTransaction(await voter_angle.setOwner(angle_multisig), "set ownet");
};
