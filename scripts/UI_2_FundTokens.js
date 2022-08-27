const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const IERC20 = artifacts.require("IERC20");
const VeTokenMinter = artifacts.require("VeTokenMinter");
const BigNumber = require("bignumber.js");

function toBN(number) {
  return new BigNumber(number);
}

module.exports = async (deployer, network) => {
  let accounts = await web3.eth.getAccounts();
  let vetokenMinter = await VeTokenMinter.at(contractList.system.vetokenMinter);
  const admin = accounts[0];

  const lp_tokens = [
    //idle token
    "0x875773784Af8135eA0ef43b5a374AaD105c5D39e",
    // angle token
    "0x31429d1856aD1377A8A0079410B297e1a9e214c2",
    //idle lp tokens
    "0x2688FC68c4eac90d9E5e1B94776cF14eADe8D877",
    "0x790E38D85a364DD03F682f5EcdC88f8FF7299908",
    "0x15794DA4DCF34E674C18BbFAF4a67FF6189690F5",
    "0xFC96989b3Df087C96C806318436B16e44c697102",
    "0x158e04225777BBEa34D2762b5Df9eBD695C158D2",
    // angle Lp tokens
    "0x7B8E89b0cE7BAC2cfEC92A371Da899eA8CBdb450",
    "0x9C215206Da4bf108aE5aEEf9dA7caD3352A36Dad",
    "0x5d8D3Ac6D21C016f9C935030480B7057B21EC804",
    "0xb3B209Bb213A5Da5B947C56f2C770b3E1015f1FE",
    "0xEDECB43233549c51CC3268b5dE840239787AD56c",
  ];

  const vetokenUsers = [
    "0xaa5e721A6a8B1F61e5976a30B908D7F7f0798677",
    "0x820745B3742652fD4C071989981FFb3a1F247eDA",
    "0xD60c0F6c7CDdb96181E3B707191AF66AC9f44d36",
    "0x8b4CB11e1D2dfb2840409c693428642FE0952565",
    "0x2E0e8dD6564e6104dB924dCD8d3AE78096489EeA",
  ];

  for (var i = vetokenUsers.length - 1; i >= 0; i--) {
    //fund ethers
    await web3.eth.sendTransaction({ from: admin, to: vetokenUsers[i], value: web3.utils.toWei("10") });

    // fund vetoken
    await vetokenMinter.withdraw(vetokenUsers[i], web3.utils.toWei("1000"), {
      from: admin,
    });

    for (var j = 0; j < lp_tokens.length; j++) {
      const lpToken = await IERC20.at(lp_tokens[j]);
      const balance = (await lpToken.balanceOf(admin)).toString();

      const amount = toBN(balance)
        .idiv(i + 1)
        .toFixed();

      await lpToken.transfer(vetokenUsers[i], amount, {
        from: admin,
      });

      console.log("user balance==> " + vetokenUsers[i] + " ", (await lpToken.balanceOf(vetokenUsers[i])).toString());
    }
  }
  process.exit(1);
};
