// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const {BN, time} = require('@openzeppelin/test-helpers');
const {keccak256: k256} = require('ethereum-cryptography/keccak');
var jsonfile = require('jsonfile');
const {toBN} = require('./helper/utils');
const Reverter = require('./helper/reverter');
const {logTransaction} = require('../migrations/helper/logger');
const {contractAddresseList} = require('./helper/dumpAddresses');
const {formatEther} = require('@ethersproject/units');
const feeDisrtroABI = require('./helper/feeDistroABI.json');
var contractList = jsonfile.readFileSync('./contracts.json');

const IERC20 = artifacts.require('IERC20');
const IExchange = artifacts.require('IExchange');
const BaseRewardPool = artifacts.require('BaseRewardPool');
const VirtualBalanceRewardPool = artifacts.require('VirtualBalanceRewardPool');
const Booster = artifacts.require('Booster');
const VE3DRewardPool = artifacts.require('VE3DRewardPool');
const VE3DLocker = artifacts.require('VE3DLocker');
const VeAssetDepositor = artifacts.require('VeAssetDepositor');
const ClaimZap = artifacts.require('ClaimZap');

let deployer = '0x2093b4281990A568C9D588b8BCE3BFD7a1557Ebd';

//system
let veToken;
let ve3Token;
let veAsset;
let depositor;
let exchange;
let weth;
let ve3TokenRewardPool;
let ve3dRewardPool;
let ve3dLocker;
let booster;
let threeCrv;
let lpToken;
let feeToken;

let userA;
let userB;
let userC;
let userD;

let starttime;
let veAssetBalance;
let lpTokenBalance;
let zap;

const reverter = new Reverter(web3);

const FEE_DENOMINATOR = 10000;

