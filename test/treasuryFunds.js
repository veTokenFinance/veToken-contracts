const VeToken = artifacts.require('VeToken');
const TreasuryFunds = artifacts.require('TreasuryFunds');

const truffleAssert = require('truffle-assertions');
const Reverter = require('./helper/reverter');

contract('TreasuryFunds', async (accounts) => {
  let ve3d;
  let treasuryFunds;

  const admin = accounts[0];
  const fundAdmin = accounts[1];
  const userA = accounts[2];
  const userB = accounts[3];

  const reverter = new Reverter(web3);

  const toWei = web3.utils.toWei;

  before('setup', async () => {
    ve3d = await VeToken.new({from: admin});
    await ve3d.mint(admin, toWei('1000000'), {from: admin});

    treasuryFunds = await TreasuryFunds.new(admin, {from: admin});
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

  describe('execute functions from contract', () => {

    beforeEach(async () => {
      await ve3d.transfer(treasuryFunds.address, toWei('100'), {from: admin});
    });

    it('reverts when someone other than the operator tries to execute a function from within the contract', async () => {
      const amount = toWei('10');

      const call = ve3d.contract.methods.transfer(userA, amount).encodeABI();

      await truffleAssert.reverts(
          treasuryFunds.execute(ve3d.address, 0, call, {from: userA}),
          '!auth',
      );
    });

    it('executes a function from within the contract', async () => {
      const amount = toWei('10');

      const call = ve3d.contract.methods.transfer(userA, amount).encodeABI();

      await treasuryFunds.execute(ve3d.address, 0, call, {from: admin});

      assert.equal(await ve3d.balanceOf(userA), amount);
    });
  });
});
