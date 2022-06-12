const BigNumber = require("bignumber.js");

function toBN(number) {
  return new BigNumber(number);
}

function log(message, value) {
  console.log(message + " ----- " + value + "\n");
}

module.exports = {
  toBN,
  log,
};
