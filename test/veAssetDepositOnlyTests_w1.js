const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const { loadContracts, contractAddresseList } = require("./helper/dumpAddresses");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const Reverter = require("./helper/reverter");
const BigNumber = require("bignumber.js");

const VoterProxy = artifacts.require("VoterProxy");
const RewardFactory = artifacts.require("RewardFactory");
const VE3Token = artifacts.require("VE3Token");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const VirtualBalanceRewardPool = artifacts.require("VirtualBalanceRewardPool");
const Booster = artifacts.require("Booster");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
const VeToken = artifacts.require("VeToken");
const IERC20 = artifacts.require("IERC20");

function toBN(number) {
  return new BigNumber(number);
}

contract("Deposit and Withdraw Test", async (accounts) => {
  let vetokenMinter;
  let vetoken;
  let rFactory;
  let tFactory;
  let sFactory;
  let poolManager;
  let vetokenRewards;
  let veassetToken;
  let escrow;
  let lpToken;
  let feeDistro;
  let voterProxy;
  let booster;
  let veassetDepositer;
  let ve3Token;
  let ve3TokenRewardPool;
  const reverter = new Reverter(web3);
  const wei = web3.utils.toWei;
  const USER1 = accounts[0];
  const FEE_DENOMINATOR = 10000;

  before("setup", async () => {
    await loadContracts();
    // basic contract
    vetokenMinter = await VeTokenMinter.at(baseContractList.system.vetokenMinter);
    vetoken = await VeToken.at(baseContractList.system.vetoken);
    rFactory = await RewardFactory.at(baseContractList.system.rFactory);
    tFactory = await TokenFactory.at(baseContractList.system.tFactory);
    sFactory = await StashFactory.at(baseContractList.system.sFactory);
    poolManager = await PoolManager.at(baseContractList.system.poolManager);
    vetokenRewards = await VE3DRewardPool.at(baseContractList.system.vetokenRewards);
    // veasset contracts
    veassetToken = await IERC20.at(contractAddresseList[0]);
    escrow = await IERC20.at(contractAddresseList[1]);
    lpToken = await IERC20.at(contractAddresseList[2]);
    voterProxy = await VoterProxy.at(contractAddresseList[3]);
    booster = await Booster.at(contractAddresseList[4]);
    ve3Token = await VE3Token.at(contractAddresseList[5]);
    veassetDepositer = await VeAssetDepositor.at(contractAddresseList[6]);
    ve3TokenRewardPool = await BaseRewardPool.at(contractAddresseList[7]);

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  it("Deposit veAsset, get ve3Token", async () => {
    //userA account has veAsset token and lp token for pid=0
    const userA = accounts[0];
    const depositAmount = wei("10");
    const depositAmount2 = wei("5");
    const lockRewardsPoolAddress = await booster.lockRewards();
    const ve3DillRewardPool = await BaseRewardPool.at(lockRewardsPoolAddress); //cvxCrvRewards, ve3Token rewards(veAsset)

    expect(lockRewardsPoolAddress).to.equal(contractAddresseList[7]);

    const ve3TokenBalanceBefore = await ve3Token.balanceOf(userA);
    const veTokenBalanceBefore = await vetoken.balanceOf(userA);
    const ve3DillRewardPoolBalanceOfUserABefore = await ve3DillRewardPool.balanceOf(userA);

    // approve and deposit pickle, return ve3Asset
    await veassetToken.approve(veassetDepositer.address, depositAmount, {
      from: userA,
    });
    console.log("Our address " + userA + " was approved");
    await veassetDepositer.deposit(depositAmount, false);

    const ve3TokenBalanceAfter = await ve3Token.balanceOf(userA);
    const veTokenBalanceAfter = await vetoken.balanceOf(userA);
    const ve3DillRewardPoolBalanceOfUserAAfter = await ve3DillRewardPool.balanceOf(userA);
    //todo: should user get ve3Token if deposit only?
    const ve3TokenFromDepositing = (ve3TokenBalanceAfter - ve3TokenBalanceBefore).toString();
    console.log("ve3Token from depositing veAsset:", ve3TokenFromDepositing);
    expect(ve3TokenFromDepositing).to.equal(web3.utils.toWei("9.99"));
    console.log("veToken from depositing veAsset:", (veTokenBalanceAfter - veTokenBalanceBefore).toString());
    expect((veTokenBalanceAfter - veTokenBalanceBefore).toString()).to.equal(web3.utils.toWei("0"));
    console.log(
      "ve3Token rewardPool user balance: ",
      (ve3DillRewardPoolBalanceOfUserAAfter - ve3DillRewardPoolBalanceOfUserABefore).toString()
    );
    expect((ve3DillRewardPoolBalanceOfUserAAfter - ve3DillRewardPoolBalanceOfUserABefore).toString()).to.equal(
      web3.utils.toWei("0")
    );

    // deposit again
    await veassetToken.approve(veassetDepositer.address, depositAmount2, {
      from: userA,
    });
    await veassetDepositer.deposit(depositAmount2, false);

    const ve3TokenBalanceAfter2 = await ve3Token.balanceOf(userA);
    expect((ve3TokenBalanceAfter2 - ve3TokenBalanceAfter).toString()).to.equal(web3.utils.toWei("4.995"));

    const incentiveVeAsset = await veassetDepositer.incentiveVeAsset();
    console.log("incentiveVeAsset : ", incentiveVeAsset.toString());
    expect(incentiveVeAsset.toString()).to.equal(web3.utils.toWei("0.015"));
  });
});
