const BigNumber = require("bignumber.js");
function toBN(number) {
  return new BigNumber(number);
}

async function getBlockTimestamp() {
  const latest = toBN(await web3.eth.getBlockNumber());

  return (await web3.eth.getBlock(latest)).timestamp;
}

advanceTimeAndBlock = async (time) => {
  await advanceTime(time);
  await advanceBlock();

  return Promise.resolve(web3.eth.getBlock("latest"));
};

advanceTime = (time) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [time],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

advanceBlock = () => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        const newBlockHash = web3.eth.getBlock("latest").hash;

        return resolve(newBlockHash);
      }
    );
  });
};

module.exports = async (deployer, network, accounts) => {
  let timeStamp = await getBlockTimestamp();
  console.log("current Time >> ", timeStamp.toString());

  await advanceTimeAndBlock(86400 * 7);

  timeStamp = await getBlockTimestamp();
  console.log("new Time >> ", timeStamp.toString());

  process.exit(0);
};
