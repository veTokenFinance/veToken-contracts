const VoterProxy = artifacts.require("VoterProxy");
const RewardFactory = artifacts.require("RewardFactory");
const VE3Token = artifacts.require("VE3Token");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const Booster = artifacts.require("Booster");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
const VeToken = artifacts.require("VeToken");
const IERC20 = artifacts.require("IERC20");
const VirtualBalanceRewardPool = artifacts.require("VirtualBalanceRewardPool");

const { loadContracts, contractAddresseList } = require("./helper/dumpAddresses");
const feeDisrtroABI = require("./helper/feeDistroABI.json");
const { toBN, log } = require("./helper/utils");
const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const Reverter = require("./helper/reverter");

contract("VeAssetDepositor", async (accounts) => {
  let vetokenMinter;
  let vetoken;
  let rFactory;
  let tFactory;
  let sFactory;
  let poolManager;
  let vetokenRewards;
  let veassetToken;
  let escrow;
  let lpToken;
  let feeDistro;
  let voterProxy;
  let booster;
  let veassetDepositer;
  let ve3Token;
  let ve3TokenRewardPool;
  const reverter = new Reverter(web3);
  const wei = web3.utils.toWei;
  const USER1 = accounts[0];
  const FEE_DENOMINATOR = 10000;

  before("setup", async () => {
    await loadContracts();
    // basic contract
    vetokenMinter = await VeTokenMinter.at(baseContractList.system.vetokenMinter);
    vetoken = await VeToken.at(baseContractList.system.vetoken);
    rFactory = await RewardFactory.at(baseContractList.system.rFactory);
    tFactory = await TokenFactory.at(baseContractList.system.tFactory);
    sFactory = await StashFactory.at(baseContractList.system.sFactory);
    poolManager = await PoolManager.at(baseContractList.system.poolManager);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
    // veasset contracts
    veassetToken = await IERC20.at(contractAddresseList[0]);
    escrow = await IERC20.at(contractAddresseList[1]);
    lpToken = await IERC20.at(contractAddresseList[2]);
    voterProxy = await VoterProxy.at(contractAddresseList[3]);
    booster = await Booster.at(contractAddresseList[4]);
    ve3Token = await VE3Token.at(contractAddresseList[5]);
    veassetDepositer = await VeAssetDepositor.at(contractAddresseList[6]);
    ve3TokenRewardPool = await BaseRewardPool.at(contractAddresseList[7]);
    feeDistro = contractAddresseList[8];
    feeDistroAdmin = contractAddresseList[9];

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("initialLock", async () => {
    it("check voter proxy balance at escrow after intial lock", async () => {
      assert.isAbove(toBN(await escrow.balanceOf(voterProxy.address)).toNumber(), toBN(wei("900")).toNumber());
    });
  });

  describe("Fees", async () => {
    it("setFeeManager", async () => {});
    it("setFees", async () => {});
  });

  describe("deposit", async () => {
    let depositAmount;
    let callIncentive;

    beforeEach("setup", async () => {
      depositAmount = await veassetToken.balanceOf(USER1);
      depositAmount = toBN(depositAmount).idiv(2);
      await veassetToken.approve(veassetDepositer.address, depositAmount);
      let lockIncentive = toBN((await veassetDepositer.lockIncentive()).toString());
      callIncentive = toBN(depositAmount).times(lockIncentive).idiv(FEE_DENOMINATOR);
    });

    it("deposit only without lock", async () => {
      await veassetDepositer.deposit(depositAmount, false);
      assert.equal((await veassetToken.balanceOf(USER1)).toString(), depositAmount.toFixed());
      assert.equal((await veassetToken.balanceOf(veassetDepositer.address)).toString(), depositAmount.toFixed());
      assert.equal((await ve3Token.balanceOf(USER1)).toString(), toBN(depositAmount).minus(callIncentive).toFixed());
    });

    it("if when new unlock time calculated during depositing - last recorded unlock time <= 2 weeks ,remain existing one", async () => {
      const existing_unlockTime = await veassetDepositer.unlockTime();
      console.log("existing unlockTime", existing_unlockTime.toString());
      await time.increase(86400 * 2);
      await veassetDepositer.deposit(depositAmount, true);
      const new_unlockTime = await veassetDepositer.unlockTime();
      console.log("new unlockTime", new_unlockTime.toString());
      assert.equal(Number(existing_unlockTime.toString()), Number(new_unlockTime.toString()));
    });

    it("if when new unlock time calculated during depositing - " + "last recorded unlock time > 2 weeks", async () => {
      const existing_unlockTime = await veassetDepositer.unlockTime();
      console.log("existing unlockTime", existing_unlockTime.toString());
      await time.increase(86400 * 40);
      await veassetDepositer.deposit(depositAmount, true);
      const new_unlockTime = await veassetDepositer.unlockTime();
      console.log("new unlockTime", new_unlockTime.toString());
      expect(Number(new_unlockTime.toString()) - Number(existing_unlockTime.toString())).to.greaterThan(0);
    });

    it.only("set new maxTime, and check new unlock time", async () => {
      const new_max_time = 28 * 86400; //4 weeks
      await veassetDepositer.setLockMaxTime(new_max_time);
      const existing_unlockTime = await veassetDepositer.unlockTime();
      console.log("existing unlockTime", existing_unlockTime.toString());
      await time.increase(86400 * 28);
      // todo: get error when deposit now Transaction: 0x427f3a610aee77e703e705475de7259640d090d24bb7541acb95469fe900c532 exited with an error (status 0).
      // Please check that the transaction:
      // answer: we should not update max time after is initialized, thank you I added this require to the function
      // so in order to set it you need to deploy a new instance in your test becuase it set in migration script
      await veassetDepositer.deposit(depositAmount, true);
      // const new_unlockTime =  await veassetDepositer.unlockTime();
      // console.log("new unlockTime", new_unlockTime.toString());
    });

    it("deposit only with lock", async () => {});
    it("deposit and stake with lock", async () => {});
    it("deposit and stake without lock", async () => {});
    it("depositAll", async () => {});
  });
});
