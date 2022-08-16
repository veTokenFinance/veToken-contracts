const {BN, time} = require('@openzeppelin/test-helpers');
const {keccak256: k256} = require('ethereum-cryptography/keccak');
var jsonfile = require('jsonfile');
const {toBN} = require('./helper/utils');
const Reverter = require('./helper/reverter');
const {logTransaction} = require('../migrations/helper/logger');
const {formatEther} = require('@ethersproject/units');
var contractList = jsonfile.readFileSync('./contracts.json');
const {
  loadContracts,
  contractAddresseList,
  Networks
} = require("./helper/dumpAddresses");

const IERC20 = artifacts.require('IERC20');
const IExchange = artifacts.require('IExchange');
const BaseRewardPool = artifacts.require('BaseRewardPool');
const VirtualBalanceRewardPool = artifacts.require('VirtualBalanceRewardPool');
const Booster = artifacts.require('Booster');
const VE3DRewardPool = artifacts.require('VE3DRewardPool');
const VE3DLocker = artifacts.require('VE3DLocker');
const VeAssetDepositor = artifacts.require('VeAssetDepositor');
const ClaimZap = artifacts.require('ClaimZap');

let deployer;

//system
let network;
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
let lpToken;
let feeToken;

let userA;

let starttime;
let veAssetBalance;
let lpTokenBalance;
let zap;

const reverter = new Reverter(web3);

async function logBalances() {
  await ve3Token.totalSupply().then(a => console.log('ve3Token total supply: ' + web3.utils.fromWei(a, 'ether')));
  await veAsset.balanceOf(userA).then(a => console.log('userA veAsset: ' + web3.utils.fromWei(a, 'ether')));
  await ve3Token.balanceOf(userA).then(a => console.log('userA ve3Token: ' + web3.utils.fromWei(a, 'ether')));
  await veToken.balanceOf(userA).then(a => console.log('userA veToken: ' + web3.utils.fromWei(a, 'ether')));
  await lpToken.balanceOf(userA).then(a => console.log('userA lpToken: ' + web3.utils.fromWei(a, 'ether')));
  await ve3TokenRewardPool.balanceOf(userA).then(a => console.log('pool ve3Token: ' + web3.utils.fromWei(a, 'ether')));
  await ve3dRewardPool.balanceOf(userA).then(a => console.log('pool veToken: ' + web3.utils.fromWei(a, 'ether')));
  await ve3TokenRewardPool.earned(userA).then(a => console.log('pool ve3Token earned: ' + web3.utils.fromWei(a, 'ether')));
  // await ve3dRewardPool.earned(veToken.address, userA).then(a => console.log('pool veToken earned: ' + web3.utils.fromWei(a, "ether")));
  await ve3dLocker.lockedBalanceOf(userA).then(a => console.log('locked balance: ' + web3.utils.fromWei(a, 'ether')));
  await ve3dLocker.claimableRewards(userA).then(a => console.log('locked claimableRewards: ' + a));
}

