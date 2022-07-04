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

contract("Booster", async (accounts) => {
  let vetokenMinter;
  let vetoken;
  let rFactory;
  let tFactory;
  let sFactory;
  let poolManager;
  let vetokenRewards;
  let veassetToken;
  let escrow;
  let feeDistro;
  let lpToken;
  let voterProxy;
  let booster;
  let veassetDepositer;
  let ve3Token;
  let ve3TokenRewardPool;
  let network;
  let feeToken;
  let stakerLockPool;
  let treasury;
  const reverter = new Reverter(web3);
  const wei = web3.utils.toWei;
  const USER1 = accounts[0];
  const USER2 = accounts[1];
  const poolId = 0;
  const FEE_DENOMINATOR = 10000;

  before("setup", async () => {
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
    feeToken = await IERC20.at(await booster.feeToken());
    treasury = accounts[2];

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("deposit", async () => {
    let depositAmount;
    let rewardPool;
    let exchangeToken;

    beforeEach("setup", async () => {
      depositAmount = await lpToken.balanceOf(USER1);
      await lpToken.approve(booster.address, depositAmount);
      exchangeToken = await IERC20.at((await booster.poolInfo(poolId))[1]);
      rewardPool = await BaseRewardPool.at((await booster.poolInfo(poolId))[3]);
    });

    it("deposit lp token and stake", async () => {
      await booster.deposit(poolId, depositAmount, true);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), depositAmount);
    });

    it("deposit lp token without stake", async () => {
      await booster.deposit(poolId, depositAmount, false);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await exchangeToken.balanceOf(USER1)).toString(), depositAmount);
    });

    it("should revert if pool shutdown", async () => {
      await poolManager.shutdownPool(booster.address, poolId);
      assert.equal((await booster.poolInfo(poolId))[5], true);

      await truffleAssert.reverts(booster.deposit(poolId, depositAmount, true), "pool is closed");
    });

    it("deposit all lp token and stake", async () => {
      await booster.depositAll(poolId, true);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), depositAmount);
    });

    it("deposit all lp token without stake", async () => {
      await booster.depositAll(poolId, false);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await exchangeToken.balanceOf(USER1)).toString(), depositAmount);
    });
  });

  describe("withdraw", async () => {
    let depositAmount;
    let rewardPool;
    let exchangeToken;

    beforeEach("setup", async () => {
      depositAmount = await lpToken.balanceOf(USER1);
      await lpToken.approve(booster.address, depositAmount);
      exchangeToken = await IERC20.at((await booster.poolInfo(poolId))[1]);
      rewardPool = await BaseRewardPool.at((await booster.poolInfo(poolId))[3]);
    });

    it("withdraw lp token in two steps when stake", async () => {
      await booster.deposit(poolId, depositAmount, true);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), depositAmount);

      await rewardPool.withdraw(depositAmount, false);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), 0);
      await booster.withdraw(poolId, depositAmount);
      assert.equal((await lpToken.balanceOf(USER1)).toString(), depositAmount);
    });

    it("withdraw all lp token in two steps when stake", async () => {
      await booster.deposit(poolId, depositAmount, true);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), depositAmount);

      await rewardPool.withdrawAll(false);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), 0);
      await booster.withdraw(poolId, depositAmount);
      assert.equal((await lpToken.balanceOf(USER1)).toString(), depositAmount);
    });

    it("withdraw lp token in one steps when stake", async () => {
      await booster.deposit(poolId, depositAmount, true);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), depositAmount);

      await rewardPool.withdrawAndUnwrap(depositAmount, false);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), 0);
      assert.equal((await lpToken.balanceOf(USER1)).toString(), depositAmount);
    });

    it("withdraw all lp token in one steps when stake", async () => {
      await booster.deposit(poolId, depositAmount, true);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), depositAmount);

      await rewardPool.withdrawAllAndUnwrap(false);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), 0);
      assert.equal((await lpToken.balanceOf(USER1)).toString(), depositAmount);
    });

    it("withdraw lp token when no stake", async () => {
      await booster.deposit(poolId, depositAmount, false);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await exchangeToken.balanceOf(USER1)).toString(), depositAmount);

      await booster.withdraw(poolId, depositAmount);
      assert.equal((await exchangeToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await lpToken.balanceOf(USER1)).toString(), depositAmount);
    });

    it("withdraw all lp token when no stake", async () => {
      await booster.deposit(poolId, depositAmount, false);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await exchangeToken.balanceOf(USER1)).toString(), depositAmount);

      await booster.withdrawAll(poolId);
      assert.equal((await exchangeToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await lpToken.balanceOf(USER1)).toString(), depositAmount);
    });

    it("withdraw lp token in two steps when shutdown pool", async () => {
      await booster.deposit(poolId, depositAmount, true);

      await poolManager.shutdownPool(booster.address, 0);
      assert.equal((await booster.poolInfo(poolId))[5], true);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), depositAmount);
      assert.equal((await lpToken.balanceOf(booster.address)).toString(), depositAmount);

      await rewardPool.withdraw(depositAmount, false);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), 0);
      await booster.withdraw(poolId, depositAmount);
      assert.equal((await lpToken.balanceOf(USER1)).toString(), depositAmount);
    });

    it("withdraw lp token in one steps when shutdown pool", async () => {
      await booster.deposit(poolId, depositAmount, true);

      await poolManager.shutdownPool(booster.address, 0);
      assert.equal((await booster.poolInfo(poolId))[5], true);

      assert.equal((await lpToken.balanceOf(USER1)).toString(), 0);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), depositAmount);
      assert.equal((await lpToken.balanceOf(booster.address)).toString(), depositAmount);

      await rewardPool.withdrawAndUnwrap(depositAmount, false);
      assert.equal((await rewardPool.balanceOf(USER1)).toString(), 0);
      assert.equal((await lpToken.balanceOf(USER1)).toString(), depositAmount);
    });
  });

  describe("claimRewards", async () => {
    let depositAmount;
    let rewardPool;
    let earmarkIncentive;
    let lockIncentive;
    let stakerIncentive;
    let stakerLockIncentive;
    let platformFee;

    beforeEach("setup", async () => {
      depositAmount = await lpToken.balanceOf(USER1);
      await lpToken.approve(booster.address, depositAmount);
      rewardPool = await BaseRewardPool.at((await booster.poolInfo(poolId))[3]);
      earmarkIncentive = toBN((await booster.earmarkIncentive()).toString());
      lockIncentive = toBN((await booster.lockIncentive()).toString());
      stakerIncentive = toBN((await booster.stakerIncentive()).toString());
    });

    it("earmarkRewards full flow", async () => {
      await booster.deposit(poolId, depositAmount, true);

      // increase time
      await time.increase(86400);
      await time.advanceBlock();

      const callerBalBefore = (await veassetToken.balanceOf(USER2)).toString();

      const lpRewardPoolBalBefore = (await veassetToken.balanceOf(rewardPool.address)).toString();

      const baseRewardPoolBalBefore = (await veassetToken.balanceOf(ve3TokenRewardPool.address)).toString();

      const ve3dRewardPoolBalBefore = (await veassetToken.balanceOf(vetokenRewards.address)).toString();

      // claim rewards
      await booster.earmarkRewards(poolId, { from: USER2 });

      console.log(
        "distributes 15% of rewards 0.5% to the caller + 4.5% to ve3d reward pool" +
          "\n" +
          "+ 10% to the ve3Token reward pool + 85% to lp reward pool"
      );

      const callerBalAfter = (await veassetToken.balanceOf(USER2)).toString();
      log("caller balance before earmarkRewards", formatEther(callerBalBefore));
      log("caller balance after earmarkRewards 0.5%", formatEther(callerBalAfter));

      const lpRewardPoolBalAfter = (await veassetToken.balanceOf(rewardPool.address)).toString();
      log("lp reward pool balance before earmarkRewards", formatEther(lpRewardPoolBalBefore));
      log("lp reward pool balance after earmarkRewards 85%", formatEther(lpRewardPoolBalAfter));

      const baseRewardPoolBalAfter = (await veassetToken.balanceOf(ve3TokenRewardPool.address)).toString();
      log("base reward pool balance before earmarkRewards", formatEther(baseRewardPoolBalBefore));
      log("base reward pool balance after earmarkRewards 10%", formatEther(baseRewardPoolBalAfter));

      const ve3dRewardPoolBalAfter = (await veassetToken.balanceOf(vetokenRewards.address)).toString();
      log("ve3d reward pool balance before earmarkRewards", formatEther(ve3dRewardPoolBalBefore));
      log("ve3d reward pool balance after earmarkRewards 4.5%", formatEther(ve3dRewardPoolBalAfter));

      const totalRewards = toBN(toBN(callerBalAfter).minus(callerBalBefore))
        .plus(toBN(lpRewardPoolBalAfter).minus(lpRewardPoolBalBefore))
        .plus(toBN(baseRewardPoolBalAfter).minus(baseRewardPoolBalBefore))
        .plus(toBN(ve3dRewardPoolBalAfter).minus(ve3dRewardPoolBalBefore))
        .toString();
      assert.isTrue(toBN(totalRewards).gt(0));
      log("total reward", formatEther(totalRewards));

      //assertion
      console.log("reward distribution assertion based on the current percentage configuration");
      const earmarkIncentiveAmount = toBN(totalRewards).times(earmarkIncentive).idiv(FEE_DENOMINATOR).toString();
      assert.equal(
        toBN(callerBalAfter).minus(callerBalBefore).toString(),
        earmarkIncentiveAmount,
        "earmarkIncentive 0.5%"
      );

      const lockIncentiveAmount = toBN(totalRewards).times(lockIncentive).idiv(FEE_DENOMINATOR).toString();
      assert.equal(
        toBN(baseRewardPoolBalAfter).minus(baseRewardPoolBalBefore).toString(),
        lockIncentiveAmount,
        "lockIncentive 10%"
      );

      const stakerIncentiveAmount = toBN(totalRewards).times(stakerIncentive).idiv(FEE_DENOMINATOR).toString();
      assert.equal(
        toBN(ve3dRewardPoolBalAfter).minus(ve3dRewardPoolBalBefore).toString(),
        stakerIncentiveAmount,
        "stakerIncentive 4.5%"
      );

      assert.equal(
        toBN(lpRewardPoolBalAfter).minus(lpRewardPoolBalBefore).toString(),
        toBN(totalRewards)
          .minus(earmarkIncentiveAmount)
          .minus(lockIncentiveAmount)
          .minus(stakerIncentiveAmount)
          .toString(),
        "lp reward pool 85%"
      );

      const userRewardBalBefore = (await veassetToken.balanceOf(USER1)).toString();
      const userEarnedBefore = (await rewardPool.earned(USER1)).toString();
      const userVetokenBalBefore = (await vetoken.balanceOf(USER1)).toString();

      // increase time
      await time.increase(86400);
      await time.advanceBlock();

      const userEarnedAfter = (await rewardPool.earned(USER1)).toString();

      // user claim rewards
      await rewardPool.getReward();

      const userRewardBalAfter = (await veassetToken.balanceOf(USER1)).toString();

      const userVetokenBalAfter = (await vetoken.balanceOf(USER1)).toString();

      log("user earned balance before increase time", formatEther(userEarnedBefore));
      log("user earned balance after increase time", formatEther(userEarnedAfter));
      log("user reward balance before getReward", formatEther(userRewardBalBefore));
      log("user reward balance after getReward", formatEther(userRewardBalAfter));
      log("user vetoken balance before getReward", formatEther(userVetokenBalBefore));
      log("user vetoken balance after getReward", formatEther(userVetokenBalAfter));

      console.log("stake vetoken balance");

      //stake vetoken
      await vetoken.approve(vetokenRewards.address, userVetokenBalAfter);
      await vetokenRewards.stake(userVetokenBalAfter);

      const userVetokenBalAfterStake = (await vetoken.balanceOf(USER1)).toString();
      const ve3TokenEarnedBefore = (await vetokenRewards.earned(veassetToken.address, USER1)).toString();
      log("user vetoken balance after stake", formatEther(userVetokenBalAfterStake));

      await time.increase(86400);
      await time.advanceBlock();

      const ve3TokenEarnedAfter = (await vetokenRewards.earned(veassetToken.address, USER1)).toString();
      log("user ve3token earned before increase time", formatEther(ve3TokenEarnedBefore));
      log("user ve3token earned after increase time", formatEther(ve3TokenEarnedAfter));

      console.log("get reward with stake");
      const userStakedBalBefore = (await ve3TokenRewardPool.balanceOf(USER1)).toString();

      //get reward and stake
      await vetokenRewards.getReward(USER1, true, true);

      const userStakedBalAfter = (await ve3TokenRewardPool.balanceOf(USER1)).toString();
      log("user ve3Token staked balance before getReward", formatEther(userStakedBalBefore));
      log("user ve3Token staked balance after getReward", formatEther(userStakedBalAfter));

      const newve3TokenEarnedBefore = (await vetokenRewards.earned(veassetToken.address, USER1)).toString();

      // increase time
      await time.increase(86400);
      await time.advanceBlock();

      const newve3TokenEarnedAfter = (await vetokenRewards.earned(veassetToken.address, USER1)).toString();
      log("user ve3token earned after getreward", formatEther(newve3TokenEarnedBefore));
      log("user ve3token earned after increase time second time", formatEther(newve3TokenEarnedAfter));

      const ve3TokenBalBefore = (await ve3Token.balanceOf(USER1)).toString();

      console.log("get reward without stake");
      //get reward without stake
      await vetokenRewards.getReward(USER1, true, false);

      const ve3TokenBalAfter = (await ve3Token.balanceOf(USER1)).toString();
      log("user ve3token balance before getreward", formatEther(ve3TokenBalBefore));
      log("user ve3token balance after getreward", formatEther(ve3TokenBalAfter));
    });

    it("earmarkRewards - check reward distribution", async () => {
      await booster.setFees(toBN(1000), toBN(450), toBN(300), toBN(50), toBN(200));
      stakerLockIncentive = toBN((await booster.stakerLockIncentive()).toString());
      platformFee = toBN((await booster.platformFee()).toString());
      await booster.setTreasury(treasury);

      assert.equal((await booster.lockIncentive()).toString(), toBN(1000));
      assert.equal((await booster.stakerIncentive()).toString(), toBN(450));
      assert.equal((await booster.stakerLockIncentive()).toString(), toBN(300));
      assert.equal((await booster.earmarkIncentive()).toString(), toBN(50));
      assert.equal((await booster.platformFee()).toString(), toBN(200));
      assert.equal(await booster.treasury(), treasury);

      await booster.deposit(poolId, depositAmount, true);

      // increase time
      await time.increase(86400);
      await time.advanceBlock();

      const callerBalBefore = (await veassetToken.balanceOf(USER2)).toString();

      const lpRewardPoolBalBefore = (await veassetToken.balanceOf(rewardPool.address)).toString();

      const baseRewardPoolBalBefore = (await veassetToken.balanceOf(ve3TokenRewardPool.address)).toString();

      const ve3dRewardPoolBalBefore = (await veassetToken.balanceOf(vetokenRewards.address)).toString();

      const stakerLockPoolBalBefore = (await veassetToken.balanceOf(stakerLockPool.address)).toString();

      const treasuryBalBefore = (await veassetToken.balanceOf(treasury)).toString();

      // claim rewards
      await booster.earmarkRewards(poolId, { from: USER2 });

      console.log(
        "distributes 20% of rewards 0.5% to the caller + 4.5% to ve3d reward pool" +
          "\n" +
          "+ 10% to the ve3Token reward pool + 3% to stakerlock pool + 2% platform fee + 80% to lp reward pool"
      );

      const callerBalAfter = (await veassetToken.balanceOf(USER2)).toString();
      log("caller balance before earmarkRewards", formatEther(callerBalBefore));
      log("caller balance after earmarkRewards 0.5%", formatEther(callerBalAfter));

      const lpRewardPoolBalAfter = (await veassetToken.balanceOf(rewardPool.address)).toString();
      log("lp reward pool balance before earmarkRewards", formatEther(lpRewardPoolBalBefore));
      log("lp reward pool balance after earmarkRewards 85%", formatEther(lpRewardPoolBalAfter));

      const baseRewardPoolBalAfter = (await veassetToken.balanceOf(ve3TokenRewardPool.address)).toString();
      log("base reward pool balance before earmarkRewards", formatEther(baseRewardPoolBalBefore));
      log("base reward pool balance after earmarkRewards 10%", formatEther(baseRewardPoolBalAfter));

      const ve3dRewardPoolBalAfter = (await veassetToken.balanceOf(vetokenRewards.address)).toString();
      log("ve3d reward pool balance before earmarkRewards", formatEther(ve3dRewardPoolBalBefore));
      log("ve3d reward pool balance after earmarkRewards 4.5%", formatEther(ve3dRewardPoolBalAfter));

      const stakerLockPoolBalAfter = (await veassetToken.balanceOf(stakerLockPool.address)).toString();
      log("xVE3D reward pool balance before earmarkRewards", formatEther(stakerLockPoolBalBefore));
      log("xVE3D reward pool balance after earmarkRewards 3%", formatEther(stakerLockPoolBalAfter));

      const treasuryBalAfter = (await veassetToken.balanceOf(treasury)).toString();
      log("treasury balance before earmarkRewards", formatEther(treasuryBalBefore));
      log("treasury balance after earmarkRewards 2%", formatEther(treasuryBalAfter));

      const totalRewards = toBN(toBN(callerBalAfter).minus(callerBalBefore))
        .plus(toBN(lpRewardPoolBalAfter).minus(lpRewardPoolBalBefore))
        .plus(toBN(baseRewardPoolBalAfter).minus(baseRewardPoolBalBefore))
        .plus(toBN(ve3dRewardPoolBalAfter).minus(ve3dRewardPoolBalBefore))
        .plus(toBN(stakerLockPoolBalAfter).minus(stakerLockPoolBalBefore))
        .plus(toBN(treasuryBalAfter).minus(treasuryBalBefore))
        .toString();
      assert.isTrue(toBN(totalRewards).gt(0));
      log("total reward", formatEther(totalRewards));

      //assertion
      console.log("reward distribution assertion based on the current percentage configuration");
      const earmarkIncentiveAmount = toBN(totalRewards).times(earmarkIncentive).idiv(FEE_DENOMINATOR).toString();
      assert.equal(
        toBN(callerBalAfter).minus(callerBalBefore).toString(),
        earmarkIncentiveAmount,
        "earmarkIncentive 0.5%"
      );

      const lockIncentiveAmount = toBN(totalRewards).times(lockIncentive).idiv(FEE_DENOMINATOR).toString();
      assert.equal(
        toBN(baseRewardPoolBalAfter).minus(baseRewardPoolBalBefore).toString(),
        lockIncentiveAmount,
        "lockIncentive 10%"
      );

      const stakerIncentiveAmount = toBN(totalRewards).times(stakerIncentive).idiv(FEE_DENOMINATOR).toString();
      assert.equal(
        toBN(ve3dRewardPoolBalAfter).minus(ve3dRewardPoolBalBefore).toString(),
        stakerIncentiveAmount,
        "stakerIncentive 4.5%"
      );

      const stakerLookIncentiveAmount = toBN(totalRewards).times(stakerLockIncentive).idiv(FEE_DENOMINATOR).toString();

      assert.equal(
        toBN(stakerLockPoolBalAfter).minus(stakerLockPoolBalBefore).toString(),
        stakerLookIncentiveAmount,
        "stakerLockIncentive 3%"
      );

      const platformFeeAmount = toBN(totalRewards).times(platformFee).idiv(FEE_DENOMINATOR).toString();
      assert.equal(toBN(treasuryBalAfter).minus(treasuryBalBefore).toString(), platformFeeAmount, "platform fee 2%");

      assert.equal(
        toBN(lpRewardPoolBalAfter).minus(lpRewardPoolBalBefore).toString(),
        toBN(totalRewards)
          .minus(earmarkIncentiveAmount)
          .minus(lockIncentiveAmount)
          .minus(stakerIncentiveAmount)
          .minus(stakerLookIncentiveAmount)
          .minus(platformFeeAmount)
          .toString(),
        "lp reward pool 80%"
      );
    });

    it("earmarkRewards - claim extra reward (stashing) - idle", async function () {
      if (network == Networks.idle) {
        await booster.deposit(poolId, depositAmount, true);

        // increase time
        await time.increase(86400);
        await time.advanceBlock();

        // claim rewards
        await booster.earmarkRewards(poolId, { from: USER2 });

        const lpRewardPoolAddress = (await booster.poolInfo(poolId))[3];
        const stashAddress = (await booster.poolInfo(poolId))[4];

        //lp reward pool
        const lpRewardPool = await BaseRewardPool.at(lpRewardPoolAddress);
        // stash pool
        const stashRewardPool = await ExtraRewardStashV3.at(stashAddress);

        const stashTokenRewardPoolAddress = (await stashRewardPool.tokenInfo(0)).rewardAddress;
        const stashTokenAddress = (await stashRewardPool.tokenInfo(0)).token;
        // reward pool for stash token
        const stashTokenExtraRewardPool = await VirtualBalanceRewardPool.at(stashTokenRewardPoolAddress);
        // stash token
        const stashToken = await IERC20.at(stashTokenAddress);

        const extraRewardPoolBalance = (await stashToken.balanceOf(stashTokenExtraRewardPool.address)).toString();

        assert.isTrue(toBN(extraRewardPoolBalance).gt(0));
        assert.equal((await lpRewardPool.extraRewardsLength()).toString(), "1");
        assert.equal(await lpRewardPool.getExtraReward(0), stashTokenRewardPoolAddress);

        log("extra reward pool (stash) balance ", formatEther(extraRewardPoolBalance));
      } else this.skip();
    });
  });

  describe("claimFeeRewards", async () => {
    let depositAmount;
    let unit;

    beforeEach("setup", async () => {
      depositAmount = await veassetToken.balanceOf(USER1);

      depositAmount = toBN(depositAmount).idiv(2);
      await veassetToken.approve(veassetDepositer.address, depositAmount);
      unit = "ether";
      if (network == Networks.angle) {
        unit = "mwei";
      }
    });

    it("earmarkFees full flow", async () => {
      await veassetDepositer.deposit(depositAmount, true, ve3TokenRewardPool.address);

      //increase time
      await time.increaseTo(
        toBN(await time.latest())
          .plus(21 * 86400)
          .toString()
      );
      await time.advanceBlock();

      const lockFeesAddress = await booster.lockFees();
      const lockFees = await VirtualBalanceRewardPool.at(lockFeesAddress);
      const rewardBalBefore = (await feeToken.balanceOf(lockFeesAddress)).toString();

      //prepare claiming reward
      const feeTokenBal = await feeToken.balanceOf(USER1);

      await feeToken.transfer(feeDistro, feeTokenBal.toString(), { from: USER1 });

      const feeDistroContract = new web3.eth.Contract(feeDisrtroABI, feeDistro);

      await feeDistroContract.methods.checkpoint_token().send({ from: feeDistroAdmin, gas: 8000000 });

      // claim fee rewards
      await booster.earmarkFees();

      const rewardBalAfter = (await feeToken.balanceOf(lockFeesAddress)).toString();
      assert.isTrue(toBN(rewardBalAfter).gt(0));
      log("reward pool balance before earmarkFees", formatUnits(rewardBalBefore, unit));
      log("reward pool balance after earmarkFees", formatUnits(rewardBalAfter, unit));

      const userBalBefore = (await feeToken.balanceOf(USER1)).toString();

      // increase time
      await time.increaseTo(
        toBN(await time.latest())
          .plus(3 * 86400)
          .toString()
      );
      await time.advanceBlock();
      // get reward
      await ve3TokenRewardPool.getReward(USER1, true);
      const userBalAfter = (await feeToken.balanceOf(USER1)).toString();

      log("user reward balance before get reward", formatUnits(userBalBefore, unit));
      log("user reward balance after get reward", formatUnits(userBalAfter, unit));

      assert.equal(
        (await feeToken.balanceOf(lockFeesAddress)).toString(),
        toBN(rewardBalAfter).minus(rewardBalBefore).minus(toBN(userBalAfter).minus(userBalBefore)).toFixed()
      );

      await time.increaseTo(
        toBN(await time.latest())
          .plus(86400)
          .toString()
      );
      await time.advanceBlock();

      log("reward pool reward per token", formatUnits((await lockFees.rewardPerToken()).toString(), unit));
    });

    it("earmarkFees - check reward distribution", async () => {
      await veassetDepositer.deposit(depositAmount, true, ve3TokenRewardPool.address);

      //increase time
      await time.increaseTo(
        toBN(await time.latest())
          .plus(21 * 86400)
          .toString()
      );
      await time.advanceBlock();

      await booster.setFeeInfo(toBN(3000), toBN(7000));
      assert.equal((await booster.lockFeesIncentive()).toString(), toBN(3000));
      assert.equal((await booster.stakerLockFeesIncentive()).toString(), toBN(7000));

      const lockFeesIncentive = toBN((await booster.lockFeesIncentive()).toString());
      const stakerLockFeesIncentive = toBN((await booster.stakerLockFeesIncentive()).toString());

      const lockFeesAddress = await booster.lockFees();

      const lockFeesBalBefore = (await feeToken.balanceOf(lockFeesAddress)).toString();
      const stakerLockFeesBalBefore = (await feeToken.balanceOf(stakerLockPool.address)).toString();

      //prepare claiming reward
      const feeTokenBal = await feeToken.balanceOf(USER1);

      await feeToken.transfer(feeDistro, feeTokenBal.toString(), { from: USER1 });

      const feeDistroContract = new web3.eth.Contract(feeDisrtroABI, feeDistro);

      await feeDistroContract.methods.checkpoint_token().send({ from: feeDistroAdmin, gas: 8000000 });

      console.log("distributes 30% of fee to the lock pool + 70% to xve3d reward pool");
      // claim fee rewards
      await booster.earmarkFees();

      const lockFeesBalAfter = (await feeToken.balanceOf(lockFeesAddress)).toString();
      log("lockFees reward pool balance before earmarkFees", formatUnits(lockFeesBalBefore, unit));
      log("lockFees reward pool balance after earmarkFees", formatUnits(lockFeesBalAfter, unit));

      const stakerLockFeesBalAfter = (await feeToken.balanceOf(stakerLockPool.address)).toString();
      log("stakerlockFees reward pool balance before earmarkFees", formatUnits(stakerLockFeesBalBefore, unit));
      log("stakerlockFees reward pool balance after earmarkFees", formatUnits(stakerLockFeesBalAfter, unit));

      const totalRewards = toBN(toBN(lockFeesBalAfter).minus(lockFeesBalBefore))
        .plus(toBN(stakerLockFeesBalAfter).minus(stakerLockFeesBalBefore))
        .toString();

      assert.isTrue(toBN(totalRewards).gt(0));
      log("total reward", formatUnits(toBN(totalRewards).toFixed(), unit));

      //assertion

      const lockFeesIncentiveAmount = toBN(totalRewards).times(lockFeesIncentive).idiv(FEE_DENOMINATOR).toString();
      assert.closeTo(
        toBN(lockFeesBalAfter).minus(lockFeesBalBefore).toNumber(),
        toBN(lockFeesIncentiveAmount).toNumber(),
        1,
        "lockFeesIncentiveAmount 30%"
      );

      const stakerLockFeesIncentiveAmount = toBN(totalRewards)
        .times(stakerLockFeesIncentive)
        .idiv(FEE_DENOMINATOR)
        .toString();
      assert.closeTo(
        toBN(stakerLockFeesBalAfter).minus(stakerLockFeesBalBefore).toNumber(),
        toBN(stakerLockFeesIncentiveAmount).toNumber(),
        1,
        "stakerLockFeesIncentiveAmount 70%"
      );
    });
  });

  describe("voteGauge", async () => {
    let gaugeProxy;

    beforeEach("setup", async () => {
      depositAmount = await veassetToken.balanceOf(USER1);
      await veassetToken.approve(veassetDepositer.address, depositAmount);
      gaugeProxyAdd = await voterProxy.gaugeProxy();
      if (network == Networks.pickle) {
        gaugeProxy = new web3.eth.Contract(pickle_gaugeProxyABI, gaugeProxyAdd);
      } else {
        gaugeProxy = new web3.eth.Contract(gaugeProxyABI, gaugeProxyAdd);
      }
    });

    it("voteGaugeWeight - pickle", async function () {
      if (network == Networks.pickle) {
        await veassetDepositer.deposit(depositAmount, true);
        log("total weight before vote", (await gaugeProxy.methods.totalWeight().call()).toString());
        log("gauge weight before vote", (await gaugeProxy.methods.weights(lpToken.address).call()).toString());
        log(
          "total voting weight before vote",
          (await gaugeProxy.methods.usedWeights(voterProxy.address).call()).toString()
        );
        await booster.voteGaugeWeight([lpToken.address], [6000000]);
        log("total weight after vote", (await gaugeProxy.methods.totalWeight().call()).toString());
        log("gauge weight after vote", (await gaugeProxy.methods.weights(lpToken.address).call()).toString());
        log(
          "total voting weight after vote",
          (await gaugeProxy.methods.usedWeights(voterProxy.address).call()).toString()
        );
      } else {
        this.skip();
      }
    });

    it("voteGaugeWeight - other projects", async function () {
      if (network != Networks.pickle) {
        const gaugeAdd = (await booster.poolInfo(poolId))[2];
        await veassetDepositer.deposit(depositAmount, true);
        log("total weight before vote", (await gaugeProxy.methods.get_total_weight().call()).toString());
        log("gauge weight before vote", (await gaugeProxy.methods.get_gauge_weight(gaugeAdd).call()).toString());
        log(
          "total voting weight before vote",
          (await gaugeProxy.methods.vote_user_power(voterProxy.address).call()).toString()
        );

        await booster.voteGaugeWeight([gaugeAdd], [6000]);
        log("total weight after vote", (await gaugeProxy.methods.get_total_weight().call()).toString());
        log("gauge weight after vote", (await gaugeProxy.methods.get_gauge_weight(gaugeAdd).call()).toString());
        log(
          "total voting weight after vote",
          (await gaugeProxy.methods.vote_user_power(voterProxy.address).call()).toString()
        );
      } else {
        this.skip();
      }
    });
  });
});
