const VoterProxy = artifacts.require("VoterProxy");
const RewardFactory = artifacts.require("RewardFactory");
const VE3Token = artifacts.require("VE3Token");
const VeAssetDepositor = artifacts.require("VeAssetDepositor");
const BaseRewardPool = artifacts.require("BaseRewardPool");
const Booster = artifacts.require("Booster");
const TokenFactory = artifacts.require("TokenFactory");
const StashFactory = artifacts.require("StashFactory");
const VE3DRewardPool = artifacts.require("VE3DRewardPool");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const PoolManager = artifacts.require("PoolManager");
const VeToken = artifacts.require("VeToken");
const IERC20 = artifacts.require("IERC20");
const VE3DLocker = artifacts.require("VE3DLocker");
const truffleAssert = require("truffle-assertions");

const { loadContracts, contractAddresseList, Networks } = require("./helper/dumpAddresses");
const { ether, balance, constants, time } = require("@openzeppelin/test-helpers");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const { toBN, log } = require("./helper/utils");
var jsonfile = require("jsonfile");
var baseContractList = jsonfile.readFileSync("contracts.json");
const Reverter = require("./helper/reverter");
const BigNumber = require("bignumber.js");
const pickleJar = require("./helper/pickleJarABI.json");
const uniswapV2Router = require("./helper/UniswapV2RouterABI.json");
const gaugeAngleABI = require("./helper/gaugeAngleABI.json");

