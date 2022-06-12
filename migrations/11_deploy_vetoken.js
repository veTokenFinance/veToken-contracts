const veToken = artifacts.require("VeToken");
const { constants } = require("@openzeppelin/test-helpers");
const addContract = require("./helper/addContracts");

module.exports = async function (deployer, network, accounts) {
  // vetoken
  await deployer.deploy(veToken);
  let vetoken = await veToken.deployed();
};
