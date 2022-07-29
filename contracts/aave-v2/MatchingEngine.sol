// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.13;

import "./MorphoUtils.sol";

/// @title MatchingEngine.
/// @author Morpho Labs.
/// @custom:contact security@morpho.xyz
/// @notice Smart contract managing the matching engine.
abstract contract MatchingEngine is MorphoUtils {
    using HeapOrdering for HeapOrdering.HeapArray;
    using WadRayMath for uint256;

    /// STRUCTS ///

    // Struct to avoid stack too deep.
    struct UnmatchVars {
        uint256 p2pIndex;
        uint256 toUnmatch;
        uint256 poolIndex;
    }

    // Struct to avoid stack too deep.
    struct MatchVars {
        uint256 p2pIndex;
        uint256 toMatch;
        uint256 poolIndex;
    }

    /// @notice Emitted when the position of a supplier is updated.
    /// @param _user The address of the supplier.
    /// @param _poolTokenAddress The address of the market.
    /// @param _balanceOnPool The supply balance on pool after update.
    /// @param _balanceInP2P The supply balance in peer-to-peer after update.
    event SupplierPositionUpdated(
        address indexed _user,
        address indexed _poolTokenAddress,
        uint256 _balanceOnPool,
        uint256 _balanceInP2P
    );

    /// @notice Emitted when the position of a borrower is updated.
    /// @param _user The address of the borrower.
    /// @param _poolTokenAddress The address of the market.
    /// @param _balanceOnPool The borrow balance on pool after update.
    /// @param _balanceInP2P The borrow balance in peer-to-peer after update.
    event BorrowerPositionUpdated(
        address indexed _user,
        address indexed _poolTokenAddress,
        uint256 _balanceOnPool,
        uint256 _balanceInP2P
    );

    /// INTERNAL ///

    /// @notice Matches suppliers' liquidity waiting on Aave up to the given `_amount` and moves it to peer-to-peer.
    /// @dev Note: This function expects Aave's exchange rate and peer-to-peer indexes to have been updated.
    /// @param _poolTokenAddress The address of the market from which to match suppliers.
    /// @param _amount The token amount to search for (in underlying).
    /// @param _maxGasForMatching The maximum amount of gas to consume within a matching engine loop.
    /// @return matched The amount of liquidity matched (in underlying).
    /// @return gasConsumedInMatching The amount of gas consumed within the matching loop.
    function _matchSuppliers(
        address _poolTokenAddress,
        uint256 _amount,
        uint256 _maxGasForMatching
    ) internal returns (uint256 matched, uint256 gasConsumedInMatching) {
        if (_maxGasForMatching == 0) return (0, 0);

        MatchVars memory vars;
        vars.poolIndex = poolIndexes[_poolTokenAddress].poolSupplyIndex;
        vars.p2pIndex = p2pSupplyIndex[_poolTokenAddress];
        address firstPoolSupplier;
        Types.SupplyBalance storage firstPoolSupplierBalance;
        uint256 remainingToMatch = _amount;

        uint256 newPoolSupplyBalance;
        uint256 newP2PSupplyBalance;

        uint256 gasLeftAtTheBeginning = gasleft();
        while (
            remainingToMatch > 0 &&
            (firstPoolSupplier = suppliersOnPool[_poolTokenAddress].getHead()) != address(0)
        ) {
            // Safe unchecked because `gasLeftAtTheBeginning` >= gas left now.
            unchecked {
                if (gasLeftAtTheBeginning - gasleft() >= _maxGasForMatching) break;
            }
            firstPoolSupplierBalance = supplyBalanceInOf[_poolTokenAddress][firstPoolSupplier];
            vars.toMatch = Math.min(
                firstPoolSupplierBalance.onPool.rayMul(vars.poolIndex),
                remainingToMatch
            );
            remainingToMatch -= vars.toMatch;

            newPoolSupplyBalance =
                firstPoolSupplierBalance.onPool -
                vars.toMatch.rayDiv(vars.poolIndex);
            newP2PSupplyBalance =
                firstPoolSupplierBalance.inP2P +
                vars.toMatch.rayDiv(vars.p2pIndex);

            supplyBalanceInOf[_poolTokenAddress][firstPoolSupplier].onPool = newPoolSupplyBalance;
            supplyBalanceInOf[_poolTokenAddress][firstPoolSupplier].inP2P = newP2PSupplyBalance;
            _updateSupplierInDS(_poolTokenAddress, firstPoolSupplier);
            emit SupplierPositionUpdated(
                firstPoolSupplier,
                _poolTokenAddress,
                newPoolSupplyBalance,
                newP2PSupplyBalance
            );
        }

        // Safe unchecked because `gasLeftAtTheBeginning` >= gas left now.
        // And _amount >= remainingToMatch.
        unchecked {
            matched = _amount - remainingToMatch;
            gasConsumedInMatching = gasLeftAtTheBeginning - gasleft();
        }
    }

    /// @notice Unmatches suppliers' liquidity in peer-to-peer up to the given `_amount` and moves it to Aave.
    /// @dev Note: This function expects Aave's exchange rate and peer-to-peer indexes to have been updated.
    /// @param _poolTokenAddress The address of the market from which to unmatch suppliers.
    /// @param _amount The amount to search for (in underlying).
    /// @param _maxGasForMatching The maximum amount of gas to consume within a matching engine loop.
    /// @return unmatched The amount unmatched (in underlying).
    function _unmatchSuppliers(
        address _poolTokenAddress,
        uint256 _amount,
        uint256 _maxGasForMatching
    ) internal returns (uint256 unmatched) {
        if (_maxGasForMatching == 0) return 0;

        UnmatchVars memory vars;
        vars.poolIndex = poolIndexes[_poolTokenAddress].poolSupplyIndex;
        vars.p2pIndex = p2pSupplyIndex[_poolTokenAddress];
        address firstP2PSupplier;
        Types.SupplyBalance storage firstP2PSupplierBalance;
        uint256 remainingToUnmatch = _amount;

        uint256 newPoolSupplyBalance;
        uint256 newP2PSupplyBalance;

        uint256 gasLeftAtTheBeginning = gasleft();
        while (
            remainingToUnmatch > 0 &&
            (firstP2PSupplier = suppliersInP2P[_poolTokenAddress].getHead()) != address(0)
        ) {
            // Safe unchecked because `gasLeftAtTheBeginning` >= gas left now.
            unchecked {
                if (gasLeftAtTheBeginning - gasleft() >= _maxGasForMatching) break;
            }
            firstP2PSupplierBalance = supplyBalanceInOf[_poolTokenAddress][firstP2PSupplier];
            vars.toUnmatch = Math.min(
                firstP2PSupplierBalance.inP2P.rayMul(vars.p2pIndex),
                remainingToUnmatch
            );
            remainingToUnmatch -= vars.toUnmatch;

            newPoolSupplyBalance =
                firstP2PSupplierBalance.onPool +
                vars.toUnmatch.rayDiv(vars.poolIndex);
            newP2PSupplyBalance =
                firstP2PSupplierBalance.inP2P -
                vars.toUnmatch.rayDiv(vars.p2pIndex);

            supplyBalanceInOf[_poolTokenAddress][firstP2PSupplier].onPool = newPoolSupplyBalance;
            supplyBalanceInOf[_poolTokenAddress][firstP2PSupplier].inP2P = newP2PSupplyBalance;
            _updateSupplierInDS(_poolTokenAddress, firstP2PSupplier);
            emit SupplierPositionUpdated(
                firstP2PSupplier,
                _poolTokenAddress,
                newPoolSupplyBalance,
                newP2PSupplyBalance
            );
        }

        // Safe unchecked because _amount >= remainingToUnmatch.
        unchecked {
            unmatched = _amount - remainingToUnmatch;
        }
    }

    /// @notice Matches borrowers' liquidity waiting on Aave up to the given `_amount` and moves it to peer-to-peer.
    /// @dev Note: This function expects peer-to-peer indexes to have been updated..
    /// @param _poolTokenAddress The address of the market from which to match borrowers.
    /// @param _amount The amount to search for (in underlying).
    /// @param _maxGasForMatching The maximum amount of gas to consume within a matching engine loop.
    /// @return matched The amount of liquidity matched (in underlying).
    /// @return gasConsumedInMatching The amount of gas consumed within the matching loop.
    function _matchBorrowers(
        address _poolTokenAddress,
        uint256 _amount,
        uint256 _maxGasForMatching
    ) internal returns (uint256 matched, uint256 gasConsumedInMatching) {
        if (_maxGasForMatching == 0) return (0, 0);
        MatchVars memory vars;
        vars.poolIndex = poolIndexes[_poolTokenAddress].poolBorrowIndex;
        vars.p2pIndex = p2pBorrowIndex[_poolTokenAddress];
        address firstPoolBorrower;
        Types.BorrowBalance storage firstPoolBorrowerBalance;
        uint256 remainingToMatch = _amount;

        uint256 newPoolBorrowBalance;
        uint256 newP2PBorrowBalance;

        uint256 gasLeftAtTheBeginning = gasleft();
        while (
            remainingToMatch > 0 &&
            (firstPoolBorrower = borrowersOnPool[_poolTokenAddress].getHead()) != address(0)
        ) {
            // Safe unchecked because `gasLeftAtTheBeginning` >= gas left now.
            unchecked {
                if (gasLeftAtTheBeginning - gasleft() >= _maxGasForMatching) break;
            }
            firstPoolBorrowerBalance = borrowBalanceInOf[_poolTokenAddress][firstPoolBorrower];
            vars.toMatch = Math.min(
                firstPoolBorrowerBalance.onPool.rayMul(vars.poolIndex),
                remainingToMatch
            );
            remainingToMatch -= vars.toMatch;

            newPoolBorrowBalance =
                firstPoolBorrowerBalance.onPool -
                vars.toMatch.rayDiv(vars.poolIndex);
            newP2PBorrowBalance =
                firstPoolBorrowerBalance.inP2P +
                vars.toMatch.rayDiv(vars.p2pIndex);

            borrowBalanceInOf[_poolTokenAddress][firstPoolBorrower].onPool = newPoolBorrowBalance;
            borrowBalanceInOf[_poolTokenAddress][firstPoolBorrower].inP2P = newP2PBorrowBalance;
            _updateBorrowerInDS(_poolTokenAddress, firstPoolBorrower);
            emit BorrowerPositionUpdated(
                firstPoolBorrower,
                _poolTokenAddress,
                newPoolBorrowBalance,
                newP2PBorrowBalance
            );
        }

        // Safe unchecked because `gasLeftAtTheBeginning` >= gas left now.
        // And _amount >= remainingToMatch.
        unchecked {
            matched = _amount - remainingToMatch;
            gasConsumedInMatching = gasLeftAtTheBeginning - gasleft();
        }
    }

    /// @notice Unmatches borrowers' liquidity in peer-to-peer for the given `_amount` and moves it to Aave.
    /// @dev Note: This function expects and peer-to-peer indexes to have been updated.
    /// @param _poolTokenAddress The address of the market from which to unmatch borrowers.
    /// @param _amount The amount to unmatch (in underlying).
    /// @param _maxGasForMatching The maximum amount of gas to consume within a matching engine loop.
    /// @return unmatched The amount unmatched (in underlying).
    function _unmatchBorrowers(
        address _poolTokenAddress,
        uint256 _amount,
        uint256 _maxGasForMatching
    ) internal returns (uint256 unmatched) {
        if (_maxGasForMatching == 0) return 0;

        UnmatchVars memory vars;
        vars.poolIndex = poolIndexes[_poolTokenAddress].poolBorrowIndex;
        vars.p2pIndex = p2pBorrowIndex[_poolTokenAddress];
        address firstP2PBorrower;
        Types.BorrowBalance storage firstP2PBorrowerBalance;
        uint256 remainingToUnmatch = _amount;

        uint256 newPoolBorrowBalance;
        uint256 newP2PBorrowBalance;

        uint256 gasLeftAtTheBeginning = gasleft();
        while (
            remainingToUnmatch > 0 &&
            (firstP2PBorrower = borrowersInP2P[_poolTokenAddress].getHead()) != address(0)
        ) {
            // Safe unchecked because `gasLeftAtTheBeginning` >= gas left now.
            unchecked {
                if (gasLeftAtTheBeginning - gasleft() >= _maxGasForMatching) break;
            }
            firstP2PBorrowerBalance = borrowBalanceInOf[_poolTokenAddress][firstP2PBorrower];
            vars.toUnmatch = Math.min(
                firstP2PBorrowerBalance.inP2P.rayMul(vars.p2pIndex),
                remainingToUnmatch
            );
            remainingToUnmatch -= vars.toUnmatch;

            newPoolBorrowBalance =
                firstP2PBorrowerBalance.onPool +
                vars.toUnmatch.rayDiv(vars.poolIndex);
            newP2PBorrowBalance =
                firstP2PBorrowerBalance.inP2P -
                vars.toUnmatch.rayDiv(vars.p2pIndex);

            borrowBalanceInOf[_poolTokenAddress][firstP2PBorrower].onPool = newPoolBorrowBalance;
            borrowBalanceInOf[_poolTokenAddress][firstP2PBorrower].inP2P = newP2PBorrowBalance;
            _updateBorrowerInDS(_poolTokenAddress, firstP2PBorrower);
            emit BorrowerPositionUpdated(
                firstP2PBorrower,
                _poolTokenAddress,
                newPoolBorrowBalance,
                newP2PBorrowBalance
            );
        }

        // Safe unchecked because _amount >= remainingToUnmatch.
        unchecked {
            unmatched = _amount - remainingToUnmatch;
        }
    }

    /// @notice Updates `_user` positions in the supplier data structures.
    /// @param _poolTokenAddress The address of the market on which to update the suppliers data structure.
    /// @param _user The address of the user.
    function _updateSupplierInDS(address _poolTokenAddress, address _user) internal {
        uint256 onPool = supplyBalanceInOf[_poolTokenAddress][_user].onPool;
        uint256 inP2P = supplyBalanceInOf[_poolTokenAddress][_user].inP2P;
        uint256 formerValueOnPool = suppliersOnPool[_poolTokenAddress].getValueOf(_user);
        uint256 formerValueInP2P = suppliersInP2P[_poolTokenAddress].getValueOf(_user);

        suppliersOnPool[_poolTokenAddress].update(_user, formerValueOnPool, onPool, maxSortedUsers);
        suppliersInP2P[_poolTokenAddress].update(_user, formerValueInP2P, inP2P, maxSortedUsers);

        if (formerValueOnPool != onPool && address(rewardsManager) != address(0))
            rewardsManager.updateUserAssetAndAccruedRewards(
                _user,
                _poolTokenAddress,
                formerValueOnPool,
                IScaledBalanceToken(_poolTokenAddress).scaledTotalSupply()
            );
    }

    /// @notice Updates `_user` positions in the borrower data structures.
    /// @param _poolTokenAddress The address of the market on which to update the borrowers data structure.
    /// @param _user The address of the user.
    function _updateBorrowerInDS(address _poolTokenAddress, address _user) internal {
        uint256 onPool = borrowBalanceInOf[_poolTokenAddress][_user].onPool;
        uint256 inP2P = borrowBalanceInOf[_poolTokenAddress][_user].inP2P;
        uint256 formerValueOnPool = borrowersOnPool[_poolTokenAddress].getValueOf(_user);
        uint256 formerValueInP2P = borrowersInP2P[_poolTokenAddress].getValueOf(_user);

        borrowersOnPool[_poolTokenAddress].update(_user, formerValueOnPool, onPool, maxSortedUsers);
        borrowersInP2P[_poolTokenAddress].update(_user, formerValueInP2P, inP2P, maxSortedUsers);

        if (formerValueOnPool != onPool && address(rewardsManager) != address(0)) {
            address variableDebtTokenAddress = pool
            .getReserveData(market[_poolTokenAddress].underlyingToken)
            .variableDebtTokenAddress;
            rewardsManager.updateUserAssetAndAccruedRewards(
                _user,
                variableDebtTokenAddress,
                formerValueOnPool,
                IScaledBalanceToken(variableDebtTokenAddress).scaledTotalSupply()
            );
        }
    }
}
