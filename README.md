# Morpho Protocol V1 🦋

[![Test](https://github.com/morpho-labs/morpho-contracts/actions/workflows/ci-foundry.yml/badge.svg)](https://github.com/morpho-labs/morpho-contracts/actions/workflows/ci-foundry.yml)

This repository contains the core smart contracts for the Morpho Protocol V1 🦋.

---

## Testing with [Foundry](https://github.com/foundry-rs/foundry) 🔨

Tests are run against a forks of real networks, which allows us to interact directly with liquidity pools of Compound or Aave. Note that you need to have an RPC provider that have access to Ethereum or Polygon.

For testing, make sure `yarn` and `foundry` are installed and install dependencies (node_modules, git submodules) with:

```bash
make install
```

Alternatively, if you only want to set up

Refer to the `env.example` for the required environment variable.

To run tests on different protocols, navigate a Unix terminal to the root folder of the project and run the command of your choice:

To run every test of a specific protocol (e.g. for Morpho-Compound):

```bash
make test PROTOCOL=compound
```

or to run only a specific set of tests of a specific protocol (e.g. for Morpho-Aave V2):

```bash
make c-TestBorrow PROTOCOL=aave-v2
```

or to run an individual test of a specific protocol (e.g. for Morpho-Aave V3):

```bash
make s-testShouldCollectTheRightAmountOfFees PROTOCOL=aave-v3
```

For the other commands, check the [Makefile](./Makefile).

---

## Testing with Hardhat

Only tests for the [RewardsDistributor](./contracts/common/rewards-distribution/RewardsDistributor.sol) are run with Hardhat.

Just run:

```bash
yarn test:hardhat
```

---

## Style guide 💅

### Code Formatting

We use prettier with the default configuration mentionned in the [Solidity Prettier Plugin](https://github.com/prettier-solidity/prettier-plugin-solidity).
We recommend developers using VS Code to set their local config as below:

```json
{
  "editor.formatOnSave": true,
  "solidity.formatter": "prettier",
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

In doing so the code will be formatted on each save.

We use Husky hook to format code before being pushed to any remote branch to enforce coding style among all developers.

### Code Style

We follow the Solidity style guide from the [Solidity Documentation](https://docs.soliditylang.org/en/latest/style-guide.html) and the [NatSpec format](https://docs.soliditylang.org/en/latest/natspec-format.html) using this pattern `///`.
Comments should begin with a capital letter and end with a period. You can check the current code to have an overview of what is expected.

---

## Contributing 💪

In this section, you will find some guidelines to read before contributing to the project.

### Creating issues and PRs

Guidelines for creating issues and PRs:

- Issues must be created and labelled with relevant labels (type of issues, high/medium/low priority, etc.).
- Nothing should be pushed directly to the `main` branch.
- Pull requests must be created before and branch names must follow this pattern: `feat/<feature-name>`, `test/<test-name>` or `fix/<fix-name>`. `docs`, `ci` can also be used. The goal is to have clear branches names and make easier their management.
- PRs must be labelled with the relevant labels.
- Issues must be linked to PRs so that once the PR is merged related issues are closed at the same time.
- Reviewers must be added to the PR.
- For commits, install the gitmoji VS Code extension and use the appropriate emoji for each commit. It should match this pattern: `<emoji> (<branch-name>) <commit-message>`. For a real world example: `✨ (feat/new-feature) Add new feature`.

### Before merging a PR

Before merging a PR:

- PR must have been reviewed by reviewers. The must deliver a complete report on the smart contracts (see the section below).
- Comments and requested changes must have been resolved.
- PR must have been approved by every reviewers.
- CI must pass.

For smart contract reviews, a complete report must have been done, not just a reading of the changes in the code. This is very important as a simple change on one line of code can bring dramatic consequences on a smart contracts (bad copy/paste have already lead to hacks).
For the guidelines on "How to review contracts and write a report?", you can follow this [link](https://morpho-labs.notion.site/How-to-do-a-Smart-Contract-Review-81d1dc692259463993cc7d81544767d1).

By default, PR are rebased with `dev` before merging to keep a clean historic of commits and the branch is deleted. The same process is done from `dev` to `main`.

## Deploying a contract on a network 🚀

You can run the following command to deploy Morpho's contracts for Aave on Mumbai by using foundry:

```bash
forge script script/DeployMorphoAaveV2.s.sol:DeployMorphoAaveV2 --rpc-url $RPC_URL  --private-key $PRIVATE_KEY --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY -vvvv
```

Make sure to have the correct environement variables setted before running the deployment script. You can add them to a .env.local environement file, and run this before executing the previous deployment command:

```bash
source .env.local
```

## Publishing and verifying a contract on Etherscan 📡

An etherscan API key is required to verify the contract and placed into your `.env.local` file.
The right arguments of the constructor of the smart contract to verify must be write inside `arguments.js`. Then you can run the following command to verify a contract:

```bash
npx hardhat verify --network <network-name> --constructor-args scripts/arguments.js <contract-address>
npx hardhat verify --network <network-name> --constructor-args scripts/arguments.js --contract contracts/Example.sol:ExampleContract <contract-address>
```

The second is necessary if contracts with different names share the same ABI.

## Verification on Tenderly 📡

In your `env.local` file, put your tenderly private key. Then you can deploy and directly verify contracts on your tenderly dashboard.

## External resources & documentation 📚

- [General documentation](https://morpho-labs.gitbook.io/morpho-documentation/)
- [Developer documentation](https://morpho-labs.gitbook.io/technical-documentation/)
- [Whitepaper](https://whitepaper.morpho.best)
- [Foundry](https://github.com/gakonst/foundry)
- [Solidity Prettier Plugin](https://github.com/prettier-solidity/prettier-plugin-solidity)

## Questions & Feedback 💬

For any question you can send an email to [merlin@mopho.best](mailto:merlin@morpho.best) 😊
