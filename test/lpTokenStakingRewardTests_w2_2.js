const { expectRevert, time } = require("@openzeppelin/test-helpers");
const { loadContracts, contractAddresseList } = require("./helper/dumpAddresses");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const { formatEther } = require("@ethersproject/units");
const Reverter = require("./helper/reverter");

const Booster = artifacts.require("Booster");
const VoterProxy = artifacts.require("VoterProxy");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VE3Token = artifacts.require("VE3Token");
const VeToken = artifacts.require("VeToken");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");

const IERC20 = artifacts.require("IERC20");

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
  const wei = web3.utils.toWei;

  before("setup", async () => {
    await loadContracts();
    vetoken = await VeToken.at(baseContractList.system.vetoken);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
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

  it("Deposit lpToken, get Rewards", async () => {
    const userA = accounts[0];
    const userB = accounts[1];
    const poolId = 0;

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

    const userAveAssetTokenInit = await veassetToken.balanceOf(userA);
    console.log("user A veAssetToken balance init:" + formatEther(userAveAssetTokenInit.toString()));
    const userAve3TokenInit = await ve3Token.balanceOf(userA);
    expect(Number(userAve3TokenInit.toString())).to.equal(0);
    console.log("user A ve3token balance init: " + formatEther(userAve3TokenInit.toString()));
    const userAveTokenInit = await vetoken.balanceOf(userA);
    expect(Number(userAveTokenInit.toString())).to.equal(0);
    console.log("user A veToken balance init: " + formatEther(userAveTokenInit.toString()));
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

    let rewardPoolBal = (await veassetToken.balanceOf(rewardPool.address)).toString();
    console.log("rewardPool veAssetToken balance after earmarkRewards():" + rewardPoolBal);
    console.log(
      "ve3TokenRewardPool veAssetToken balance after earmarkRewards():" +
        (await veassetToken.balanceOf(ve3TokenRewardPool.address)).toString()
    );
    console.log(
      "vetokenRewards Pool veAssetToken balance after earmarkRewards():" +
        (await veassetToken.balanceOf(vetokenRewards.address)).toString()
    );

    await time.increase(86400);
    await time.advanceBlock();
    const earned = (await rewardPool.earned(userA)).toString();
    console.log("userA rewardPool earning: " + earned);
    expect(Number(earned.toString())).to.greaterThan(0);
    console.log("userA veAssertToken before getReward():" + (await veassetToken.balanceOf(userA)).toString());
    console.log("userA veToken before getReward():" + (await vetoken.balanceOf(userA)).toString());
    await rewardPool.getReward();
    // 1.83% from  LP pools profits veAsset tokens
    console.log("userA veAssertToken after getReward():" + (await veassetToken.balanceOf(userA)).toString());
    // 2.veToken( VE3D ) minted based on formula
    const vetokenAmount = await vetoken.balanceOf(userA);
    console.log("userA veToken after getReward():" + vetokenAmount);
    expect(Number(vetokenAmount.toString())).to.greaterThan(0);
    console.log(
      "rewardPool veAssertToken after getReward():" + (await veassetToken.balanceOf(rewardPool.address)).toString()
    );

    // withdraw a portion of lp token without claim rewards
    await rewardPool.withdrawAndUnwrap(wei("10"), false, { from: userA });

    const userAlptokenAfterWithdraw = await lpToken.balanceOf(userA);
    expect(Number(formatEther(userAlptokenAfterWithdraw.toString()))).to.equal(10);

    const userAveAssetTokenAfterWithdraw1 = await veassetToken.balanceOf(userA);
    console.log("userA veAssetToken after withdraw:" + userAveAssetTokenAfterWithdraw1.toString());
    const userAveTokenAfterWithdraw1 = await vetoken.balanceOf(userA);
    console.log("userA veToken after withdraw:" + userAveTokenAfterWithdraw1.toString());

    await time.increase(86400);
    await time.advanceBlock();

    // get more rewards and  withdraw remaining all lptoken and rewards claimed.
    const stakedRemaininglpToken = await rewardPool.balanceOf(userA);
    await rewardPool.withdrawAndUnwrap(stakedRemaininglpToken, true, {
      from: userA,
    });
    const userAveAssetTokenAfterWithdraw2 = await veassetToken.balanceOf(userA);
    console.log("userA veAssetToken after withdraw All:" + userAveAssetTokenAfterWithdraw2.toString());
    expect(Number((userAveAssetTokenAfterWithdraw2 - userAveAssetTokenAfterWithdraw1).toString())).to.greaterThan(0);
    const userAveTokenAfterWithdraw2 = await vetoken.balanceOf(userA);
    expect(Number((userAveTokenAfterWithdraw2 - userAveTokenAfterWithdraw1).toString())).to.greaterThan(0);
    console.log("userA veToken after withdraw All:" + userAveTokenAfterWithdraw2.toString());

    const userAlptokenAfterWithdrawAll = await lpToken.balanceOf(userA);
    expect(formatEther(userAlptokenAfterWithdrawAll.toString())).to.equal(
      formatEther(lpTokenBalanceOfUserA.toString())
    );

    // get reward again, userA shouldn't get any new reward
    await time.increase(86400);
    await time.advanceBlock();
    await rewardPool.getReward();
    const userAveAssetTokenAfterWithdrawAll = await veassetToken.balanceOf(userA);
    expect(Number((userAveAssetTokenAfterWithdrawAll - userAveAssetTokenAfterWithdraw2).toString())).to.equal(0);
    const userAveTokenAfterWithdrawAll = await vetoken.balanceOf(userA);
    expect(Number((userAveTokenAfterWithdrawAll - userAveTokenAfterWithdraw2).toString())).to.equal(0);

    //withdraw again when userA has no lptoken staked, should revert
    await expectRevert(rewardPool.withdrawAndUnwrap(wei("10"), true, { from: userA }), "revert");
    console.log(" ->reverted (withdraw when no lp token, fail on user funds)");
  });
});
