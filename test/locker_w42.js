const VoterProxy = artifacts.require("VoterProxy");
const RewardFactory = artifacts.require("RewardFactory");
const VE3Token = artifacts.require("VE3Token");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const Booster = artifacts.require("Booster");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VE3DLocker = artifacts.require("VE3DLocker");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
const VeToken = artifacts.require("VeToken");
const IERC20 = artifacts.require("IERC20");
const ITokenMinter = artifacts.require("ITokenMinter");
const VirtualBalanceRewardPool = artifacts.require("VirtualBalanceRewardPool");
const ExtraRewardStashV3 = artifacts.require("ExtraRewardStashV3");

const { loadContracts, contractAddresseList, Networks } = require("./helper/dumpAddresses");
const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const feeDisrtroABI = require("./helper/feeDistroABI.json");
const pickle_gaugeProxyABI = require("./helper/gaugeProxyABI_pickle.json");
const gaugeProxyABI = require("./helper/gaugeProxyABI.json");
const { toBN, log } = require("./helper/utils");
const truffleAssert = require("truffle-assertions");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const { parseEther, formatEther, parseUnits, formatUnits } = require("@ethersproject/units");
const Reverter = require("./helper/reverter");
const BigNumber = require("bignumber.js");

contract("Locker", async (accounts) => {
    let vetokenMinter;
    let vetoken;
    let rFactory;
    let tFactory;
    let sFactory;
    let poolManager;
    let vetokenRewards;
    let veassetToken;
    let escrow;
    let feeDistro;
    let lpToken;
    let voterProxy;
    let booster;
    let veassetDepositer;
    let ve3Token;
    let ve3TokenRewardPool;
    let network;
    let feeToken;
    let stakerLockPool;
    let treasury;
    const reverter = new Reverter(web3);
    const wei = web3.utils.toWei;
    const USER1 = accounts[0];
    const USER2 = accounts[1];
    const poolId = 0;
    const FEE_DENOMINATOR = 10000;

    before("setup", async () => {
        network = await loadContracts();
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
        treasury = accounts[2];

        await reverter.snapshot();
    });

    afterEach("revert", reverter.revert);

    describe("Test lock contract", async () => {
        let depositAmount;
        let rewardPool;
        let exchangeToken;

        beforeEach("setup", async () => {
            depositAmount = await lpToken.balanceOf(USER1);
            await lpToken.approve(booster.address, depositAmount);
            exchangeToken = await IERC20.at((await booster.poolInfo(poolId))[1]);
            rewardPool = await BaseRewardPool.at((await booster.poolInfo(poolId))[3]);
        });

        it("Test lock contract", async () => {
            const poolId = 0;

            // deposit lpToken
            const poolInfo = JSON.stringify(await booster.poolInfo(poolId));
            const parsedPoolInfo = JSON.parse(poolInfo);
            const rewardPool = await BaseRewardPool.at(parsedPoolInfo.veAssetRewards);
            const lpTokenBalanceOfUserA = await lpToken.balanceOf(USER1);
            console.log("USER1 initial Lp token balance:" + formatEther(lpTokenBalanceOfUserA.toString()));
            await lpToken.approve(booster.address, lpTokenBalanceOfUserA);
            await booster.depositAll(0, true, { from: USER1 });
            console.log("deposit all lp token user A has...");

            // advance time
            await time.increase(10 * 86400);
            await time.advanceBlock();

            const advanceTime = async (secondsElaspse) => {
                await time.increase(secondsElaspse);
                await time.advanceBlock();
                console.log("\n  >>>>  advance time " + (secondsElaspse / 86400) + " days  >>>>\n");
            }

            const day = 86400;

            await rewardPool
                .balanceOf(USER1)
                .then((a) => console.log("user A lp rewardPool initial balance: " + formatEther(a.toString())));

            const veAssetBalance = await veassetToken.balanceOf(USER1);
            console.log("user A veAssetToken balance init:" + formatEther(veAssetBalance.toString()));
            await ve3Token
                .balanceOf(USER1)
                .then((a) => console.log("user A ve3token balance init: " + formatEther(a.toString())));
            await vetoken
                .balanceOf(USER1)
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
            console.log("USER2 veAssetToken balance:" + (await veassetToken.balanceOf(USER2)).toString());
            await booster.earmarkRewards(poolId, { from: USER2 });
            console.log("get lp token rewards by earmarkRewards() called by user B...");

            await time.increase(86400);
            await time.advanceBlock();
            const earned = (await rewardPool.earned(USER1)).toString();
            console.log("USER1 rewardPool earning: " + earned);

            console.log("USER1 veAssertToken before getReward():" + (await veassetToken.balanceOf(USER1)).toString());
            await rewardPool.getReward();

            // transfer veToken from USER1 to another USER2 to mock getting veToken from rewards or from market
            await vetoken.balanceOf(USER1).then((a) => console.log("USER1 veToken balance: " + formatEther(a.toString())));

            const vetokenBalance = await vetoken.balanceOf(USER1);
            await vetoken.approve(USER2, vetokenBalance, { from: USER1 });
            await vetoken.transfer(USER2, toBN(vetokenBalance).div(2));
            const stakingVetokenAmount = await vetoken.balanceOf(USER2);
            console.log("USER2 veToken balance init after getting from USER1: " + formatEther(stakingVetokenAmount.toString()));
            expect(Number(stakingVetokenAmount.toString())).to.greaterThan(0);


            await stakerLockPool.setApprovals();
            console.log("rewards and approvals set");
            var firstTime = await time.latest();
            //epoch length 604800
            let firstepoch = (Math.floor(firstTime / (86400 * 7))).toFixed(0) * (86400 * 7);
            console.log("first epoch: " + firstepoch);
            const currentEpoch = async () => {
                var currentTime = await time.latest();
                currentTime = (Math.floor(currentTime / (86400 * 7))).toFixed(0) * (86400 * 7)
                var epochIdx = ((currentTime - firstepoch) / (86400 * 7)).toFixed(0);
                console.log("current epoch: " + currentTime + ", " + epochIdx);
                return currentTime;
            }

            await stakerLockPool.epochCount().then(a => console.log("epoch count before: " + a))
            await stakerLockPool.checkpointEpoch();
            await stakerLockPool.epochCount().then(a => console.log("epoch count after: " + a))
            await stakerLockPool.checkpointEpoch();
            await stakerLockPool.epochCount().then(a => console.log("epoch count after2: " + a))

            const lockerInfo = async () => {
                await currentEpoch();
                console.log("\t==== locker info =====");
                await ve3Token.balanceOf(stakerLockPool.address).then(a => console.log("\t   ve3Token: " + a));
                await vetoken.balanceOf(stakerLockPool.address).then(a => console.log("\t   vetoken: " + a));
                var tsup = await stakerLockPool.totalSupply();
                var epochs = await stakerLockPool.epochCount();
                console.log("\t   epochs: " + epochs);
                for (var i = 0; i < epochs; i++) {
                    var epochdata = await stakerLockPool.epochs(i);
                    var epochTime = epochdata.date;
                    var epochSupply = epochdata.supply;
                    console.log("\t   voteSupplyAtEpoch(" + i + ") " + ", date: " + epochTime + "  sup: " + epochSupply);
                }
                console.log("\t----- locker info end -----");
            }
            var isShutdown = false;
            const userInfo = async (_user) => {
                var bal = await stakerLockPool.balanceOf(_user);
                console.log("\t   balanceOf: " + bal);
                await stakerLockPool.pendingLockOf(_user).then(a => console.log("\t   pending balance: " + a));
                await stakerLockPool.lockedBalanceOf(_user).then(a => console.log("\t   lockedBalanceOf: " + a));
                await stakerLockPool.lockedBalances(_user).then(a => console.log("\t   lockedBalances: " + a.total + ", " + a.unlockable + ", " + a.locked + "\n\t     lock data: " + JSON.stringify(a.lockData)));
                await stakerLockPool.balances(_user).then(a => console.log("\t   nextunlockIndex: " + a.nextUnlockIndex));
                await stakerLockPool.claimableRewards(_user).then(a => console.log("\t   claimableRewards: " + a));
                await ve3Token.balanceOf(_user).then(a => console.log("\t   ve3Token wallet: " + a));
                await vetoken.balanceOf(_user).then(a => console.log("\t   vetoken wallet: " + a));
                await vetokenRewards.balanceOf(_user).then(a => console.log("\t   vetokenRewards: " + a));
                var epochs = await stakerLockPool.epochCount();
                for (var i = 0; i < epochs; i++) {
                    var balAtE = await stakerLockPool.balanceAtEpochOf(i, _user);
                    var pendingAtE = await stakerLockPool.pendingLockAtEpochOf(i, _user);
                    console.log("\t   voteBalanceAtEpochOf(" + i + ") " + balAtE + ", pnd: " + pendingAtE);

                    //this check is a bit annoying if you dont checkpointEpoch..
                    if (!isShutdown && i == epochs - 2) {
                        assert(balAtE.toString() == bal.toString(), "balanceOf should be equal in value to the current epoch (" + i + ")");
                    }
                }
                console.log("\t---- user info: " + _user + "(" + _user + ") end ----");
            }

            await lockerInfo();
            await userInfo(USER1);

            console.log("start lock")
            var ve3TokenBalance = await ve3Token.balanceOf(USER1);
            await ve3Token.approve(stakerLockPool.address, ve3TokenBalance, { from: USER1 });
            var tx = await stakerLockPool.lock(USER1, web3.utils.toWei("1.0", "ether"), { from: USER1 });
            console.log("locked for USER1, gas: " + tx.receipt.gasUsed);
            await lockerInfo();
            await userInfo(USER1);


            //check that balanceOf increases after next epoch starts
            console.log("\n\n\n\n##### check weight start at next epoch..\n");
            for (var i = 0; i < 7; i++) {
                await advanceTime(day);
                await stakerLockPool.checkpointEpoch();
                await currentEpoch();
                await userInfo(USER1);
            }

            //check that lock expires after 16 epochs
            console.log("\n\n\n\n##### check lock length and expiry..\n");
            for (var i = 0; i < 16; i++) {
                await advanceTime(day * 7);
                await stakerLockPool.checkpointEpoch();
                await currentEpoch();
                await userInfo(USER1);
            }
            await lockerInfo();

            console.log("\n\n\n\n##### relock and normal lock and check epoch data\n");

            //move ahead an epoch just to see things more clearly
            await advanceTime(day * 7);
            await stakerLockPool.checkpointEpoch();
            await currentEpoch();

            //try relock and lock with order: relock -> lock
            //check relock goes to current epoch
            //check new lock goes to next epoch
            //check supply goes to correct epoch
            console.log("\n ->> relock then lock, relock to current and lock to next.");
            await stakerLockPool.processExpiredLocks(true, { from: USER1 });
            var tx = await stakerLockPool.lock(USER2, web3.utils.toWei("1.0", "ether"), { from: USER1 });
            console.log("locked for USER1, gas: " + tx.receipt.gasUsed);
            await userInfo(USER1);
            await lockerInfo();

            //try relock&lock with different order: lock -> relock
            //check relock goes to current epoch
            //check new lock goes to next epoch
            //check supply goes to correct epoch
            await advanceTime(day * 7 * 19);
            await stakerLockPool.checkpointEpoch();
            await currentEpoch();
            console.log("\n ->> lock then relock, relock to current and lock to next.");
            var tx = await stakerLockPool.lock(USER1, web3.utils.toWei("1.0", "ether"), 0, { from: USER1 });
            console.log("locked for user z, gas: " + tx.receipt.gasUsed);
            await stakerLockPool.processExpiredLocks(true, { from: USER1 });
            await userInfo(USER1);
            await lockerInfo();

            //try lock->advance 1 week-> relock (add weight to existing lock(current)) ->  lock (create new lock for next epoch)

            await advanceTime(day * 7 * 20);
            await stakerLockPool.checkpointEpoch();
            await currentEpoch();
            console.log("\n\n ->> lock, advance, relock, lock.");
            var tx = await stakerLockPool.lock(USER1, web3.utils.toWei("1.0", "ether"), 0, { from: USER1 });
            console.log("locked for user z, gas: " + tx.receipt.gasUsed);
            await advanceTime(day * 7);
            await currentEpoch();
            await stakerLockPool.processExpiredLocks(true, { from: USER1 });
            console.log("relocked")
            var tx = await stakerLockPool.lock(USER1, web3.utils.toWei("2.0", "ether"), 0, { from: USER1 });
            console.log("locked for user z, gas: " + tx.receipt.gasUsed);
            await currentEpoch();
            await userInfo(USER1);
            await lockerInfo();

            //rewards and distribute

            await vetokenRewards.getReward(USER1, true, true)

            await lockerInfo();
            await userInfo(USER1);

            await advanceTime(day);

            await lockerInfo();
            await userInfo(USER1);

            await advanceTime(day);

            var tx = await stakerLockPool.methods['getReward(address)'](USER1, { from: USER1 });
            console.log("get reward for user A");
            console.log("gas used: " + tx.receipt.gasUsed);

            await userInfo(USER1);
        });
    });
});
