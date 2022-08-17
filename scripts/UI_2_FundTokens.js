const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const IERC20 = artifacts.require("IERC20");
const BigNumber = require("bignumber.js");

function toBN(number) {
  return new BigNumber(number);
}

module.exports = async (deployer, network) => {
  let accounts = await web3.eth.getAccounts();

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
    "0x68fFd42b61D7E97d1b4C63BB9f7671e816dc9B26",
    "0x8f6b2f88D67383a87db3Dbd0d34FdeD296c1A1c4",
    "0xa29c577390b48dB5cfb42263A3ce2bdD8fE1B364",
    "0xa51D79fC646874f7Bd6a9c25A19a875eCbbc7d29",
  ];

  for (var i = vetokenUsers.length - 1; i >= 0; i--) {
    for (var j = 0; j < lp_tokens.length; j++) {
      const lpToken = await IERC20.at(lp_tokens[j]);
      const balance = (await lpToken.balanceOf(admin)).toString();
      console.log("balance=>>>", balance);
      console.log(i);
      const amount = toBN(balance)
        .idiv(i + 1)
        .toFixed();
      console.log("amount=>>>", amount);
      await lpToken.transfer(vetokenUsers[i], amount, {
        from: admin,
      });

      console.log("user balance==> " + vetokenUsers[i] + " ", (await lpToken.balanceOf(vetokenUsers[i])).toString());
    }
  }
};
