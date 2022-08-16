const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const { loadContracts, contractAddresseList } = require("./helper/dumpAddresses");
const pickleProxyABI = require("./helper/gaugeProxyABI_pickle.json");
const gaugeProxyABI = require("./helper/gaugeProxyABI.json");
const { hashMessage } = require("@ethersproject/hash");

const Reverter = require("./helper/reverter");
const BigNumber = require("bignumber.js");

const Booster = artifacts.require("Booster");
const VoterProxy = artifacts.require("VoterProxy");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VE3Token = artifacts.require("VE3Token");
const VeToken = artifacts.require("VeToken");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const IERC20 = artifacts.require("IERC20");

const IVoting = artifacts.require("IVoting");

function toBN(number) {
  return new BigNumber(number);
}

contract("Voting Test", async (accounts) => {
  let vetoken;
  let vetokenRewards;
  let veassetToken;
  let lpToken;
  let voterProxy;
  let booster;
  let veassetDepositor;
  let ve3Token;
  let ve3TokenRewardPool;
  let vote;
  let votestart;
  let controller;
  const reverter = new Reverter(web3);
  const eip1271MagicValue = "0x1626ba7e";

  const data = {
    data: {
      vote: {
        id: "QmeU7ct9Y4KLrh6F6mbT1eJNMkeQKMSnSujEfMCfbRLCMp",
        voter: "0x96176C25803Ce4cF046aa74895646D8514Ea1611",
        created: 1621183227,
        proposal: {
          id: "QmPvbwguLfcVryzBRrbY4Pb9bCtxURagdv1XjhtFLf3wHj",
        },
        choice: 1,
        space: {
          id: "spookyswap.eth",
        },
      },
    },
  };

  const msg = JSON.stringify(data);
  const hash = hashMessage(msg);
  const invalidHash = hashMessage(JSON.stringify({ ...data, version: "faux" }));

  before("setup", async () => {
    await loadContracts();
    vetoken = await VeToken.at(baseContractList.system.vetoken);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
    veassetToken = await IERC20.at(contractAddresseList[0]);
    lpToken = await IERC20.at(contractAddresseList[2]);
    voterProxy = await VoterProxy.at(contractAddresseList[3]);
    booster = await Booster.at(contractAddresseList[4]);
    ve3Token = await VE3Token.at(contractAddresseList[5]);
    veassetDepositor = await VeAssetDepositor.at(contractAddresseList[6]);
    ve3TokenRewardPool = await BaseRewardPool.at(contractAddresseList[7]);

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  it("Test gauge weight voting functions", async () => {
    const userA = accounts[0];
    const userB = accounts[8];
    const controllerAddress = await voterProxy.gaugeProxy();
    console.log("controller, gauge controller address", controllerAddress);

    const poolId = 0;
    const poolInfo = JSON.stringify(await booster.poolInfo(poolId));
    const parsedPoolInfo = JSON.parse(poolInfo);

    //deposit veAsset
    const veAssetBalanceBefore = await veassetToken.balanceOf(userA);
    console.log("userA veasset balance:", veAssetBalanceBefore.toString());
    await veassetToken.approve(veassetDepositor.address, veAssetBalanceBefore, {
      from: userA,
    });
    await veassetDepositor.deposit(toBN(veAssetBalanceBefore).idiv(2), true, ve3TokenRewardPool.address, {
      from: userA,
    });

    const veAssetBalanceAfter = await veassetToken.balanceOf(userA);
    console.log("userA veasset balance after:", veAssetBalanceAfter.toString());
    await veassetToken.balanceOf(veassetDepositor.address).then((a) => console.log("depositor veassetToken: " + a));
    await veassetToken.balanceOf(voterProxy.address).then((a) => console.log("voterProxy veassetToken: " + a));

    await time.increase(86400);
    await time.advanceBlock();
    console.log("advance time....");

    // test gauge weight voting
    console.log("gauge weight testing...");

    // case 1: vote as non-delegate(revert)
    await expectRevert(booster.voteGaugeWeight([parsedPoolInfo.gauge], [10000], { from: userB }), "revert");
    // case 2: vote as delegate
    // PICKLE: https://etherscan.io/address/0x2e57627ACf6c1812F99e274d0ac61B786c19E74f#readContract

    if (controllerAddress == "0x2e57627ACf6c1812F99e274d0ac61B786c19E74f") {
      // check to make sure our voterProxy has dill(vePickle) so it can vote.
      const vePickleAddress = "0xbBCf169eE191A1Ba7371F30A1C344bFC498b29Cf";
      const vePickle = await IERC20.at(vePickleAddress);
      await vePickle.balanceOf(veassetDepositor.address).then((a) => console.log("depositor vePickle: " + a));
      await vePickle.balanceOf(voterProxy.address).then((a) => console.log("voterProxy vePickle >0: " + a));

      // show that weight power has changed
      const pickleProxyControllerContract = new web3.eth.Contract(pickleProxyABI, controllerAddress);
      const totalWeightBefore = await pickleProxyControllerContract.methods.totalWeight().call();
      console.log("totalWeightBefore: " + totalWeightBefore.toString());
      await booster.voteGaugeWeight([lpToken.address], [10000]);
      const totalWeightAfter = await pickleProxyControllerContract.methods.totalWeight().call();
      const votes = await pickleProxyControllerContract.methods.votes(voterProxy.address, lpToken.address).call();
      console.log("votes: " + votes);
      console.log("totalWeightAfter: " + totalWeightAfter);
      assert.isAbove(Number(totalWeightAfter - totalWeightBefore), 0);
    }

    // IDLE: https://etherscan.io/address/0xaC69078141f76A1e257Ee889920d02Cc547d632f#readContract
    // Angle: https://etherscan.io/address/0x9aD7e7b0877582E14c17702EecF49018DD6f2367
    else {
      let controller = new web3.eth.Contract(gaugeProxyABI, controllerAddress);
      console.log("lptokenGauge info:", parsedPoolInfo.gauge);
      var voteInfoBefore = await controller.methods.vote_user_slopes(voterProxy.address, parsedPoolInfo.gauge).call();
      console.log("gauge weight power before: " + voteInfoBefore[1]);
      await booster.voteGaugeWeight([parsedPoolInfo.gauge], [10]);
      const voteInfoAfter = await controller.methods.vote_user_slopes(voterProxy.address, parsedPoolInfo.gauge).call();
      console.log("gauge weight power after: " + voteInfoAfter[1]);
      assert.isAbove(Number(voteInfoAfter[1] - voteInfoBefore[1]), 0);
    }
  });

  it("test snapshot voting with a valid hash", async () => {
    const voteSinger = accounts[5];
    const voteDelegateSigner = accounts[0];
    const sig = await web3.eth.sign(msg, voteSinger);
    await booster.setVote(hash, true, { from: voteDelegateSigner });
    let isValid = await voterProxy.isValidSignature(hash, sig);
    expect(isValid).to.equal(eip1271MagicValue);

    await booster.setVote(hash, false, { from: voteDelegateSigner });
    isValid = await voterProxy.isValidSignature(invalidHash, sig);
    expect(isValid).to.equal("0xffffffff");
  });

  it("test snapshot voting with an invalid hash", async () => {
    const voteSinger = accounts[4];
    const voteDelegateSigner = accounts[0];
    const sig = await web3.eth.sign(msg, voteSinger);
    await booster.setVote(hash, true, { from: voteDelegateSigner });
    const isValid = await voterProxy.isValidSignature(invalidHash, sig);
    expect(isValid).to.equal("0xffffffff");
  });
});