contract.only('Test claim zap', async accounts => {
  before('setup', async () => {
    veToken = await IERC20.at(contractList.system.vetoken);
    ve3Token = await IERC20.at(contractList.system.ve3_idle);
    veAsset = await IERC20.at(contractList.system.idle_address);
    depositor = await VeAssetDepositor.at(contractList.system.idle_depositor);
    exchange = await IExchange.at('0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F');
    weth = await IERC20.at('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    ve3TokenRewardPool = await BaseRewardPool.at(contractList.system.idle_ve3TokenRewardPool);
    ve3dRewardPool = await VE3DRewardPool.at(contractList.system.vetokenRewards);
    ve3dLocker = await VE3DLocker.at(contractList.system.ve3dLocker);
    booster = await Booster.at(contractList.system.idle_booster);
    threeCrv = await IERC20.at('0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490');
    lpToken = await IERC20.at(contractList.system.idle_lptoken);
    feeToken = await IERC20.at(await booster.feeToken());

    userA = accounts[0];
    userB = accounts[1];
    userC = accounts[2];
    userD = accounts[3];

    starttime = await time.latest();

    await reverter.snapshot();
  });

  after('revert', reverter.revert);

  it('deploy ClaimZap contract', async () => {

    //deploy
    zap = await ClaimZap.new(veAsset.address, veToken.address, ve3Token.address, depositor.address, ve3TokenRewardPool.address, ve3dRewardPool.address, '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', ve3dLocker.address);
    await zap.setApprovals();
    console.log('zap deployed');

  });

  it('swap weth for veAsset', async () => {
    //swap for veAsset
    await weth.sendTransaction({value: web3.utils.toWei('0.1', 'ether'), from: deployer});
    var wethBalance = await weth.balanceOf(deployer);
    console.log('receive weth: ' + wethBalance);
    await weth.approve(exchange.address, wethBalance, {from: deployer});
    await exchange.swapExactTokensForTokens(web3.utils.toWei('0.1', 'ether'), 0, [weth.address, veAsset.address], userA, starttime + 3000, {from: deployer});

    veAssetBalance = await veAsset.balanceOf(userA);
    console.log('veAsset balance: ' + veAssetBalance);
    assert.isAbove(toBN(veAssetBalance).toNumber(), 0);
  });

  it('deposit veAsset and stake ve3Token', async () => {
    veAssetBalance = await veAsset.balanceOf(userA);
    console.log('veAsset balance: ' + veAssetBalance);

    // send lp token to userA
    let lpTokenHolder = '0xefe1a7b147ac4c0b761da878f6a315923441ca54';
    logTransaction(await lpToken.transfer(userA, web3.utils.toWei('5'), {from: lpTokenHolder}), 'fund userA with lp token');

    lpTokenBalance = await lpToken.balanceOf(userA);
    console.log('lpTokenBalance userA: ', lpTokenBalance.toString());

    assert.isAbove(toBN(lpTokenBalance).toNumber(), 0);

    const lockFeesPoolAddress = await booster.lockFees();
    const ve3TokenLockRewardPool = await VirtualBalanceRewardPool.at(lockFeesPoolAddress); //vecrvRewards, ve3Token veVeAsset fees
    const lpRewardPoolInfo = await booster.poolInfo(0);
    const lpRewardPoolAddress = await lpRewardPoolInfo.veAssetRewards;
    const lPRewardPool = await BaseRewardPool.at(lpRewardPoolAddress);

    let depositAmount = toBN(web3.utils.toWei('10.0', 'ether'));
    let lpTokenDepositAmount = toBN(web3.utils.toWei('5.0', 'ether'));
    let remainingAmount = toBN(veAssetBalance).minus(depositAmount);

    const ve3IdleRewardPoolBalanceOfUserABefore = await ve3TokenRewardPool.balanceOf(userA);
    const lpRewardOfUserABefore = await lPRewardPool.balanceOf(userA);
    const ve3TokenBalanceBefore = await ve3Token.balanceOf(userA);
    const veTokenBalanceBefore = await veToken.balanceOf(userA);

    // set incentive percentages
    await booster.setFeeInfo(toBN(5000), toBN(5000));

    // mock lp token deposit to get profit from it, account[0] has lp token for pool[0], poolId=0
    await lpToken.approve(booster.address, lpTokenDepositAmount);
    await booster.deposit(0, lpTokenDepositAmount, true);
    const lpRewardOfUserAAfter = await lPRewardPool.balanceOf(userA);
    console.log('lpRewardOfUserA Before: ' + formatEther(lpRewardOfUserABefore.toString()) + '\n');
    console.log('lpRewardOfUserA After: ' + formatEther(lpRewardOfUserAAfter.toString()) + '\n');
    assert.equal(lpRewardOfUserAAfter.toString(), lpTokenDepositAmount.toString());
    assert.equal(toBN(lpRewardOfUserAAfter).minus(lpRewardOfUserABefore).toString(), lpTokenDepositAmount.toString());

    // approve and deposit veAsset, staking returned ve3Idle
    await veAsset.approve(depositor.address, depositAmount, {from: userA});
    console.log('Our address ' + userA + ' was approved');
    await depositor.deposit(depositAmount, true, ve3TokenRewardPool.address, {from: userA});
    const veAssetTokenBalanceBefore = await veAsset.balanceOf(userA);
    const feeTokenBalanceBefore = await feeToken.balanceOf(userA);
    const ve3TokenRewardPoolBalanceOfUserAAfter = await ve3TokenRewardPool.balanceOf(userA);

    console.log('ve3IdleRewardPoolBalanceOfUserA Before: ' + formatEther(lpRewardOfUserABefore.toString()) + '\n');
    console.log('ve3IdleRewardPoolBalanceOfUserA After: ' + formatEther(lpRewardOfUserAAfter.toString()) + '\n');
    assert.equal(
        toBN(ve3TokenRewardPoolBalanceOfUserAAfter).minus(ve3IdleRewardPoolBalanceOfUserABefore),
        web3.utils.toWei('10'),
    );

    // increase time, check rewards
    starttime = await time.latest();
    console.log('current block time: ' + starttime);
    const latestBlock = await time.latestBlock();
    console.log('latest mined block number: ', latestBlock.toString());
    await time.increase(21 * 86400); // 21 days, 1 day = 86400 s
    // Forces a block to be mined, incrementing the block height.
    await time.advanceBlock();
    const endTime = await time.latest();
    console.log('current block time: ' + endTime);
    const latestBlock2 = await time.latestBlock();
    console.log('latest mined block number: ', latestBlock2.toString());

    const lockFeesBalBefore = (await veAsset.balanceOf(lockFeesPoolAddress)).toString();
    const stakerLockFeesBalBefore = (await veAsset.balanceOf(ve3dLocker.address)).toString();
    const feeDistro = contractList.system.idle_feedistro;
    const feeDistroAdmin = contractList.system.idle_feedistro_admin;

    // mock veAsset project distributes reward in feeDistro
    const feeTokenBal = await feeToken.balanceOf(userA);
    await feeToken.transfer(feeDistro, toBN(feeTokenBal).div(2), {from: userA});
    const feeDistroContract = new web3.eth.Contract(feeDisrtroABI, feeDistro);
    await feeDistroContract.methods.checkpoint_token().send({from: feeDistroAdmin, gas: 8000000});
    const feeDistroBalance = await feeToken.balanceOf(feeDistro);
    console.log('mock feeDistro getting reward:', feeDistroBalance.toString());

    // 1.100% veAsset funded from locking gauge ($veAsset) from earmarkFees(), get from feeDistro

    await booster.earmarkFees();
    const lockRewardPerToken = await ve3TokenLockRewardPool.rewardPerToken();
    const stakeLockRewardPerToken = await ve3dLocker.rewardPerToken(veAsset.address);
    const userARewardInlockRewardPool = await ve3TokenLockRewardPool.earned(userA);

    const lockFeesBalAfter = (await feeToken.balanceOf(lockFeesPoolAddress)).toString();
    console.log('lockFees reward pool balance before earmarkFees', lockFeesBalBefore);
    console.log('lockFees reward pool balance after earmarkFees', lockFeesBalAfter);

    const stakerLockFeesBalAfter = (await feeToken.balanceOf(ve3dLocker.address)).toString();
    console.log('stakerlockFees reward pool balance before earmarkFees', stakerLockFeesBalBefore);
    console.log('stakerlockFees reward pool balance after earmarkFees', stakerLockFeesBalAfter);
    assert.isAbove(Number(toBN(lockFeesBalAfter).minus(lockFeesBalBefore)), 0);
    assert.isAbove(Number(toBN(stakerLockFeesBalAfter).minus(stakerLockFeesBalBefore)), 0);
    assert.equal(
        Number(toBN(lockFeesBalAfter).minus(lockFeesBalBefore)),
        Number(toBN(stakerLockFeesBalAfter).minus(stakerLockFeesBalBefore)),
    );

    // 2. 10% from the veAsset LP pools 17% profits (e.g. $Pickle) , call each pool, e.g. poolId=1 earmarkRewards(1)
    await booster.earmarkRewards(0, {from: userB});
    const lockRewardPerToken2 = await ve3TokenLockRewardPool.rewardPerToken();
    const stakeLockRewardPerToken2 = await ve3dLocker.rewardPerToken(veAsset.address);
    const lpPooolRewardPerToken = await lPRewardPool.rewardPerToken();
    const userARewardInlockRewardPool2 = await ve3TokenLockRewardPool.earned(userA);

    console.log(
        'get lp pools rewards:',
        lockRewardPerToken2.toString(),
        stakeLockRewardPerToken2.toString(),
        lpPooolRewardPerToken.toString(),
    );
    console.log(
        'user A new reward in ve3DillLockRewardPool from lp token pools',
        userARewardInlockRewardPool2.toString(),
    );

    // 3. VE3D minted based on formula ($VE3D), ve3D is minted from rewardClaimed() in booster when getReward() called.
    await ve3TokenLockRewardPool.getReward(userA);
    console.log('get veAsset locking rewards:', lockRewardPerToken.toString(), stakeLockRewardPerToken.toString());
    console.log('user A rewards in ve3DillLockRewardPool from locking', userARewardInlockRewardPool.toString());
    await lPRewardPool.getReward(userA, true);
    await ve3TokenRewardPool.getReward(userA, true);
    const veAssetBalanceAfterRewardClaimed = await veAsset.balanceOf(userA);
    const ve3TokenClaimed = await ve3Token.balanceOf(userA);

    console.log(
        'userA earned veAsset:',
        toBN(veAssetBalanceAfterRewardClaimed).minus(veAssetTokenBalanceBefore).toString(),
    );
    console.log('userA earned ve3Token:', toBN(ve3TokenClaimed).minus(ve3TokenBalanceBefore).toString());

    //assert.isAbove(Number((toBN(veAssetBalanceAfterRewardClaimed).minus(veAssetTokenBalanceBefore))), 0);

    assert.equal(Number(toBN(ve3TokenClaimed).minus(ve3TokenBalanceBefore)), 0);

    //advance time again
    await time.increase(20 * 86400); //20 days
    await time.advanceBlock();
    console.log('advance time...');
    await time.latest().then((a) => console.log('current block time: ' + a));
    await time.latestBlock().then((a) => console.log('current block: ' + a));

    const feeTokenBal2 = await feeToken.balanceOf(userA);
    await feeToken.transfer(feeDistro, toBN(feeTokenBal2), {from: userA});
    await feeDistroContract.methods.checkpoint_token().send({from: feeDistroAdmin, gas: 8000000});

    await booster.earmarkRewards(0, {from: userB});
    await booster.earmarkFees({from: userB});

    const userARewardInlockRewardPool3 = await ve3TokenLockRewardPool.earned(userA);
    const userARewardInlpRewardPool3 = await lPRewardPool.earned(userA);
    const userARewardInRewardPool3 = await ve3TokenRewardPool.earned(userA);
    console.log('user A new reward in LockRewardPool', userARewardInlockRewardPool3.toString());
    console.log('user A new reward in lpRewardPool', userARewardInlpRewardPool3.toString());
    assert.isAbove(Number(userARewardInlpRewardPool3), 0);
    console.log('user A new reward in RewardPool', userARewardInRewardPool3.toString());
    assert.isAbove(Number(userARewardInRewardPool3), 0);

    // get rewards in different pools
    await ve3TokenLockRewardPool.getReward(userA);
    await lPRewardPool.getReward(userA, true);
    await ve3TokenRewardPool.getReward(userA, true);

    const veAssetBalanceAfterRewardClaimed2 = await veAsset.balanceOf(userA);
    const veAssetEarned = toBN(veAssetBalanceAfterRewardClaimed2).minus(veAssetTokenBalanceBefore);
    console.log('userA earned veAsset:', veAssetEarned.toString());
    // assert.isAbove(Number(veAssetEarned), 0);

    const ve3TokenClaimed2 = await ve3Token.balanceOf(userA);
    const ve3TokenEarned = toBN(ve3TokenClaimed2).minus(ve3TokenBalanceBefore);
    console.log('userA earned ve3Token:', ve3TokenEarned.toString());
    assert.equal(Number(ve3TokenEarned), 0);

    const vetokenClaimed2 = await veToken.balanceOf(userA);
    const veTokenEarned = toBN(vetokenClaimed2).minus(veTokenBalanceBefore);
    console.log('userA earned vetoken:', veTokenEarned.toString());
    assert.isAbove(Number(veTokenEarned), 0);

    // let mask = 1 + 4 + 8; // claim veToken, claim ve3Token, claimLockedVeToken
    // await zap.claimRewards([lPRewardPool.address, ve3TokenRewardPool.address], [ve3dRewardPool.address], [], [], 0, 0, 0, mask, {from: userA, gasPrice: 0});
    // console.log('ve3TokenBalance after', toBN(await ve3Token.balanceOf(userA)).toString());

    // await veAsset.approve(zap.address, depositAmount);
    //
    // console.log("ve3TokenBalance before",toBN(await ve3Token.balanceOf(userA)).toString());
    // await veAsset.approve(zap.address, web3.utils.toWei('10000000000.0', 'ether'), {from: userA, gasPrice: 0});
    //
    // let mask = 32; // LockVeAssetDeposit
    // await zap.claimRewards([], [], [], [], web3.utils.toWei('10000000000.0', 'ether'), 0, 0, mask, {from: userA, gasPrice: 0});
    // console.log("ve3TokenBalance after", toBN(await ve3Token.balanceOf(userA)).toString());
  });

  // it('deposit veAsset with locking and without exchange', async () => {
  //   veAssetBalance = await veAsset.balanceOf(userA);
  //   console.log('veAsset balance: ' + veAssetBalance);
  //
  //   let depositAmount = toBN(web3.utils.toWei('100000.0', 'ether'));
  //   let remainingAmount = toBN(veAssetBalance).minus(depositAmount);
  //   await veAsset.approve(zap.address, depositAmount);
  //
  //   console.log('ve3TokenBalance before', toBN(await ve3Token.balanceOf(userA)).toString());
  //   await veAsset.approve(zap.address, web3.utils.toWei('10000000000.0', 'ether'), {from: userA, gasPrice: 0});
  //
  //   let mask = 1 + 4 + 8; // claim veToken, claim ve3Token, claimLockedVeToken
  //   await zap.claimRewards([], [], [], [], web3.utils.toWei('10000000000.0', 'ether'), 0, 0, mask, {from: userA, gasPrice: 0});
  //   console.log('ve3TokenBalance after', toBN(await ve3Token.balanceOf(userA)).toString());
  // });

  //
  // it("stake ve3Token in BaseRewardPool", async()=>{
  //   await ve3Token.approve(ve3TokenRewardPool.address, web3.utils.toWei('1000.0', 'ether'), {from: userA, gasPrice: 0});
  //
  //   await ve3TokenRewardPool.stake(web3.utils.toWei('1000.0', 'ether'), {from: userA, gasPrice: 0});
  // })

  it('claim rewards', async () => {
    //tests

    // await weth.sendTransaction({value: web3.utils.toWei('1.0', 'ether'), from: deployer});
    // var wethBalance = await weth.balanceOf(deployer);
    // console.log('receive weth: ' + wethBalance);
    // await weth.approve(exchange.address, wethBalance, {from: deployer});
    // await exchange.swapExactTokensForTokens(web3.utils.toWei('1.0', 'ether'), 0, [weth.address, spell.address], deployer, starttime + 3000, {from: deployer});
    // var spellbalance = await spell.balanceOf(deployer);
    // console.log('swapped for spell: ' + spellbalance);

    await veAsset.approve(zap.address, web3.utils.toWei('10000000000.0', 'ether'), {from: userA, gasPrice: 0});
    await veToken.approve(zap.address, web3.utils.toWei('10000000000.0', 'ether'), {from: userA, gasPrice: 0});
    console.log('approved');

    await ve3Token.totalSupply().then(a => console.log('ve3Token totaly supply: ' + a));
    await veAsset.balanceOf(userA).then(a => console.log('userA veAsset: ' + a));
    await ve3Token.balanceOf(userA).then(a => console.log('userA ve3Token: ' + a));
    await veToken.balanceOf(userA).then(a => console.log('userA veToken: ' + a));
    // await threeCrv.balanceOf(userA).then(a => console.log('userA threeCrv: ' + a));
    await lpToken.balanceOf(userA).then(a => console.log('userA lpToken: ' + a));
    await ve3TokenRewardPool.balanceOf(userA).then(a => console.log('pool ve3Token: ' + a));
    await ve3dRewardPool.balanceOf(userA).then(a => console.log('pool veToken: ' + a));
    await ve3TokenRewardPool.earned(userA).then(a => console.log('pool ve3Token earned: ' + a));
    // await ve3dRewardPool.earned(veToken.address, userA).then(a => console.log('pool veToken earned: ' + a));
    await ve3dLocker.lockedBalanceOf(userA).then(a => console.log('locked balance: ' + a));
    await ve3dLocker.claimableRewards(userA).then(a => console.log('locked claimableRewards: ' + a));

    time.increase(100 * 86400); // 10 days, 1 day = 86400 s
    // Forces a block to be mined, incrementing the block height.
    await time.advanceBlock();
    const endTime = await time.latest();

    let mask = 2 + 16;
    await zap.claimRewards([], [], [], [veToken.address], web3.utils.toWei('10000000000.0', 'ether'), 0, web3.utils.toWei('10000000000.0', 'ether'), mask, {from: userA, gasPrice: 0});
    // await zap.claimRewards([],[],[rewardDistro.address],[spell.address],0,1,0,0,mask,{from:userA,gasPrice:0});
    console.log('zap\'d');
    await ve3Token.totalSupply().then(a => console.log('ve3Token totaly supply: ' + a));
    await veAsset.balanceOf(userA).then(a => console.log('userA veAsset: ' + a));
    await ve3Token.balanceOf(userA).then(a => console.log('userA ve3Token: ' + a));
    await veToken.balanceOf(userA).then(a => console.log('userA veToken: ' + a));
    // await threeCrv.balanceOf(userA).then(a => console.log('userA threeCrv: ' + a));
    await lpToken.balanceOf(userA).then(a => console.log('userA lpToken: ' + a));
    await ve3TokenRewardPool.balanceOf(userA).then(a => console.log('pool ve3Token: ' + a));
    await ve3dRewardPool.balanceOf(userA).then(a => console.log('pool veToken: ' + a));
    await ve3TokenRewardPool.earned(userA).then(a => console.log('pool ve3Token earned: ' + a));
    // await ve3dRewardPool.earned(userA).then(a => console.log('pool veToken earned: ' + a));
    await ve3dLocker.lockedBalanceOf(userA).then(a => console.log('locked balance: ' + a));
    await ve3dLocker.claimableRewards(userA).then(a => console.log('locked claimableRewards: ' + a));
  });
});

