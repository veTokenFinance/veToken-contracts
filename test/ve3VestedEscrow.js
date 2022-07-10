const Ve3VestedEscrow = artifacts.require("Ve3VestedEscrow");
const VeToken = artifacts.require("VeToken");

const { time, constants } = require("@openzeppelin/test-helpers");
const truffleAssert = require("truffle-assertions");
const BigNumber = require("bignumber.js");

function toBN(number) {
  return new BigNumber(number);
}

contract("Ve3VestedEscrow", async (accounts) => {
  let ve3d;
  let vestedEscrow;
  let startTime;

  const TOTAL_TIME = 3600 * 24 * 365 * 1.5; // 1.5 years

  const funder = accounts[0];
  const admin = accounts[1];
  const alice = accounts[2];
  const bob = accounts[3];

  const toWei = web3.utils.toWei;

  beforeEach("setup", async () => {
    ve3d = await VeToken.new({ from: funder });
    await ve3d.mint(funder, toWei("1000000"), {from: funder})
    startTime = Number(await time.latest()) + 1000;

    vestedEscrow = await Ve3VestedEscrow.new(
      ve3d.address,
      admin,
      funder,
      startTime,
      TOTAL_TIME
    );
  });

  describe("setter", () => {
    describe("#setAdmin", () => {
      it("it reverts if caller is not admin", async () => {
        await truffleAssert.reverts(
          vestedEscrow.setAdmin(alice, { from: alice }),
          "!auth"
        );
      });

      it("it reverts if new admin is address(0)", async () => {
        await truffleAssert.reverts(
          vestedEscrow.setAdmin(constants.ZERO_ADDRESS, { from: admin }),
          "!zero address"
        );
      });

      it("it sets new admin", async () => {
        await vestedEscrow.setAdmin(alice, { from: admin });

        assert.equal(await vestedEscrow.admin(), alice);
      });

      it("it emits event", async () => {
        const tx = await vestedEscrow.setAdmin(alice, { from: admin });

        truffleAssert.eventEmitted(tx, "AdminChanged", (ev) => {
          return ev.newAdmin === alice;
        });
      });
    });

    describe("#setFunder", () => {
      it("it reverts if caller is not admin", async () => {
        await truffleAssert.reverts(
          vestedEscrow.setFunder(alice, { from: alice }),
          "!auth"
        );
      });

      it("it reverts if new admin is address(0)", async () => {
        await truffleAssert.reverts(
          vestedEscrow.setFunder(constants.ZERO_ADDRESS, { from: admin }),
          "!zero address"
        );
      });

      it("it sets new funder", async () => {
        await vestedEscrow.setFunder(alice, { from: admin });

        assert.equal(await vestedEscrow.funder(), alice);
      });

      it("it emits event", async () => {
        const tx = await vestedEscrow.setFunder(alice, { from: admin });

        truffleAssert.eventEmitted(tx, "FunderChanged", (ev) => {
          return ev.newFunder === alice;
        });
      });
    });

    describe("#setStartTime", () => {
      it("it reverts if caller is not admin", async () => {
        await truffleAssert.reverts(
          vestedEscrow.setStartTime(startTime + 100, { from: alice }),
          "!auth"
        );
      });

      it("it reverts if new startTime is earlier than current time", async () => {
        await truffleAssert.reverts(
          vestedEscrow.setStartTime(startTime - 2000, { from: admin }),
          "start must be future"
        );
      });

      it("it sets new startTime", async () => {
        await vestedEscrow.setStartTime(startTime + 100, { from: admin });

        assert.equal(await vestedEscrow.startTime(), startTime + 100);
      });

      it("it emits event", async () => {
        const tx = await vestedEscrow.setStartTime(startTime + 100, {
          from: admin,
        });

        truffleAssert.eventEmitted(tx, "StartTimeChanged", (ev) => {
          return Number(ev.newStartTime) === startTime + 100;
        });
      });
    });
  });

  describe("fund and claim", () => {
    const aliceAmount = toWei("100");
    const bobAmount = toWei("50");

    beforeEach(async () => {
      await ve3d.approve(vestedEscrow.address, constants.MAX_UINT256, {
        from: funder,
      });
    });

    describe("#fund", () => {
      it("it reverts if caller is not funder", async () => {
        await truffleAssert.reverts(
          vestedEscrow.fund([alice], [aliceAmount], { from: alice }),
          "!funder"
        );
      });

      it("it reverts if input arguments have invalid length", async () => {
        await truffleAssert.reverts(
          vestedEscrow.fund([alice, bob], [aliceAmount], { from: funder }),
          "!arr"
        );
      });

      it("it reverts if vesting already started", async () => {
        await time.increase("3000");

        await truffleAssert.reverts(
          vestedEscrow.fund([alice], [aliceAmount], { from: funder }),
          "already started"
        );
      });

      it("it reverts if amount is zero", async () => {
        await truffleAssert.reverts(
          vestedEscrow.fund([alice, bob], [aliceAmount, 0], { from: funder }),
          "!zero amount"
        );
      });

      it("it funds reward tokens for multiple recipients", async () => {
        await vestedEscrow.fund([alice, bob], [aliceAmount, bobAmount], {
          from: funder,
        });

        assert.equal(
          await ve3d.balanceOf(vestedEscrow.address),
          toBN(aliceAmount).plus(bobAmount).toString()
        );
      });

      it("it updates totalLocked of recipients", async () => {
        await vestedEscrow.fund([alice, bob], [aliceAmount, bobAmount], {
          from: funder,
        });

        assert.equal(await vestedEscrow.totalLocked(alice), aliceAmount);
        assert.equal(await vestedEscrow.totalLocked(bob), bobAmount);
      });

      it("it updates initialised", async () => {
        await vestedEscrow.fund([alice, bob], [aliceAmount, bobAmount], {
          from: funder,
        });

        assert.equal(await vestedEscrow.initialised(), true);
      });

      it("it emits event", async () => {
        const tx = await vestedEscrow.fund(
          [alice, bob],
          [aliceAmount, bobAmount],
          {
            from: funder,
          }
        );

        truffleAssert.eventEmitted(tx, "Funded", (ev) => {
          return ev.recipient === alice && ev.reward.toString() === aliceAmount;
        });

        truffleAssert.eventEmitted(tx, "Funded", (ev) => {
          return ev.recipient === bob && ev.reward.toString() === bobAmount;
        });
      });

      it("it reverts if already initialised", async () => {
        await vestedEscrow.fund([alice], [aliceAmount], {
          from: funder,
        });

        await truffleAssert.reverts(
          vestedEscrow.fund([alice], [aliceAmount], {
            from: funder,
          }),
          "initialised already"
        );
      });
    });

    describe("#claim", () => {
      beforeEach(async () => {
        await vestedEscrow.fund([alice, bob], [aliceAmount, bobAmount], {
          from: funder,
        });
      });

      it("it reverts if no pending reward", async () => {
        await truffleAssert.reverts(
          vestedEscrow.claim({ from: alice }),
          "no reward"
        );
      });

      it("it claims pending reward", async () => {
        await time.increase("2000");

        await vestedEscrow.claim({
          from: alice,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(aliceAmount)
          .times(elapsed)
          .dividedToIntegerBy(TOTAL_TIME);

        assert.equal(await ve3d.balanceOf(alice), claimed.toString());
      });

      it("it updates totalClaimed for recipient", async () => {
        await time.increase("2000");

        await vestedEscrow.claim({
          from: alice,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(aliceAmount)
          .times(elapsed)
          .dividedToIntegerBy(TOTAL_TIME);

        assert.equal(
          await vestedEscrow.totalClaimed(alice),
          claimed.toString()
        );
      });

      it("it claims maximum allocation after vesting ends", async () => {
        await time.increase((TOTAL_TIME + 2000).toString());

        await vestedEscrow.claim({
          from: alice,
        });

        assert.equal(await ve3d.balanceOf(alice), aliceAmount);
      });

      it("it emits event", async () => {
        await time.increase("2000");

        const tx = await vestedEscrow.claim({
          from: alice,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(aliceAmount)
          .times(elapsed)
          .dividedToIntegerBy(TOTAL_TIME);

        truffleAssert.eventEmitted(tx, "Claim", (ev) => {
          return (
            ev.user === alice && ev.amount.toString() === claimed.toString()
          );
        });
      });
    });

    describe("#cancel", () => {
      beforeEach(async () => {
        await vestedEscrow.fund([alice, bob], [aliceAmount, bobAmount], {
          from: funder,
        });
      });

      it("it reverts if caller is not admin", async () => {
        await truffleAssert.reverts(
          vestedEscrow.cancel(alice, { from: alice }),
          "!auth"
        );
      });

      it("it reverts if no tokens locked", async () => {
        await truffleAssert.reverts(
          vestedEscrow.cancel(funder, { from: admin }),
          "!funding"
        );
      });

      it("it cancels vesting", async () => {
        await vestedEscrow.cancel(alice, { from: admin });

        assert.equal(await vestedEscrow.totalLocked(alice), "0");
      });

      it("it transfers remaining tokens to admin address", async () => {
        await vestedEscrow.cancel(alice, { from: admin });

        assert.equal(await ve3d.balanceOf(admin), aliceAmount);
      });

      it("it claimes current pending balance to recipient", async () => {
        await time.increase("2000");

        await vestedEscrow.cancel(alice, {
          from: admin,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(aliceAmount)
          .times(elapsed)
          .dividedToIntegerBy(TOTAL_TIME);

        assert.equal(await ve3d.balanceOf(alice), claimed.toString());
        assert.equal(
          await ve3d.balanceOf(admin),
          toBN(aliceAmount).minus(claimed).toString()
        );
      });

      it("it emits event", async () => {
        await time.increase("2000");

        const tx = await vestedEscrow.cancel(alice, {
          from: admin,
        });

        truffleAssert.eventEmitted(tx, "Cancelled", (ev) => {
          return ev.recipient === alice;
        });
      });
    });
  });
});
