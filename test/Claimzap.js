// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const {BN, time} = require('@openzeppelin/test-helpers');
const {keccak256: k256} = require('ethereum-cryptography/keccak');
var jsonfile = require('jsonfile');
const {toBN} = require('./helper/utils');
const Reverter = require('./helper/reverter');
var contractList = jsonfile.readFileSync('./contracts.json');

const IERC20 = artifacts.require('IERC20');
const IExchange = artifacts.require('IExchange');
const BaseRewardPool = artifacts.require('BaseRewardPool');
const VE3DRewardPool = artifacts.require('VE3DRewardPool');
const VE3DLocker = artifacts.require('VE3DLocker');
const VeAssetDepositor = artifacts.require('VeAssetDepositor');
const ClaimZap = artifacts.require('ClaimZap');

// - get some ve3tokens by locking veAsset into depositor
// -

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
let threeCrv;

let userA;
let userB;
let userC;
let userD;

let starttime;
let veAssetBalance;
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
    threeCrv = await IERC20.at('0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490');

    userA = accounts[0];
    userB = accounts[1];
    userC = accounts[2];
    userD = accounts[3];

    starttime = await time.latest();

    await reverter.snapshot();
  });

  after("revert", reverter.revert);

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

  it('deposit veAsset with lock', async () => {
    let depositAmount = toBN(veAssetBalance).idiv(2);
    let remainingAmount = toBN(veAssetBalance).minus(depositAmount);
    await veAsset.approve(depositor.address, depositAmount);
    let lockIncentive = toBN(
        (await depositor.lockIncentive()).toString(),
    );
    let callIncentive = toBN(depositAmount)
        .times(lockIncentive)
        .idiv(FEE_DENOMINATOR);

    await depositor.deposit(depositAmount, false);

    // not working
    // assert.equal(
    //     (await veAsset.balanceOf(userA)).toString(),
    //     remainingAmount.toFixed(),
    // );
    // assert.equal(
    //     (await veAsset.balanceOf(depositor.address)).toString(),
    //     depositAmount.toFixed(),
    // );
    assert.equal(
        (await ve3Token.balanceOf(userA)).toString(),
        toBN(depositAmount).minus(callIncentive).toFixed(),
    );

  });

  it("stake ve3Token in BaseRewardPool", async()=>{
    await ve3Token.approve(ve3TokenRewardPool.address, web3.utils.toWei('1000.0', 'ether'), {from: userA, gasPrice: 0});

    await ve3TokenRewardPool.stake(web3.utils.toWei('1000.0', 'ether'), {from: userA, gasPrice: 0});
  })

  it('deploy ClaimZap contract', async () => {

    // return;
    //deploy
    zap = await ClaimZap.new(veAsset.address, veToken.address, ve3Token.address, depositor.address, ve3TokenRewardPool.address, ve3dRewardPool.address, '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', ve3dLocker.address);
    await zap.setApprovals();
    console.log('zap deployed');

  });

  it('checks some more stuff', async () => {
    //tests
    let spell = await IERC20.at('0x090185f2135308bad17527004364ebcc2d37e5f6');
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
    // await spell.balanceOf(userA).then(a => console.log('userA spell: ' + a));
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
    // await spell.balanceOf(userA).then(a => console.log('userA spell: ' + a));
    await ve3TokenRewardPool.balanceOf(userA).then(a => console.log('pool ve3Token: ' + a));
    await ve3dRewardPool.balanceOf(userA).then(a => console.log('pool veToken: ' + a));
    await ve3TokenRewardPool.earned(userA).then(a => console.log('pool ve3Token earned: ' + a));
    // await ve3dRewardPool.earned(userA).then(a => console.log('pool veToken earned: ' + a));
    await ve3dLocker.lockedBalanceOf(userA).then(a => console.log('locked balance: ' + a));
    await ve3dLocker.claimableRewards(userA).then(a => console.log('locked claimableRewards: ' + a));
  });
});

