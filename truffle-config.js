/**
 * Use this file to configure your truffle project. It's seeded with some
 * common settings for different networks and features like migrations,
 * compilation and testing. Uncomment the ones you need or modify
 * them to suit your project as necessary.
 *
 * More information about configuration can be found at:
 *
 * trufflesuite.com/docs/advanced/configuration
 *
 * To deploy via Infura you'll need a wallet provider (like @truffle/hdwallet-provider)
 * to sign your transactions before they're sent to a remote public node. Infura accounts
 * are available for free at: infura.io/register.
 *
 * You'll also need a mnemonic - the twelve word phrase the wallet uses to generate
 * public/private key pairs. If you're publishing your code to GitHub make sure you load this
 * phrase from a file you've .gitignored so it doesn't accidentally become public.
 *
 */

// const HDWalletProvider = require('@truffle/hdwallet-provider');
// const infuraKey = "fj4jll3k.....";
//
// const fs = require('fs');

const HDWalletProvider = require("@truffle/hdwallet-provider");

const dotenv = require("dotenv");
const Web3 = require("web3");
dotenv.config();

module.exports = {
  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a development blockchain for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache-cli, geth or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.
    //
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      gas: 8000000,
      gasPrice: 100000000000,
      skipDryRun: true,
      disableConfirmationListener: true,
    },
    idle: {
      provider: () => new Web3.providers.HttpProvider("http://127.0.0.1:8549"),
      host: "127.0.0.1",
      port: 8549,
      network_id: "*",
      gas: 8000000,
      gasPrice: 50000000000,
      skipDryRun: true,
    },
    angle: {
      provider: () => new Web3.providers.HttpProvider("http://127.0.0.1:8550"),
      host: "127.0.0.1",
      port: 8550,
      network_id: "*",
      gas: 8000000,
      //gasPrice: 50000000000,
      skipDryRun: true,
    },
    server_fork: {
      provider: () => new Web3.providers.HttpProvider("http://66.29.155.152:8545"),
      host: "66.29.155.152",
      port: 8545,
      network_id: "1",
      gas: 8000000,
      gasPrice: 100000000000,
      skipDryRun: true,
      networkCheckTimeout: 10000,
      timeoutBlocks: 200,
    },
    kovan: {
      provider: () =>
        new HDWalletProvider([process.env.PRIVATE_KEY], `wss://eth-kovan.g.alchemy.com/v2/${process.env.PROJECT_ID}`),
      network_id: 42, // kovan's id
      gas: 3000000,
      gasPrice: 10000000000,
      skipDryRun: true,
    },
    rinkeby: {
      provider: () =>
        new HDWalletProvider([process.env.PRIVATE_KEY], `wss://eth-rinkeby.g.alchemy.com/v2/${process.env.PROJECT_ID}`),
      network_id: 4, // kovan's id
      gas: 8000000,
      gasPrice: 10000000000,
      skipDryRun: true,
    },
    mainnet: {
      provider: () =>
        new HDWalletProvider([process.env.PRIVATE_KEY], `wss://eth-mainnet.g.alchemy.com/v2/${process.env.PROJECT_ID}`),
      network_id: 1, // Mainnet's id
      gas: 8000000,
      gasPrice: 9000000000,
      skipDryRun: true,
    },
    avalanche_testnet: {
      provider: () => new HDWalletProvider([process.env.PRIVATE_KEY], "https://api.avax-test.network/ext/bc/C/rpc"),
      network_id: 43113, // Mainnet's id
      gas: 8000000,
      gasPrice: 25000000000,
      skipDryRun: true,
    },
    avalanche_mainnet: {
      provider: () => new HDWalletProvider([process.env.PRIVATE_KEY], "https://api.avax.network/ext/bc/C/rpc"),
      network_id: 43114, // Mainnet's id
      gas: 8000000,
      gasPrice: 30000000000,
      skipDryRun: true,
    },
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },
  plugins: ["truffle-plugin-verify"],
  api_keys: {
    etherscan: process.env.ETHERSCAN_KEY,
    snowtrace: process.env.SNOWTRACE_KEY,
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.7", // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200,
        },
        // evmVersion: "byzantium"
      },
    },
  },

  // Truffle DB is currently disabled by default; to enable it, change enabled: false to enabled: true
  //
  // Note: if you migrated your contracts prior to enabling this field in your Truffle project and want
  // those previously migrated contracts available in the .db directory, you will need to run the following:
  // $ truffle migrate --reset --compile-all

  db: {
    enabled: false,
  },
};