contract('Test claim zap', async accounts => {
  before('setup', async () => {
    network = await loadContracts();
    veToken = await IERC20.at(contractList.system.vetoken);
    ve3Token = await IERC20.at(contractAddresseList[5]);
    veAsset = await IERC20.at(contractAddresseList[0]);
    depositor = await VeAssetDepositor.at(contractAddresseList[6]);
    exchange = await IExchange.at('0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F');
    weth = await IERC20.at('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    ve3TokenRewardPool = await BaseRewardPool.at(contractAddresseList[7]);
    ve3dRewardPool = await VE3DRewardPool.at(contractList.system.vetokenRewards);
    ve3dLocker = await VE3DLocker.at(contractList.system.ve3dLocker);
    booster = await Booster.at(contractAddresseList[4]);
    lpToken = await IERC20.at(contractAddresseList[2]);
    feeToken = await IERC20.at(await booster.feeToken());

    userA = accounts[0];
    deployer = accounts[1];

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
    await logBalances();
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

  it('deposit lpToken and veAsset, stake and get rewards', async () => {
    await logBalances();

    // send lp token to userA
    let lpTokenHolder = '0xefe1a7b147ac4c0b761da878f6a315923441ca54';
    switch(network){
      case Networks.idle:
        lpTokenHolder = "0xefe1a7b147ac4c0b761da878f6a315923441ca54"
        break;
      case Networks.angle:
        lpTokenHolder = "0x5aB0e4E355b08e692933c1F6f85fd0bE56aD18A6";
        break;
    }
    logTransaction(await lpToken.transfer(userA, web3.utils.toWei('5'), {from: lpTokenHolder}), 'fund userA with lp token');

    lpTokenBalance = await lpToken.balanceOf(userA);
    assert.isAbove(toBN(lpTokenBalance).toNumber(), 0);

    const lockFeesPoolAddress = await booster.lockFees();
    const ve3TokenLockRewardPool = await VirtualBalanceRewardPool.at(lockFeesPoolAddress); //vecrvRewards, ve3Token veVeAsset fees
    const lpRewardPoolInfo = await booster.poolInfo(0);
    const lpRewardPoolAddress = await lpRewardPoolInfo.veAssetRewards;
    const lPRewardPool = await BaseRewardPool.at(lpRewardPoolAddress);

    let depositAmount = toBN(web3.utils.toWei('10.0', 'ether'));
    let lpTokenDepositAmount = toBN(web3.utils.toWei('5.0', 'ether'));

    const ve3TokenRewardPoolBalanceOfUserABefore = await ve3TokenRewardPool.balanceOf(userA);
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

    // approve and deposit veAsset, staking returned ve3Token
    await veAsset.approve(depositor.address, depositAmount, {from: userA});
    await depositor.deposit(depositAmount, true, ve3TokenRewardPool.address, {from: userA});
    const veAssetTokenBalanceBefore = await veAsset.balanceOf(userA);
    const ve3TokenRewardPoolBalanceOfUserAAfter = await ve3TokenRewardPool.balanceOf(userA);

    console.log('ve3TokenRewardPoolBalanceOfUserA Before: ' + formatEther(lpRewardOfUserABefore.toString()) + '\n');
    console.log('ve3TokenRewardPoolBalanceOfUserA After: ' + formatEther(lpRewardOfUserAAfter.toString()) + '\n');
    assert.equal(
        toBN(ve3TokenRewardPoolBalanceOfUserAAfter).minus(ve3TokenRewardPoolBalanceOfUserABefore),
        web3.utils.toWei('10'),
    );

    // increase time, check rewards
    starttime = await time.latest();
    await time.increase(21 * 86400); // 21 days, 1 day = 86400 s
    await time.advanceBlock();

    const lockRewardPerToken = await ve3TokenLockRewardPool.rewardPerToken();
    const stakeLockRewardPerToken = await ve3dLocker.rewardPerToken(veAsset.address);
    const userARewardInlockRewardPool = await ve3TokenLockRewardPool.earned(userA);

    await booster.earmarkRewards(0);

    let options = 1 + 4 + 8; // ClaimVetoken, ClaimVe3Token, ClaimLockedVeToken
    await zap.claimRewards([lPRewardPool.address, ve3TokenRewardPool.address], [ve3TokenLockRewardPool.address], [], [], 0, 0, 0, options, {from: userA});

    console.log('get veAsset locking rewards:', lockRewardPerToken.toString(), stakeLockRewardPerToken.toString());
    console.log('user A rewards in ve3TokenLockRewardPool from locking', userARewardInlockRewardPool.toString());

    const veAssetBalanceAfterRewardClaimed = await veAsset.balanceOf(userA);
    const ve3TokenClaimed = await ve3Token.balanceOf(userA);

    console.log(
        'userA earned veAsset:',
        toBN(veAssetBalanceAfterRewardClaimed).minus(veAssetTokenBalanceBefore).toString(),
    );
    console.log('userA earned ve3Token:', toBN(ve3TokenClaimed).minus(ve3TokenBalanceBefore).toString());

    assert.isAbove(Number((toBN(veAssetBalanceAfterRewardClaimed).minus(veAssetTokenBalanceBefore))), 0);

    assert.equal(Number(toBN(ve3TokenClaimed).minus(ve3TokenBalanceBefore)), 0);

    //advance time again
    await time.increase(20 * 86400); //20 days
    await time.advanceBlock();
    console.log('advance time...');
    await time.latest().then((a) => console.log('current block time: ' + a));
    await time.latestBlock().then((a) => console.log('current block: ' + a));

    await booster.earmarkRewards(0);

    const userARewardInlockRewardPool3 = await ve3TokenLockRewardPool.earned(userA);
    const userARewardInlpRewardPool3 = await lPRewardPool.earned(userA);
    const userARewardInRewardPool3 = await ve3TokenRewardPool.earned(userA);
    console.log('user A new reward in LockRewardPool', userARewardInlockRewardPool3.toString());
    console.log('user A new reward in lpRewardPool', userARewardInlpRewardPool3.toString());
    assert.isAbove(Number(userARewardInlpRewardPool3), 0);
    console.log('user A new reward in RewardPool', userARewardInRewardPool3.toString());
    assert.isAbove(Number(userARewardInRewardPool3), 0);

    await zap.claimRewards([lPRewardPool.address, ve3TokenRewardPool.address], [ve3TokenLockRewardPool.address], [], [],0, 0, 0, options, {from: userA});

    const veAssetBalanceAfterRewardClaimed2 = await veAsset.balanceOf(userA);
    const veAssetEarned = toBN(veAssetBalanceAfterRewardClaimed2).minus(veAssetTokenBalanceBefore);
    console.log('userA earned veAsset:', veAssetEarned.toString());
    assert.isAbove(Number(veAssetEarned), 0);

    const ve3TokenClaimed2 = await ve3Token.balanceOf(userA);
    const ve3TokenEarned = toBN(ve3TokenClaimed2).minus(ve3TokenBalanceBefore);
    console.log('userA earned ve3Token:', ve3TokenEarned.toString());
    assert.equal(Number(ve3TokenEarned), 0);

    const vetokenClaimed2 = await veToken.balanceOf(userA);
    const veTokenEarned = toBN(vetokenClaimed2).minus(veTokenBalanceBefore);
    console.log('userA earned vetoken:', veTokenEarned.toString());
    assert.isAbove(Number(veTokenEarned), 0);

    await logBalances();
  });
});

