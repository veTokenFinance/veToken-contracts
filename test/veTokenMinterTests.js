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
const ITokenMinter = artifacts.require("ITokenMinter");
const VirtualBalanceRewardPool = artifacts.require("VirtualBalanceRewardPool");
const ExtraRewardStashV3 = artifacts.require("ExtraRewardStashV3");

const { loadContracts, contractAddresseList, Networks } = require("./helper/dumpAddresses");
const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const feeDisrtroABI = require("./helper/feeDistroABI.json");
const pickle_gaugeProxyABI = require("./helper/gaugeProxyABI_pickle.json");
const gaugeProxyABI = require("./helper/gaugeProxyABI.json");
const { toBN, log } = require("./helper/utils");
const truffleAssert = require("truffle-assertions");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const { parseEther, formatEther, parseUnits, formatUnits } = require("@ethersproject/units");
const Reverter = require("./helper/reverter");
const BigNumber = require("bignumber.js");

contract("Ve3tokenMultipleRewards", async (accounts) => {
  let vetokenMinter;
  let vetoken;
  let rFactory;
  let tFactory;
  let sFactory;
  let poolManager;
  let vetokenRewards;
  //idle
  let veasset_idle;
  let escrow_idle;
  let feeDistro_idle;
  let lpToken_idle;
  let voterProxy_idle;
  let booster_idle;
  let veassetDepositer_idle;
  let ve3Token_idle;
  let ve3TokenRewardPool_idle;
  let feeDistroAdmin_idle;
  let feeToken_idle;
  //angle
  let veasset_angle;
  let escrow_angle;
  let feeDistro_angle;
  let lpToken_angle;
  let voterProxy_angle;
  let booster_angle;
  let veassetDepositer_angle;
  let ve3Token_angle;
  let ve3TokenRewardPool_angle;
  let feeDistroAdmin_angle;
  let feeToken_angle;

  let network;
  let stakerLockPool;
  let treasury;
  const reverter = new Reverter(web3);
  const wei = web3.utils.toWei;
  const USER1 = accounts[0];
  const USER2 = accounts[1];
  const poolId = 0;
  const FEE_DENOMINATOR = 10000;

  before("setup", async function () {
    network = await loadContracts();

    if (network != Networks.none) {
      this.skip();
    }
    // basic contract
    vetokenMinter = await VeTokenMinter.at(baseContractList.system.vetokenMinter);
    vetoken = await VeToken.at(baseContractList.system.vetoken);
    rFactory = await RewardFactory.at(baseContractList.system.rFactory);
    tFactory = await TokenFactory.at(baseContractList.system.tFactory);
    sFactory = await StashFactory.at(baseContractList.system.sFactory);
    poolManager = await PoolManager.at(baseContractList.system.poolManager);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
    stakerLockPool = await VE3DLocker.at(baseContractList.system.ve3dLocker);
    // idle contracts
    veasset_idle = await IERC20.at(baseContractList.system.idle_address);
    escrow_idle = await IERC20.at(baseContractList.system.idle_escrow);
    lpToken_idle = await IERC20.at(baseContractList.system.idle_lptoken);
    voterProxy_idle = await VoterProxy.at(baseContractList.system.idle_voterProxy);
    booster_idle = await Booster.at(baseContractList.system.idle_booster);
    ve3Token_idle = await VE3Token.at(baseContractList.system.ve3_idle);
    veassetDepositer_idle = await VeAssetDepositor.at(baseContractList.system.idle_depositor);
    ve3TokenRewardPool_idle = await BaseRewardPool.at(baseContractList.system.idle_ve3TokenRewardPool);
    feeDistro_idle = baseContractList.system.idle_feedistro;
    feeDistroAdmin_idle = baseContractList.system.idle_feedistro_admin;
    feeToken_idle = await IERC20.at(await booster_idle.feeToken());

    // angle contracts
    veasset_angle = await IERC20.at(baseContractList.system.angle_address);
    escrow_angle = await IERC20.at(baseContractList.system.angle_escrow);
    lpToken_angle = await IERC20.at(baseContractList.system.angle_lptoken);
    voterProxy_angle = await VoterProxy.at(baseContractList.system.angle_voterProxy);
    booster_angle = await Booster.at(baseContractList.system.angle_booster);
    ve3Token_angle = await VE3Token.at(baseContractList.system.ve3_angle);
    veassetDepositer_angle = await VeAssetDepositor.at(baseContractList.system.angle_depositor);
    ve3TokenRewardPool_angle = await BaseRewardPool.at(baseContractList.system.angle_ve3TokenRewardPool);
    feeDistro_angle = baseContractList.system.angle_feedistro;
    feeDistroAdmin_angle = baseContractList.system.angle_feedistro_admin;
    feeToken_angle = await IERC20.at(await booster_angle.feeToken());

    treasury = accounts[2];

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("test veTokenMinter", async () => {
    let depositAmount_idle;
    let rewardPool_idle;
    let earmarkIncentive_idle;
    let lockIncentive_idle;
    let stakerIncentive_idle;
    let stakerLockIncentive_idle;
    let depositAmount_angle;
    let rewardPool_angle;
    let earmarkIncentive_angle;
    let lockIncentive_angle;
    let stakerIncentive_angle;
    let stakerLockIncentive_angle;
    let platformFee;

    beforeEach("setup", async function () {
      if (network != Networks.none) {
        this.skip();
      }
      //idle
      depositAmount_idle = await lpToken_idle.balanceOf(USER1);
      await lpToken_idle.approve(booster_idle.address, depositAmount_idle);
      rewardPool_idle = await BaseRewardPool.at((await booster_idle.poolInfo(poolId))[3]);

      //angle
      depositAmount_angle = await lpToken_angle.balanceOf(USER1);
      await lpToken_angle.approve(booster_angle.address, depositAmount_angle);
      rewardPool_angle = await BaseRewardPool.at((await booster_angle.poolInfo(poolId))[3]);
    });

    it("remove operator and add operator", async function () {
      if (network != Networks.none) {
        this.skip();
      }

      const veTokenMinterCalculation = async (to, amount) => {
        console.log("\t==== veTokenMinter info =====");
        const veTokenTotalSupply = await vetokenMinter.totalSupply();
        const veTokenTotalCliffs = await vetokenMinter.totalCliffs();
        log("veTokenTotalSupply", veTokenTotalSupply);
        const veTokenReductionPerCliff = await vetokenMinter.reductionPerCliff();
        log("veTokenReductionPerCliff", veTokenReductionPerCliff);
        const cliff = veTokenTotalSupply/veTokenReductionPerCliff;
        log(" current Cliff", cliff);
        const reduction = veTokenTotalCliffs - cliff;
        log(" current reduction", reduction);
        await vetokenMinter.mint(to, amount);
        const veTokenTotalAddedSupply = await vetokenMinter.totalSupply();
        return veTokenTotalAddedSupply;
        console.log("\t==== veTokenMinter info End =====");
      }


      await vetokenMinter.removeOperator(booster_angle.address);
      await  vetokenMinter.removeOperator(booster_idle.address);
      const totalWeightAfterRemoveOperator = await vetokenMinter.totalWeight();
      assert.equal(0,totalWeightAfterRemoveOperator.toString());

      await vetokenMinter.addOperator(booster_angle.address, toBN(10).pow(25).times(5));
      const totalWeightAfterAddOperator = await vetokenMinter.totalWeight();
      assert.equal(10**25*5 ,totalWeightAfterAddOperator.toString());

      const veTokenBalanceBefore = await vetoken.balanceOf(USER2);
      await vetokenMinter.withdraw(USER2, 10);
      const veTokenBalanceAfter = await vetoken.balanceOf(USER2);
      assert.equal(10, toBN(veTokenBalanceAfter).minus(toBN(veTokenBalanceBefore)).toString());

      // add dummy operator
      await vetokenMinter.addOperator(USER1, toBN(10).pow(25).times(1));
      const mintedTotalVeTokens = [];
      for(let i = 0; i < 10; i++){
        const mintedVeToken = await veTokenMinterCalculation(USER2, web3.utils.toWei("2", "mwei"));
        console.log("minted VeToken", mintedVeToken.toString());
        mintedTotalVeTokens.push(toBN(mintedVeToken));
      }

      const mintedVeTokens = [];
      for (var i=1; i < mintedTotalVeTokens.length; i++ ){
        const minted = mintedTotalVeTokens[i] - mintedTotalVeTokens[i-1];
        mintedVeTokens.push(minted);
      }
      //todo: check the log, the current cliff is always too small, will never reach 1000 even if we reach max supply 30 million
      // the minted amount never reduce until we reach max supply.
      // looks like we need to remove 1e18. wrong unit.
      mintedVeTokens.forEach(item => console.log(item.toString()));
    });
  });
});
