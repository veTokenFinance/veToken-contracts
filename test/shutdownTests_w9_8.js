const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const { loadContracts, contractAddresseList } = require("./helper/dumpAddresses");
const jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const Reverter = require("./helper/reverter");
const Booster = artifacts.require("Booster");
const VoterProxy = artifacts.require("VoterProxy");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const PoolManager = artifacts.require("PoolManager");
const IERC20 = artifacts.require("IERC20");

contract("Shutdown Test", async (accounts) => {
  let poolManager;
  let lpToken;
  let voterProxy;
  let booster;

  const reverter = new Reverter(web3);
  const wei = web3.utils.toWei;

  before("setup", async () => {
    await loadContracts();

    poolManager = await PoolManager.at(baseContractList.system.poolManager);
    lpToken = await IERC20.at(contractAddresseList[2]);
    voterProxy = await VoterProxy.at(contractAddresseList[3]);
    booster = await Booster.at(contractAddresseList[4]);

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  it.only("After shutdown, funds should be back to booster, and redeposit should be reverted", async () => {
    const userA = accounts[0];
    const lpTokenDepositAmount = await lpToken.balanceOf(userA);
    const poolId = 0;

    const poolInfo = JSON.stringify(await booster.poolInfo(poolId));
    const parsedPoolInfo = JSON.parse(poolInfo);
    const rewardPool = await BaseRewardPool.at(parsedPoolInfo.veAssetRewards);

    const starttime = await time.latest();
    console.log("current block time: " + starttime);
    await time.latestBlock().then((a) => console.log("current block: " + a));

    const lpTokenbalance = await lpToken.balanceOf(userA);
    console.log("Initial lp token balance of userA: " + formatEther(lpTokenbalance.toString()));
    const userABalanceInRewardPoolBefore = await rewardPool.balanceOf(userA);
    await lpToken.approve(booster.address, lpTokenDepositAmount);

    console.log("deposit...");
    await booster.deposit(0, lpTokenDepositAmount, true, { from: userA });
    await rewardPool
      .balanceOf(userA)
      .then((a) => console.log("userA deposited lp in rewardPool: " + formatEther(a.toString())));
    await rewardPool
      .earned(userA)
      .then((a) => console.log("userA rewards earned(unclaimed): " + formatEther(a.toString())));

    await lpToken
      .balanceOf(userA)
      .then((a) => console.log("before shutdown, userA lptoken balance: " + formatEther(a.toString())));
    const userABalanceInRewardPoolAfter = await rewardPool.balanceOf(userA);
    expect((userABalanceInRewardPoolAfter - userABalanceInRewardPoolBefore).toString()).to.equal(
      lpTokenDepositAmount.toString()
    );

    const boosterlpTokenBalanceBeforeShutdown = await lpToken.balanceOf(booster.address);
    expect(boosterlpTokenBalanceBeforeShutdown.toString()).to.equal("0");

    const gaugelpTokenBalance = await voterProxy.balanceOfPool(parsedPoolInfo.gauge);
    expect(gaugelpTokenBalance.toString()).to.equal(lpTokenDepositAmount.toString());

    // shutdown, funds move back to booster from gauge
    // await booster.shutdownSystem({ from: userA });
    // console.log("system shutdown ...");
    await poolManager.shutdownPool(booster.address, 0);
    await lpToken
      .balanceOf(userA)
      .then((a) => console.log("after shutdown, userA lp token balance: " + formatEther(a.toString())));
    await rewardPool
      .balanceOf(userA)
      .then((a) => console.log("after shutdown, userA balance in reward pool: " + formatEther(a.toString())));
    const boostBalanceAfterShutdown = await lpToken.balanceOf(booster.address);
    expect(boostBalanceAfterShutdown.toString()).to.equal(lpTokenDepositAmount.toString());

    const gaugeBalanceAfterShutdown = await voterProxy.balanceOfPool(parsedPoolInfo.gauge);
    expect(gaugeBalanceAfterShutdown.toString()).to.equal("0");

    // try to deposit while in shutdown state, will revert
    try {
      await booster.deposit(0, lpTokenDepositAmount, true, { from: userA });
    } catch (error) {
      console.log("try deposit again, it reverts");
      //console.log(error);
    }

    console.log("withdraw...");
    await rewardPool.withdrawAllAndUnwrap(true, { from: userA });
    const userlpTokenBalanceAfterWithdraw = await lpToken.balanceOf(userA);
    expect(userlpTokenBalanceAfterWithdraw.toString()).to.equal(lpTokenbalance.toString());

    const userRewardPoolBalanceAfterWithdraw = await rewardPool.balanceOf(userA);
    expect(userRewardPoolBalanceAfterWithdraw.toString()).to.equal("0");

    const boosterLpTokenBalanceAfterUserWithdraw = await lpToken.balanceOf(booster.address);
    expect(boosterLpTokenBalanceAfterUserWithdraw.toString()).to.equal("0");

    await voterProxy
      .balanceOfPool(parsedPoolInfo.gauge)
      .then((a) => console.log("gauge balance: " + formatEther(a.toString())));
  });
});
