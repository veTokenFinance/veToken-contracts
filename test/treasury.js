const Treasury = artifacts.require("Treasury");
const VE3Token = artifacts.require("VE3Token");

const { time, constants } = require("@openzeppelin/test-helpers");
const truffleAssert = require("truffle-assertions");
const BigNumber = require("bignumber.js");

function toBN(number) {
  return new BigNumber(number);
}

contract("Treasury", async (accounts) => {
  let ve3Token;
  let treasury;
  let startTime;

  const TOTAL_TIME = 3600 * 24 * 365; // 1 year

  const funder = accounts[0];
  const admin = accounts[1];
  const alice = accounts[2];

  const toWei = web3.utils.toWei;

  beforeEach("setup", async () => {
    ve3Token = await VE3Token.new("VE3", "VE3", { from: funder });
    await ve3Token.mint(funder, toWei("1000000"), {from: funder})
    startTime = Number(await time.latest()) + 1000;

    treasury = await Treasury.new(
      ve3Token.address,
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
          treasury.setAdmin(alice, { from: alice }),
          "!auth"
        );
      });

      it("it reverts if new admin is address(0)", async () => {
        await truffleAssert.reverts(
          treasury.setAdmin(constants.ZERO_ADDRESS, { from: admin }),
          "!zero address"
        );
      });

      it("it sets new admin", async () => {
        await treasury.setAdmin(alice, { from: admin });

        assert.equal(await treasury.admin(), alice);
      });

      it("it emits event", async () => {
        const tx = await treasury.setAdmin(alice, { from: admin });

        truffleAssert.eventEmitted(tx, "AdminChanged", (ev) => {
          return ev.newAdmin === alice;
        });
      });
    });

    describe("#setFunder", () => {
      it("it reverts if caller is not admin", async () => {
        await truffleAssert.reverts(
          treasury.setFunder(alice, { from: alice }),
          "!auth"
        );
      });

      it("it reverts if new admin is address(0)", async () => {
        await truffleAssert.reverts(
          treasury.setFunder(constants.ZERO_ADDRESS, { from: admin }),
          "!zero address"
        );
      });

      it("it sets new funder", async () => {
        await treasury.setFunder(alice, { from: admin });

        assert.equal(await treasury.funder(), alice);
      });

      it("it emits event", async () => {
        const tx = await treasury.setFunder(alice, { from: admin });

        truffleAssert.eventEmitted(tx, "FunderChanged", (ev) => {
          return ev.newFunder === alice;
        });
      });
    });
  });

  describe("fund and claim", () => {
    const fundAmount = toWei("100");

    beforeEach(async () => {
      await ve3Token.approve(treasury.address, constants.MAX_UINT256, {
        from: funder,
      });
    });

    describe("#fund", () => {
      it("it reverts if caller is not funder", async () => {
        await truffleAssert.reverts(
          treasury.fund(fundAmount, { from: alice }),
          "!funder"
        );
      });

      it("it reverts if vesting already started", async () => {
        await time.increase("3000");

        await truffleAssert.reverts(
          treasury.fund(fundAmount, { from: funder }),
          "already started"
        );
      });

      it("it reverts if amount is zero", async () => {
        await truffleAssert.reverts(
          treasury.fund(0, { from: funder }),
          "!zero amount"
        );
      });

      it("it funds reward token", async () => {
        await treasury.fund(fundAmount, {
          from: funder,
        });

        assert.equal(await ve3Token.balanceOf(treasury.address), fundAmount);
      });

      it("it updates totalLocked", async () => {
        await treasury.fund(fundAmount, {
          from: funder,
        });

        assert.equal(await treasury.totalLocked(), fundAmount);
      });

      it("it emits event", async () => {
        const tx = await treasury.fund(fundAmount, {
          from: funder,
        });

        truffleAssert.eventEmitted(tx, "Funded", (ev) => {
          return ev.reward.toString() === fundAmount;
        });
      });

      it("it reverts if already initialised", async () => {
        await treasury.fund(fundAmount, {
          from: funder,
        });

        await truffleAssert.reverts(
          treasury.fund(fundAmount, {
            from: funder,
          }),
          "initialised already"
        );
      });
    });

    describe("#claim", () => {
      beforeEach(async () => {
        await treasury.fund(fundAmount, {
          from: funder,
        });
      });

      it("it reverts if caller is not admin", async () => {
        await truffleAssert.reverts(treasury.claim({ from: alice }), "!auth");
      });

      it("it reverts if no pending reward", async () => {
        await truffleAssert.reverts(
          treasury.claim({ from: admin }),
          "no reward"
        );
      });

      it("it claims pending reward", async () => {
        await time.increase("2000");

        await treasury.claim({
          from: admin,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(fundAmount)
          .times(elapsed)
          .dividedToIntegerBy(TOTAL_TIME);

        assert.equal(await ve3Token.balanceOf(admin), claimed.toString());
      });

      it("it updates totalClaimed", async () => {
        await time.increase("2000");

        await treasury.claim({
          from: admin,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(fundAmount)
          .times(elapsed)
          .dividedToIntegerBy(TOTAL_TIME);

        assert.equal(await treasury.totalClaimed(), claimed.toString());
      });

      it("it claims maximum allocation after vesting ends", async () => {
        await time.increase((TOTAL_TIME + 2000).toString());

        await treasury.claim({
          from: admin,
        });

        assert.equal(await ve3Token.balanceOf(admin), fundAmount);
      });

      it("it emits event", async () => {
        await time.increase("2000");

        const tx = await treasury.claim({
          from: admin,
        });

        const currentTime = Number(await time.latest());
        const elapsed = currentTime - startTime;

        const claimed = toBN(fundAmount)
          .times(elapsed)
          .dividedToIntegerBy(TOTAL_TIME);

        truffleAssert.eventEmitted(tx, "Claim", (ev) => {
          return (
            ev.user === admin && ev.amount.toString() === claimed.toString()
          );
        });
      });
    });
  });
});
