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
const VE3Token = artifacts.require("VE3Token");
const VeToken = artifacts.require("VeToken");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const StashFactory = artifacts.require("StashFactory");
const RewardFactory = artifacts.require("RewardFactory");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VE3DLocker = artifacts.require("VE3DLocker");
const TokenFactory = artifacts.require("TokenFactory");

const IExchange = artifacts.require("IExchange");
const IERC20 = artifacts.require("IERC20");
const ERC20 = artifacts.require("ERC20");

function toBN(number) {
  return new BigNumber(number);
}

contract("veToken Locking Reward Test", async (accounts) => {
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
  let veTokenLocker;
  let treasury;
  const reverter = new Reverter(web3);
  const wei = web3.utils.toWei;
  const USER1 = accounts[0];
  const FEE_DENOMINATOR = 10000;

  before("setup", async () => {
    await loadContracts();

    vetoken = await VeToken.at(baseContractList.system.vetoken);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
    veTokenLocker = await VE3DLocker.at(baseContractList.system.ve3dLocker);
    veassetToken = await IERC20.at(contractAddresseList[0]);
    lpToken = await IERC20.at(contractAddresseList[2]);
    voterProxy = await VoterProxy.at(contractAddresseList[3]);
    booster = await Booster.at(contractAddresseList[4]);
    ve3Token = await VE3Token.at(contractAddresseList[5]);
    veassetDepositer = await VeAssetDepositor.at(contractAddresseList[6]);
    ve3TokenRewardPool = await BaseRewardPool.at(contractAddresseList[7]);
    treasury = accounts[2];

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  it("Deposit lpToken, get veToken Rewards, then lock veToken to get rewards", async () => {
    const userA = accounts[0];
    const userB = accounts[1];
    const userC = accounts[2];
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

    const advanceTime = async (secondsElaspse) => {
      await time.increase(secondsElaspse);
      await time.advanceBlock();
      console.log("\n  >>>>  advance time " + secondsElaspse / 86400 + " days  >>>>\n");
    };

    const day = 86400;

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

    // get lp token rewards
    await time.increase(86400 * 7);
    await time.advanceBlock();
    console.log("userB veAssetToken balance:" + (await veassetToken.balanceOf(userB)).toString());
    await booster.earmarkRewards(poolId, { from: userB });
    console.log("get lp token rewards by earmarkRewards() called by user B...");

    await time.increase(86400 * 7);
    await time.advanceBlock();
    const earned = (await rewardPool.earned(userA)).toString();
    console.log("userA rewardPool earning: " + earned);

    console.log("userA veAssertToken before getReward():" + (await veassetToken.balanceOf(userA)).toString());
    await rewardPool.getReward();

    // transfer veToken from userA to another userB to mock getting veToken from rewards or from market
    await vetoken.balanceOf(userA).then((a) => console.log("userA veToken balance: " + formatEther(a.toString())));

    const vetokenBalance = await vetoken.balanceOf(userA);
    await vetoken.approve(userB, vetokenBalance, { from: userA });
    await vetoken.transfer(userB, toBN(vetokenBalance).div(2));
    const stakingVetokenAmount = await vetoken.balanceOf(userB);
    console.log("userB veToken balance init after getting from userA: " + formatEther(stakingVetokenAmount.toString()));
    expect(Number(stakingVetokenAmount.toString())).to.greaterThan(0);

    // set up locker reward (addReward, addOperator - done in migration scripts)
    await booster.setFees(toBN(1000), toBN(450), toBN(300), toBN(50), toBN(200));
    await veTokenLocker.setApprovals();
    var firstTime = await time.latest();
    //epoch length 604800
    let firstepoch = Math.floor(firstTime / (86400 * 7)).toFixed(0) * (86400 * 7);
    console.log("first epoch: " + firstepoch);

    const currentEpoch = async () => {
      var currentTime = await time.latest();
      currentTime = Math.floor(currentTime / (86400 * 7)).toFixed(0) * (86400 * 7);
      var epochIdx = ((currentTime - firstepoch) / (86400 * 7)).toFixed(0);
      console.log("current epoch: " + currentTime + ", " + epochIdx);
      return currentTime;
    };

    await veTokenLocker.epochCount().then((a) => console.log("epoch count before: " + a));
    await veTokenLocker.checkpointEpoch();
    await veTokenLocker.epochCount().then((a) => console.log("epoch count after: " + a));
    await veTokenLocker.checkpointEpoch();
    await veTokenLocker.epochCount().then((a) => console.log("epoch count after2: " + a));

    const lockerInfo = async () => {
      await currentEpoch();
      console.log("\t==== locker info =====");
      await veassetToken.balanceOf(veTokenLocker.address).then((a) => console.log("\t   veAsset: " + a));
      await veassetToken.balanceOf(treasury).then((a) => console.log("\t   treasury veAsset: " + a));
      var tsup = await veTokenLocker.totalSupply();
      console.log("\t   totalSupply: " + tsup);
      await veTokenLocker.lockedSupply().then((a) => console.log("\t   lockedSupply: " + a));
      await vetoken.balanceOf(veTokenLocker.address).then((a) => console.log("\t   veToken: " + a));
      var epochs = await veTokenLocker.epochCount();
      console.log("\t   epochs: " + epochs);
      for (var i = 0; i < epochs; i++) {
        var epochdata = await veTokenLocker.epochs(i);
        var epochTime = epochdata.date;
        var epochSupply = epochdata.supply;
        var tsupAtEpoch = await veTokenLocker.totalSupplyAtEpoch(i);
        console.log(
          "\t   voteSupplyAtEpoch(" + i + ") " + tsupAtEpoch + ", date: " + epochTime + "  sup: " + epochSupply
        );
        // if (i == epochs - 2) {
        //   assert(
        //     tsupAtEpoch.toString() == tsup.toString(),
        //     "totalSupply() should be equal in value to the current epoch (" + i + ")"
        //   );
        // }
      }
      console.log("\t----- locker info end -----");
    };

    const userInfo = async (_user) => {
      console.log("\t----- user info start -----");
      var bal = await veTokenLocker.balanceOf(_user);
      console.log("\t   balanceOf: " + bal);
      await veTokenLocker.pendingLockOf(_user).then((a) => console.log("\t   pending balance: " + a));
      await veTokenLocker.lockedBalanceOf(_user).then((a) => console.log("\t   lockedBalanceOf: " + a));
      await veTokenLocker
        .lockedBalances(_user)
        .then((a) =>
          console.log(
            "\t   lockedBalances: " +
              a.total +
              ", " +
              a.unlockable +
              ", " +
              a.locked +
              "\n\t     lock data: " +
              JSON.stringify(a.lockData)
          )
        );
      await veTokenLocker.balances(_user).then((a) => console.log("\t   nextunlockIndex: " + a.nextUnlockIndex));

      const userRewards=  await veTokenLocker.claimableRewards(_user);
      for ( i = 0; i < userRewards.length; i++) {
       console.log( "reward Token " + i +  ":address :" +  userRewards[i].token);
       console.log("reward Token " + i +  ":amount: " +  userRewards[i].amount);
      }

      await veassetToken.balanceOf(_user).then((a) => console.log("\t  veAsset balance: " + a));
      await vetoken.balanceOf(_user).then((a) => console.log("\t   veToken balance: " + a));
      await vetokenRewards.balanceOf(_user).then((a) => console.log("\t   staked veToken balance: " + a));
      var epochs = await veTokenLocker.epochCount();
      for(var i = 0; i < epochs; i++){
        var balAtE = await veTokenLocker.balanceAtEpochOf(i, _user);
        var pendingAtE = await veTokenLocker.pendingLockAtEpochOf(i, _user);
        console.log("\t   voteBalanceAtEpochOf("+i+") " +balAtE +", pendingLockAtEpoch: " +pendingAtE);

     // this check is a bit annoying if you dont checkpointEpoch..
     //    if(i==epochs-2){
     //      assert(balAtE.toString()==bal.toString(),"balanceOf should be equal in value to the current epoch (" +i +")");
     //    }
      }
      console.log("\t----- user info end-----");
    };

    await lockerInfo();
    await userInfo(userB);

    //userB lock veToken
    console.log("start lock...");
    var veTokenUserBBalance = await vetoken.balanceOf(userB);
    await vetoken.approve(veTokenLocker.address, veTokenUserBBalance, { from: userB });
    var tx = await veTokenLocker.lock(userB, veTokenUserBBalance, { from: userB });
    console.log("locked for user B, gas: " + tx.receipt.gasUsed);
    await lockerInfo();
    await userInfo(userB);
    //
    //check that balanceOf increases after next epoch starts
    console.log("\n\n\n\n##### check weight start at next epoch..\n");
    for (var i = 0; i < 7; i++) {
      await advanceTime(day);
      await veTokenLocker.checkpointEpoch();
      await currentEpoch();
      await userInfo(userB);
    }

    // check reward -- veAsset reward added by addReward() during migration step
    // check rewards (different rewards decimals extra reward-- will be set up in another test)
    // Rewards from lp pools
    console.log("\n\n\n\n##### check user rewards...\n");
    // only rewards from lp pools will be distributed to ve3dlocker (stakerLockIncentive)
    const veAssetTokenForLockerBeforeRewards = await veassetToken.balanceOf(veTokenLocker.address);
    await time.increase(86400 * 14);
    await time.advanceBlock();
    await booster.earmarkRewards(poolId, { from: userA });
    const veAssetTokenForLockerAfterRewards  =await veassetToken.balanceOf(veTokenLocker.address);
    expect(Number(veAssetTokenForLockerAfterRewards.toString())-Number(veAssetTokenForLockerBeforeRewards.toString())).to.greaterThan(0);


    // check lock expired
    const veAssetTokenForUserBBeforeRewards = await veassetToken.balanceOf(userB);
    console.log(veAssetTokenForUserBBeforeRewards);

    console.log("\n\n\n\n##### check lock length and expiry..\n");
    for (var i = 0; i < 16; i++) {
      await advanceTime(day * 7);
      await veTokenLocker.checkpointEpoch();
      await currentEpoch();
    }

    await userInfo(userB);
    await lockerInfo();

    await veTokenLocker.getReward(userB);
    console.log("\n\n\n\n##### check userB claimable rewards after get reward.\n");
    userInfo(userB);


    // check relock
    console.log("\n ->> relock then lock, relock to current and lock to next.");

    await veTokenLocker.processExpiredLocks(true, { from: userB });
    const vetokenBalance2 = await vetoken.balanceOf(userA);
    await vetoken.approve(userB, vetokenBalance2, { from: userA });
    await vetoken.transfer(userB, toBN(vetokenBalance2).div(2));
    const veTokenUserBBalance2 = await vetoken.balanceOf(userB);
    console.log("veTokenUserB: " + veTokenUserBBalance2);
    await vetoken.approve(veTokenLocker.address, veTokenUserBBalance2, { from: userB });
    var tx = await veTokenLocker.lock(userB, veTokenUserBBalance2, { from: userB });
    console.log("locked for user B, gas: " + tx.receipt.gasUsed);
    await userInfo(userB);
    await lockerInfo();
  });
});
