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

  describe("claimRewards", async () => {
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

    it("earmarkRewards full flow for idle and angle", async function () {
      if (network != Networks.none) {
        this.skip();
      }

      const veTokenMinterCalculation = async (amount, veTokenBoosterAddress) => {
        console.log("\t==== veTokenMinter info =====");
        const veTokenWeight_booster = await vetokenMinter.veAssetWeights(veTokenBoosterAddress);
        const veTokenTotalWeight = await vetokenMinter.totalWeight();
        const veTokenTotalSupply = await vetokenMinter.totalSupply();
        const veTokenTotalCliffs = await vetokenMinter.totalCliffs();
        log("veTokenTotalSupply", veTokenTotalSupply);
        const veTokenReductionPerCliff = await vetokenMinter.reductionPerCliff();
        log("veTokenReductionPerCliff", veTokenReductionPerCliff.toString());
        const cliff = toBN(veTokenTotalSupply).div(toBN(veTokenReductionPerCliff));
        log(" current Cliff", cliff.toString());
        const reduction = toBN(veTokenTotalCliffs).minus(cliff);
        log(" current reduction", reduction);
        //getReward() in reward contract call booster.rewardClaimed
        const mint_input = toBN(amount).multipliedBy(toBN(veTokenWeight_booster)).div(toBN(veTokenTotalWeight));
        log(" input amount for mint function", mint_input);
        //vetokenMinter.mint()
        const expected_minted = mint_input.multipliedBy(toBN(reduction)).div(toBN(veTokenTotalCliffs)).div(10**18);
        return expected_minted;
        console.log("\t==== veTokenMinter info End =====");
      };

      await booster_idle.deposit(poolId, depositAmount_idle, true);
      await booster_angle.deposit(poolId, depositAmount_angle, true);

      // increase time
      await time.increase(86400);
      await time.advanceBlock();

      // claim rewards
      await booster_idle.earmarkRewards(poolId, { from: USER2 });
      await booster_angle.earmarkRewards(poolId, { from: USER2 });

      // increase time
      await time.increase(86400);
      await time.advanceBlock();

      // user claim rewards
      const userVetokenBeforeAnyReward = await vetoken.balanceOf(USER1);
      //await veTokenMinterInfo();

      const rewardEarned_idle = await rewardPool_idle.earned(USER1);

      const veTokenTotalSupplyBefore = await vetokenMinter.totalSupply();

      // 1. get rewards from idle pool
      await rewardPool_idle.getReward();

      const veTokenTotalSupplyAfter = await vetokenMinter.totalSupply();
      console.log("earned ", rewardEarned_idle.toString());
      const expectedVeToken_idle = await veTokenMinterCalculation(rewardEarned_idle, booster_idle.address);

      log("expectedVeToken via idle minted", expectedVeToken_idle.toString());
      // check total supply added or via balance
      const actualVeTokenMintedforIdle = toBN(veTokenTotalSupplyAfter).minus(toBN(veTokenTotalSupplyBefore)).div(10**18);
      log("actualVeToken via idle minted", actualVeTokenMintedforIdle.toString());

      assert.closeTo(
        expectedVeToken_idle.toNumber(),
        actualVeTokenMintedforIdle.toNumber(),
        0.00001,
        "check minted veToken for idle"
      );
      const userVetokenFromIdlePool = await vetoken.balanceOf(USER1);
      log(
        "veToken minted from idle pool and transferred to user",
        toBN(userVetokenFromIdlePool).minus(userVetokenBeforeAnyReward).toString()
      );

      assert.equal(
        toBN(userVetokenFromIdlePool).minus(userVetokenBeforeAnyReward).div(10**18).toNumber(),
        actualVeTokenMintedforIdle.toNumber()
      );

      // 2. get rewards from angle pool
      const rewardEarned_angle = await rewardPool_angle.earned(USER1);
      console.log("earned ", rewardEarned_angle.toString());
      await rewardPool_angle.getReward();
      const veTokenTotalSupplyAfter2= await vetokenMinter.totalSupply();

      const expectedVeToken_angle = await veTokenMinterCalculation(rewardEarned_angle, booster_angle.address);
      log("expectedVeToken angle minted", expectedVeToken_angle.toString());
      const actualVeTokenMintedForAngle = toBN(veTokenTotalSupplyAfter2).minus(toBN(veTokenTotalSupplyAfter)).div(10**18);
      assert.closeTo(
        expectedVeToken_angle.toNumber(),
        actualVeTokenMintedForAngle.toNumber(),
        0.00001,
        "check minted veToken for angle"
      );
      log("actual veToken minted from angle pool", actualVeTokenMintedForAngle);
      const userVetokenBalAfter = (await vetoken.balanceOf(USER1)).toString();
      log(
        "veToken minted from angle pool and transferred to user",
        toBN(userVetokenBalAfter).minus(toBN(userVetokenFromIdlePool)).toString()
      );
      assert.equal(
        toBN(userVetokenBalAfter).minus(toBN(userVetokenFromIdlePool)).div(10**18).toNumber(),
        actualVeTokenMintedForAngle.toNumber());

      //stake vetoken
      await vetoken.approve(vetokenRewards.address, userVetokenBalAfter);
      await vetokenRewards.stake(userVetokenBalAfter);

      const ve3TokenEarnedBefore_idle = (await vetokenRewards.earned(veasset_idle.address, USER1)).toString();
      const ve3TokenEarnedBefore_angle = (await vetokenRewards.earned(veasset_angle.address, USER1)).toString();

      await time.increase(86400);
      await time.advanceBlock();

      const ve3TokenEarnedAfter_idle = (await vetokenRewards.earned(veasset_idle.address, USER1)).toString();
      log("user ve3token_idle earned before increase time", formatEther(ve3TokenEarnedBefore_idle));
      log("user ve3token_idle earned after increase time", formatEther(ve3TokenEarnedAfter_idle));
      const ve3TokenEarnedAfter_angle = (await vetokenRewards.earned(veasset_angle.address, USER1)).toString();
      log("user ve3token_angle earned before increase time", formatEther(ve3TokenEarnedBefore_angle));
      log("user ve3token_angle earned after increase time", formatEther(ve3TokenEarnedAfter_angle));

      console.log("get reward with stake");
      const userStakedBalBefore_idle = (await ve3TokenRewardPool_idle.balanceOf(USER1)).toString();
      const userStakedBalBefore_angle = (await ve3TokenRewardPool_angle.balanceOf(USER1)).toString();

      //get reward and stake
      await vetokenRewards.getReward(USER1, true, true);

      const userStakedBalAfter_idle = (await ve3TokenRewardPool_idle.balanceOf(USER1)).toString();
      log("user ve3Token_idle staked balance before getReward", formatEther(userStakedBalBefore_idle));
      log("user ve3Token_idle staked balance after getReward", formatEther(userStakedBalAfter_idle));

      const userStakedBalAfter_angle = (await ve3TokenRewardPool_angle.balanceOf(USER1)).toString();
      log("user ve3Token_angle staked balance before getReward", formatEther(userStakedBalBefore_angle));
      log("user ve3Token_angle staked balance after getReward", formatEther(userStakedBalAfter_angle));

      const newve3TokenEarnedBefore_idle = (await vetokenRewards.earned(veasset_idle.address, USER1)).toString();
      const newve3TokenEarnedBefore_angle = (await vetokenRewards.earned(veasset_angle.address, USER1)).toString();

      // increase time
      await time.increase(86400);
      await time.advanceBlock();

      const newve3TokenEarnedAfter_idle = (await vetokenRewards.earned(veasset_idle.address, USER1)).toString();
      log("user ve3token_idle earned after getreward", formatEther(newve3TokenEarnedBefore_idle));
      log("user ve3token_idle earned after increase time second time", formatEther(newve3TokenEarnedAfter_idle));

      const newve3TokenEarnedAfter_angle = (await vetokenRewards.earned(veasset_angle.address, USER1)).toString();
      log("user ve3token_angle earned after getreward", formatEther(newve3TokenEarnedBefore_angle));
      log("user ve3token_angle earned after increase time second time", formatEther(newve3TokenEarnedAfter_angle));

      const ve3TokenBalBefore_idle = (await ve3Token_idle.balanceOf(USER1)).toString();
      const ve3TokenBalBefore_angle = (await ve3Token_angle.balanceOf(USER1)).toString();

      console.log("get reward without stake");
      //get reward without stake
      await vetokenRewards.getReward(USER1, true, false);

      const ve3TokenBalAfter_idle = (await ve3Token_idle.balanceOf(USER1)).toString();
      log("user ve3token_idle balance before getreward", formatEther(ve3TokenBalBefore_idle));
      log("user ve3token_idle balance after getreward", formatEther(ve3TokenBalAfter_idle));

      const ve3TokenBalAfter_angle = (await ve3Token_angle.balanceOf(USER1)).toString();
      log("user ve3token_angle balance before getreward", formatEther(ve3TokenBalBefore_angle));
      log("user ve3token_angle balance after getreward", formatEther(ve3TokenBalAfter_angle));
    });
  });
});
