const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

module.exports = async (deployer, network, accounts) => {
  await time.latest().then((a) => console.log("current time: " + a));
  await time.latestBlock().then((a) => console.log("current block: " + a));
  await time.increase(86400);
  await time.advanceBlock();
  await time.advanceBlock();
  console.log("advance time...");
  await time.latest().then((a) => console.log("current time: " + a));
  await time.latestBlock().then((a) => console.log("current block: " + a));
};
