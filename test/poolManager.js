const Booster = artifacts.require("Booster");
const PoolManager = artifacts.require("PoolManager");

const { loadContracts, contractAddresseList, Networks } = require("./helper/dumpAddresses");
const gaugeABI = require("./helper/gaugeABI.json");
const truffleAssert = require("truffle-assertions");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const Reverter = require("./helper/reverter");

contract("PoolManager", async (accounts) => {
  let poolManager;
  let booster;
  let network;
  const reverter = new Reverter(web3);
  const USER1 = accounts[0];
  let poolInfoLog;
  const testGauge = "0xe786df7076afeecc3facd841ed4ad20d0f04cf19";
  let number;

  before("setup", async () => {
    network = await loadContracts();
    // basic contract
    poolManager = await PoolManager.at(baseContractList.system.poolManager);
    booster = await Booster.at(contractAddresseList[4]);
    await reverter.snapshot();
    if (network === Networks.idle) {
      number = 3;
    }
    if (network === Networks.angle) {
      number = 4;
    }
  });

  afterEach("revert", reverter.revert);

  describe("Pool Test", async () => {
    it("addPool and compare vs remote gauge", async () => {
      await poolManager.addPool(testGauge, booster.address, 3, number);
      await booster
        .getPastEvents("PoolAdded", { fromBlock: "latest", toBlock: "latest" })
        .then((a) => (poolInfoLog = a));
      const newPoolInfoData = JSON.stringify(poolInfoLog[0].returnValues);
      const newPoolInfo = JSON.parse(newPoolInfoData);
      const testGaugeRemote = new web3.eth.Contract(gaugeABI, testGauge);
      const remoteLpAddress = await testGaugeRemote.methods.lp_token().call({ from: USER1, gas: 300000 });
      assert.equal(newPoolInfo[0], remoteLpAddress);
    });

    it("add the same pool (unique check: revert)", async () => {
      await poolManager.addPool(testGauge, booster.address, 3, number);
      await truffleAssert.reverts(poolManager.addPool(testGauge, booster.address, 3, number), "already registered");
    });
  });
});
