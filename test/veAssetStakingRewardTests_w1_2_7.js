const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const { loadContracts, contractAddresseList } = require("./helper/dumpAddresses");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const feeDisrtroABI = require("./helper/feeDistroABI.json");
const Reverter = require("./helper/reverter");
const BigNumber = require("bignumber.js");

const VoterProxy = artifacts.require("VoterProxy");
const RewardFactory = artifacts.require("RewardFactory");
const VE3Token = artifacts.require("VE3Token");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const VirtualBalanceRewardPool = artifacts.require("VirtualBalanceRewardPool");
const Booster = artifacts.require("Booster");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
const VeToken = artifacts.require("VeToken");
const IERC20 = artifacts.require("IERC20");
const VE3DLocker = artifacts.require("VE3DLocker");

function toBN(number) {
  return new BigNumber(number);
}

contract("Staking Reward Test", async (accounts) => {
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
  let feeDistroAdmin;
  const reverter = new Reverter(web3);
  const wei = web3.utils.toWei;
  const FEE_DENOMINATOR = 10000;

  before("setup", async () => {
    await loadContracts();
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

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  it("Deposit veAsset and stake ve3Dill, get Rewards", async () => {
    //userA account has veAsset token and lp token for pid=0
    const userA = accounts[0];
    const userB = accounts[1];
    const depositAmount = wei("10");
    const lpTokenDepositAmount = wei("5");
    const lockRewardsPoolAddress = await booster.lockRewards();
    const ve3DillRewardPool = await BaseRewardPool.at(lockRewardsPoolAddress); //cvxCrvRewards, ve3Token rewards(veAsset)
    const ve3DillRewardPoolBalanceOfUserABefore = await ve3DillRewardPool.balanceOf(userA);
    assert.equal(lockRewardsPoolAddress, contractAddresseList[7]);

    const stakerRewardsPoolAddress = await booster.stakerRewards(); //vetoken rewards,   cvxRewards
    //const stakerRewardsPool = await VE3DRewardPool.at(stakerRewardsPoolAddress);
    assert.equal(stakerRewardsPoolAddress, baseContractList.system.vetokenRewards);
    const lockFeesPoolAddress = await booster.lockFees();
    const ve3DillLockRewardPool = await VirtualBalanceRewardPool.at(lockFeesPoolAddress); //vecrvRewards, ve3Token veVeAsset fees

    const lpRewardPoolInfo = await booster.poolInfo(0);
    const lpRewardPoolAddress = await lpRewardPoolInfo.veAssetRewards;
    const lPRewardPool = await BaseRewardPool.at(lpRewardPoolAddress);

    const lpRewardOfUserABefore = await lPRewardPool.balanceOf(userA);
    const ve3TokenBalanceBefore = await ve3Token.balanceOf(userA);
    const veTokenBalanceBefore = await vetoken.balanceOf(userA);
    // set incentive percentages
    await booster.setFeeInfo(toBN(5000), toBN(5000));

    // mock lp token deposit to get profit from it, account[0] has lp token for pool[0], poolId=0
    await lpToken.approve(booster.address, lpTokenDepositAmount);
    await booster.deposit(0, lpTokenDepositAmount, true);
    const lpRewardOfUserAAfter = await lPRewardPool.balanceOf(userA);
    console.log("lpRewardOfUserA Before: " + formatEther(lpRewardOfUserABefore.toString()) + "\n");
    console.log("lpRewardOfUserA After: " + formatEther(lpRewardOfUserAAfter.toString()) + "\n");
    assert.equal(lpRewardOfUserAAfter, lpTokenDepositAmount);
    assert.equal(toBN(lpRewardOfUserAAfter).minus(lpRewardOfUserABefore), lpTokenDepositAmount);

    // approve and deposit veAsset(pickle, idle...) , staking returned ve3Dill
    await veassetToken.approve(veassetDepositer.address, depositAmount, { from: userA });
    console.log("Our address " + userA + " was approved");
    await veassetDepositer.deposit(depositAmount, true, ve3DillRewardPool.address, { from: userA });
    const veAssetTokenBalanceBefore = await veassetToken.balanceOf(userA);
    const feeTokenBalanceBefore = await feeToken.balanceOf(userA);
    const ve3DillRewardPoolBalanceOfUserAAfter = await ve3DillRewardPool.balanceOf(userA);

    console.log("ve3DillRewardPoolBalanceOfUserA Before: " + formatEther(lpRewardOfUserABefore.toString()) + "\n");
    console.log("ve3DillRewardPoolBalanceOfUserA After: " + formatEther(lpRewardOfUserAAfter.toString()) + "\n");
    assert.equal(
      toBN(ve3DillRewardPoolBalanceOfUserAAfter).minus(ve3DillRewardPoolBalanceOfUserABefore),
      web3.utils.toWei("10")
    );

    // increase time, check rewards
    const startTime = await time.latest();
    console.log("current block time: " + startTime);
    const latestBlock = await time.latestBlock();
    console.log("latest mined block number: ", latestBlock.toString());
    await time.increase(21 * 86400); // 10 days, 1 day = 86400 s
    // Forces a block to be mined, incrementing the block height.
    await time.advanceBlock();
    const endTime = await time.latest();
    console.log("current block time: " + endTime);
    const latestBlock2 = await time.latestBlock();
    console.log("latest mined block number: ", latestBlock2.toString());

    const lockFeesBalBefore = (await veassetToken.balanceOf(lockFeesPoolAddress)).toString();
    const stakerLockFeesBalBefore = (await veassetToken.balanceOf(stakerLockPool.address)).toString();

    // mock veAsset project distributes reward in feeDistro
    const feeTokenBal = await feeToken.balanceOf(userA);
    await feeToken.transfer(feeDistro, toBN(feeTokenBal).div(2), { from: userA });
    const feeDistroContract = new web3.eth.Contract(feeDisrtroABI, feeDistro);
    await feeDistroContract.methods.checkpoint_token().send({ from: feeDistroAdmin, gas: 8000000 });
    const feeDistroBalance = await feeToken.balanceOf(feeDistro);
    console.log("mock feeDistro getting reward:", feeDistroBalance.toString());

    // 1.100% veAsset funded from locking gauge ($veAsset) from earmarkFees(), get from feeDistro

    await booster.earmarkFees();
    const lockRewardPerToken = await ve3DillLockRewardPool.rewardPerToken();
    const stakeLockRewardPerToken = await stakerLockPool.rewardPerToken(veassetToken.address);
    const userARewardInlockRewardPool = await ve3DillLockRewardPool.earned(userA);

    const lockFeesBalAfter = (await feeToken.balanceOf(lockFeesPoolAddress)).toString();
    console.log("lockFees reward pool balance before earmarkFees", lockFeesBalBefore);
    console.log("lockFees reward pool balance after earmarkFees", lockFeesBalAfter);

    const stakerLockFeesBalAfter = (await feeToken.balanceOf(stakerLockPool.address)).toString();
    console.log("stakerlockFees reward pool balance before earmarkFees", stakerLockFeesBalBefore);
    console.log("stakerlockFees reward pool balance after earmarkFees", stakerLockFeesBalAfter);
    assert.isAbove(Number(toBN(lockFeesBalAfter).minus(lockFeesBalBefore)), 0);
    assert.isAbove(Number(toBN(stakerLockFeesBalAfter).minus(stakerLockFeesBalBefore)), 0);
    assert.equal(
      Number(toBN(lockFeesBalAfter).minus(lockFeesBalBefore)),
      Number(toBN(stakerLockFeesBalAfter).minus(stakerLockFeesBalBefore))
    );

    // 2. 10% from the veAsset LP pools 17% profits (e.g. $Pickle) , call each pool, e.g. poolId=1 earmarkRewards(1)
    await booster.earmarkRewards(0, { from: userB });
    const lockRewardPerToken2 = await ve3DillLockRewardPool.rewardPerToken();
    const stakeLockRewardPerToken2 = await stakerLockPool.rewardPerToken(veassetToken.address);
    const lpPooolRewardPerToken = await lPRewardPool.rewardPerToken();
    const userARewardInlockRewardPool2 = await ve3DillLockRewardPool.earned(userA);

    console.log(
      "get lp pools rewards:",
      lockRewardPerToken2.toString(),
      stakeLockRewardPerToken2.toString(),
      lpPooolRewardPerToken.toString()
    );
    console.log(
      "user A new reward in ve3DillLockRewardPool from lp token pools",
      userARewardInlockRewardPool2.toString()
    );

    // 3. VE3D minted based on formula ($VE3D), ve3D is minted from rewardClaimed() in booster when getReward() called.
    await ve3DillLockRewardPool.getReward(userA);
    console.log("get veAsset locking rewards:", lockRewardPerToken.toString(), stakeLockRewardPerToken.toString());
    console.log("user A rewards in ve3DillLockRewardPool from locking", userARewardInlockRewardPool.toString());
    await lPRewardPool.getReward(userA, true);
    await ve3DillRewardPool.getReward(userA, true);
    const veAssetBalanceAfterRewardClaimed = await veassetToken.balanceOf(userA);
    const ve3TokenClaimed = await ve3Token.balanceOf(userA);

    console.log(
      "userA earned veAsset:",
      toBN(veAssetBalanceAfterRewardClaimed).minus(veAssetTokenBalanceBefore).toString()
    );
    console.log("userA earned ve3Token:", toBN(ve3TokenClaimed).minus(ve3TokenBalanceBefore).toString());

    //assert.isAbove(Number((toBN(veAssetBalanceAfterRewardClaimed).minus(veAssetTokenBalanceBefore))), 0);

    assert.equal(Number(toBN(ve3TokenClaimed).minus(ve3TokenBalanceBefore)), 0);

    //advance time again
    await time.increase(20 * 86400); //20 days
    await time.advanceBlock();
    console.log("advance time...");
    await time.latest().then((a) => console.log("current block time: " + a));
    await time.latestBlock().then((a) => console.log("current block: " + a));

    const feeTokenBal2 = await feeToken.balanceOf(userA);
    await feeToken.transfer(feeDistro, toBN(feeTokenBal2), { from: userA });
    await feeDistroContract.methods.checkpoint_token().send({ from: feeDistroAdmin, gas: 8000000 });

    await booster.earmarkRewards(0, { from: userB });
    await booster.earmarkFees({ from: userB });

    const userARewardInlockRewardPool3 = await ve3DillLockRewardPool.earned(userA);
    const userARewardInlpRewardPool3 = await lPRewardPool.earned(userA);
    const userARewardInRewardPool3 = await ve3DillRewardPool.earned(userA);
    console.log("user A new reward in LockRewardPool", userARewardInlockRewardPool3.toString());
    console.log("user A new reward in lpRewardPool", userARewardInlpRewardPool3.toString());
    assert.isAbove(Number(userARewardInlpRewardPool3), 0);
    console.log("user A new reward in RewardPool", userARewardInRewardPool3.toString());
    assert.isAbove(Number(userARewardInRewardPool3), 0);

    // get rewards in different pools
    await ve3DillLockRewardPool.getReward(userA);
    await lPRewardPool.getReward(userA, true);
    await ve3DillRewardPool.getReward(userA, true);

    const veAssetBalanceAfterRewardClaimed2 = await veassetToken.balanceOf(userA);
    const veAssetEarned = toBN(veAssetBalanceAfterRewardClaimed2).minus(veAssetTokenBalanceBefore);
    console.log("userA earned veAsset:", veAssetEarned.toString());
    // assert.isAbove(Number(veAssetEarned), 0);

    const ve3TokenClaimed2 = await ve3Token.balanceOf(userA);
    const ve3TokenEarned = toBN(ve3TokenClaimed2).minus(ve3TokenBalanceBefore);
    console.log("userA earned ve3Token:", ve3TokenEarned.toString());
    assert.equal(Number(ve3TokenEarned), 0);

    const vetokenClaimed2 = await vetoken.balanceOf(userA);
    const veTokenEarned = toBN(vetokenClaimed2).minus(veTokenBalanceBefore);
    console.log("userA earned vetoken:", veTokenEarned.toString());
    assert.isAbove(Number(veTokenEarned), 0);
  });
});
