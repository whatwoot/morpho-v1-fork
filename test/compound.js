require('dotenv').config({ path: '.env.local' });
const { utils, BigNumber } = require('ethers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const hre = require('hardhat');
const config = require(`@config/${process.env.NETWORK}-config.json`);
const {
  SCALE,
  underlyingToCToken,
  cTokenToUnderlying,
  underlyingToP2pUnit,
  p2pUnitToUnderlying,
  underlyingToCdUnit,
  cDUnitToUnderlying,
  removeDigitsBigNumber,
  bigNumberMin,
  to6Decimals,
  computeNewMorphoExchangeRate,
  getTokens,
} = require('./utils/helpers');

describe('MorphoPositionsManagerForCompound Contract', () => {
  let cUsdcToken;
  let cDaiToken;
  let cUsdtToken;
  let cMkrToken;
  let daiToken;
  let usdtToken;
  let uniToken;
  let MorphoPositionsManagerForCompound;
  let morphoPositionsManagerForCompound;
  let fakeCompoundPositionsManager;

  let signers;
  let owner;
  let supplier1;
  let supplier2;
  let supplier3;
  let borrower1;
  let borrower2;
  let borrower3;
  let liquidator;
  let addrs;
  let suppliers;
  let borrowers;

  let underlyingThreshold;
  let snapshotId;

  before(async () => {
    // Users
    signers = await ethers.getSigners();
    [owner, supplier1, supplier2, supplier3, borrower1, borrower2, borrower3, liquidator, ...addrs] = signers;
    suppliers = [supplier1, supplier2, supplier3];
    borrowers = [borrower1, borrower2, borrower3];

    const RedBlackBinaryTree = await ethers.getContractFactory('RedBlackBinaryTree');
    const redBlackBinaryTree = await RedBlackBinaryTree.deploy();
    await redBlackBinaryTree.deployed();

    // Deploy contracts
    MorphoMarketsManagerForCompound = await ethers.getContractFactory('MorphoMarketsManagerForCompound');
    morphoMarketsManagerForCompound = await MorphoMarketsManagerForCompound.deploy();
    await morphoMarketsManagerForCompound.deployed();

    MorphoPositionsManagerForCompound = await ethers.getContractFactory('MorphoPositionsManagerForCompound', {
      libraries: {
        RedBlackBinaryTree: redBlackBinaryTree.address,
      },
    });
    morphoPositionsManagerForCompound = await MorphoPositionsManagerForCompound.deploy(morphoMarketsManagerForCompound.address, config.compound.comptroller.address);
    fakeCompoundPositionsManager = await MorphoPositionsManagerForCompound.deploy(morphoMarketsManagerForCompound.address, config.compound.comptroller.address);
    await morphoPositionsManagerForCompound.deployed();
    await fakeCompoundPositionsManager.deployed();

    // Get contract dependencies
    const cTokenAbi = require(config.tokens.cToken.abi);
    cUsdcToken = await ethers.getContractAt(cTokenAbi, config.tokens.cUsdc.address, owner);
    cDaiToken = await ethers.getContractAt(cTokenAbi, config.tokens.cDai.address, owner);
    cUsdtToken = await ethers.getContractAt(cTokenAbi, config.tokens.cUsdt.address, owner);
    cUniToken = await ethers.getContractAt(cTokenAbi, config.tokens.cUni.address, owner);
    cMkrToken = await ethers.getContractAt(cTokenAbi, config.tokens.cMkr.address, owner); // This is in fact crLINK tokens (no crMKR on Polygon)

    comptroller = await ethers.getContractAt(require(config.compound.comptroller.abi), config.compound.comptroller.address, owner);
    compoundOracle = await ethers.getContractAt(require(config.compound.oracle.abi), comptroller.oracle(), owner);

    // Mint some ERC20
    daiToken = await getTokens(config.tokens.dai.whale, 'whale', signers, config.tokens.dai, utils.parseUnits('10000'));
    usdcToken = await getTokens(config.tokens.usdc.whale, 'whale', signers, config.tokens.usdc, BigNumber.from(10).pow(10));
    usdtToken = await getTokens(config.tokens.usdt.whale, 'whale', signers, config.tokens.usdt, BigNumber.from(10).pow(10));
    uniToken = await getTokens(config.tokens.uni.whale, 'whale', signers, config.tokens.uni, utils.parseUnits('100'));

    underlyingThreshold = utils.parseUnits('1');

    // Create and list markets
    await morphoMarketsManagerForCompound.connect(owner).setPositionsManagerForCompound(morphoPositionsManagerForCompound.address);
    await morphoMarketsManagerForCompound.connect(owner).createMarket(config.tokens.cDai.address);
    await morphoMarketsManagerForCompound.connect(owner).createMarket(config.tokens.cUsdc.address);
    await morphoMarketsManagerForCompound.connect(owner).createMarket(config.tokens.cUni.address);
    await morphoMarketsManagerForCompound.connect(owner).createMarket(config.tokens.cUsdt.address);
    await morphoMarketsManagerForCompound.connect(owner).updateThreshold(config.tokens.cUsdc.address, BigNumber.from(1).pow(6));
    await morphoMarketsManagerForCompound.connect(owner).updateThreshold(config.tokens.cUsdt.address, BigNumber.from(1).pow(6));
  });

  beforeEach(async () => {
    snapshotId = await hre.network.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await hre.network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Deployment', () => {
    it('Should deploy the contract with the right values', async () => {
      // Calculate p2pBPY
      const borrowRatePerBlock = await cDaiToken.borrowRatePerBlock();
      const supplyRatePerBlock = await cDaiToken.supplyRatePerBlock();
      const expectedBPY = borrowRatePerBlock.add(supplyRatePerBlock).div(2);
      expect(await morphoMarketsManagerForCompound.p2pBPY(config.tokens.cDai.address)).to.equal(expectedBPY);
      expect(await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address)).to.be.equal(utils.parseUnits('1'));

      // Thresholds
      underlyingThreshold = await morphoPositionsManagerForCompound.threshold(config.tokens.cDai.address);
      expect(underlyingThreshold).to.be.equal(utils.parseUnits('1'));
    });
  });

  describe('Governance functions', () => {
    it('Should revert when at least when a market in input is not a real market', async () => {
      expect(morphoMarketsManagerForCompound.connect(owner).createMarket(config.tokens.usdt.address)).to.be.reverted;
    });

    it('Only Owner should be able to create markets in peer-to-peer', async () => {
      expect(morphoMarketsManagerForCompound.connect(supplier1).createMarket(config.tokens.cEth.address)).to.be.reverted;
      expect(morphoMarketsManagerForCompound.connect(borrower1).createMarket(config.tokens.cEth.address)).to.be.reverted;
      expect(morphoMarketsManagerForCompound.connect(owner).createMarket(config.tokens.cEth.address)).not.be.reverted;
    });

    it('Only Morpho should be able to create markets on MorphoPositionsManagerForCompound', async () => {
      expect(morphoPositionsManagerForCompound.connect(supplier1).createMarket(config.tokens.cMkr.address)).to.be.reverted;
      expect(morphoPositionsManagerForCompound.connect(borrower1).createMarket(config.tokens.cMkr.address)).to.be.reverted;
      expect(morphoPositionsManagerForCompound.connect(owner).createMarket(config.tokens.cMkr.address)).to.be.reverted;
      await morphoMarketsManagerForCompound.connect(owner).createMarket(config.tokens.cMkr.address);
      expect(await comptroller.checkMembership(morphoPositionsManagerForCompound.address, config.tokens.cMkr.address)).to.be.true;
    });

    it('marketsManagerForCompound should not be changed after already set by Owner', async () => {
      expect(morphoMarketsManagerForCompound.connect(owner).setPositionsManagerForCompound(fakeCompoundPositionsManager.address)).to.be.reverted;
    });

    it('Only Owner should be able to update thresholds', async () => {
      const newThreshold = utils.parseUnits('2');
      await morphoMarketsManagerForCompound.connect(owner).updateThreshold(config.tokens.cUsdc.address, newThreshold);

      // Other accounts than Owner
      await expect(morphoMarketsManagerForCompound.connect(supplier1).updateThreshold(config.tokens.cUsdc.address, newThreshold)).to.be.reverted;
      await expect(morphoMarketsManagerForCompound.connect(borrower1).updateThreshold(config.tokens.cUsdc.address, newThreshold)).to.be.reverted;
    });

    it('Should create a market the with right values', async () => {
      const supplyBPY = await cMkrToken.supplyRatePerBlock();
      const borrowBPY = await cMkrToken.borrowRatePerBlock();
      const { blockNumber } = await morphoMarketsManagerForCompound.connect(owner).createMarket(config.tokens.cMkr.address);
      expect(await morphoMarketsManagerForCompound.isCreated(config.tokens.cMkr.address)).to.be.true;

      const p2pBPY = supplyBPY.add(borrowBPY).div(2);
      expect(await morphoMarketsManagerForCompound.p2pBPY(config.tokens.cMkr.address)).to.equal(p2pBPY);

      expect(await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cMkr.address)).to.equal(SCALE);
      expect(await morphoMarketsManagerForCompound.lastUpdateBlockNumber(config.tokens.cMkr.address)).to.equal(blockNumber);
    });
  });

  describe('Suppliers on Compound (no borrowers)', () => {
    it('Should have correct balances at the beginning', async () => {
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool).to.equal(0);
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P).to.equal(0);
    });

    it('Should revert when supply less than the required threshold', async () => {
      await expect(morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, underlyingThreshold.sub(1))).to.be.reverted;
    });

    it('Should have the correct balances after supply', async () => {
      const amount = utils.parseUnits('10');
      const daiBalanceBefore = await daiToken.balanceOf(supplier1.getAddress());
      const expectedDaiBalanceAfter = daiBalanceBefore.sub(amount);
      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, amount);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, amount);
      const daiBalanceAfter = await daiToken.balanceOf(supplier1.getAddress());

      // Check ERC20 balance
      expect(daiBalanceAfter).to.equal(expectedDaiBalanceAfter);
      const exchangeRate = await cDaiToken.callStatic.exchangeRateCurrent();
      const expectedSupplyBalanceOnPool = underlyingToCToken(amount, exchangeRate);
      expect(await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address)).to.equal(expectedSupplyBalanceOnPool);
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool).to.equal(expectedSupplyBalanceOnPool);
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P).to.equal(0);
    });

    it('Should be able to withdraw ERC20 right after supply up to max supply balance', async () => {
      const amount = utils.parseUnits('10');
      const daiBalanceBefore1 = await daiToken.balanceOf(supplier1.getAddress());
      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, amount);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, amount);
      const daiBalanceAfter1 = await daiToken.balanceOf(supplier1.getAddress());
      expect(daiBalanceAfter1).to.equal(daiBalanceBefore1.sub(amount));

      const supplyBalanceOnPool = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      const exchangeRate1 = await cDaiToken.callStatic.exchangeRateCurrent();
      const toWithdraw1 = cTokenToUnderlying(supplyBalanceOnPool, exchangeRate1);

      // TODO: improve this test to prevent attacks
      await expect(morphoPositionsManagerForCompound.connect(supplier1).withdraw(toWithdraw1.add(utils.parseUnits('0.001')).toString())).to.be.reverted;

      // Update exchange rate
      await cDaiToken.connect(supplier1).exchangeRateCurrent();
      const exchangeRate2 = await cDaiToken.callStatic.exchangeRateCurrent();
      const toWithdraw2 = cTokenToUnderlying(supplyBalanceOnPool, exchangeRate2);
      await morphoPositionsManagerForCompound.connect(supplier1).withdraw(config.tokens.cDai.address, toWithdraw2);
      const daiBalanceAfter2 = await daiToken.balanceOf(supplier1.getAddress());
      // Check ERC20 balance
      expect(daiBalanceAfter2).to.equal(daiBalanceBefore1.sub(amount).add(toWithdraw2));

      // Check cToken left are only dust in supply balance
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool).to.be.lt(1000);
      await expect(morphoPositionsManagerForCompound.connect(supplier1).withdraw(config.tokens.cDai.address, utils.parseUnits('0.001'))).to.be.reverted;
    });

    it('Should be able to supply more ERC20 after already having supply ERC20', async () => {
      const amount = utils.parseUnits('10');
      const amountToApprove = utils.parseUnits('10').mul(2);
      const daiBalanceBefore = await daiToken.balanceOf(supplier1.getAddress());

      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, amountToApprove);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, amount);
      const exchangeRate1 = await cDaiToken.callStatic.exchangeRateCurrent();
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, amount);
      const exchangeRate2 = await cDaiToken.callStatic.exchangeRateCurrent();

      // Check ERC20 balance
      const daiBalanceAfter = await daiToken.balanceOf(supplier1.getAddress());
      expect(daiBalanceAfter).to.equal(daiBalanceBefore.sub(amountToApprove));

      // Check supply balance
      const expectedSupplyBalanceOnPool1 = underlyingToCToken(amount, exchangeRate1);
      const expectedSupplyBalanceOnPool2 = underlyingToCToken(amount, exchangeRate2);
      const expectedSupplyBalanceOnPool = expectedSupplyBalanceOnPool1.add(expectedSupplyBalanceOnPool2);
      expect(await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address)).to.equal(expectedSupplyBalanceOnPool);
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool).to.equal(expectedSupplyBalanceOnPool);
    });

    it('Several suppliers should be able to supply and have the correct balances', async () => {
      const amount = utils.parseUnits('10');
      let expectedCTokenBalance = BigNumber.from(0);

      for (const i in suppliers) {
        const supplier = suppliers[i];
        const daiBalanceBefore = await daiToken.balanceOf(supplier.getAddress());
        const expectedDaiBalanceAfter = daiBalanceBefore.sub(amount);
        await daiToken.connect(supplier).approve(morphoPositionsManagerForCompound.address, amount);
        await morphoPositionsManagerForCompound.connect(supplier).supply(config.tokens.cDai.address, amount);
        const exchangeRate = await cDaiToken.callStatic.exchangeRateCurrent();
        const daiBalanceAfter = await daiToken.balanceOf(supplier.getAddress());

        // Check ERC20 balance
        expect(daiBalanceAfter).to.equal(expectedDaiBalanceAfter);
        const expectedSupplyBalanceOnPool = underlyingToCToken(amount, exchangeRate);
        expectedCTokenBalance = expectedCTokenBalance.add(expectedSupplyBalanceOnPool);
        expect(removeDigitsBigNumber(7, await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address))).to.equal(removeDigitsBigNumber(7, expectedCTokenBalance));
        expect(removeDigitsBigNumber(4, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier.getAddress())).onPool)).to.equal(
          removeDigitsBigNumber(4, expectedSupplyBalanceOnPool)
        );
        expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier.getAddress())).inP2P).to.equal(0);
      }
    });
  });

  describe('Borrowers on Compound (no suppliers)', () => {
    it('Should have correct balances at the beginning', async () => {
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.equal(0);
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P).to.equal(0);
    });

    it('Should revert when providing 0 as collateral', async () => {
      await expect(morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, 0)).to.be.reverted;
    });

    it('Should revert when borrow less than threshold', async () => {
      const amount = to6Decimals(utils.parseUnits('10'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, amount);
      await expect(morphoPositionsManagerForCompound.connect(supplier1).borrow(config.tokens.cDai.address, amount)).to.be.reverted;
    });

    it('Should be able to borrow on Compound after providing collateral up to max', async () => {
      const amount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, amount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, amount);
      const cTokenExchangeRate = await cUsdcToken.callStatic.exchangeRateCurrent();
      const collateralBalanceInCToken = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool;
      const collateralBalanceInUnderlying = cTokenToUnderlying(collateralBalanceInCToken, cTokenExchangeRate);
      const { collateralFactorMantissa } = await comptroller.markets(config.tokens.cDai.address);
      const usdcPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cUsdc.address);
      const daiPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cDai.address);
      const maxToBorrow = collateralBalanceInUnderlying.mul(usdcPriceMantissa).div(daiPriceMantissa).mul(collateralFactorMantissa).div(SCALE);
      const daiBalanceBefore = await daiToken.balanceOf(borrower1.getAddress());

      // Borrow
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, maxToBorrow);
      const borrowIndex = await cDaiToken.borrowIndex();
      const daiBalanceAfter = await daiToken.balanceOf(borrower1.getAddress());

      // Check borrower1 balances
      expect(daiBalanceAfter).to.equal(daiBalanceBefore.add(maxToBorrow));
      const borrowBalanceOnPoolInUnderlying = cDUnitToUnderlying((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool, borrowIndex);
      let diff;
      if (borrowBalanceOnPoolInUnderlying.gt(maxToBorrow)) diff = borrowBalanceOnPoolInUnderlying.sub(maxToBorrow);
      else diff = maxToBorrow.sub(borrowBalanceOnPoolInUnderlying);
      expect(removeDigitsBigNumber(1, diff)).to.equal(0);

      // Check Morpho balances
      expect(await daiToken.balanceOf(morphoPositionsManagerForCompound.address)).to.equal(0);
      expect(await cDaiToken.callStatic.borrowBalanceCurrent(morphoPositionsManagerForCompound.address)).to.equal(maxToBorrow);
    });

    it('Should not be able to borrow more than max allowed given an amount of collateral', async () => {
      const amount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, amount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, amount);
      const collateralBalanceInCToken = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool;
      const cTokenExchangeRate = await cUsdcToken.callStatic.exchangeRateCurrent();
      const collateralBalanceInUnderlying = cTokenToUnderlying(collateralBalanceInCToken, cTokenExchangeRate);
      const { collateralFactorMantissa } = await comptroller.markets(config.tokens.cDai.address);
      const usdcPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cUsdc.address);
      const daiPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cDai.address);
      const maxToBorrow = collateralBalanceInUnderlying.mul(usdcPriceMantissa).div(daiPriceMantissa).mul(collateralFactorMantissa).div(SCALE);
      // WARNING: maxToBorrow seems to be not accurate
      const moreThanMaxToBorrow = maxToBorrow.add(utils.parseUnits('10'));

      // TODO: fix dust issue
      // This check does not pass when adding utils.parseUnits("0.00001") to maxToBorrow
      await expect(morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, moreThanMaxToBorrow)).to.be.reverted;
    });

    it('Several borrowers should be able to borrow and have the correct balances', async () => {
      const collateralAmount = to6Decimals(utils.parseUnits('10'));
      const borrowedAmount = utils.parseUnits('2');
      let expectedMorphoBorrowBalance = BigNumber.from(0);
      let previousBorrowIndex = await cDaiToken.borrowIndex();

      for (const i in borrowers) {
        const borrower = borrowers[i];
        await usdcToken.connect(borrower).approve(morphoPositionsManagerForCompound.address, collateralAmount);
        await morphoPositionsManagerForCompound.connect(borrower).supply(config.tokens.cUsdc.address, collateralAmount);
        const daiBalanceBefore = await daiToken.balanceOf(borrower.getAddress());

        await morphoPositionsManagerForCompound.connect(borrower).borrow(config.tokens.cDai.address, borrowedAmount);
        // We have one block delay from Compound
        const borrowIndex = await cDaiToken.borrowIndex();
        expectedMorphoBorrowBalance = expectedMorphoBorrowBalance.mul(borrowIndex).div(previousBorrowIndex).add(borrowedAmount);

        // All underlyings should have been sent to the borrower
        const daiBalanceAfter = await daiToken.balanceOf(borrower.getAddress());
        expect(daiBalanceAfter).to.equal(daiBalanceBefore.add(borrowedAmount));
        const borrowBalanceOnPoolInUnderlying = cDUnitToUnderlying((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower.getAddress())).onPool, borrowIndex);
        let diff;
        if (borrowBalanceOnPoolInUnderlying.gt(borrowedAmount)) diff = borrowBalanceOnPoolInUnderlying.sub(borrowedAmount);
        else diff = borrowedAmount.sub(borrowBalanceOnPoolInUnderlying);
        expect(removeDigitsBigNumber(1, diff)).to.equal(0);
        // Update previous borrow index
        previousBorrowIndex = borrowIndex;
      }

      // Check Morpho balances
      expect(await daiToken.balanceOf(morphoPositionsManagerForCompound.address)).to.equal(0);
      expect(await cDaiToken.callStatic.borrowBalanceCurrent(morphoPositionsManagerForCompound.address)).to.equal(expectedMorphoBorrowBalance);
    });

    it('Borrower should be able to repay less than what is on Compound', async () => {
      const amount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, amount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, amount);
      const collateralBalanceInCToken = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool;
      const cTokenExchangeRate = await cUsdcToken.callStatic.exchangeRateCurrent();
      const collateralBalanceInUnderlying = cTokenToUnderlying(collateralBalanceInCToken, cTokenExchangeRate);
      const { collateralFactorMantissa } = await comptroller.markets(config.tokens.cDai.address);
      const usdcPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cUsdc.address);
      const daiPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cDai.address);
      const maxToBorrow = collateralBalanceInUnderlying.mul(usdcPriceMantissa).div(daiPriceMantissa).mul(collateralFactorMantissa).div(SCALE);

      const daiBalanceBefore = await daiToken.balanceOf(borrower1.getAddress());
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, maxToBorrow);
      const borrowBalanceOnPool = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool;
      const borrowIndex1 = await cDaiToken.borrowIndex();
      const borrowBalanceOnPoolInUnderlying = cDUnitToUnderlying(borrowBalanceOnPool, borrowIndex1);
      const toRepay = borrowBalanceOnPoolInUnderlying.div(2);
      await daiToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, toRepay);
      const borrowIndex2 = await cDaiToken.borrowIndex();
      await morphoPositionsManagerForCompound.connect(borrower1).repay(config.tokens.cDai.address, toRepay);
      const daiBalanceAfter = await daiToken.balanceOf(borrower1.getAddress());

      const expectedBalanceOnPool = borrowBalanceOnPool.sub(underlyingToCdUnit(borrowBalanceOnPoolInUnderlying.div(2), borrowIndex2));
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.equal(expectedBalanceOnPool);
      expect(daiBalanceAfter).to.equal(daiBalanceBefore.add(maxToBorrow).sub(toRepay));
    });
  });

  describe('P2P interactions between supplier and borrowers', () => {
    it('Supplier should withdraw her liquidity while not enough cToken in peer-to-peer contract', async () => {
      // Supplier supplys tokens
      const supplyAmount = utils.parseUnits('10');
      const daiBalanceBefore1 = await daiToken.balanceOf(supplier1.getAddress());
      const expectedDaiBalanceAfter1 = daiBalanceBefore1.sub(supplyAmount);
      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, supplyAmount);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, supplyAmount);
      const daiBalanceAfter1 = await daiToken.balanceOf(supplier1.getAddress());

      // Check ERC20 balance
      expect(daiBalanceAfter1).to.equal(expectedDaiBalanceAfter1);
      const cTokenExchangeRate1 = await cDaiToken.callStatic.exchangeRateCurrent();
      const expectedSupplyBalanceOnPool1 = underlyingToCToken(supplyAmount, cTokenExchangeRate1);
      expect(await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address)).to.equal(expectedSupplyBalanceOnPool1);
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool).to.equal(expectedSupplyBalanceOnPool1);

      // Borrower provides collateral
      const collateralAmount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, collateralAmount);

      // Borrowers borrows supplier1 amount
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, supplyAmount);

      // Check supplier1 balances
      const cTokenExchangeRate2 = await cDaiToken.callStatic.exchangeRateCurrent();
      const p2pExchangeRate1 = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      const expectedSupplyBalanceOnPool2 = expectedSupplyBalanceOnPool1.sub(underlyingToCToken(supplyAmount, cTokenExchangeRate2));
      const expectedSupplyBalanceInP2P2 = underlyingToP2pUnit(supplyAmount, p2pExchangeRate1);
      const supplyBalanceOnPool2 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      const supplyBalanceInP2P2 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P;
      expect(supplyBalanceOnPool2).to.equal(expectedSupplyBalanceOnPool2);
      expect(supplyBalanceInP2P2).to.equal(expectedSupplyBalanceInP2P2);

      // Check borrower1 balances
      const expectedBorrowBalanceInP2P1 = expectedSupplyBalanceInP2P2;
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.equal(0);
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P).to.equal(expectedBorrowBalanceInP2P1);

      // Compoundare remaining to withdraw and the cToken contract balance
      await morphoMarketsManagerForCompound.connect(owner).updateP2pUnitExchangeRate(config.tokens.cDai.address);
      const p2pExchangeRate2 = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      const p2pExchangeRate3 = computeNewMorphoExchangeRate(p2pExchangeRate2, await morphoMarketsManagerForCompound.p2pBPY(config.tokens.cDai.address), 1, 0).toString();
      const daiBalanceBefore2 = await daiToken.balanceOf(supplier1.getAddress());
      const supplyBalanceOnPool3 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      const supplyBalanceInP2P3 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P;
      const cTokenExchangeRate3 = await cDaiToken.callStatic.exchangeRateStored();
      const supplyBalanceOnPoolInUnderlying = cTokenToUnderlying(supplyBalanceOnPool3, cTokenExchangeRate3);
      const amountToWithdraw = supplyBalanceOnPoolInUnderlying.add(p2pUnitToUnderlying(supplyBalanceInP2P3, p2pExchangeRate3));
      const expectedDaiBalanceAfter2 = daiBalanceBefore2.add(amountToWithdraw);
      const remainingToWithdraw = amountToWithdraw.sub(supplyBalanceOnPoolInUnderlying);
      const cTokenContractBalanceInUnderlying = cTokenToUnderlying(await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address), cTokenExchangeRate3);
      expect(remainingToWithdraw).to.be.gt(cTokenContractBalanceInUnderlying);

      // Expected borrow balances
      const expectedMorphoBorrowBalance = remainingToWithdraw.add(cTokenContractBalanceInUnderlying).sub(supplyBalanceOnPoolInUnderlying);

      // Withdraw
      await morphoPositionsManagerForCompound.connect(supplier1).withdraw(config.tokens.cDai.address, amountToWithdraw);
      const borrowIndex = await cDaiToken.borrowIndex();
      const expectedBorrowerBorrowBalanceOnPool = underlyingToCdUnit(expectedMorphoBorrowBalance, borrowIndex);
      const borrowBalance = await cDaiToken.callStatic.borrowBalanceCurrent(morphoPositionsManagerForCompound.address);
      const daiBalanceAfter2 = await daiToken.balanceOf(supplier1.getAddress());

      // Check borrow balance of Morpho
      expect(removeDigitsBigNumber(10, borrowBalance)).to.equal(removeDigitsBigNumber(10, expectedMorphoBorrowBalance));

      // Check supplier1 underlying balance
      expect(removeDigitsBigNumber(1, daiBalanceAfter2)).to.equal(removeDigitsBigNumber(1, expectedDaiBalanceAfter2));

      // Check supply balances of supplier1
      expect(removeDigitsBigNumber(1, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool)).to.equal(0);
      expect(removeDigitsBigNumber(9, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P)).to.equal(0);

      // Check borrow balances of borrower1
      expect(removeDigitsBigNumber(9, (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool)).to.equal(
        removeDigitsBigNumber(9, expectedBorrowerBorrowBalanceOnPool)
      );
      expect(removeDigitsBigNumber(9, (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P)).to.equal(0);
    });

    it('Supplier should withdraw her liquidity while enough cDaiToken in peer-to-peer contract', async () => {
      const supplyAmount = utils.parseUnits('10');
      let supplier;

      for (const i in suppliers) {
        supplier = suppliers[i];
        const daiBalanceBefore = await daiToken.balanceOf(supplier.getAddress());
        const expectedDaiBalanceAfter = daiBalanceBefore.sub(supplyAmount);
        await daiToken.connect(supplier).approve(morphoPositionsManagerForCompound.address, supplyAmount);
        await morphoPositionsManagerForCompound.connect(supplier).supply(config.tokens.cDai.address, supplyAmount);
        const daiBalanceAfter = await daiToken.balanceOf(supplier.getAddress());

        // Check ERC20 balance
        expect(daiBalanceAfter).to.equal(expectedDaiBalanceAfter);
        const cTokenExchangeRate = await cDaiToken.callStatic.exchangeRateStored();
        const expectedSupplyBalanceOnPool = underlyingToCToken(supplyAmount, cTokenExchangeRate);
        expect(removeDigitsBigNumber(4, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier.getAddress())).onPool)).to.equal(
          removeDigitsBigNumber(4, expectedSupplyBalanceOnPool)
        );
      }

      // Borrower provides collateral
      const collateralAmount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, collateralAmount);

      const previousSupplier1SupplyBalanceOnPool = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;

      // Borrowers borrows supplier1 amount
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, supplyAmount);

      // Check supplier1 balances
      const p2pExchangeRate1 = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      const cTokenExchangeRate2 = await cDaiToken.callStatic.exchangeRateCurrent();
      // Expected balances of supplier1
      const expectedSupplyBalanceOnPool2 = previousSupplier1SupplyBalanceOnPool.sub(underlyingToCToken(supplyAmount, cTokenExchangeRate2));
      const expectedSupplyBalanceInP2P2 = underlyingToP2pUnit(supplyAmount, p2pExchangeRate1);
      const supplyBalanceOnPool2 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      const supplyBalanceInP2P2 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P;
      expect(supplyBalanceOnPool2).to.equal(expectedSupplyBalanceOnPool2);
      expect(supplyBalanceInP2P2).to.equal(expectedSupplyBalanceInP2P2);

      // Check borrower1 balances
      const expectedBorrowBalanceInP2P1 = expectedSupplyBalanceInP2P2;
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.equal(0);
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P).to.equal(expectedBorrowBalanceInP2P1);

      // Compoundare remaining to withdraw and the cToken contract balance
      await morphoMarketsManagerForCompound.connect(owner).updateP2pUnitExchangeRate(config.tokens.cDai.address);
      const p2pExchangeRate2 = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      const p2pExchangeRate3 = computeNewMorphoExchangeRate(p2pExchangeRate2, await morphoMarketsManagerForCompound.p2pBPY(config.tokens.cDai.address), 1, 0).toString();
      const daiBalanceBefore2 = await daiToken.balanceOf(supplier1.getAddress());
      const supplyBalanceOnPool3 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      const supplyBalanceInP2P3 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P;
      const cTokenExchangeRate3 = await cDaiToken.callStatic.exchangeRateCurrent();
      const supplyBalanceOnPoolInUnderlying = cTokenToUnderlying(supplyBalanceOnPool3, cTokenExchangeRate3);
      const amountToWithdraw = supplyBalanceOnPoolInUnderlying.add(p2pUnitToUnderlying(supplyBalanceInP2P3, p2pExchangeRate3));
      const expectedDaiBalanceAfter2 = daiBalanceBefore2.add(amountToWithdraw);
      const remainingToWithdraw = amountToWithdraw.sub(supplyBalanceOnPoolInUnderlying);
      const cTokenContractBalanceInUnderlying = cTokenToUnderlying(await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address), cTokenExchangeRate3);
      expect(remainingToWithdraw).to.be.lt(cTokenContractBalanceInUnderlying);

      // supplier3 balances before the withdraw
      const supplier3SupplyBalanceOnPool = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier3.getAddress())).onPool;
      const supplier3SupplyBalanceInP2P = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier3.getAddress())).inP2P;

      // supplier2 balances before the withdraw
      const supplier2SupplyBalanceOnPool = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier2.getAddress())).onPool;
      const supplier2SupplyBalanceInP2P = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier2.getAddress())).inP2P;

      // borrower1 balances before the withdraw
      const borrower1BorrowBalanceOnPool = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool;
      const borrower1BorrowBalanceInP2P = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P;

      // Withdraw
      await morphoPositionsManagerForCompound.connect(supplier1).withdraw(config.tokens.cDai.address, amountToWithdraw);
      const cTokenExchangeRate4 = await cDaiToken.callStatic.exchangeRateStored();
      const borrowBalance = await cDaiToken.callStatic.borrowBalanceCurrent(morphoPositionsManagerForCompound.address);
      const daiBalanceAfter2 = await daiToken.balanceOf(supplier1.getAddress());

      const supplier2SupplyBalanceOnPoolInUnderlying = cTokenToUnderlying(supplier2SupplyBalanceOnPool, cTokenExchangeRate4);
      const amountToMove = bigNumberMin(supplier2SupplyBalanceOnPoolInUnderlying, remainingToWithdraw);
      const p2pExchangeRate4 = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      const expectedSupplier2SupplyBalanceOnPool = supplier2SupplyBalanceOnPool.sub(underlyingToCToken(amountToMove, cTokenExchangeRate4));
      const expectedSupplier2SupplyBalanceInP2P = supplier2SupplyBalanceInP2P.add(underlyingToP2pUnit(amountToMove, p2pExchangeRate4));

      // Check borrow balance of Morpho
      expect(borrowBalance).to.equal(0);

      // Check supplier1 underlying balance
      expect(daiBalanceAfter2).to.equal(expectedDaiBalanceAfter2);

      // Check supply balances of supplier1
      expect(removeDigitsBigNumber(1, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool)).to.equal(0);
      expect(removeDigitsBigNumber(5, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P)).to.equal(0);

      // Check supply balances of supplier2: supplier2 should have replaced supplier1
      expect(removeDigitsBigNumber(1, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier2.getAddress())).onPool)).to.equal(
        removeDigitsBigNumber(1, expectedSupplier2SupplyBalanceOnPool)
      );
      expect(removeDigitsBigNumber(7, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier2.getAddress())).inP2P)).to.equal(
        removeDigitsBigNumber(7, expectedSupplier2SupplyBalanceInP2P)
      );

      // Check supply balances of supplier3: supplier3 balances should not move
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier3.getAddress())).onPool).to.equal(supplier3SupplyBalanceOnPool);
      expect((await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier3.getAddress())).inP2P).to.equal(supplier3SupplyBalanceInP2P);

      // Check borrow balances of borrower1: borrower1 balances should not move (except interest earn meanwhile)
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.equal(borrower1BorrowBalanceOnPool);
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P).to.equal(borrower1BorrowBalanceInP2P);
    });

    it('Borrower in peer-to-peer only, should be able to repay all borrow amount', async () => {
      // Supplier supplys tokens
      const supplyAmount = utils.parseUnits('10');
      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, supplyAmount);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, supplyAmount);

      // Borrower borrows half of the tokens
      const collateralAmount = to6Decimals(utils.parseUnits('100'));
      const daiBalanceBefore = await daiToken.balanceOf(borrower1.getAddress());
      const toBorrow = supplyAmount.div(2);

      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, toBorrow);

      const borrowerBalanceInP2P = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P;
      const p2pBPY = await morphoMarketsManagerForCompound.p2pBPY(config.tokens.cDai.address);
      await morphoMarketsManagerForCompound.updateP2pUnitExchangeRate(config.tokens.cDai.address);
      const p2pUnitExchangeRate = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      // WARNING: Should be one block but the pow function used in contract is not accurate
      const p2pExchangeRate = computeNewMorphoExchangeRate(p2pUnitExchangeRate, p2pBPY, 1, 0).toString();
      const toRepay = p2pUnitToUnderlying(borrowerBalanceInP2P, p2pExchangeRate);
      const expectedDaiBalanceAfter = daiBalanceBefore.add(toBorrow).sub(toRepay);
      const previousMorphoCTokenBalance = await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address);

      // Repay
      await daiToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, toRepay);
      await morphoPositionsManagerForCompound.connect(borrower1).repay(config.tokens.cDai.address, toRepay);
      const cTokenExchangeRate = await cDaiToken.callStatic.exchangeRateStored();
      const expectedMorphoCTokenBalance = previousMorphoCTokenBalance.add(underlyingToCToken(toRepay, cTokenExchangeRate));

      // Check borrower1 balances
      const daiBalanceAfter = await daiToken.balanceOf(borrower1.getAddress());
      expect(daiBalanceAfter).to.equal(expectedDaiBalanceAfter);
      // TODO: implement interest for borrowers to compoundlete this test as borrower's debt is not increasing here
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.equal(0);
      // Commented here due to the pow function issue
      // expect(removeDigitsBigNumber(1, (await morphoPositionsManagerForCompound.borrowBalanceInOf(borrower1.getAddress())).inP2P)).to.equal(0);

      // Check Morpho balances
      expect(await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address)).to.equal(expectedMorphoCTokenBalance);
      expect(await cDaiToken.callStatic.borrowBalanceCurrent(morphoPositionsManagerForCompound.address)).to.equal(0);
    });

    it('Borrower in peer-to-peer and on Compound, should be able to repay all borrow amount', async () => {
      // Supplier supplys tokens
      const supplyAmount = utils.parseUnits('10');
      const amountToApprove = utils.parseUnits('100000000');
      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, supplyAmount);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, supplyAmount);

      // Borrower borrows two times the amount of tokens;
      const collateralAmount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, collateralAmount);
      const daiBalanceBefore = await daiToken.balanceOf(borrower1.getAddress());
      const toBorrow = supplyAmount.mul(2);
      const supplyBalanceOnPool = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, toBorrow);

      const cTokenExchangeRate1 = await cDaiToken.callStatic.exchangeRateStored();
      const expectedMorphoBorrowBalance1 = toBorrow.sub(cTokenToUnderlying(supplyBalanceOnPool, cTokenExchangeRate1));
      const morphoBorrowBalanceBefore1 = await cDaiToken.callStatic.borrowBalanceCurrent(morphoPositionsManagerForCompound.address);
      expect(removeDigitsBigNumber(6, morphoBorrowBalanceBefore1)).to.equal(removeDigitsBigNumber(6, expectedMorphoBorrowBalance1));
      await daiToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, amountToApprove);

      const borrowerBalanceInP2P = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P;
      const p2pBPY = await morphoMarketsManagerForCompound.p2pBPY(config.tokens.cDai.address);
      const p2pUnitExchangeRate = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      // WARNING: Should be 2 blocks but the pow function used in contract is not accurate
      const p2pExchangeRate = computeNewMorphoExchangeRate(p2pUnitExchangeRate, p2pBPY, 1, 0).toString();
      const borrowerBalanceInP2PInUnderlying = p2pUnitToUnderlying(borrowerBalanceInP2P, p2pExchangeRate);

      // Compoundute how much to repay
      const doUpdate = await cDaiToken.borrowBalanceCurrent(morphoPositionsManagerForCompound.address);
      await doUpdate.wait(1);
      const borrowIndex1 = await cDaiToken.borrowIndex();
      const borrowerBalanceOnPool = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool;
      const toRepay = borrowerBalanceOnPool.mul(borrowIndex1).div(SCALE).add(borrowerBalanceInP2PInUnderlying);
      const expectedDaiBalanceAfter = daiBalanceBefore.add(toBorrow).sub(toRepay);
      const previousMorphoCTokenBalance = await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address);

      // Repay
      await daiToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, toRepay);
      const borrowIndex3 = await cDaiToken.callStatic.borrowIndex();
      await morphoPositionsManagerForCompound.connect(borrower1).repay(config.tokens.cDai.address, toRepay);
      const cTokenExchangeRate2 = await cDaiToken.callStatic.exchangeRateStored();
      const expectedMorphoCTokenBalance = previousMorphoCTokenBalance.add(underlyingToCToken(borrowerBalanceInP2PInUnderlying, cTokenExchangeRate2));
      const expectedBalanceOnPool = borrowerBalanceOnPool.sub(borrowerBalanceOnPool.mul(borrowIndex1).div(borrowIndex3));

      // Check borrower1 balances
      const daiBalanceAfter = await daiToken.balanceOf(borrower1.getAddress());
      expect(daiBalanceAfter).to.equal(expectedDaiBalanceAfter);
      const borrower1BorrowBalanceOnPool = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool;
      expect(removeDigitsBigNumber(2, borrower1BorrowBalanceOnPool)).to.equal(removeDigitsBigNumber(2, expectedBalanceOnPool));
      // WARNING: Commented here due to the pow function issue
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P).to.be.lt(1000000000000);

      // Check Morpho balances
      expect(removeDigitsBigNumber(6, await cDaiToken.balanceOf(morphoPositionsManagerForCompound.address))).to.equal(removeDigitsBigNumber(6, expectedMorphoCTokenBalance));
      // Issue here: we cannot access the most updated borrow balance as it's updated during the repayBorrow on Compound.
      // const expectedMorphoBorrowBalance2 = morphoBorrowBalanceBefore2.sub(borrowerBalanceOnPool.mul(borrowIndex2).div(SCALE));
      // expect(removeDigitsBigNumber(3, await cToken.callStatic.borrowBalanceStored(morphoPositionsManagerForCompound.address))).to.equal(removeDigitsBigNumber(3, expectedMorphoBorrowBalance2));
    });

    it('Should disconnect supplier from Morpho when borrow an asset that nobody has on morphoMarketsManagerForCompound and the supply balance is partly used', async () => {
      // supplier1 supplys DAI
      const supplyAmount = utils.parseUnits('100');
      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, supplyAmount);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, supplyAmount);

      // borrower1 supplys USDC as collateral
      const collateralAmount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, collateralAmount);

      // borrower1 borrows part of the supply amount of supplier1
      const amountToBorrow = supplyAmount.div(2);
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, amountToBorrow);
      const borrowBalanceInP2P = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P;

      // supplier1 borrows USDT that nobody is supply in peer-to-peer
      const cDaiExchangeRate1 = await cDaiToken.callStatic.exchangeRateCurrent();
      const mDaiExchangeRate1 = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      const supplyBalanceOnPool1 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      const supplyBalanceInP2P1 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P;
      const supplyBalanceOnPoolInUnderlying = cTokenToUnderlying(supplyBalanceOnPool1, cDaiExchangeRate1);
      const supplyBalanceMorphoInUnderlying = p2pUnitToUnderlying(supplyBalanceInP2P1, mDaiExchangeRate1);
      const supplyBalanceInUnderlying = supplyBalanceOnPoolInUnderlying.add(supplyBalanceMorphoInUnderlying);
      const { collateralFactorMantissa } = await comptroller.markets(config.tokens.cDai.address);
      const usdtPriceMantissa = await compoundOracle.callStatic.getUnderlyingPrice(config.tokens.cUsdt.address);
      const daiPriceMantissa = await compoundOracle.callStatic.getUnderlyingPrice(config.tokens.cDai.address);
      const maxToBorrow = supplyBalanceInUnderlying.mul(daiPriceMantissa).div(usdtPriceMantissa).mul(collateralFactorMantissa).div(SCALE);
      await morphoPositionsManagerForCompound.connect(supplier1).borrow(config.tokens.cUsdt.address, maxToBorrow);

      // Check balances
      const supplyBalanceOnPool2 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      const borrowBalanceOnPool = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool;
      const cDaiExchangeRate2 = await cDaiToken.callStatic.exchangeRateCurrent();
      const cDaiBorrowIndex = await cDaiToken.borrowIndex();
      const mDaiExchangeRate2 = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      const expectedBorrowBalanceOnPool = p2pUnitToUnderlying(borrowBalanceInP2P, mDaiExchangeRate2).mul(SCALE).div(cDaiBorrowIndex);
      const usdtBorrowBalance = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cUsdt.address, supplier1.getAddress())).onPool;
      const cUsdtBorrowIndex = await cUsdtToken.borrowIndex();
      const usdtBorrowBalanceInUnderlying = usdtBorrowBalance.mul(cUsdtBorrowIndex).div(SCALE);
      expect(removeDigitsBigNumber(6, supplyBalanceOnPool2)).to.equal(removeDigitsBigNumber(6, underlyingToCToken(supplyBalanceInUnderlying, cDaiExchangeRate2)));
      expect(removeDigitsBigNumber(2, borrowBalanceOnPool)).to.equal(removeDigitsBigNumber(2, expectedBorrowBalanceOnPool));
      expect(removeDigitsBigNumber(2, usdtBorrowBalanceInUnderlying)).to.equal(removeDigitsBigNumber(2, maxToBorrow));
    });

    it('Supplier should be connected to borrowers already in peer-to-peer when supplying', async () => {
      const collateralAmount = to6Decimals(utils.parseUnits('100'));
      const supplyAmount = utils.parseUnits('100');
      const borrowAmount = utils.parseUnits('30');

      // borrower1 borrows
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, borrowAmount);
      const borrower1BorrowBalanceOnPool = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool;

      // borrower2 borrows
      await usdcToken.connect(borrower2).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower2).supply(config.tokens.cUsdc.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower2).borrow(config.tokens.cDai.address, borrowAmount);
      const borrower2BorrowBalanceOnPool = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower2.getAddress())).onPool;

      // borrower3 borrows
      await usdcToken.connect(borrower3).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower3).supply(config.tokens.cUsdc.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower3).borrow(config.tokens.cDai.address, borrowAmount);
      const borrower3BorrowBalanceOnPool = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower3.getAddress())).onPool;

      // supplier1 supply
      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, supplyAmount);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, supplyAmount);
      const cTokenExchangeRate = await cDaiToken.callStatic.exchangeRateStored();
      const borrowIndex = await cDaiToken.borrowIndex();
      const p2pUnitExchangeRate = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);

      // Check balances
      const supplyBalanceInP2P = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).inP2P;
      const supplyBalanceOnPool = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cDai.address, supplier1.getAddress())).onPool;
      const underlyingMatched = cDUnitToUnderlying(borrower1BorrowBalanceOnPool.add(borrower2BorrowBalanceOnPool).add(borrower3BorrowBalanceOnPool), borrowIndex);
      expectedSupplyBalanceInP2P = underlyingMatched.mul(SCALE).div(p2pUnitExchangeRate);
      expectedSupplyBalanceOnPool = underlyingToCToken(supplyAmount.sub(underlyingMatched), cTokenExchangeRate);
      expect(removeDigitsBigNumber(2, supplyBalanceInP2P)).to.equal(removeDigitsBigNumber(2, expectedSupplyBalanceInP2P));
      expect(supplyBalanceOnPool).to.equal(expectedSupplyBalanceOnPool);
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.be.lte(1);
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower2.getAddress())).onPool).to.be.lte(1);
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower3.getAddress())).onPool).to.be.lte(1);
    });

    it('User can borrow partially on Compound when suppliers have debt (Avoid Infinite loop)', async () => {
      // This test produces a scenario where a user wants to borrow funds and tries to match with some suppliers.
      // Because those suppliers are having debt on compound, their collaterals can not be given to a borrower.
      // We look for the users with the highest value that do not have debt on compound.
      // If, for a given checked value, all of the borrowers have debt on compound, we need to go check for the second highest value.
      // and not end up having an infinite loop, checking all the time the highest value.

      const collateralAmount = utils.parseUnits('500');
      const supplyAmount = utils.parseUnits('100');
      const borrowAmount = utils.parseUnits('10');
      const borrowAmountForDAI = utils.parseUnits('200');

      // supplier1 supplies 100 DAI
      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, supplyAmount);
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, supplyAmount);

      // Borrower1 borrows 10 UNI and collateralises 500 DAI
      await daiToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cDai.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cUni.address, borrowAmount);

      // Borrower2 borrows 10 UNI and collateralises 500 DAI
      await daiToken.connect(borrower2).approve(morphoPositionsManagerForCompound.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower2).supply(config.tokens.cDai.address, collateralAmount);
      await morphoPositionsManagerForCompound.connect(borrower2).borrow(config.tokens.cUni.address, borrowAmount);

      // borrower3 wants to borrow 200 DAI
      await usdcToken.connect(borrower3).approve(morphoPositionsManagerForCompound.address, to6Decimals(utils.parseUnits('500')));
      await morphoPositionsManagerForCompound.connect(borrower3).supply(config.tokens.cUsdc.address, to6Decimals(utils.parseUnits('500')));
      await expect(morphoPositionsManagerForCompound.connect(borrower3).borrow(config.tokens.cDai.address, borrowAmountForDAI)).to.not.be.reverted;
    });
  });

  describe('Test liquidation', () => {
    it('Borrower should be liquidated while supply (collateral) is only on Compound', async () => {
      // Deploy custom price oracle
      const PriceOracle = await ethers.getContractFactory('SimplePriceOracle');
      priceOracle = await PriceOracle.deploy();
      await priceOracle.deployed();

      // Install admin user
      const adminAddress = await comptroller.admin();
      await hre.network.provider.send('hardhat_impersonateAccount', [adminAddress]);
      await hre.network.provider.send('hardhat_setBalance', [adminAddress, ethers.utils.parseEther('10').toHexString()]);
      const admin = await ethers.getSigner(adminAddress);

      // Deposit
      const amount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, amount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, amount);
      const collateralBalanceInCToken = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool;
      const cTokenExchangeRate = await cUsdcToken.callStatic.exchangeRateCurrent();
      const collateralBalanceInUnderlying = cTokenToUnderlying(collateralBalanceInCToken, cTokenExchangeRate);
      const { collateralFactorMantissa } = await comptroller.markets(config.tokens.cUsdc.address);
      const usdcPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cUsdc.address);
      const daiPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cDai.address);
      const maxToBorrow = collateralBalanceInUnderlying.mul(usdcPriceMantissa).div(daiPriceMantissa).mul(collateralFactorMantissa).div(SCALE);

      // Borrow
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, maxToBorrow);
      const collateralBalanceBefore = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool;
      const borrowBalanceBefore = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool;

      // Set price oracle
      await comptroller.connect(admin)._setPriceOracle(priceOracle.address);
      priceOracle.setUnderlyingPrice(config.tokens.cDai.address, BigNumber.from('1010182920000000000'));
      priceOracle.setUnderlyingPrice(config.tokens.cUsdc.address, BigNumber.from('1000000000000000000000000000000'));
      priceOracle.setUnderlyingPrice(config.tokens.cUni.address, BigNumber.from('1000000000000000000000000000000'));
      priceOracle.setUnderlyingPrice(config.tokens.cUsdt.address, BigNumber.from('1000000000000000000000000000000'));

      // Force compoundOracle update by setting comptroller again (but with the custom price oracle)
      await hre.network.provider.send('hardhat_impersonateAccount', [morphoMarketsManagerForCompound.address]);
      await hre.network.provider.send('hardhat_setBalance', [morphoMarketsManagerForCompound.address, ethers.utils.parseEther('10').toHexString()]);
      const morphoMarketsManagerUser = await ethers.getSigner(morphoMarketsManagerForCompound.address);
      await morphoPositionsManagerForCompound.connect(morphoMarketsManagerUser).setComptroller(comptroller.address);

      // Mine block
      await hre.network.provider.send('evm_mine', []);

      // Liquidate
      const toRepay = maxToBorrow.div(2);
      await daiToken.connect(liquidator).approve(morphoPositionsManagerForCompound.address, toRepay);
      const usdcBalanceBefore = await usdcToken.balanceOf(liquidator.getAddress());
      const daiBalanceBefore = await daiToken.balanceOf(liquidator.getAddress());
      await morphoPositionsManagerForCompound.connect(liquidator).liquidate(config.tokens.cDai.address, config.tokens.cUsdc.address, borrower1.getAddress(), toRepay);
      const usdcBalanceAfter = await usdcToken.balanceOf(liquidator.getAddress());
      const daiBalanceAfter = await daiToken.balanceOf(liquidator.getAddress());

      // Liquidation parameters
      const borrowIndex = await cDaiToken.borrowIndex();
      const cUsdcTokenExchangeRate = await cUsdcToken.callStatic.exchangeRateCurrent();
      const liquidationIncentive = await comptroller.liquidationIncentiveMantissa();
      const collateralAssetPrice = await priceOracle.getUnderlyingPrice(config.tokens.cUsdc.address);
      const borrowedAssetPrice = await priceOracle.getUnderlyingPrice(config.tokens.cDai.address);
      const amountToSeize = toRepay.mul(borrowedAssetPrice).div(collateralAssetPrice).mul(liquidationIncentive).div(SCALE);
      const expectedCollateralBalanceAfter = collateralBalanceBefore.sub(underlyingToCToken(amountToSeize, cUsdcTokenExchangeRate));
      const expectedBorrowBalanceAfter = borrowBalanceBefore.sub(underlyingToCdUnit(toRepay, borrowIndex));
      const expectedUsdcBalanceAfter = usdcBalanceBefore.add(amountToSeize);
      const expectedDaiBalanceAfter = daiBalanceBefore.sub(toRepay);

      // Check balances
      expect(removeDigitsBigNumber(6, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool)).to.equal(
        removeDigitsBigNumber(6, expectedCollateralBalanceAfter)
      );
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.equal(expectedBorrowBalanceAfter);
      expect(removeDigitsBigNumber(1, usdcBalanceAfter)).to.equal(removeDigitsBigNumber(1, expectedUsdcBalanceAfter));
      expect(daiBalanceAfter).to.equal(expectedDaiBalanceAfter);
    });

    it('Borrower should be liquidated while supply (collateral) is on Compound and in peer-to-peer', async () => {
      // Deploy custom price oracle
      const PriceOracle = await ethers.getContractFactory('SimplePriceOracle');
      priceOracle = await PriceOracle.deploy();
      await priceOracle.deployed();

      // Install admin user
      const adminAddress = await comptroller.admin();
      await hre.network.provider.send('hardhat_impersonateAccount', [adminAddress]);
      await hre.network.provider.send('hardhat_setBalance', [adminAddress, ethers.utils.parseEther('10').toHexString()]);
      const admin = await ethers.getSigner(adminAddress);

      await daiToken.connect(supplier1).approve(morphoPositionsManagerForCompound.address, utils.parseUnits('1000'));
      await morphoPositionsManagerForCompound.connect(supplier1).supply(config.tokens.cDai.address, utils.parseUnits('1000'));

      // borrower1 supplys USDC as supply (collateral)
      const amount = to6Decimals(utils.parseUnits('100'));
      await usdcToken.connect(borrower1).approve(morphoPositionsManagerForCompound.address, amount);
      await morphoPositionsManagerForCompound.connect(borrower1).supply(config.tokens.cUsdc.address, amount);

      // borrower2 borrows part of supply of borrower1 -> borrower1 has supply in peer-to-peer and on Compound
      const toBorrow = amount;
      await uniToken.connect(borrower2).approve(morphoPositionsManagerForCompound.address, utils.parseUnits('50'));
      await morphoPositionsManagerForCompound.connect(borrower2).supply(config.tokens.cUni.address, utils.parseUnits('50'));
      await morphoPositionsManagerForCompound.connect(borrower2).borrow(config.tokens.cUsdc.address, toBorrow);

      // borrower1 borrows DAI
      const cUsdcTokenExchangeRate1 = await cUsdcToken.callStatic.exchangeRateCurrent();
      const mUsdcTokenExchangeRate1 = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cUsdc.address);
      const supplyBalanceOnPool1 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool;
      const supplyBalanceInP2P1 = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).inP2P;
      const supplyBalanceOnPoolInUnderlying = cTokenToUnderlying(supplyBalanceOnPool1, cUsdcTokenExchangeRate1);
      const supplyBalanceMorphoInUnderlying = p2pUnitToUnderlying(supplyBalanceInP2P1, mUsdcTokenExchangeRate1);
      const supplyBalanceInUnderlying = supplyBalanceOnPoolInUnderlying.add(supplyBalanceMorphoInUnderlying);
      const { collateralFactorMantissa } = await comptroller.markets(config.tokens.cUsdc.address);
      const usdcPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cUsdc.address);
      const daiPriceMantissa = await compoundOracle.getUnderlyingPrice(config.tokens.cDai.address);
      const maxToBorrow = supplyBalanceInUnderlying.mul(usdcPriceMantissa).div(daiPriceMantissa).mul(collateralFactorMantissa).div(SCALE);
      await morphoPositionsManagerForCompound.connect(borrower1).borrow(config.tokens.cDai.address, maxToBorrow);
      const collateralBalanceOnPoolBefore = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool;
      const collateralBalanceInP2PBefore = (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).inP2P;
      const borrowBalanceInP2PBefore = (await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P;

      // Set price oracle
      await comptroller.connect(admin)._setPriceOracle(priceOracle.address);
      priceOracle.setUnderlyingPrice(config.tokens.cDai.address, BigNumber.from('1020182920000000000'));
      priceOracle.setUnderlyingPrice(config.tokens.cUsdc.address, BigNumber.from('1000000000000000000000000000000'));
      priceOracle.setUnderlyingPrice(config.tokens.cUni.address, BigNumber.from('1000000000000000000000000000000'));
      priceOracle.setUnderlyingPrice(config.tokens.cUsdt.address, BigNumber.from('1000000000000000000000000000000'));

      // Force compoundOracle update by setting comptroller again (but with the custom price oracle)
      await hre.network.provider.send('hardhat_impersonateAccount', [morphoMarketsManagerForCompound.address]);
      await hre.network.provider.send('hardhat_setBalance', [morphoMarketsManagerForCompound.address, ethers.utils.parseEther('10').toHexString()]);
      const morphoMarketsManagerUser = await ethers.getSigner(morphoMarketsManagerForCompound.address);
      await morphoPositionsManagerForCompound.connect(morphoMarketsManagerUser).setComptroller(comptroller.address);

      // Mine block
      await hre.network.provider.send('evm_mine', []);

      // liquidator liquidates borrower1's position
      const closeFactor = await comptroller.closeFactorMantissa();
      const toRepay = maxToBorrow.mul(closeFactor).div(SCALE);
      await daiToken.connect(liquidator).approve(morphoPositionsManagerForCompound.address, toRepay);
      const usdcBalanceBefore = await usdcToken.balanceOf(liquidator.getAddress());
      const daiBalanceBefore = await daiToken.balanceOf(liquidator.getAddress());
      await morphoPositionsManagerForCompound.connect(liquidator).liquidate(config.tokens.cDai.address, config.tokens.cUsdc.address, borrower1.getAddress(), toRepay);
      const usdcBalanceAfter = await usdcToken.balanceOf(liquidator.getAddress());
      const daiBalanceAfter = await daiToken.balanceOf(liquidator.getAddress());

      // Liquidation parameters
      const mDaiExchangeRate = await morphoMarketsManagerForCompound.p2pUnitExchangeRate(config.tokens.cDai.address);
      const cUsdcTokenExchangeRate = await cUsdcToken.callStatic.exchangeRateCurrent();
      const liquidationIncentive = await comptroller.liquidationIncentiveMantissa();
      const collateralAssetPrice = await priceOracle.getUnderlyingPrice(config.tokens.cUsdc.address);
      const borrowedAssetPrice = await priceOracle.getUnderlyingPrice(config.tokens.cDai.address);
      const amountToSeize = toRepay.mul(borrowedAssetPrice).div(collateralAssetPrice).mul(liquidationIncentive).div(SCALE);
      const expectedCollateralBalanceInP2PAfter = collateralBalanceInP2PBefore.sub(amountToSeize.sub(cTokenToUnderlying(collateralBalanceOnPoolBefore, cUsdcTokenExchangeRate)));
      const expectedBorrowBalanceInP2PAfter = borrowBalanceInP2PBefore.sub(toRepay.mul(SCALE).div(mDaiExchangeRate));
      const expectedUsdcBalanceAfter = usdcBalanceBefore.add(amountToSeize);
      const expectedDaiBalanceAfter = daiBalanceBefore.sub(toRepay);

      // Check liquidatee balances
      expect(removeDigitsBigNumber(4, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).onPool)).to.equal(0);
      expect(removeDigitsBigNumber(2, (await morphoPositionsManagerForCompound.supplyBalanceInOf(config.tokens.cUsdc.address, borrower1.getAddress())).inP2P)).to.equal(
        removeDigitsBigNumber(2, expectedCollateralBalanceInP2PAfter)
      );
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).onPool).to.equal(0);
      expect((await morphoPositionsManagerForCompound.borrowBalanceInOf(config.tokens.cDai.address, borrower1.getAddress())).inP2P).to.equal(expectedBorrowBalanceInP2PAfter);

      // Check liquidator balances
      let diff;
      if (usdcBalanceAfter.gt(expectedUsdcBalanceAfter)) diff = usdcBalanceAfter.sub(expectedUsdcBalanceAfter);
      else diff = expectedUsdcBalanceAfter.sub(usdcBalanceAfter);
      expect(removeDigitsBigNumber(1, diff)).to.equal(0);
      expect(daiBalanceAfter).to.equal(expectedDaiBalanceAfter);
    });
  });

  xdescribe('Test attacks', () => {
    it('Should not be DDOS by a supplier or a group of suppliers', async () => {});

    it('Should not be DDOS by a borrower or a group of borrowers', async () => {});

    it('Should not be subject to flash loan attacks', async () => {});

    it('Should not be subjected to Oracle Manipulation attacks', async () => {});
  });
});