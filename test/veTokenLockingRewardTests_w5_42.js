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
    // basic contract
    // vetokenMinter = await VeTokenMinter.at(baseContractList.system.vetokenMinter);
    vetoken = await VeToken.at(baseContractList.system.vetoken);
    // rFactory = await RewardFactory.at(baseContractList.system.rFactory);
    // tFactory = await TokenFactory.at(baseContractList.system.tFactory);
    // sFactory = await StashFactory.at(baseContractList.system.sFactory);
    // poolManager = await PoolManager.at(baseContractList.system.poolManager);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
    veTokenLocker = await VE3DLocker.at(baseContractList.system.ve3dLocker);
    // // veasset contracts
    veassetToken = await IERC20.at(contractAddresseList[0]);
    // escrow = await IERC20.at(contractAddresseList[1]);
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

    // transfer veToken from userA to another userB to mock getting veToken from rewards or from market
    await vetoken.balanceOf(userA).then((a) => console.log("userA veToken balance: " + formatEther(a.toString())));

    const vetokenBalance = await vetoken.balanceOf(userA);
    await vetoken.approve(userB, vetokenBalance, { from: userA });
    await vetoken.transfer(userB, toBN(vetokenBalance).div(2));
    const stakingVetokenAmount = await vetoken.balanceOf(userB);
    console.log("userB veToken balance init after getting from userA: " + formatEther(stakingVetokenAmount.toString()));
    expect(Number(stakingVetokenAmount.toString())).to.greaterThan(0);

    // set up locker reward (addReward, addOperator - done in migration scripts)
    await veTokenLocker.setApprovals();
    var firstTime = await time.latest();
    //epoch length 604800
    let firstepoch = (Math.floor(firstTime / (86400*7))).toFixed(0) * (86400*7);
    console.log("first epoch: " +firstepoch);
    const currentEpoch = async() =>{
      var currentTime = await time.latest();
      currentTime = (Math.floor(currentTime / (86400*7))).toFixed(0) * (86400*7)
      var epochIdx = ((currentTime - firstepoch) / (86400*7)).toFixed(0);
      console.log("current epoch: " + currentTime +", " +epochIdx);
      return currentTime;
    }

    await veTokenLocker.epochCount().then(a=>console.log("epoch count before: " +a))
    await veTokenLocker.checkpointEpoch();
    await veTokenLocker.epochCount().then(a=>console.log("epoch count after: " +a))
    await veTokenLocker.checkpointEpoch();
    await veTokenLocker.epochCount().then(a=>console.log("epoch count after2: " +a))

    const lockerInfo = async () => {
      await currentEpoch();
      console.log("\t==== locker info =====");
      await veassetToken.balanceOf(veTokenLocker.address).then(a=>console.log("\t   veToken: " +a));
      await veassetToken.balanceOf(treasury).then(a=>console.log("\t   treasury cvx: " +a));
      var tsup = await veTokenLocker.totalSupply();
      console.log("\t   totalSupply: " +tsup);
      await veTokenLocker.lockedSupply().then(a=>console.log("\t   lockedSupply: " +a));
      await veTokenLocker.boostedSupply().then(a=>console.log("\t   boostedSupply: " +a));
      await vetoken.balanceOf(veTokenLocker.address).then(a=>console.log("\t   cvxcrv: " +a));
      var epochs = await locker.epochCount();
      console.log("\t   epochs: " +epochs);
      for(var i = 0; i < epochs; i++){
        var epochdata = await veTokenLocker.epochs(i);
        var epochTime = epochdata.date;
        var epochSupply = epochdata.supply;
        var tsupAtEpoch = await veTokenLocker.totalSupplyAtEpoch(i);
        console.log("\t   voteSupplyAtEpoch("+i+") " +tsupAtEpoch +", date: " +epochTime +"  sup: " +epochSupply);
        if(i==epochs-2){
          assert(tsupAtEpoch.toString()==tsup.toString(),"totalSupply() should be equal in value to the current epoch (" +i +")");
        }
      }
      console.log("\t----- locker info end -----");
    }

    const userInfo = async (_user) => {
      console.log("\t==== user info: "+userNames[_user]+" ====");
      var bal = await veTokenLocker.balanceOf(_user);
      console.log("\t   balanceOf: " +bal);
      await veTokenLocker.pendingLockOf(_user).then(a=>console.log("\t   pending balance: " +a));
      await veTokenLocker.rewardWeightOf(_user).then(a=>console.log("\t   reward weightOf: " +a));
      await veTokenLocker.lockedBalanceOf(_user).then(a=>console.log("\t   lockedBalanceOf: " +a));
      await veTokenLocker.lockedBalances(_user).then(a=>console.log("\t   lockedBalances: " +a.total +", " +a.unlockable +", " +a.locked +"\n\t     lock data: " +JSON.stringify(a.lockData) ));
      await veTokenLocker.balances(_user).then(a=>console.log("\t   nextunlockIndex: " +a.nextUnlockIndex ));
      await veTokenLocker.claimableRewards(_user).then(a=>console.log("\t   claimableRewards: " +a));
      await veassetToken.balanceOf(_user).then(a=>console.log("\t  veAssest wallet: " +a));
      await vetoken.balanceOf(_user).then(a=>console.log("\t   veToken wallet: " +a));
      await vetokenRewards.balanceOf(_user).then(a=>console.log("\t   staked veToken: " +a));
      var epochs = await locker.epochCount();
      for(var i = 0; i < epochs; i++){
        var balAtE = await veTokenLocker.balanceAtEpochOf(i, _user);
        var pendingAtE = await veTokenLocker.pendingLockAtEpochOf(i, _user);
        console.log("\t   voteBalanceAtEpochOf("+i+") " +balAtE +", pnd: " +pendingAtE);

        //this check is a bit annoying if you dont checkpointEpoch..
        if(!isShutdown && i==epochs-2){
          assert(balAtE.toString()==bal.toString(),"balanceOf should be equal in value to the current epoch (" +i +")");
        }
      }
      console.log("\t---- user info: "+userNames[_user]+"("+_user +") end ----");
    }

    await lockerInfo();
    await userInfo(userC);

    //userC lock veToken
    console.log("start lock")
    var veTokenUserCBalance= await vetoken.balanceOf(userC);
    await vetoken.approve(veTokenLocker.address,veTokenUserCBalance,{from:userC});
    var tx = await locker.lock(userC,veTokenUserCBalance,{from:userZ});
    console.log("locked for user z, gas: " +tx.receipt.gasUsed);
    await lockerInfo();
    await userInfo(userC);

    //check that balanceOf increases after next epoch starts
    console.log("\n\n\n\n##### check weight start at next epoch..\n");
    for(var i = 0; i < 7; i++){
      await advanceTime(day);
      await locker.checkpointEpoch();
      await currentEpoch();
      await userInfo(userZ);
    }



    // //lock vetoken (ve3D)
    // await vetoken.approve(vetokenRewards.address, stakingVetokenAmount, {
    //   from: userC,
    // });
    // await vetokenRewards.stake(stakingVetokenAmount, { from: userC });
    //
    // await booster.earmarkRewards(poolId, { from: userB });
    //
    // console.log("userC veToken balance after staking:" + (await vetoken.balanceOf(userC)).toString());
    // console.log("userC ve3Token balance after staking:" + (await ve3Token.balanceOf(userC)).toString());
    // console.log("userC veAsset Token balance after staking:" + (await veassetToken.balanceOf(userC)).toString());
    // const userCveTokenAfterStaking = await vetoken.balanceOf(userC);
    // expect(Number(userCveTokenAfterStaking.toString())).to.equal(0);
    //
    // await time.increase(86400);
    // await time.advanceBlock();
    //
    // const userCEarnedveTokenRewards = await vetokenRewards.earned(veassetToken.address, userC);
    // console.log("userC veToken rewardPool veAsset earning: " + userCEarnedveTokenRewards);
    // expect(Number(userCEarnedveTokenRewards.toString())).to.greaterThan(0);
    //
    // console.log("userC veToken balance before getReward():" + (await vetoken.balanceOf(userC)).toString());
    // const userCVe3TokenRewardBefore = await ve3TokenRewardPool.balanceOf(userC);
    // console.log("ve3TokenRewardPool of userC reward before getReward: " + userCVe3TokenRewardBefore.toString());
    //
    // // withdrawAll calls getReward if boolean claim is true.
    // // 4.5% from the pickle LP pools 17% profits in the form of ve3Dill(ve3CRV)[ve3Tokens]
    // // VE3D minted based on formula (veToken)
    // // no veAsset token
    //
    // await vetokenRewards.withdrawAll(true, { from: userC });
    // // await vetokenRewards.getReward(userC, true, true);
    // const userCVe3TokenRewardAfter = await ve3TokenRewardPool.balanceOf(userC);
    // console.log("ve3TokenRewardPool of userC reward after getReward: " + userCVe3TokenRewardAfter.toString());
    // expect(Number((userCVe3TokenRewardAfter - userCVe3TokenRewardBefore).toString())).to.equal(0);
    //
    // const userCveTokenAfter = await vetoken.balanceOf(userC);
    // const userCve3TokenAfter = await ve3Token.balanceOf(userC);
    // const userCveAssetTokenAfter = await veassetToken.balanceOf(userC);
    // console.log("userC veToken balance after getReward:" + userCveTokenAfter.toString());
    // console.log("userC ve3Token balance after getReward:" + userCve3TokenAfter.toString());
    // console.log("userC veAsset Token balance after getReward:" + userCveAssetTokenAfter.toString());
    // expect(Number(userCveAssetTokenAfter.toString())).to.equal(0);
    // expect(Number(userCveTokenAfter.toString())).to.greaterThan(0);
    // expect(Number(userCve3TokenAfter.toString())).to.greaterThan(0);
  });
});
