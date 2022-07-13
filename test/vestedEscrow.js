const VestedEscrow = artifacts.require('VestedEscrow');
const VeToken = artifacts.require('VeToken');
const VE3DRewardPool = artifacts.require('VE3DRewardPool');

const {time, constants} = require('@openzeppelin/test-helpers');
const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');

function toBN(number) {
  return new BigNumber(number);
}

contract.only('VestedEscrow', async (accounts) => {
  let ve3d;
  let vestedEscrow;
  let startTime;
  let endTime;
  let ve3dRewardPool;

  const TOTAL_TIME = 1.5 * 365 * 86400; // 1,5 years

  const admin = accounts[0];
  const fundAdmin = accounts[1];
  const userA = accounts[2];
  const userB = accounts[3];

  const toWei = web3.utils.toWei;

  beforeEach('setup', async () => {
    ve3d = await VeToken.new({from: admin});
    await ve3d.mint(admin, toWei('1000000'), {from: admin});
    startTime = Number(await time.latest()) + 1000;
    endTime = startTime + TOTAL_TIME;

    ve3dRewardPool = await VE3DRewardPool.new(ve3d.address, admin, {from: admin});

    vestedEscrow = await VestedEscrow.new(
        ve3d.address,
        startTime,
        endTime,
        ve3dRewardPool.address,
        fundAdmin,
    );
  });

  describe('setter', () => {
    describe('#setAdmin', () => {
      it('it reverts if caller is not admin', async () => {
        await truffleAssert.reverts(
            vestedEscrow.setAdmin(userA, {from: userA}),
            '!auth',
        );
      });

      it('it reverts if new fundAdmin is address(0)', async () => {
        await truffleAssert.reverts(
            vestedEscrow.setAdmin(constants.ZERO_ADDRESS, {from: admin}),
            '!zero address',
        );
      });

      it('it sets new fundAdmin', async () => {
        await vestedEscrow.setAdmin(userA, {from: admin});

        assert.equal(await vestedEscrow.admin(), userA);
      });
    });

    describe('#setFundAdmin', () => {
      it('it reverts if caller is not admin', async () => {
        await truffleAssert.reverts(
            vestedEscrow.setFundAdmin(userA, {from: userA}),
            '!auth',
        );
      });

      it('it reverts if new fundAdmin is address(0)', async () => {
        await truffleAssert.reverts(
            vestedEscrow.setFundAdmin(constants.ZERO_ADDRESS, {from: admin}),
            '!zero address',
        );
      });

      it('it sets new admin', async () => {
        await vestedEscrow.setFundAdmin(userA, {from: admin});

        assert.equal(await vestedEscrow.fundAdmin(), userA);
      });
    });

    describe('#setStartTime', () => {
      it('it reverts if caller is not admin', async () => {
        await truffleAssert.reverts(
            vestedEscrow.setStartTime(startTime + 100, {from: userA}),
            '!auth',
        );
      });

      it('it reverts if new startTime is earlier than current time', async () => {
        await truffleAssert.reverts(
            vestedEscrow.setStartTime(startTime - 2000, {from: admin}),
            'start must be future',
        );
      });

      it('it sets new startTime', async () => {
        await vestedEscrow.setStartTime(startTime + 100, {from: admin});

        assert.equal(await vestedEscrow.startTime(), startTime + 100);
      });
    });
  });

  describe('fund and claim', () => {
    const amountUserA = toWei('100');
    const amountUserB = toWei('50');
    const totalAmount = toBN(amountUserA).plus(amountUserB);

    beforeEach(async () => {
      await ve3d.approve(vestedEscrow.address, constants.MAX_UINT256, {
        from: admin,
      });

      await vestedEscrow.addTokens(totalAmount, {from: admin});

    });

    describe('#fund', () => {
      it('it adds tokens to the contract', async () => {
        await vestedEscrow.addTokens(totalAmount, {from: admin});
      });

      it('it reverts if caller is not admin', async () => {
        await truffleAssert.reverts(
            vestedEscrow.fund([userA], [amountUserA], {from: userA}),
            '!auth',
        );
      });

      it('it reverts if input arguments have invalid length', async () => {
        await truffleAssert.reverts(
            vestedEscrow.fund([userA, userB], [amountUserA], {from: admin}),
            '!arr',
        );
      });

      it('it reverts if amount is zero', async () => {
        await truffleAssert.reverts(
            vestedEscrow.fund([userA, userB], [amountUserA, 0], {from: admin}),
            '!zero amount',
        );
      });

      it('it funds reward tokens for multiple recipients', async () => {
        await vestedEscrow.fund([userA, userB], [amountUserA, amountUserB], {
          from: admin,
        });

        assert.equal(
            await ve3d.balanceOf(vestedEscrow.address),
            toBN(amountUserA).plus(amountUserB).toString(),
        );
      });

      it('it updates lockedOf of recipients', async () => {
        await vestedEscrow.fund([userA, userB], [amountUserA, amountUserB], {
          from: admin,
        });

        assert.equal(await vestedEscrow.lockedOf(userA), amountUserA);
        assert.equal(await vestedEscrow.lockedOf(userB), amountUserB);
      });

      it('it emits event', async () => {
        const tx = await vestedEscrow.fund(
            [userA, userB],
            [amountUserA, amountUserB],
            {
              from: admin,
            },
        );

        truffleAssert.eventEmitted(tx, 'Fund', (ev) => {
          return ev.recipient === userA && ev.reward.toString() === amountUserA;
        });

        truffleAssert.eventEmitted(tx, 'Fund', (ev) => {
          return ev.recipient === userB && ev.reward.toString() === amountUserB;
        });
      });
    });

    describe('#claim', () => {
      beforeEach(async () => {
        await vestedEscrow.fund([userA, userB], [amountUserA, amountUserB], {
          from: admin,
        });
      });

      // it("it reverts if no pending reward", async () => {
      //   await truffleAssert.reverts(
      //       vestedEscrow.claim({ from: userA }),
      //       "no reward"
      //   );
      // });

      it('it claims pending reward', async () => {
        await time.increase('2000');

        await vestedEscrow.claim(userA, {
          from: userA,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(amountUserA)
            .times(elapsed)
            .dividedToIntegerBy(TOTAL_TIME);

        assert.equal(await ve3d.balanceOf(userA), claimed.toString());
      });

      it('it updates totalClaimed for recipient', async () => {
        await time.increase('2000');

        await vestedEscrow.claim(userA, {
          from: userA,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(amountUserA)
            .times(elapsed)
            .dividedToIntegerBy(TOTAL_TIME);

        assert.equal(
            await vestedEscrow.totalClaimed(userA),
            claimed.toString(),
        );
      });

      it('it claims maximum allocation after vesting ends', async () => {
        await time.increase((TOTAL_TIME + 2000).toString());

        await vestedEscrow.claim(userA, {
          from: userA,
        });

        assert.equal(await ve3d.balanceOf(userA), amountUserA);
      });

      it('it emits event', async () => {
        await time.increase('2000');

        const tx = await vestedEscrow.claim(userA, {
          from: userA,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(amountUserA)
            .times(elapsed)
            .dividedToIntegerBy(TOTAL_TIME);

        truffleAssert.eventEmitted(tx, 'Claim', (ev) => {
          return (
              ev.user === userA && ev.amount.toString() === claimed.toString()
          );
        });
      });
    });

    describe('#claimAndStake', () => {
      beforeEach(async () => {
        await vestedEscrow.fund([userA, userB], [amountUserA, amountUserB], {
          from: admin,
        });
      });

      it('it claims and stakes pending reward', async () => {

        await time.increase('2000');

        await vestedEscrow.claimAndStake({
          from: userA,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(amountUserA)
            .times(elapsed)
            .dividedToIntegerBy(TOTAL_TIME);

        const stakeAmount = await ve3dRewardPool.balanceOf(userA);
        assert.equal(stakeAmount, claimed.toString());
      });

      it('it updates totalClaimed for recipient', async () => {
        await time.increase('2000');

        await vestedEscrow.claimAndStake({
          from: userA,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(amountUserA)
            .times(elapsed)
            .dividedToIntegerBy(TOTAL_TIME);

        assert.equal(
            await vestedEscrow.totalClaimed(userA),
            claimed.toString(),
        );
      });

      it('it claims and stakes maximum allocation after vesting ends', async () => {
        await time.increase((TOTAL_TIME + 2000).toString());

        await vestedEscrow.claim(userA, {
          from: userA,
        });

        assert.equal(await ve3d.balanceOf(userA), amountUserA);
      });

      it('it emits event', async () => {
        await time.increase('2000');

        const tx = await vestedEscrow.claimAndStake({
          from: userA,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(amountUserA)
            .times(elapsed)
            .dividedToIntegerBy(TOTAL_TIME);

        truffleAssert.eventEmitted(tx, 'Claim', (ev) => {
          return (
              ev.user === userA && ev.amount.toString() === claimed.toString()
          );
        });
      });
    });

    describe('#overview', () => {
      beforeEach(async () => {
        await vestedEscrow.fund([userA, userB], [amountUserA, amountUserB], {
          from: admin,
        });
      });

      it("should claim unlock over time, claim and stake", async () => {
        let blockTime = await time.latest();
        while(blockTime <= endTime){
          await time.increase(35*86400);
          await time.advanceBlock();
          await time.advanceBlock();
          await time.advanceBlock();

          await time.latest().then(a=>console.log("advance time..."+a));
          await vestedEscrow.totalTime().then(a=>console.log("vesting total time: " +a));
          await vestedEscrow.initialLockedSupply().then(a=>console.log("vesting initialLockedSupply: " +a));
          await vestedEscrow.unallocatedSupply().then(a=>console.log("vesting unallocatedSupply: " +a));
          await vestedEscrow.vestedSupply().then(a=>console.log("vesting vestedSupply: " +a));

          await vestedEscrow.lockedOf(userA).then(a=>console.log("userA locked: " +a))
          await vestedEscrow.balanceOf(userA).then(a=>console.log("userA balance: " +a))
          await vestedEscrow.vestedOf(userA).then(a=>console.log("userA vested: " +a))

          await vestedEscrow.lockedOf(userB).then(a=>console.log("userB locked: " +a))
          await vestedEscrow.balanceOf(userB).then(a=>console.log("userB balance: " +a))
          await vestedEscrow.vestedOf(userB).then(a=>console.log("userB vested: " +a))
          console.log("----------------------------");
          blockTime = await time.latest();
        }

        await vestedEscrow.claim(userA);
        await ve3d.balanceOf(userA).then(a=>console.log("User A ve3d in wallet: " +a))

        await vestedEscrow.claimAndStake({from:userB})
        await ve3dRewardPool.balanceOf(userB).then(a=>console.log("User B ve3d staked: " +a))
      });
    });
  });
});
