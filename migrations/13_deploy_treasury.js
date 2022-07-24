const Treasury = artifacts.require("Treasury");

module.exports = async function (deployer, network, accounts) {
  const veToken = "0x1F209ed40DD77183e9B69c72106F043e0B51bf24";
  const startTime = "7777777777";
  const totalTime = 3600 * 24 * 365; // 1 year

  const admin = accounts[0];
  const funder = "0x1F209ed40DD77183e9B69c72106F043e0B51bf24";

  await deployer.deploy(
    Treasury,
    veToken,
    admin,
    funder,
    startTime,
    totalTime
  );
  let treasury = await Treasury.deployed();

  console.log("Treasury deployed at", treasury.address);
};
