var jsonfile = require("jsonfile");
var contractList = jsonfile.readFileSync("contracts.json");
let contractAddresseList = [];

const Networks = {
  pickle: 0,
  curve: 1,
  ribbon: 2,
  idle: 3,
  angle: 4,
  balancer: 5,
};

async function loadContracts() {
  networkId = await web3.eth.net.getId();
  //pickle
  if (networkId == "80001") {
    contractAddresseList.push(contractList.system.pickle_address);
    contractAddresseList.push(contractList.system.pickle_escrow);
    contractAddresseList.push(contractList.system.pickle_lptoken);
    contractAddresseList.push(contractList.system.pickle_voterProxy);
    contractAddresseList.push(contractList.system.pickle_booster);
    contractAddresseList.push(contractList.system.ve3_pickle);
    contractAddresseList.push(contractList.system.pickle_depositor);
    contractAddresseList.push(contractList.system.pickle_ve3TokenRewardPool);
    contractAddresseList.push(contractList.system.pickle_feedistro);
    contractAddresseList.push(contractList.system.pickle_feedistro_admin);

    contractAddresseList.push("0xdc98556ce24f007a5ef6dc1ce96322d65832a819"); //10
    contractAddresseList.push("0x5Eff6d166D66BacBC1BF52E2C54dD391AE6b1f48");
    contractAddresseList.push("0x55282dA27a3a02ffe599f6D11314D239dAC89135");
    contractAddresseList.push("0x8c2D16B7F6D3F989eb4878EcF13D695A7d504E43");
    contractAddresseList.push("0xa7a37aE5Cb163a3147DE83F15e15D8E5f94D6bCE");
    contractAddresseList.push("0xde74b6c547bd574c3527316a2eE30cd8F6041525");
    contractAddresseList.push("0x3261D9408604CC8607b687980D40135aFA26FfED");
    contractAddresseList.push("0x77C8A58D940a322Aea02dBc8EE4A30350D4239AD");
    contractAddresseList.push("0x3Bcd97dCA7b1CED292687c97702725F37af01CaC"); //18
    contractAddresseList.push("0x87dA823B6fC8EB8575a235A824690fda94674c88");
    contractAddresseList.push("0x09a3EcAFa817268f77BE1283176B946C4ff2E608");
    contractAddresseList.push("0xa47c8bf37f92aBed4A126BDA807A7b7498661acD");
    contractAddresseList.push("0x06325440D014e39736583c165C2963BA99fAf14E");
    contractAddresseList.push("0x088ee5007C98a9677165D78dD2109AE4a3D04d0C");
    contractAddresseList.push("0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e");
    contractAddresseList.push("0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58");
    contractAddresseList.push("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599");
    contractAddresseList.push("0x06da0fd433C1A5d7a4faa01111c044910A184553");
    contractAddresseList.push("0x397FF1542f962076d0BFE58eA045FfA2d347ACa0");
    contractAddresseList.push("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    contractAddresseList.push("0xdAC17F958D2ee523a2206206994597C13D831ec7");
    contractAddresseList.push("0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f");
    contractAddresseList.push("0x6B175474E89094C44Da98b954EedeAC495271d0F");
    contractAddresseList.push("0x10B47177E92Ef9D5C6059055d92DdF6290848991");
    contractAddresseList.push("0x429881672B9AE42b8EbA0E26cD9C73711b891Ca5");
    contractAddresseList.push("0xc5bDdf9843308380375a611c18B50Fb9341f502A");
    contractAddresseList.push("0x55FE002aefF02F77364de339a1292923A15844B8");
    contractAddresseList.push("0xcffad3200574698b78f32232aa9d63eabd290703");
    contractAddresseList.push("0xa74255eD5Bf5fa9e26d387915192420AAC6ab105");
    contractAddresseList.push("0xf60c2Ea62EDBfE808163751DD0d8693DCb30019c");
    contractAddresseList.push("0x56c915758Ad3f76Fd287FFF7563ee313142Fb663");
    contractAddresseList.push("0xFEB4acf3df3cDEA7399794D0869ef76A6EfAff52");
    contractAddresseList.push("0x55FE002aefF02F77364de339a1292923A15844B8");
    contractAddresseList.push("0xCFFAd3200574698b78f32232aa9D63eABD290703");
    contractAddresseList.push("0x5632Cf9a1b4ac936A3c6d3D66EB75c0344c61c2d");
    contractAddresseList.push("0xF8dB00cDdEEDd6BEA28dfF88F6BFb1B531A6cBc9");
    contractAddresseList.push("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
    contractAddresseList.push("0x2feb1512183545f48f6b9c5b4ebfcaf49cfca6f3");

    return Networks.pickle;
  }
  //curve
  else if (networkId == "80002") {
    contractAddresseList.push(contractList.system.crv_address);
    contractAddresseList.push(contractList.system.curve_escrow);
    contractAddresseList.push(contractList.system.curve_lptoken);

    contractAddresseList.push(contractList.system.curve_voterProxy);
    contractAddresseList.push(contractList.system.curve_booster);
    contractAddresseList.push(contractList.system.ve3_curve);
    contractAddresseList.push(contractList.system.curve_depositor);
    contractAddresseList.push(contractList.system.curve_ve3TokenRewardPool);
    contractAddresseList.push(contractList.system.curve_feedistro);
    contractAddresseList.push(contractList.system.curve_feedistro_admin);
    return Networks.curve;
  }
  //ribbon
  else if (networkId == "80003") {
    contractAddresseList.push(contractList.system.ribbon_address);
    contractAddresseList.push(contractList.system.ribbon_escrow);
    contractAddresseList.push(contractList.system.ribbon_lptoken);

    contractAddresseList.push(contractList.system.ribbon_voterProxy);
    contractAddresseList.push(contractList.system.ribbon_booster);
    contractAddresseList.push(contractList.system.ve3_ribbon);
    contractAddresseList.push(contractList.system.ribbon_depositor);
    contractAddresseList.push(contractList.system.ribbon_ve3TokenRewardPool);
    contractAddresseList.push(contractList.system.ribbon_feedistro);
    contractAddresseList.push(contractList.system.ribbon_feedistro_admin);

    contractAddresseList.push("0x65a833afDc250D9d38f8CD9bC2B1E3132dB13B2F");
    contractAddresseList.push("0x554Fe9292Cd2E2b9469E19e814842C060312FF00");
    contractAddresseList.push("0x53773E034d9784153471813dacAFF53dBBB78E8c");
    contractAddresseList.push("0xB7e56C4F44d42487b73169D6EF727489Dda00549");
    contractAddresseList.push("0x25751853Eab4D0eB3652B5eB6ecB102A2789644B");
    contractAddresseList.push("0xCB33844b365c53D3462271cEe9B719B6Fc8bA06A");
    return Networks.ribbon;
  }
  //idle
  else if (networkId == "80004") {
    contractAddresseList.push(contractList.system.idle_address);
    contractAddresseList.push(contractList.system.idle_escrow);
    contractAddresseList.push(contractList.system.idle_lptoken);

    contractAddresseList.push(contractList.system.idle_voterProxy);
    contractAddresseList.push(contractList.system.idle_booster);
    contractAddresseList.push(contractList.system.ve3_idle);
    contractAddresseList.push(contractList.system.idle_depositor);
    contractAddresseList.push(contractList.system.idle_ve3TokenRewardPool);
    contractAddresseList.push(contractList.system.idle_feedistro);
    contractAddresseList.push(contractList.system.idle_feedistro_admin);

    contractAddresseList.push("0x790E38D85a364DD03F682f5EcdC88f8FF7299908"); //10
    contractAddresseList.push("0xD2d24db10c43811302780e082A3E6f73a97eA48F");
    contractAddresseList.push("0x15794DA4DCF34E674C18BbFAF4a67FF6189690F5"); //12
    contractAddresseList.push("0x919F34ed092696CcfAE27d1173c32c0147e0edF5"); //13
    contractAddresseList.push("0xFC96989b3Df087C96C806318436B16e44c697102");
    contractAddresseList.push("0x442Aea0Fd2AFbd3391DAE768F7046f132F0a6300");
    return Networks.idle;
  }
  //angle
  else if (networkId == "80005") {
    contractAddresseList.push(contractList.system.angle_address);
    contractAddresseList.push(contractList.system.angle_escrow);
    contractAddresseList.push(contractList.system.angle_lptoken);

    contractAddresseList.push(contractList.system.angle_voterProxy);
    contractAddresseList.push(contractList.system.angle_booster);
    contractAddresseList.push(contractList.system.ve3_angle);
    contractAddresseList.push(contractList.system.angle_depositor);
    contractAddresseList.push(contractList.system.angle_ve3TokenRewardPool);
    contractAddresseList.push(contractList.system.angle_feedistro);
    contractAddresseList.push(contractList.system.angle_feedistro_admin);

    contractAddresseList.push("0x9C215206Da4bf108aE5aEEf9dA7caD3352A36Dad");
    contractAddresseList.push("0x279a7DBFaE376427FFac52fcb0883147D42165FF");

    contractAddresseList.push("0x5d8D3Ac6D21C016f9C935030480B7057B21EC804");
    contractAddresseList.push("0xb3B209Bb213A5Da5B947C56f2C770b3E1015f1FE");
    contractAddresseList.push("0xfdA462548Ce04282f4B6D6619823a7C64Fdc0185");
    contractAddresseList.push("0xA2dEe32662F6243dA539bf6A8613F9A9e39843D3");
    return Networks.angle;
  }
  //balancer
  else if (networkId == "80006") {
    contractAddresseList.push(contractList.system.balancer_address);
    contractAddresseList.push(contractList.system.balancer_escrow);
    contractAddresseList.push(contractList.system.balancer_lptoken);

    contractAddresseList.push(contractList.system.balancer_voterProxy);
    contractAddresseList.push(contractList.system.balancer_booster);
    contractAddresseList.push(contractList.system.balancer_curve);
    contractAddresseList.push(contractList.system.balancer_depositor);
    contractAddresseList.push(contractList.system.balancer_ve3TokenRewardPool);
    contractAddresseList.push(contractList.system.balancer_feedistro);
    contractAddresseList.push(contractList.system.balancer_feedistro_admin);
    return Networks.balancer;
  }
}

module.exports = {
  loadContracts,
  contractAddresseList,
  Networks,
};
