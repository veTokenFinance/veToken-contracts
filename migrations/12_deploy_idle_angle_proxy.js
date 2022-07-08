const VoterProxyV2 = artifacts.require("VoterProxyV2");
const { logTransaction, logAddress } = require("./helper/logger");
const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const { upgradeProxy } = require("@openzeppelin/truffle-upgrades");

module.exports = async function (deployer) {
  const idle = "0x875773784Af8135eA0ef43b5a374AaD105c5D39e";
  const stkIDLE = "0xaac13a116ea7016689993193fce4badc8038136f";
  const gaugeController_idle = "0xaC69078141f76A1e257Ee889920d02Cc547d632f";
  const idleMintr = "0x074306BC6a6Fc1bD02B425dd41D742ADf36Ca9C6";

  const angle = "0x31429d1856aD1377A8A0079410B297e1a9e214c2";
  const veANGLE = "0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5";
  const gaugeController_angle = "0x9aD7e7b0877582E14c17702EecF49018DD6f2367";

  const voter_idle = await deployProxy(
    VoterProxyV2,
    ["IDLEVoterProxy", idle, stkIDLE, gaugeController_idle, idleMintr, 3],
    {
      deployer,
      initializer: "__VoterProxyV2_init",
    }
  );

  const voter_angle = await deployProxy(
    VoterProxyV2,
    ["ANGLEVoterProxy", angle, veANGLE, gaugeController_angle, constants.ZERO_ADDRESS, 4],
    { deployer, initializer: "__VoterProxyV2_init" }
  );
  logAddress("idle voter proxy", voter_idle.address);
  logAddress("angle voter proxy", voter_angle.address);

  // change the owner addres to mulitsig wallet
  logTransaction(await voter_idle.setOwner("0x30a8609c9D3F4a9ee8EBD556388C6d8479af77d1"), "set ownet");
  logTransaction(await voter_angle.setOwner("0x30a8609c9D3F4a9ee8EBD556388C6d8479af77d1"), "set ownet");
};