contract("Booster LP Stake", async (accounts) => {
  let vetokenMinter;
  let vetoken;
  let rFactory;
  let tFactory;
  let sFactory;
  let poolManager;
  let vetokenRewards;
  let veassetToken;
  let ve3dLocker;
  let escrow;
  let feeDistro;
  let lpToken;
  let voterProxy;
  let booster;
  let veassetDepositer;
  let ve3Token;
  let ve3TokenRewardPool;
  const reverter = new Reverter(web3);
  const wei = web3.utils.toWei;
  const USER1 = accounts[0];
  const USER2 = accounts[1];
  const poolId = 0;
  const FEE_DENOMINATOR = 10000;
  let uniExchange;
  let sushiExchange;
  let network;
  let uniExchangeRouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  let sushiExchangeRouterAddress = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";

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
    // veasset contracts
    veassetToken = await IERC20.at(contractAddresseList[0]);
    escrow = await IERC20.at(contractAddresseList[1]);
    lpToken = await IERC20.at(contractAddresseList[2]);
    voterProxy = await VoterProxy.at(contractAddresseList[3]);
    booster = await Booster.at(contractAddresseList[4]);
    ve3Token = await VE3Token.at(contractAddresseList[5]);
    veassetDepositer = await VeAssetDepositor.at(contractAddresseList[6]);
    ve3TokenRewardPool = await BaseRewardPool.at(contractAddresseList[7]);
    feeDistro = await booster.feeDistro();
    uniExchange = new web3.eth.Contract(uniswapV2Router, uniExchangeRouterAddress);
    sushiExchange = new web3.eth.Contract(uniswapV2Router, sushiExchangeRouterAddress);
    ve3dLocker = await VE3DLocker.at(baseContractList.system.ve3dLocker);
    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("deposit", async () => {
    let depositAmount;
    let depositAmountTwo;
    let depositAmountThree;
    let depositAmountFour;
    let rewardPool;
    let earmarkIncentive;
    let lockIncentive;
    let stakerIncentive;

    beforeEach("setup", async () => {
      depositAmount = await lpToken.balanceOf(USER1);
      await lpToken.approve(booster.address, depositAmount);
      rewardPool = await BaseRewardPool.at((await booster.poolInfo(0))[3]);
      earmarkIncentive = toBN((await booster.earmarkIncentive()).toString());
      lockIncentive = toBN((await booster.lockIncentive()).toString());
      stakerIncentive = toBN((await booster.stakerIncentive()).toString());
    });

    it("deposit lp token 0 and check earned", async () => {
      await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
      await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
      await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
      await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));
      await booster.deposit(0, depositAmount, true);

      // increase time
      await time.increase(10 * 86400);
      await time.advanceBlock();
      log("we increased time (1)", "");

      await booster.earmarkRewards(0, { from: USER2 });
      log("earmarkRewards from user2 executed", "");
      // const veAssetRewardBalance = await veassetToken.balanceOf;
      await veassetToken.balanceOf(USER2).then((a) => log("veassetToken balance of user2:", formatEther(a.toString())));
      let rewardPoolBal = (await veassetToken.balanceOf(rewardPool.address)).toString();
      log("rewardPoolBalance (veassetToken balance):", formatEther(rewardPoolBal));

      await veassetToken
        .balanceOf(ve3TokenRewardPool.address)
        .then((a) => log("ve3TokenRewardPool balance:", formatEther(a.toString())));

      await veassetToken
        .balanceOf(vetokenRewards.address)
        .then((a) => log("veassetToken balance on vetokenRewards address:", formatEther(a.toString())));

      await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
      await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
      await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
      await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));

      //assert.equal((await rewardPool.earned(USER1)).toString(), 0);

      // increase time
      await time.increase(86400);
      await time.advanceBlock();
      log("increase time again and check earned (2)", "");
      const earned = (await rewardPool.earned(USER1)).toString();

      log("Earned:", formatEther(earned));
    });

    it("deposit lp tokens and check earned", async () => {
      if (network === Networks.angle) {
        await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
        await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
        await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
        await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));
        await booster.deposit(0, depositAmount, true);

        const poolInfo = JSON.stringify(await booster.poolInfo(1));
        const parsedPoolInfo = JSON.parse(poolInfo);
        const rewardPoolTwo = await BaseRewardPool.at(parsedPoolInfo.veAssetRewards);

        const poolInfoThree = JSON.stringify(await booster.poolInfo(2));
        const parsedPoolInfoThree = JSON.parse(poolInfoThree);
        const rewardPoolThree = await BaseRewardPool.at(parsedPoolInfoThree.veAssetRewards);

        const poolInfoFour = JSON.stringify(await booster.poolInfo(3));
        const parsedPoolInfoFour = JSON.parse(poolInfoFour);
        const rewardPoolFour = await BaseRewardPool.at(parsedPoolInfoFour.veAssetRewards);

        const lpTokenTwo = await IERC20.at(parsedPoolInfo.lptoken);
        const lpTokenThree = await IERC20.at(parsedPoolInfoThree.lptoken);
        const lpTokenFour = await IERC20.at(parsedPoolInfoFour.lptoken);

        const sanUSDC_EUR = await IERC20.at(contractAddresseList[10]);
        depositAmountTwo = await sanUSDC_EUR.balanceOf(contractAddresseList[11]);
        await sanUSDC_EUR.transfer(accounts[0], depositAmountTwo, {
          from: contractAddresseList[11],
        });
        const sanFEI_EUR = await IERC20.at(lpTokenThree.address);
        depositAmountThree = await sanFEI_EUR.balanceOf(contractAddresseList[14]);
        await sanFEI_EUR.transfer(accounts[0], depositAmountThree, {
          from: contractAddresseList[14],
        });
        const sanFRAX_EUR = await IERC20.at(lpTokenFour.address);
        depositAmountFour = await sanFRAX_EUR.balanceOf(contractAddresseList[15]);
        await sanFRAX_EUR.transfer(accounts[0], depositAmountFour, {
          from: contractAddresseList[15],
          gas: 80000,
        });
        const angle = await IERC20.at(contractAddresseList[0]);
        await angle.transfer("0x51fE22abAF4a26631b2913E417c0560D547797a7", web3.utils.toWei("1000"), {
          from: accounts[0],
        });
        await angle.transfer("0x7c0fF11bfbFA3cC2134Ce62034329a4505408924", web3.utils.toWei("1000"), {
          from: accounts[0],
        });
        await angle.transfer("0xb40432243E4F317cE287398e72Ab8f0312fc2FE8", web3.utils.toWei("1000"), {
          from: accounts[0],
        });
        await angle.transfer("0x3785Ce82be62a342052b9E5431e9D3a839cfB581", web3.utils.toWei("1000"), {
          from: accounts[0],
        });

        await lpTokenTwo.balanceOf(USER1).then((a) => log("lptokenTwo balance:", formatEther(a.toString())));
        const lpTokenTwoBalance = await lpTokenTwo.balanceOf(USER1);

        await lpTokenThree.balanceOf(USER1).then((a) => log("lptokenThree balance:", formatEther(a.toString())));
        const lpTokenThreeBalance = await lpTokenThree.balanceOf(USER1);

        await lpTokenFour.balanceOf(USER1).then((a) => log("lpTokenFour balance:", formatEther(a.toString())));
        const lpTokenFourBalance = await lpTokenFour.balanceOf(USER1);

        await lpTokenTwo.approve(booster.address, lpTokenTwoBalance);
        await booster.deposit(1, lpTokenTwoBalance, true);

        await lpTokenThree.approve(booster.address, lpTokenThreeBalance);
        await booster.deposit(2, lpTokenThreeBalance, true);

        await lpTokenFour.approve(booster.address, lpTokenFourBalance);
        await booster.deposit(3, lpTokenFourBalance, true);

        // increase time
        await time.increase(10 * 86400);
        await time.advanceBlock();
        log("we increased time (1)", "");

        await booster.earmarkRewards(0, { from: USER2 });
        await booster.earmarkRewards(1, { from: USER2 });
        await booster.earmarkRewards(2, { from: USER2 });
        await booster.earmarkRewards(3, { from: USER2 });

        log("earmarkRewards from user2 executed", "");
        // const veAssetRewardBalance = await veassetToken.balanceOf;
        await veassetToken
          .balanceOf(USER2)
          .then((a) => log("veassetToken balance of user2:", formatEther(a.toString())));
        let rewardPoolBal = (await veassetToken.balanceOf(rewardPool.address)).toString();
        log("rewardPoolBalance (veassetToken balance):", formatEther(rewardPoolBal));

        await veassetToken
          .balanceOf(ve3TokenRewardPool.address)
          .then((a) => log("ve3TokenRewardPool balance:", formatEther(a.toString())));

        await veassetToken
          .balanceOf(vetokenRewards.address)
          .then((a) => log("veassetToken balance on vetokenRewards address:", formatEther(a.toString())));

        await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
        await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
        await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
        await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));

        //assert.equal((await rewardPool.earned(USER1)).toString(), 0);

        // increase time
        await time.increase(86400);
        await time.advanceBlock();
        log("increase time again and check earned (2)", "");
        const earned = (await rewardPool.earned(USER1)).toString();

        log("Earned:", formatEther(earned));

        log("increase time again and check earned (2)", "");

        const earnedTwo = (await rewardPoolTwo.earned(USER1)).toString();
        log("EarnedTwo:", formatEther(earnedTwo));

        const earnedThree = (await rewardPoolThree.earned(USER1)).toString();
        log("EarnedThree:", formatEther(earnedThree));

        const earnedFour = (await rewardPoolFour.earned(USER1)).toString();
        log("EarnedFour:", formatEther(earnedFour));
      }
      if (network === Networks.pickle) {
        await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
        await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
        await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
        await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));
        await booster.deposit(0, depositAmount, true);

        const poolInfo = JSON.stringify(await booster.poolInfo(1));
        const parsedPoolInfo = JSON.parse(poolInfo);
        const rewardPoolTwo = await BaseRewardPool.at(parsedPoolInfo.veAssetRewards);

        const poolInfoThree = JSON.stringify(await booster.poolInfo(2));
        const parsedPoolInfoThree = JSON.parse(poolInfoThree);
        const rewardPoolThree = await BaseRewardPool.at(parsedPoolInfoThree.veAssetRewards);

        const poolInfoFour = JSON.stringify(await booster.poolInfo(3));
        const parsedPoolInfoFour = JSON.parse(poolInfoFour);
        const rewardPoolFour = await BaseRewardPool.at(parsedPoolInfoFour.veAssetRewards);

        const poolInfoFive = JSON.stringify(await booster.poolInfo(4));
        const parsedPoolInfoFive = JSON.parse(poolInfoFive);
        const rewardPoolFive = await BaseRewardPool.at(parsedPoolInfoFive.veAssetRewards);

        const poolInfoSix = JSON.stringify(await booster.poolInfo(5));
        const parsedPoolInfoSix = JSON.parse(poolInfoSix);
        const rewardPoolSix = await BaseRewardPool.at(parsedPoolInfoSix.veAssetRewards);

        const poolInfoSeven = JSON.stringify(await booster.poolInfo(6));
        const parsedPoolInfoSeven = JSON.parse(poolInfoSeven);
        const rewardPoolSeven = await BaseRewardPool.at(parsedPoolInfoSeven.veAssetRewards);

        const poolInfoEight = JSON.stringify(await booster.poolInfo(7));
        const parsedPoolInfoEight = JSON.parse(poolInfoEight);
        const rewardPoolEight = await BaseRewardPool.at(parsedPoolInfoEight.veAssetRewards);

        const poolInfoNine = JSON.stringify(await booster.poolInfo(8));
        const parsedPoolInfoNine = JSON.parse(poolInfoNine);
        const rewardPoolNine = await BaseRewardPool.at(parsedPoolInfoNine.veAssetRewards);

        const lpTokenTwo = await IERC20.at(parsedPoolInfo.lptoken);
        const lpTokenThree = await IERC20.at(parsedPoolInfoThree.lptoken);
        const lpTokenFour = await IERC20.at(parsedPoolInfoFour.lptoken);
        const lpTokenFive = await IERC20.at(parsedPoolInfoFive.lptoken);
        const lpTokenSix = await IERC20.at(parsedPoolInfoSix.lptoken);
        const lpTokenSeven = await IERC20.at(parsedPoolInfoSeven.lptoken);
        const lpTokenEight = await IERC20.at(parsedPoolInfoEight.lptoken);
        const lpTokenNine = await IERC20.at(parsedPoolInfoNine.lptoken);
        const uniMirUstLP = await IERC20.at(contractAddresseList[19]);
        const mir = await IERC20.at(contractAddresseList[20]);
        const ust = await IERC20.at(contractAddresseList[21]);
        const curvestETHLp = await IERC20.at(contractAddresseList[22]);
        const yfiSushiLp = await IERC20.at(contractAddresseList[23]);
        const yfi = await IERC20.at(contractAddresseList[24]);
        const wbtcSushiLp = await IERC20.at(contractAddresseList[25]);
        const wbtc = await IERC20.at(contractAddresseList[26]);
        const usdtSushiLp = await IERC20.at(contractAddresseList[27]);
        const usdcSushiLp = await IERC20.at(contractAddresseList[28]);
        const usdc = await IERC20.at(contractAddresseList[29]);
        const usdt = await IERC20.at(contractAddresseList[30]);
        const daiSushiLp = await IERC20.at(contractAddresseList[31]);
        const dai = await IERC20.at(contractAddresseList[32]);
        const yveCRVDAO = await IERC20.at(contractAddresseList[33]);
        const pickle = await IERC20.at(contractAddresseList[34]);
        const veCRVDAO = await IERC20.at(contractAddresseList[35]);
        const usdtBalancePre = await usdt.balanceOf(contractAddresseList[36]);
        const wbtcBalancePre = await wbtc.balanceOf(contractAddresseList[37]);
        await mir.transfer(USER1, web3.utils.toWei("100"), { from: contractAddresseList[38] }),
          "fund account[0] with mir";
        await ust.transfer(USER1, web3.utils.toWei("100"), { from: contractAddresseList[39] }),
          "fund account[0] with ust";
        await curvestETHLp.transfer(USER1, web3.utils.toWei("100"), { from: contractAddresseList[40] }),
          "fund account[0] with curvestETHLp";
        await yfi.transfer(USER1, web3.utils.toWei("100"), { from: contractAddresseList[41] }),
          "fund account[0] with yfi";
        await wbtc.transfer(USER1, wbtcBalancePre, { from: contractAddresseList[37] }), "fund account[0] with wbtc";
        await usdt.transfer(USER1, usdtBalancePre, { from: contractAddresseList[36] }), "fund account[0] with usdt";
        await dai.transfer(USER1, web3.utils.toWei("1000"), { from: contractAddresseList[43] }),
          "fund account[0] with dai";
        await veCRVDAO.transfer(USER1, web3.utils.toWei("100"), { from: contractAddresseList[44] }),
          "fund account[0] with veCRVDAO";
        await pickle.transfer(USER1, web3.utils.toWei("100"), { from: contractAddresseList[45] }),
          "fund account[0] with pickle";
        const weth = await IERC20.at(contractAddresseList[46]);
        await weth.transfer(USER1, web3.utils.toWei("500"), { from: contractAddresseList[47] });
        const wethBalance = await weth.balanceOf(USER1);
        await weth.balanceOf(USER1).then((a) => log("weth balance:", formatEther(a.toString())));
        const pickleBalance = await pickle.balanceOf(USER1);
        await pickle.balanceOf(USER1).then((a) => log("pickle balance:", formatEther(a.toString())));
        const veCRVDAOBalance = await veCRVDAO.balanceOf(USER1);
        await veCRVDAO.balanceOf(USER1).then((a) => log("veCRVDAO balance:", formatEther(a.toString())));
        let starttime = await time.latest();
        await weth.transfer(USER1, web3.utils.toWei("500"), { from: contractAddresseList[47] });
        await pickle.approve(uniExchangeRouterAddress, pickleBalance, { from: USER1 });
        await weth.approve(uniExchangeRouterAddress, wethBalance, { from: USER1 });
        await veCRVDAO.approve(sushiExchangeRouterAddress, veCRVDAOBalance, { from: USER1 });
        await uniExchange.methods
          .addLiquidity(weth.address, pickle.address, wethBalance, pickleBalance, 0, 0, USER1, starttime + 3000)
          .send({ from: USER1, gas: 300000 });
        const wethBalanceTwo = await weth.balanceOf(USER1);
        await weth.approve(sushiExchangeRouterAddress, wethBalanceTwo, { from: USER1 });
        await sushiExchange.methods
          .addLiquidity(weth.address, veCRVDAO.address, wethBalanceTwo, veCRVDAOBalance, 0, 0, USER1, starttime + 3000)
          .send({ from: USER1, gas: 300000 });
        await weth.transfer(USER1, web3.utils.toWei("500"), { from: contractAddresseList[47] });
        const wethBalanceThree = await weth.balanceOf(USER1);
        const daiBalance = await dai.balanceOf(USER1);
        await weth.approve(sushiExchangeRouterAddress, wethBalanceThree, { from: USER1 });
        await dai.approve(sushiExchangeRouterAddress, daiBalance, { from: USER1 });
        await sushiExchange.methods
          .addLiquidity(weth.address, dai.address, wethBalanceThree, daiBalance, 0, 0, USER1, starttime + 3000)
          .send({ from: USER1, gas: 300000 });
        await weth.transfer(USER1, web3.utils.toWei("500"), { from: contractAddresseList[47] });
        const wethBalanceFour = await weth.balanceOf(USER1);
        const usdcBalancePre = await usdc.balanceOf(contractAddresseList[36]);
        //await usdc.balanceOf(contractAddresseList[35]).then(a => log('usdc balance: ' + web3.utils.toWei(a)))
        await usdc.transfer(USER1, usdcBalancePre, { from: contractAddresseList[36] });
        const usdcBalance = await usdc.balanceOf(USER1);
        await usdc.approve(sushiExchangeRouterAddress, usdcBalance, { from: USER1 });
        await weth.approve(sushiExchangeRouterAddress, wethBalanceFour, { from: USER1 });
        await sushiExchange.methods
          .addLiquidity(weth.address, usdc.address, wethBalanceFour, usdcBalance, 0, 0, USER1, starttime + 3000)
          .send({ from: USER1, gas: 300000 });
        await weth.transfer(USER1, web3.utils.toWei("500"), { from: contractAddresseList[47] });
        const wethBalanceFive = await weth.balanceOf(USER1);
        const usdtBalance = await usdt.balanceOf(USER1);
        await usdt.approve(sushiExchangeRouterAddress, usdtBalance, { from: USER1 });
        await weth.approve(sushiExchangeRouterAddress, wethBalanceFive, { from: USER1 });
        await sushiExchange.methods
          .addLiquidity(weth.address, usdt.address, wethBalanceFive, usdtBalance, 0, 0, USER1, starttime + 3000)
          .send({ from: USER1, gas: 300000 });
        await weth.transfer(USER1, web3.utils.toWei("500"), { from: contractAddresseList[47] });
        const wethBalanceSix = await weth.balanceOf(USER1);
        const wbtcBalance = await wbtc.balanceOf(USER1);
        await wbtc.approve(sushiExchangeRouterAddress, wbtcBalance, { from: USER1 });
        await weth.approve(sushiExchangeRouterAddress, wethBalanceSix, { from: USER1 });
        await sushiExchange.methods
          .addLiquidity(weth.address, wbtc.address, wethBalanceSix, wbtcBalance, 0, 0, USER1, starttime + 3000)
          .send({ from: USER1, gas: 300000 });

        await weth.transfer(USER1, web3.utils.toWei("500"), { from: contractAddresseList[47] });
        const wethBalanceSeven = await weth.balanceOf(USER1);
        const yfiBalance = await yfi.balanceOf(USER1);
        await yfi.approve(sushiExchangeRouterAddress, yfiBalance, { from: USER1 });
        await weth.approve(sushiExchangeRouterAddress, wethBalanceSeven, { from: USER1 });
        await sushiExchange.methods
          .addLiquidity(weth.address, yfi.address, wethBalanceSeven, yfiBalance, 0, 0, USER1, starttime + 3000)
          .send({ from: USER1, gas: 300000 });

        const mirBalance = await mir.balanceOf(USER1);
        const ustBalance = await ust.balanceOf(USER1);
        await ust.approve(uniExchangeRouterAddress, ustBalance, { from: USER1 });
        await mir.approve(uniExchangeRouterAddress, mirBalance, { from: USER1 });
        await uniExchange.methods
          .addLiquidity(ust.address, mir.address, ustBalance, mirBalance, 0, 0, USER1, starttime + 3000)
          .send({ from: USER1, gas: 300000 });

        await lpTokenTwo.balanceOf(USER1).then((a) => log("lptokenTwo balance:", formatEther(a.toString())));
        await yveCRVDAO.balanceOf(USER1).then((a) => log("yveCRVDAO balance:", formatEther(a.toString())));
        await daiSushiLp.balanceOf(USER1).then((a) => log("daiSushiLp balance:", formatEther(a.toString())));
        await usdcSushiLp.balanceOf(USER1).then((a) => log("usdcSushiLp balance:", formatEther(a.toString())));
        await usdtSushiLp.balanceOf(USER1).then((a) => log("usdtSushiLp balance:", formatEther(a.toString())));
        await wbtcSushiLp.balanceOf(USER1).then((a) => log("wbtcSushiLp balance:", formatEther(a.toString())));
        await yfiSushiLp.balanceOf(USER1).then((a) => log("yfiSushiLp balance:", formatEther(a.toString())));
        await curvestETHLp.balanceOf(USER1).then((a) => log("curvestETHLp balance:", formatEther(a.toString())));
        await uniMirUstLP.balanceOf(USER1).then((a) => log("uniMirUstLP balance:", formatEther(a.toString())));
        const yveCRVDAOBalance = await yveCRVDAO.balanceOf(USER1);
        await yveCRVDAO.approve(lpTokenThree.address, yveCRVDAOBalance);
        const daiSushiLpBalance = await daiSushiLp.balanceOf(USER1);
        const usdcSushiLpBalance = await usdcSushiLp.balanceOf(USER1);
        const usdtSushiLpBalance = await usdtSushiLp.balanceOf(USER1);
        const wbtcSushiLpBalance = await wbtcSushiLp.balanceOf(USER1);
        const yfiSushiLpBalance = await yfiSushiLp.balanceOf(USER1);
        const curvestETHLpBalance = await curvestETHLp.balanceOf(USER1);
        const uniMirUstLPBalance = await uniMirUstLP.balanceOf(USER1);
        await daiSushiLp.approve(lpTokenFour.address, daiSushiLpBalance);
        await usdcSushiLp.approve(lpTokenFive.address, usdcSushiLpBalance);
        await usdtSushiLp.approve(lpTokenSix.address, usdtSushiLpBalance);
        await wbtcSushiLp.approve(lpTokenSeven.address, wbtcSushiLpBalance);
        await yfiSushiLp.approve(lpTokenEight.address, yfiSushiLpBalance);
        await curvestETHLp.approve(lpTokenNine.address, curvestETHLpBalance);
        //await uniMirUstLP.approve(lpTokenTen.address, uniMirUstLPBalance);
        const pickleJarThree = new web3.eth.Contract(pickleJar, lpTokenThree.address);
        await pickleJarThree.methods.deposit(yveCRVDAOBalance).send({ from: USER1, gas: 300000 });
        const pickleJarFour = new web3.eth.Contract(pickleJar, lpTokenFour.address);
        await pickleJarFour.methods.deposit(daiSushiLpBalance).send({ from: USER1, gas: 300000 });
        const pickleJarFive = new web3.eth.Contract(pickleJar, lpTokenFive.address);
        await pickleJarFive.methods.deposit(usdcSushiLpBalance).send({ from: USER1, gas: 300000 });
        const pickleJarSix = new web3.eth.Contract(pickleJar, contractAddresseList[14]);
        await pickleJarSix.methods.deposit(usdtSushiLpBalance).send({ from: USER1, gas: 300000 });
        const pickleJarSeven = new web3.eth.Contract(pickleJar, contractAddresseList[15]);
        await pickleJarSeven.methods.deposit(wbtcSushiLpBalance).send({ from: USER1, gas: 300000 });

        const pickleJarEight = new web3.eth.Contract(pickleJar, contractAddresseList[16]);
        await pickleJarEight.methods.deposit(yfiSushiLpBalance).send({ from: USER1, gas: 300000 });

        const pickleJarNine = new web3.eth.Contract(pickleJar, contractAddresseList[17]);
        await pickleJarNine.methods.deposit(curvestETHLpBalance).send({ from: USER1, gas: 300000 });

        //const pickleJarTen = new web3.eth.Contract(pickleJar, contractAddresseList[18]);
        //await pickleJarTen.methods.deposit(uniMirUstLPBalance).send({ from: USER1, gas: 300000 });

        const lpTokenTwoBalance = await lpTokenTwo.balanceOf(USER1);
        const lpTokenThreeBalance = await lpTokenThree.balanceOf(USER1);
        const lpTokenFourBalance = await lpTokenFour.balanceOf(USER1);
        const lpTokenFiveBalance = await lpTokenFive.balanceOf(USER1);
        const lpTokenSixBalance = await lpTokenSix.balanceOf(USER1);
        await lpTokenThree.balanceOf(USER1).then((a) => log("lpTokenThree balance:", formatEther(a.toString())));
        await lpTokenFour.balanceOf(USER1).then((a) => log("lpTokenFour balance:", formatEther(a.toString())));
        await lpTokenFive.balanceOf(USER1).then((a) => log("lpTokenFive balance:", formatEther(a.toString())));
        await lpTokenSix.balanceOf(USER1).then((a) => log("lpTokenFive balance:", formatEther(a.toString())));
        const lpTokenSevenBalance = await lpTokenSeven.balanceOf(USER1);
        await lpTokenSeven.balanceOf(USER1).then((a) => log("lpTokenSeven balance:", formatEther(a.toString())));

        const lpTokenEightBalance = await lpTokenEight.balanceOf(USER1);
        await lpTokenEight.balanceOf(USER1).then((a) => log("lpTokenEight balance:", formatEther(a.toString())));

        const lpTokenNineBalance = await lpTokenNine.balanceOf(USER1);
        await lpTokenNine.balanceOf(USER1).then((a) => log("lpTokenNine balance:", formatEther(a.toString())));

        //const lpTokenTenBalance = await lpTokenTen.balanceOf(USER1)
        //await lpTokenTen.balanceOf(USER1).then(a => log('lpTokenTen balance: ' + formatEther(a.toString())))

        await lpTokenTwo.approve(booster.address, lpTokenTwoBalance);
        await lpTokenThree.approve(booster.address, lpTokenThreeBalance);
        await lpTokenFour.approve(booster.address, lpTokenFourBalance);
        await lpTokenFive.approve(booster.address, lpTokenFiveBalance);
        await lpTokenSix.approve(booster.address, lpTokenSixBalance);
        await lpTokenSeven.approve(booster.address, lpTokenSevenBalance);

        await lpTokenEight.approve(booster.address, lpTokenEightBalance);

        await lpTokenNine.approve(booster.address, lpTokenNineBalance);

        //await lpTokenTen.approve(booster.address, lpTokenTenBalance);

        await booster.deposit(1, lpTokenTwoBalance, true);
        await booster.deposit(2, lpTokenThreeBalance, true);
        await booster.deposit(3, lpTokenFourBalance, true);
        await booster.deposit(4, lpTokenFiveBalance, true);
        await booster.deposit(5, lpTokenSixBalance, true);
        await booster.deposit(6, lpTokenSevenBalance, true);
        await booster.deposit(7, lpTokenEightBalance, true);
        await booster.deposit(8, lpTokenNineBalance, true);
        //await booster.deposit(10, lpTokenTenBalance, true);

        // increase time
        await time.increase(10 * 86400);
        await time.advanceBlock();
        log("we increased time (1)", "");

        await booster.earmarkRewards(0, { from: USER2 });
        await booster.earmarkRewards(1, { from: USER2 });
        await booster.earmarkRewards(2, { from: USER2 });
        await booster.earmarkRewards(3, { from: USER2 });
        await booster.earmarkRewards(4, { from: USER2 });
        await booster.earmarkRewards(5, { from: USER2 });
        await booster.earmarkRewards(6, { from: USER2 });
        await booster.earmarkRewards(7, { from: USER2 });
        await booster.earmarkRewards(8, { from: USER2 });
        //await booster.earmarkRewards(10, { from: USER2 });

        log("earmarkRewards from user2 executed", "");
        // const veAssetRewardBalance = await veassetToken.balanceOf;
        await veassetToken
          .balanceOf(USER2)
          .then((a) => log("veassetToken balance of user2:", formatEther(a.toString())));
        let rewardPoolBal = (await veassetToken.balanceOf(rewardPool.address)).toString();
        log("rewardPoolBalance (veassetToken balance):", formatEther(rewardPoolBal));

        await veassetToken
          .balanceOf(ve3TokenRewardPool.address)
          .then((a) => log("ve3TokenRewardPool balance:", formatEther(a.toString())));

        await veassetToken
          .balanceOf(vetokenRewards.address)
          .then((a) => log("veassetToken balance on vetokenRewards address:", formatEther(a.toString())));

        await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
        await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
        await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
        await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));

        //assert.equal((await rewardPool.earned(USER1)).toString(), 0);

        // increase time
        await time.increase(86400);
        await time.advanceBlock();
        log("increase time again and check earned (2)", "");
        const earned = (await rewardPool.earned(USER1)).toString();

        log("Earned:", formatEther(earned));

        const earnedTwo = (await rewardPoolTwo.earned(USER1)).toString();
        log("EarnedTwo:", formatEther(earnedTwo));

        const earnedThree = (await rewardPoolThree.earned(USER1)).toString();
        log("EarnedThree:", formatEther(earnedThree));

        const earnedFour = (await rewardPoolFour.earned(USER1)).toString();
        log("EarnedFour:", formatEther(earnedFour));

        const earnedFive = (await rewardPoolFive.earned(USER1)).toString();
        log("EarnedFive:", formatEther(earnedFive));

        const earnedSix = (await rewardPoolSix.earned(USER1)).toString();
        log("EarnedSix:", formatEther(earnedSix));

        const earnedSeven = (await rewardPoolSeven.earned(USER1)).toString();
        log("EarnedSeven:", formatEther(earnedSeven));

        const earnedEight = (await rewardPoolEight.earned(USER1)).toString();
        log("EarnedEight:", formatEther(earnedEight));

        const earnedNine = (await rewardPoolNine.earned(USER1)).toString();
        log("earnedNine:", formatEther(earnedNine));

        //const earnedTen = (await rewardPoolTen.earned(USER1)).toString();
        //log('earnedTen: ' + formatEther(earnedTen))
      }
      if (network === Networks.ribbon) {
        await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
        await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
        await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
        await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));
        await booster.deposit(0, depositAmount, true);

        const poolInfo = JSON.stringify(await booster.poolInfo(1));
        const parsedPoolInfo = JSON.parse(poolInfo);
        const rewardPoolTwo = await BaseRewardPool.at(parsedPoolInfo.veAssetRewards);

        const poolInfoThree = JSON.stringify(await booster.poolInfo(2));
        const parsedPoolInfoThree = JSON.parse(poolInfoThree);
        const rewardPoolThree = await BaseRewardPool.at(parsedPoolInfoThree.veAssetRewards);

        const poolInfoFour = JSON.stringify(await booster.poolInfo(3));
        const parsedPoolInfoFour = JSON.parse(poolInfoFour);
        const rewardPoolFour = await BaseRewardPool.at(parsedPoolInfoFour.veAssetRewards);

        const lpTokenTwo = await IERC20.at(parsedPoolInfo.lptoken);
        const lpTokenThree = await IERC20.at(parsedPoolInfoThree.lptoken);
        const lpTokenFour = await IERC20.at(parsedPoolInfoFour.lptoken);

        const btcThetaVault = await IERC20.at(lpTokenTwo.address);
        depositAmountTwo = await btcThetaVault.balanceOf(contractAddresseList[11]);
        await btcThetaVault.transfer(accounts[0], depositAmountTwo, {
          from: contractAddresseList[11],
          gas: 80000,
        });
        const stETH = await IERC20.at(lpTokenThree.address);
        depositAmountThree = await stETH.balanceOf(contractAddresseList[13]);
        await stETH.transfer(accounts[0], depositAmountThree, {
          from: contractAddresseList[13],
          gas: 80000,
        });
        const ethTheta = await IERC20.at(lpTokenFour.address);
        depositAmountFour = await ethTheta.balanceOf(contractAddresseList[15]);
        await ethTheta.transfer(accounts[0], depositAmountFour, {
          from: contractAddresseList[15],
          gas: 80000,
        });

        await lpTokenTwo.balanceOf(USER1).then((a) => log("lptokenTwo balance:", formatEther(a.toString())));
        const lpTokenTwoBalance = await lpTokenTwo.balanceOf(USER1);

        await lpTokenThree.balanceOf(USER1).then((a) => log("lptokenThree balance:", formatEther(a.toString())));
        const lpTokenThreeBalance = await lpTokenThree.balanceOf(USER1);

        await lpTokenFour.balanceOf(USER1).then((a) => log("lpTokenFour balance:", formatEther(a.toString())));
        const lpTokenFourBalance = await lpTokenFour.balanceOf(USER1);

        await lpTokenTwo.approve(booster.address, lpTokenTwoBalance);
        await booster.deposit(1, lpTokenTwoBalance, true);

        await lpTokenThree.approve(booster.address, lpTokenThreeBalance);
        await booster.deposit(2, lpTokenThreeBalance, true);

        await lpTokenFour.approve(booster.address, lpTokenFourBalance);
        await booster.deposit(3, lpTokenFourBalance, true);

        // increase time
        await time.increase(10 * 86400);
        await time.advanceBlock();
        log("we increased time (1)", "");

        await booster.earmarkRewards(0, { from: USER2 });
        await booster.earmarkRewards(1, { from: USER2 });
        await booster.earmarkRewards(2, { from: USER2 });
        await booster.earmarkRewards(3, { from: USER2 });
        log("earmarkRewards from user2 executed", "");
        // const veAssetRewardBalance = await veassetToken.balanceOf;
        await veassetToken
          .balanceOf(USER2)
          .then((a) => log("veassetToken balance of user2:", formatEther(a.toString())));
        let rewardPoolBal = (await veassetToken.balanceOf(rewardPool.address)).toString();
        log("rewardPoolBalance (veassetToken balance):", formatEther(rewardPoolBal));

        await veassetToken
          .balanceOf(ve3TokenRewardPool.address)
          .then((a) => log("ve3TokenRewardPool balance:", formatEther(a.toString())));

        await veassetToken
          .balanceOf(vetokenRewards.address)
          .then((a) => log("veassetToken balance on vetokenRewards address:", formatEther(a.toString())));

        await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
        await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
        await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
        await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));

        //assert.equal((await rewardPool.earned(USER1)).toString(), 0);

        // increase time
        await time.increase(86400);
        await time.advanceBlock();
        log("increase time again and check earned (2)", "");
        const earned = (await rewardPool.earned(USER1)).toString();

        log("Earned:", formatEther(earned));

        const earnedTwo = (await rewardPoolTwo.earned(USER1)).toString();
        log("EarnedTwo:", formatEther(earnedTwo));

        const earnedThree = (await rewardPoolThree.earned(USER1)).toString();
        log("EarnedThree:", formatEther(earnedThree));

        const earnedFour = (await rewardPoolFour.earned(USER1)).toString();
        log("EarnedFour:", formatEther(earnedFour));
      }
      if (network === Networks.idle) {
        await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
        await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
        await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
        await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));
        await booster.deposit(0, depositAmount, true);

        const poolInfo = JSON.stringify(await booster.poolInfo(1));
        const parsedPoolInfo = JSON.parse(poolInfo);
        const rewardPoolTwo = await BaseRewardPool.at(parsedPoolInfo.veAssetRewards);

        const poolInfoThree = JSON.stringify(await booster.poolInfo(2));
        const parsedPoolInfoThree = JSON.parse(poolInfoThree);
        const rewardPoolThree = await BaseRewardPool.at(parsedPoolInfoThree.veAssetRewards);

        const poolInfoFour = JSON.stringify(await booster.poolInfo(3));
        const parsedPoolInfoFour = JSON.parse(poolInfoFour);
        const rewardPoolFour = await BaseRewardPool.at(parsedPoolInfoFour.veAssetRewards);

        const lpTokenTwo = await IERC20.at(parsedPoolInfo.lptoken);
        const lpTokenThree = await IERC20.at(parsedPoolInfoThree.lptoken);
        const lpTokenFour = await IERC20.at(parsedPoolInfoFour.lptoken);

        const idleCvxalUSD3CRV = await IERC20.at(contractAddresseList[10]);
        depositAmountTwo = await idleCvxalUSD3CRV.balanceOf(contractAddresseList[11]);
        await idleCvxalUSD3CRV.transfer(accounts[0], web3.utils.toWei("1000"), {
          from: contractAddresseList[11],
          gas: 80000,
        });
        const idleCvxFRAX3CRV = await IERC20.at(lpTokenThree.address);
        depositAmountThree = await idleCvxFRAX3CRV.balanceOf(contractAddresseList[13]);
        await idleCvxFRAX3CRV.transfer(accounts[0], depositAmountThree, {
          from: contractAddresseList[13],
          gas: 80000,
        });
        const idleCvxMIM3LP3CRV = await IERC20.at(lpTokenFour.address);
        depositAmountFour = await idleCvxMIM3LP3CRV.balanceOf(contractAddresseList[15]);
        await idleCvxMIM3LP3CRV.transfer(accounts[0], depositAmountFour, {
          from: contractAddresseList[15],
          gas: 80000,
        });

        await lpTokenTwo.balanceOf(USER1).then((a) => log("lptokenTwo balance:", formatEther(a.toString())));
        const lpTokenTwoBalance = await lpTokenTwo.balanceOf(USER1);

        await lpTokenThree.balanceOf(USER1).then((a) => log("lptokenThree balance:", formatEther(a.toString())));
        const lpTokenThreeBalance = await lpTokenThree.balanceOf(USER1);

        await lpTokenFour.balanceOf(USER1).then((a) => log("lpTokenFour balance:", formatEther(a.toString())));
        const lpTokenFourBalance = await lpTokenFour.balanceOf(USER1);

        await lpTokenTwo.approve(booster.address, lpTokenTwoBalance);
        await booster.deposit(1, lpTokenTwoBalance, true);

        await lpTokenThree.approve(booster.address, lpTokenThreeBalance);
        await booster.deposit(2, lpTokenThreeBalance, true);

        await lpTokenFour.approve(booster.address, lpTokenFourBalance);
        await booster.deposit(3, lpTokenFourBalance, true);

        // increase time
        await time.increase(10 * 86400);
        await time.advanceBlock();
        log("we increased time (1)", "");

        await booster.earmarkRewards(0, { from: USER2 });
        await booster.earmarkRewards(1, { from: USER2 });
        await booster.earmarkRewards(2, { from: USER2 });
        await booster.earmarkRewards(3, { from: USER2 });
        log("earmarkRewards from user2 executed", "");
        // const veAssetRewardBalance = await veassetToken.balanceOf;
        await veassetToken
          .balanceOf(USER2)
          .then((a) => log("veassetToken balance of user2:", formatEther(a.toString())));
        let rewardPoolBal = (await veassetToken.balanceOf(rewardPool.address)).toString();
        log("rewardPoolBalance (veassetToken balance):", formatEther(rewardPoolBal));

        await veassetToken
          .balanceOf(ve3TokenRewardPool.address)
          .then((a) => log("ve3TokenRewardPool balance:", formatEther(a.toString())));

        await veassetToken
          .balanceOf(vetokenRewards.address)
          .then((a) => log("veassetToken balance on vetokenRewards address:", formatEther(a.toString())));

        await veassetToken.balanceOf(USER1).then((a) => log("veassetToken balance:", formatEther(a.toString())));
        await ve3Token.balanceOf(USER1).then((a) => log("ve3token balance:", formatEther(a.toString())));
        await vetoken.balanceOf(USER1).then((a) => log("vetoken balance:", formatEther(a.toString())));
        await lpToken.balanceOf(USER1).then((a) => log("lptoken balance:", formatEther(a.toString())));

        //assert.equal((await rewardPool.earned(USER1)).toString(), 0);

        // increase time
        await time.increase(86400);
        await time.advanceBlock();
        log("increase time again and check earned (2)", "");
        const earned = (await rewardPool.earned(USER1)).toString();

        log("Earned:", formatEther(earned));

        const earnedTwo = (await rewardPoolTwo.earned(USER1)).toString();
        log("EarnedTwo:", formatEther(earnedTwo));

        const earnedThree = (await rewardPoolThree.earned(USER1)).toString();
        log("EarnedThree:", formatEther(earnedThree));

        const earnedFour = (await rewardPoolFour.earned(USER1)).toString();
        log("EarnedFour:", formatEther(earnedFour));
      }
    });

    it("check setRewardContracts (check for address zero)", async () => {
      await booster.setRewardContracts(
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000"
      );
      await truffleAssert.reverts(
        booster.setRewardContracts(
          "0x0000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000"
        ),
        "Not Fail"
      );
      // Seems not failing at all!
    });

    it("check setFeeInfo (try to set more than FEE_DENOMINATOR)", async () => {
      await truffleAssert.reverts(booster.setFeeInfo(toBN(10001), toBN(0)), "status 0");
      // Seems not failing at all!
    });

    it("angle scaling factor withdraw (test), also check earned", async () => {
      if (network === Networks.angle) {
        const poolInfo = JSON.stringify(await booster.poolInfo(4));
        const parsedPoolInfo = JSON.parse(poolInfo);
        const rewardPool = await BaseRewardPool.at(parsedPoolInfo.veAssetRewards);
        const lpTokenWithScaleFactor = await IERC20.at(parsedPoolInfo.lptoken);
        const GUNI = await IERC20.at(lpTokenWithScaleFactor.address);
        const depositAmountlpTokenWithScaleFactor = await GUNI.balanceOf("0x1F427A6FCdb95A7393C58552093e10A932890FA8");
        await GUNI.transfer(accounts[0], depositAmountlpTokenWithScaleFactor, {
          from: "0x1F427A6FCdb95A7393C58552093e10A932890FA8",
        });
        const angleGaugeWithScale = new web3.eth.Contract(gaugeAngleABI, parsedPoolInfo.gauge);
        const scalingFactor = await angleGaugeWithScale.methods.scaling_factor().call({ from: USER1, gas: 300000 });
        await lpTokenWithScaleFactor
          .balanceOf(USER1)
          .then((a) => log("G-UNI (token with scaling_factor) balance:", (a * 10 ** 18) / scalingFactor));
        const lpTokenWithScaleFactorBalance = await lpTokenWithScaleFactor.balanceOf(USER1);
        await lpTokenWithScaleFactor.balanceOf(USER1).then((a) => log("G-UNI balance:", formatEther(a.toString())));
        await lpTokenWithScaleFactor.approve(booster.address, lpTokenWithScaleFactorBalance);
        await booster.deposit(4, lpTokenWithScaleFactorBalance, true);

        // increase time
        await time.increase(10 * 86400);
        await time.advanceBlock();
        log("we increased time (1)", "");

        await booster.earmarkRewards(4, { from: USER2 });

        // increase time
        await time.increase(86400);
        await time.advanceBlock();
        log("increase time again and check earned (2)", "");

        const earned = (await rewardPool.earned(USER1)).toString();
        log("Earned:", formatEther(earned));

        await rewardPool.withdraw(lpTokenWithScaleFactorBalance, false);
        assert.equal((await rewardPool.balanceOf(USER1)).toString(), 0);

        await booster.withdraw(4, lpTokenWithScaleFactorBalance, { from: USER1 });
        // await booster.withdrawAll(4, { from: USER1 }); // reverts as well
        log("Withdraw lptoken from G-UNI (token with scaling_factor) Gauge (with scaling factor)", "");
        await lpTokenWithScaleFactor
          .balanceOf(USER1)
          .then((a) => log("G-UNI (token with scaling_factor) balance:", (a * 10 ** 18) / scalingFactor));
        await lpTokenWithScaleFactor.balanceOf(USER1).then((a) => log("G-UNI balance:", formatEther(a.toString())));
        const depositAmountlpTokenAfterWithdraw = await GUNI.balanceOf(USER1);
        assert.notEqual(depositAmountlpTokenAfterWithdraw.toString(), 0);
      }
    });
  });
});
