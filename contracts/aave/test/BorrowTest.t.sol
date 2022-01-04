// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.7;

import "./TestSetup.sol";

contract BorrowTest is TestSetup {
    // 2.1 - The user borrows less than the threshold of the given market, the transaction reverts.
    function testFail_borrow_2_1() public {
        uint256 amount = positionsManager.threshold(aDai) - 1;
        borrower1.approve(dai, amount);
        borrower1.borrow(aDai, amount);
    }

    function testFail_borrow_2_1_usdc() public {
        uint256 amount = positionsManager.threshold(aUsdc) - 1;
        borrower1.approve(usdc, to6Decimals(2 * amount));
        borrower1.borrow(aUsdc, to6Decimals(2 * amount));
    }

    // 2.2 - The borrower tries to borrow more than his collateral allows, the transaction reverts.
    function testFail_borrow_2_2() public {
        uint256 amount = 10000 ether;

        borrower1.approve(usdc, amount);
        borrower1.supply(aUsdc, amount);

        uint256 maxToBorrow = get_max_to_borrow(
            amount,
            usdc,
            dai,
            SimplePriceOracle(lendingPoolAddressesProvider.getPriceOracle())
        );
        borrower1.borrow(aDai, maxToBorrow + 1);
    }

    // Should be able to borrow more ERC20 after already having borrowed ERC20
    function testBorrowMultiple() public {
        uint256 amount = 10000 ether;

        borrower1.approve(usdc, address(positionsManager), to6Decimals(4 * amount));
        borrower1.supply(aUsdc, to6Decimals(4 * amount));

        borrower1.borrow(aDai, amount);
        borrower1.borrow(aDai, amount);

        (, uint256 onPool) = positionsManager.borrowBalanceInOf(aDai, address(borrower1));

        marketsManager.updateRates(aDai);
        uint256 normalizedVariableDebt = lendingPool.getReserveNormalizedVariableDebt(dai);
        uint256 expectedOnPool = underlyingToAdUnit(2 * amount, normalizedVariableDebt);
        testEquality(onPool, expectedOnPool);
    }

    // 2.3 - There are no available suppliers: all of the borrowed amount is onPool.
    function testBorrow_2_3() public {
        uint256 amount = 10000 ether;

        borrower1.approve(usdc, to6Decimals(2 * amount));
        borrower1.supply(aUsdc, to6Decimals(2 * amount));
        borrower1.borrow(aDai, amount);

        (uint256 inP2P, uint256 onPool) = positionsManager.borrowBalanceInOf(
            aDai,
            address(borrower1)
        );

        marketsManager.updateRates(aDai);
        uint256 normalizedVariableDebt = lendingPool.getReserveNormalizedVariableDebt(dai);
        uint256 expectedOnPool = underlyingToAdUnit(amount, normalizedVariableDebt);

        testEquality(onPool, expectedOnPool);
        testEquality(inP2P, 0);
    }

    // 2.4 - There is 1 available supplier, he matches 100% of the borrower liquidity, everything is inP2P.
    function testBorrow_2_4() public {
        uint256 amount = 10000 ether;

        borrower1.approve(usdc, to6Decimals(_amount * 2));
        borrower1.supply(aUsdc, to6Decimals(_amount * 2));
        borrower1.borrow(aDai, _amount);

        borrower1.approve(usdc, to6Decimals(amount * 2));
        borrower1.supply(aUsdc, to6Decimals(amount * 2));
        borrower1.borrow(aDai, amount);

        (uint256 supplyInP2P, ) = positionsManager.supplyBalanceInOf(aDai, address(supplier1));

        marketsManager.updateRates(aDai);
        uint256 p2pExchangeRate = marketsManager.p2pExchangeRate(aDai);
        uint256 expectedInP2P = p2pUnitToUnderlying(supplyInP2P, p2pExchangeRate);
        assertEq(expectedInP2P, _amount, "Supplier1 supply in P2P");

        testEquality(expectedInP2P, amount);

        (uint256 inP2P, uint256 onPool) = positionsManager.borrowBalanceInOf(
            aDai,
            address(borrower1)
        );

        testEquality(onPool, 0);
        testEquality(inP2P, supplyInP2P);
    }

    // 2.5 - There is 1 available supplier, he doesn't match 100% of the borrower liquidity.
    // Borrower inP2P is equal to the supplier previous amount onPool, the rest is set onPool.
    function testBorrow_2_5() public {
        uint256 amount = 10000 ether;

        supplier1.approve(dai, amount);
        supplier1.supply(aDai, amount);

        borrower1.approve(usdc, to6Decimals(4 * amount));
        borrower1.supply(aUsdc, to6Decimals(4 * amount));
        uint256 borrowAmount = amount * 2;
        borrower1.borrow(aDai, borrowAmount);

        (uint256 supplyInP2P, ) = positionsManager.supplyBalanceInOf(aDai, address(supplier1));

        (uint256 inP2P, uint256 onPool) = positionsManager.borrowBalanceInOf(
            aDai,
            address(borrower1)
        );

        testEquality(inP2P, supplyInP2P);

        marketsManager.updateRates(aDai);
        uint256 normalizedVariableDebt = lendingPool.getReserveNormalizedVariableDebt(dai);
        uint256 expectedOnPool = underlyingToAdUnit(amount, normalizedVariableDebt);

        testEquality(onPool, expectedOnPool);
    }

    // 2.6 - There are NMAX (or less) supplier that match the borrowed amount, everything is inP2P after NMAX (or less) match.
    function testBorrow_2_6() public {
        uint256 amount = 10000 ether;
        uint256 collateral = 2 * amount;

        setNMAXAndCreateSigners(20);
        uint256 NMAX = positionsManager.NMAX();

        uint256 amountPerSupplier = amount / NMAX;

        for (uint256 i = 0; i < NMAX; i++) {
            suppliers[i].approve(dai, amountPerSupplier);
            suppliers[i].supply(aDai, amountPerSupplier);
        }

        borrower1.approve(usdc, to6Decimals(collateral));
        borrower1.supply(aUsdc, to6Decimals(collateral));
        borrower1.borrow(aDai, amount);

        uint256 inP2P;
        uint256 onPool;
        uint256 p2pExchangeRate = marketsManager.p2pExchangeRate(aDai);
        uint256 expectedInP2P;

        for (uint256 i = 0; i < NMAX; i++) {
            (inP2P, onPool) = positionsManager.supplyBalanceInOf(aDai, address(suppliers[i]));

            expectedInP2P = p2pUnitToUnderlying(inP2P, p2pExchangeRate);

            testEquality(expectedInP2P, amountPerSupplier);
            testEquality(onPool, 0);
        }

        (inP2P, onPool) = positionsManager.borrowBalanceInOf(aDai, address(borrower1));
        expectedInP2P = p2pUnitToUnderlying(inP2P, p2pExchangeRate);

        testEquality(inP2P, amount);
        testEquality(onPool, 0);
    }

    // 2.7 - The NMAX biggest supplier don't match all of the borrowed amount, after NMAX match, the rest is borrowed and set onPool.
    // ⚠️ most gas expensive borrow scenario.
    function testBorrow_2_7() public {
        uint256 amount = 10000 ether;
        uint256 collateral = 2 * amount;

        setNMAXAndCreateSigners(20);
        uint256 NMAX = positionsManager.NMAX();

        uint256 amountPerSupplier = amount / (2 * NMAX);

        for (uint256 i = 0; i < NMAX; i++) {
            suppliers[i].approve(dai, amountPerSupplier);
            suppliers[i].supply(aDai, amountPerSupplier);
        }

        borrower1.approve(usdc, to6Decimals(collateral));
        borrower1.supply(aUsdc, to6Decimals(collateral));
        borrower1.borrow(aDai, amount);

        uint256 inP2P;
        uint256 onPool;
        uint256 p2pExchangeRate = marketsManager.p2pExchangeRate(aDai);
        uint256 normalizedVariableDebt = lendingPool.getReserveNormalizedVariableDebt(dai);
        uint256 expectedInP2P;

        for (uint256 i = 0; i < NMAX; i++) {
            (inP2P, onPool) = positionsManager.supplyBalanceInOf(aDai, address(suppliers[i]));

            expectedInP2P = p2pUnitToUnderlying(inP2P, p2pExchangeRate);

            testEquality(expectedInP2P, amountPerSupplier);
            testEquality(onPool, 0);
        }

        (inP2P, onPool) = positionsManager.borrowBalanceInOf(aDai, address(borrower1));

        expectedInP2P = p2pUnitToUnderlying(amount / 2, p2pExchangeRate);
        uint256 expectedOnPool = underlyingToAdUnit(amount / 2, normalizedVariableDebt);

        testEquality(inP2P, expectedInP2P);
        testEquality(onPool, expectedOnPool);
    }

    // ----------

    function get_max_to_borrow(
        uint256 _collateralInUnderlying,
        address _suppliedAsset,
        address _borrowedAsset,
        SimplePriceOracle _oracle
    ) internal view returns (uint256) {
        (, , uint256 liquidationThreshold, , , , , , , ) = protocolDataProvider
            .getReserveConfigurationData(_borrowedAsset);
        uint256 maxToBorrow = (((((_collateralInUnderlying *
            _oracle.getAssetPrice(_suppliedAsset)) / 10**ERC20(_suppliedAsset).decimals()) *
            10**ERC20(_borrowedAsset).decimals()) / _oracle.getAssetPrice(_borrowedAsset)) *
            liquidationThreshold) / PERCENT_BASE;
        return maxToBorrow;
    }
}
