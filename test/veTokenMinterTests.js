const VoterProxy = artifacts.require("VoterProxy");
const RewardFactory = artifacts.require("RewardFactory");
const VE3Token = artifacts.require("VE3Token");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const Booster = artifacts.require("Booster");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VE3DLocker = artifacts.require("VE3DLocker");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
const VeToken = artifacts.require("VeToken");
const IERC20 = artifacts.require("IERC20");

const { loadContracts, contractAddresseList} = require("./helper/dumpAddresses");
const { toBN, log } = require("./helper/utils");

var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const Reverter = require("./helper/reverter");


contract("Ve3tokenMultipleRewards", async (accounts) => {
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
  let feeToken;

  let network;
  let stakerLockPool;
  let treasury;
  const reverter = new Reverter(web3);
  const USER1 = accounts[0];
  const USER2 = accounts[1];
  const poolId = 0;


  before("setup", async function () {
    network = await loadContracts();
    // basic contract
    vetokenMinter = await VeTokenMinter.at(baseContractList.system.vetokenMinter);
    vetoken = await VeToken.at(baseContractList.system.vetoken);
    rFactory = await RewardFactory.at(baseContractList.system.rFactory);
    tFactory = await TokenFactory.at(baseContractList.system.tFactory);
    sFactory = await StashFactory.at(baseContractList.system.sFactory);
    poolManager = await PoolManager.at(baseContractList.system.poolManager);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
    stakerLockPool = await VE3DLocker.at(baseContractList.system.ve3dLocker);
    veassetToken = await IERC20.at(contractAddresseList[0]);
    escrow = await IERC20.at(contractAddresseList[1]);
    lpToken = await IERC20.at(contractAddresseList[2]);
    voterProxy = await VoterProxy.at(contractAddresseList[3]);
    booster = await Booster.at(contractAddresseList[4]);
    ve3Token = await VE3Token.at(contractAddresseList[5]);
    veassetDepositer = await VeAssetDepositor.at(contractAddresseList[6]);
    ve3TokenRewardPool = await BaseRewardPool.at(contractAddresseList[7]);
    feeDistro = contractAddresseList[8];
    feeToken = await IERC20.at(await booster.feeToken());

    treasury = accounts[2];

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("test veTokenMinter", async () => {


    let depositAmount;
    let rewardPool;


    beforeEach("setup", async function () {

      depositAmount = await lpToken.balanceOf(USER1);
      await lpToken.approve(booster.address, depositAmount);
      rewardPool = await BaseRewardPool.at((await booster.poolInfo(poolId))[3]);
    });

    it("remove operator and add operator", async function () {


      const veTokenMinterCalculation = async (to, amount) => {
        console.log("\t==== veTokenMinter info =====");

        const veTokenTotalSupply = await vetokenMinter.totalSupply();
        const veTokenTotalCliffs = await vetokenMinter.totalCliffs();
        log("veTokenTotalSupply", veTokenTotalSupply);
        const veTokenReductionPerCliff = await vetokenMinter.reductionPerCliff();
        log("veTokenReductionPerCliff", veTokenReductionPerCliff);
        const cliff = veTokenTotalSupply / veTokenReductionPerCliff;
        log(" current Cliff", cliff);
        const reduction = veTokenTotalCliffs - cliff;
        log(" current reduction", reduction);
        await vetokenMinter.mint(to, amount);
        const veTokenTotalAddedSupply = await vetokenMinter.totalSupply();
        return veTokenTotalAddedSupply;
        console.log("\t==== veTokenMinter info End =====");
      };

      await vetokenMinter.removeOperator(booster.address);
      const totalWeightAfterRemoveOperator = await vetokenMinter.totalWeight();
      assert.equal(0, totalWeightAfterRemoveOperator.toString());

      await vetokenMinter.addOperator(booster.address, toBN(10).pow(25).times(5));
      const totalWeightAfterAddOperator = await vetokenMinter.totalWeight();
      assert.equal(10 ** 25 * 5, totalWeightAfterAddOperator.toString());

      const veTokenBalanceBefore = await vetoken.balanceOf(USER2);
      await vetokenMinter.withdraw(USER2, 10);
      const veTokenBalanceAfter = await vetoken.balanceOf(USER2);
      assert.equal(10, toBN(veTokenBalanceAfter).minus(toBN(veTokenBalanceBefore)).toString());

      // add dummy operator
      await vetokenMinter.addOperator(USER1, toBN(10).pow(25).times(1));
      const mintedTotalVeTokens = [];
      for (let i = 0; i < 10; i++) {
        // every time pass in 2 million ( unit 18 decimal)
        const mintedVeToken = await veTokenMinterCalculation(USER2, web3.utils.toWei("2000000", "ether"));
        console.log("minted VeToken", mintedVeToken.toString());
        mintedTotalVeTokens.push(toBN(mintedVeToken));
      }

      const mintedVeTokens = [];
      for (var i = 1; i < mintedTotalVeTokens.length; i++) {
        const minted = mintedTotalVeTokens[i] - mintedTotalVeTokens[i - 1];
        mintedVeTokens.push(minted);
      }
       // minted veToken reduces as cliff changes by increased Total Supply
      for (var i = 1; i < mintedVeTokens.length; i++) {
        console.log(toBN(mintedVeTokens[i]).div(10**18).toString());
        assert.isAbove(Number(mintedVeTokens[i-1]-mintedVeTokens[i]), 0);
      }
    });

    });
  });

