import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });
import 'module-alias/register';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'hardhat-deploy';
const config = require(`@config/${process.env.NETWORK}-config.json`);

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        url: `https://${process.env.NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
        blockNumber: config.startBlock, // Beginning from a specific block number allows caching data and a faster setup
      },
      allowUnlimitedContractSize: true,
    },
    kovan: {
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      // privateKey: "0x574028dad40752ed4448624f35ecb32821b0b0791652a34c10aa78053a08a730",
      url: `https://kovan.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    },
    rinkeby: {
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      gas: 2100000,
      gasPrice: 8000000000,
    },
    ropsten: {
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      gas: 2100000,
      gasPrice: 8000000000,
    },
    polygon: {
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      gas: 2100000,
      gasPrice: 8000000000,
    },
  },
  namedAccounts: {
    deployer: {
      kovan: '0x2F25DB0982Fd8E8be238281e4b6c413Eda688637',
    },
  },
  solidity: {
    version: '0.8.7',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  gasReporter: {
    currency: 'USD',
  },
  mocha: {
    timeout: 200000,
  },
};