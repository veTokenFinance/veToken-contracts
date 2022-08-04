const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const { loadContracts, contractAddresseList } = require("./helper/dumpAddresses");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const Reverter = require("./helper/reverter");
const BigNumber = require("bignumber.js");

const Booster = artifacts.require("Booster");
const VoterProxy = artifacts.require("VoterProxy");
const ExtraRewardStashV2 = artifacts.require("ExtraRewardStashV2");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const VirtualBalanceRewardPool = artifacts.require("VirtualBalanceRewardPool");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VE3Token = artifacts.require("VE3Token");
const VeToken = artifacts.require("VeToken");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const StashFactory = artifacts.require("StashFactory");
const RewardFactory = artifacts.require("RewardFactory");
const DepositToken = artifacts.require("DepositToken");
const TokenFactory = artifacts.require("TokenFactory");

const IExchange = artifacts.require("IExchange");
const IERC20 = artifacts.require("IERC20");
const ERC20 = artifacts.require("ERC20");

function toBN(number) {
  return new BigNumber(number);
}

contract("veToken Staking Reward Test", async (accounts) => {
  let vetoken;
  let vetokenRewards;
  let veassetToken;
  let lpToken;
  let voterProxy;
  let booster;
  let veassetDepositer;
  let ve3Token;
  let ve3TokenRewardPool;
  const reverter = new Reverter(web3);

  before("setup", async () => {
    await loadContracts();
    // basic contract
    // vetokenMinter = await VeTokenMinter.at(baseContractList.system.vetokenMinter);
    vetoken = await VeToken.at(baseContractList.system.vetoken);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
    // // veasset contracts
    veassetToken = await IERC20.at(contractAddresseList[0]);
    lpToken = await IERC20.at(contractAddresseList[2]);
    voterProxy = await VoterProxy.at(contractAddresseList[3]);
    booster = await Booster.at(contractAddresseList[4]);
    ve3Token = await VE3Token.at(contractAddresseList[5]);
    veassetDepositer = await VeAssetDepositor.at(contractAddresseList[6]);
    ve3TokenRewardPool = await BaseRewardPool.at(contractAddresseList[7]);

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  it("Deposit lpToken, get veToken Rewards, then stake veToken to get rewards", async () => {
    const userA = accounts[0];
    const userB = accounts[1];
    const userC = accounts[2];
    const poolId = 0;

    const currentEpoch = async () => {
      var currentTime = await time.latest();
      currentTime = Math.floor(currentTime / (86400 * 7)).toFixed(0) * (86400 * 7);
      console.log("current epoch: " + currentTime);
      return currentTime;
    };

    const checkRewardInfo = async () => {
      currentEpoch();
      const veAssetRewardInfo = await vetokenRewards.rewardTokenInfo(veassetToken.address);
      console.log(" reward amount :", veAssetRewardInfo.queuedRewards.toNumber());
      console.log(" reward lastUpdateTime :", veAssetRewardInfo.lastUpdateTime.toNumber());
      console.log(" reward periodFinish :", veAssetRewardInfo.periodFinish.toNumber());
      console.log(" rewardRate:", veAssetRewardInfo.rewardRate.toNumber());
    };

    // deposit lpToken
    const poolInfo = JSON.stringify(await booster.poolInfo(poolId));
    const parsedPoolInfo = JSON.parse(poolInfo);
    const rewardPool = await BaseRewardPool.at(parsedPoolInfo.veAssetRewards);
    const lpTokenBalanceOfUserA = await lpToken.balanceOf(userA);
    console.log("userA initial Lp token balance:" + formatEther(lpTokenBalanceOfUserA.toString()));
    await lpToken.approve(booster.address, lpTokenBalanceOfUserA);
    await booster.depositAll(0, true, { from: userA });
    console.log("deposit all lp token user A has...");

    // advance time
    await time.increase(10 * 86400);
    await time.advanceBlock();

    await rewardPool
      .balanceOf(userA)
      .then((a) => console.log("user A lp rewardPool initial balance: " + formatEther(a.toString())));

    const veAssetBalance = await veassetToken.balanceOf(userA);
    console.log("user A veAssetToken balance init:" + formatEther(veAssetBalance.toString()));
    await ve3Token
      .balanceOf(userA)
      .then((a) => console.log("user A ve3token balance init: " + formatEther(a.toString())));
    await vetoken
      .balanceOf(userA)
      .then((a) => console.log("user A veToken balance init: " + formatEther(a.toString())));

    console.log(
      "rewardPool veAssetToken balance before earmarkRewards():" +
        (await veassetToken.balanceOf(rewardPool.address)).toString()
    );
    console.log(
      "ve3TokenRewardPool veAssetToken balance before earmarkRewards():" +
        (await veassetToken.balanceOf(ve3TokenRewardPool.address)).toString()
    );
    console.log(
      "vetokenRewards Pool veAssetToken balance before earmarkRewards():" +
        (await veassetToken.balanceOf(vetokenRewards.address)).toString()
    );

    // get lp token rewards
    await time.increase(86400);
    await time.advanceBlock();
    console.log("userB veAssetToken balance:" + (await veassetToken.balanceOf(userB)).toString());
    await booster.earmarkRewards(poolId, { from: userB });
    console.log("get lp token rewards by earmarkRewards() called by user B...");

    await time.increase(86400);
    await time.advanceBlock();
    const earned = (await rewardPool.earned(userA)).toString();
    console.log("userA rewardPool earning: " + earned);

    console.log("userA veAssertToken before getReward():" + (await veassetToken.balanceOf(userA)).toString());
    await rewardPool.getReward();

    // transfer veToken from userA to another userC to mock getting veToken from rewards or from market
    await vetoken.balanceOf(userA).then((a) => console.log("userA veToken balance: " + formatEther(a.toString())));

    const vetokenBalance = await vetoken.balanceOf(userA);
    await vetoken.approve(userC, vetokenBalance, { from: userA });
    await vetoken.transfer(userC, toBN(vetokenBalance).div(2));
    const stakingVetokenAmount = await vetoken.balanceOf(userC);
    console.log("userC veToken balance init after getting from userA: " + formatEther(stakingVetokenAmount.toString()));
    expect(Number(stakingVetokenAmount.toString())).to.greaterThan(0);

    //stake vetoken (ve3D)
    await vetoken.approve(vetokenRewards.address, stakingVetokenAmount, {
      from: userC,
    });
    await vetokenRewards.stake(stakingVetokenAmount, { from: userC });

    await booster.earmarkRewards(poolId, { from: userB });
    await checkRewardInfo();

    console.log("userC veToken balance after staking:" + (await vetoken.balanceOf(userC)).toString());
    console.log("userC ve3Token balance after staking:" + (await ve3Token.balanceOf(userC)).toString());
    console.log("userC veAsset Token balance after staking:" + (await veassetToken.balanceOf(userC)).toString());
    const userCveTokenAfterStaking = await vetoken.balanceOf(userC);
    expect(Number(userCveTokenAfterStaking.toString())).to.equal(0);

    await time.increase(86400);
    await time.advanceBlock();

    const userCEarnedveTokenRewards = await vetokenRewards.earned(veassetToken.address, userC);
    console.log("userC veToken rewardPool veAsset earning: " + userCEarnedveTokenRewards);
    expect(Number(userCEarnedveTokenRewards.toString())).to.greaterThan(0);

    console.log("userC veToken balance before getReward():" + (await vetoken.balanceOf(userC)).toString());
    const userCVe3TokenRewardBefore = await ve3TokenRewardPool.balanceOf(userC);
    console.log("ve3TokenRewardPool of userC reward before getReward: " + userCVe3TokenRewardBefore.toString());

    // withdrawAll calls getReward if boolean claim is true.
    // 4.5% from the pickle LP pools 17% profits in the form of ve3Dill(ve3CRV)[ve3Tokens]
    // VE3D minted based on formula (veToken)
    // no veAsset token

    await vetokenRewards.withdrawAll(true, { from: userC });
    // await vetokenRewards.getReward(userC, true, true);
    const userCVe3TokenRewardAfter = await ve3TokenRewardPool.balanceOf(userC);
    console.log("ve3TokenRewardPool of userC reward after getReward: " + userCVe3TokenRewardAfter.toString());
    expect(Number((userCVe3TokenRewardAfter - userCVe3TokenRewardBefore).toString())).to.equal(0);

    const userCveTokenAfter = await vetoken.balanceOf(userC);
    const userCve3TokenAfter = await ve3Token.balanceOf(userC);
    const userCveAssetTokenAfter = await veassetToken.balanceOf(userC);
    console.log("userC veToken balance after getReward:" + userCveTokenAfter.toString());
    console.log("userC ve3Token balance after getReward:" + userCve3TokenAfter.toString());
    console.log("userC veAsset Token balance after getReward:" + userCveAssetTokenAfter.toString());
    expect(Number(userCveAssetTokenAfter.toString())).to.equal(0);
    expect(Number(userCveTokenAfter.toString())).to.greaterThan(0);
    expect(Number(userCve3TokenAfter.toString())).to.greaterThan(0);

    checkRewardInfo();
    /// advance time to pass active reward period finish time
    await time.increase(10 * 86400);
    // owner recovers extra reward
    const ownerBalanceBeforeRecoverReward = (await veassetToken.balanceOf(userA)).toString();
    const veAssetRewardInfoBeforeRecover = await vetokenRewards.rewardTokenInfo(veassetToken.address);
    await vetokenRewards.recoverUnusedReward(veassetToken.address);

    const ownerBalanceAfterRecoverReward = (await veassetToken.balanceOf(userA)).toString();
    console.log("Owner balance before recover reward:" + ownerBalanceBeforeRecoverReward.toString());
    console.log("Owner balance After recover reward:" + ownerBalanceAfterRecoverReward.toString());
    console.log("queuedRewards:" + veAssetRewardInfoBeforeRecover.queuedRewards.toString());
    const ownerBalanceDifference = toBN(ownerBalanceAfterRecoverReward).minus(ownerBalanceBeforeRecoverReward);
    console.log("actual recovered reward:" + ownerBalanceDifference.toString());


    assert.equal(Number(ownerBalanceDifference), Number(veAssetRewardInfoBeforeRecover.queuedRewards));
    const veAssetRewardInfoAfterRecover = await vetokenRewards.rewardTokenInfo(veassetToken.address);
    console.log("queued rewards after recover:", veAssetRewardInfoAfterRecover.queuedRewards.toNumber());
    assert.equal(veAssetRewardInfoAfterRecover.queuedRewards.toNumber(), 0);

    await vetokenRewards.removeReward(veassetToken.address);

    const veAssetRewardInfoAfter = await vetokenRewards.rewardTokenInfo(veassetToken.address);
    console.log(veAssetRewardInfoAfter);

    await vetokenRewards.addReward(
      veassetToken.address,
      veassetDepositer.address,
      ve3TokenRewardPool.address,
      ve3Token.address
    );
  });
});
