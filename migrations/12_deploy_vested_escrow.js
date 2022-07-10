const Ve3VestedEscrow = artifacts.require("Ve3VestedEscrow");

module.exports = async function (deployer, network, accounts) {
  const veToken = "0x1F209ed40DD77183e9B69c72106F043e0B51bf24";
  const startTime = "7777777777";
  const totalTime = 3600 * 24 * 365 * 1.5; // 1.5 years

  const admin = accounts[0];
  const funder = "0x1F209ed40DD77183e9B69c72106F043e0B51bf24";

  await deployer.deploy(
    Ve3VestedEscrow,
    veToken,
    admin,
    funder,
    startTime,
    totalTime
  );
  let vestedEscrow = await Ve3VestedEscrow.deployed();

  console.log("VestedEscrow deployed at", vestedEscrow.address);
};
