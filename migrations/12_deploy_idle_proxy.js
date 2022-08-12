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
  const idle_multisig = "0xFA0367fECb8Ec884bA1E547f3daf5c63B888304b";

  const voter_idle = await deployProxy(
    VoterProxyV2,
    ["IDLEVoterProxy", idle, stkIDLE, gaugeController_idle, idleMintr, 3],
    {
      deployer,
      initializer: "__VoterProxyV2_init",
    }
  );

  logAddress("idle voter proxy", voter_idle.address);

  // change the owner addres to mulitsig wallet
  logTransaction(await voter_idle.setOwner(idle_multisig), "set ownet");
};
