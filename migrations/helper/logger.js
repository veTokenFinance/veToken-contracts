function logTransaction(tx, name) {
  console.log(`Transaction ${name}: gas used ${tx.receipt.gasUsed}, hash ${tx.tx}`);
}

function logAddress(name, address) {
  console.log("CONTRACT: " + name + " ----- " + address + "\n");
}

module.exports = {
  logAddress,
  logTransaction,
};
