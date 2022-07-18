const VestedEscrow = artifacts.require('VestedEscrow');
const VeToken = artifacts.require('VeToken');
const VE3DRewardPool = artifacts.require('VE3DRewardPool');
const TreasuryFunds = artifacts.require('TreasuryFunds');

const {time, constants} = require('@openzeppelin/test-helpers');
const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');
const Reverter = require('./helper/reverter');

function toBN(number) {
  return new BigNumber(number);
}

contract.only('TreasuryFunds', async (accounts) => {
  let ve3d;
  let vestedEscrow;
  let startTime;
  let endTime;
  let ve3dRewardPool;
  let treasuryFunds;

  const TOTAL_TIME = 1.5 * 365 * 86400; // 1,5 years

  const admin = accounts[0];
  const fundAdmin = accounts[1];
  const userA = accounts[2];
  const userB = accounts[3];

  const reverter = new Reverter(web3);

  const toWei = web3.utils.toWei;

  const stakeForJsonInterface = {
    'inputs': [
      {
        'internalType': 'address',
        'name': '_for',
        'type': 'address',
      },
      {
        'internalType': 'uint256',
        'name': '_amount',
        'type': 'uint256',
      },
    ],
    'name': 'stakeFor',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function',
  };

  before('setup', async () => {
    ve3d = await VeToken.new({from: admin});
    await ve3d.mint(admin, toWei('1000000'), {from: admin});
    startTime = Number(await time.latest()) + 1000;
    endTime = startTime + TOTAL_TIME;

    treasuryFunds = await TreasuryFunds.new(admin, {from: admin});

    ve3dRewardPool = await VE3DRewardPool.new(ve3d.address, admin, {from: admin});

    vestedEscrow = await VestedEscrow.new(
        ve3d.address,
        startTime,
        endTime,
        ve3dRewardPool.address,
        fundAdmin,
    );
    await reverter.snapshot();
  });

  afterEach('revert', reverter.revert);

  describe('setter', () => {
    describe('set operator', () => {
      it('it reverts if caller is not operator', async () => {
        await truffleAssert.reverts(
            treasuryFunds.setOperator(userA, {from: userA}),
            '!auth',
        );
      });

      it('it sets new operator', async () => {
        await treasuryFunds.setOperator(fundAdmin, {from: admin});

        assert.equal(await treasuryFunds.operator(), fundAdmin);
      });
    });
  });

  describe('withdraw by operator', () => {

    beforeEach(async () => {
      await ve3d.transfer(treasuryFunds.address, toWei('100'), {from: admin});
    });

    it('reverts when someone other than the operator tries to withdraw funds', async () => {
      await truffleAssert.reverts(
          treasuryFunds.withdrawTo(ve3d.address, toWei('10'), userB, {from: userA}),
          '!auth',
      );
    });

    it('withdraws tokens from the contract', async () => {
      const amount = toWei('10');
      await treasuryFunds.withdrawTo(ve3d.address, amount, userB, {from: admin});

      assert.equal(await ve3d.balanceOf(userB), amount);
    });

    it('it emits event', async () => {
      const amount = toWei('10');
      const tx = await treasuryFunds.withdrawTo(ve3d.address, amount, userB, {from: admin});

      truffleAssert.eventEmitted(tx, 'WithdrawTo', (ev) => {
        return ev.user === userB && ev.amount == amount;
      });
    });
  });

  describe('stake in ve3dRewardPool', () => {

    beforeEach(async () => {
      await ve3d.transfer(treasuryFunds.address, toWei('100'), {from: admin});
    });

    it('reverts when someone other than the operator tries to execute a function', async () => {
      const amount = toWei('10');

      const call = web3.eth.abi.encodeFunctionCall(stakeForJsonInterface, [treasuryFunds.address, amount]);
      console.log('call', call);

      await truffleAssert.reverts(
          treasuryFunds.execute(ve3dRewardPool.address, toWei('10'), call, {from: userA}),
          '!auth',
      );
    });

    it('executes a function to stake in ve3dRewardPool', async () => {
      const amount = toWei('10');

      const call = web3.eth.abi.encodeFunctionCall(stakeForJsonInterface, [treasuryFunds.address, amount]);
      console.log('call', call);

      let tx = await treasuryFunds.execute(ve3dRewardPool.address, toWei('10'), call, {from: admin});

      console.log(tx);
      console.log((await ve3dRewardPool.balanceOf(treasuryFunds.address)).toString());

      assert.equal(await ve3dRewardPool.balanceOf(treasuryFunds.address), amount);
    });
    //
    // it('it emits event', async () => {
    //   const amount = toWei('10');
    //   const tx = await treasuryFunds.withdrawTo(ve3d.address, amount, userB, {from: admin});
    //
    //   truffleAssert.eventEmitted(tx, 'WithdrawTo', (ev) => {
    //     return ev.user === userB && ev.amount == amount;
    //   });
    // });
  });
});
