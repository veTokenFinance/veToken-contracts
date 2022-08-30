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
const wei = web3.utils.toWei;

function toBN(number) {
  return new BigNumber(number);
}

contract("lptoken Deposit only Test", async (accounts) => {
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

  it.only("Deposit lpToken, get Rewards", async () => {
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

    // deposit only, no stake
    await booster.depositAll(0, false, { from: userA });
    console.log("deposit all lp token user A has...");

    // advance time
    await time.increase(10 * 86400);
    await time.advanceBlock();

    // should not be staked
    const userArewardPoolBalance = await rewardPool.balanceOf(userA);
    expect(Number(userArewardPoolBalance.toString())).to.equal(0);

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
    // userA should not get any reward
    console.log("userA rewardPool earning: " + earned);
    expect(Number(earned.toString())).to.equal(0);

    // withdraw too much
    await expectRevert(booster.withdraw(poolId, lpTokenBalanceOfUserA + 10, { from: userA }), "revert");
    console.log(" ->reverted (withdraw too much, fail on user funds)");

    // withdraw a portion of deposited lp token
    await booster.withdraw(poolId, lpTokenBalanceOfUserA, { from: userA });
    const userAlpTokenAfterWithdraw = await lpToken.balanceOf(userA);
    expect(userAlpTokenAfterWithdraw.toString()).to.equal(lpTokenBalanceOfUserA.toString());

    // withdraw all deposited lp token
    await booster.withdrawAll(poolId, { from: userA });
    const userAlpTokenAfterWithdrawAll = await lpToken.balanceOf(userA);
    console.log("userA lptoken after withdraw all:" + (await lpToken.balanceOf(userA)).toString());
    expect(formatEther(userAlpTokenAfterWithdrawAll.toString())).to.equal(
      formatEther(lpTokenBalanceOfUserA.toString())
    );
  });
});
