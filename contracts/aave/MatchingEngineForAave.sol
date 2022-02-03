// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.7;

import {IAToken} from "./interfaces/aave/IAToken.sol";
import "./interfaces/aave/IScaledBalanceToken.sol";
import "./interfaces/IMatchingEngineForAave.sol";
import "./interfaces/IPositionsManagerForAave.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./libraries/aave/WadRayMath.sol";

import "../common/libraries/DoubleLinkedList.sol";

import "./PositionsManagerForAaveStorage.sol";
import "./PositionsManagerForAave.sol";

/// @title MatchingEngineManager
/// @dev Smart contract managing the matching engine.
contract MatchingEngineForAave is IMatchingEngineForAave, PositionsManagerForAaveStorage {
    using DoubleLinkedList for DoubleLinkedList.List;
    using WadRayMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    /// @dev Emitted when the position of a supplier is updated.
    /// @param _user The address of the supplier.
    /// @param _poolTokenAddress The address of the market.
    /// @param _balanceOnPool The supply balance on pool after update.
    /// @param _balanceInP2P The supply balance in P2P after update.
    event SupplierPositionUpdated(
        address indexed _user,
        address indexed _poolTokenAddress,
        uint256 _balanceOnPool,
        uint256 _balanceInP2P
    );

    /// @dev Emitted when the position of a borrower is updated.
    /// @param _user The address of the borrower.
    /// @param _poolTokenAddress The address of the market.
    /// @param _balanceOnPool The borrow balance on pool after update.
    /// @param _balanceInP2P The borrow balance in P2P after update.
    event BorrowerPositionUpdated(
        address indexed _user,
        address indexed _poolTokenAddress,
        uint256 _balanceOnPool,
        uint256 _balanceInP2P
    );

    /// @dev Matches suppliers' liquidity waiting on Aave for the given `_amount` and move it to P2P.
    /// @dev Note: p2pExchangeRates must have been updated before calling this function.
    /// @param _poolToken The pool token of the market from which to match suppliers.
    /// @param _underlyingToken The underlying token of the market to find liquidity.
    /// @param _amount The token amount to search for (in underlying).
    /// @return matchedSupply The amount of liquidity matched (in underlying).
    function matchSuppliers(
        IAToken _poolToken,
        IERC20 _underlyingToken,
        uint256 _amount
    ) public override returns (uint256 matchedSupply) {
        address poolTokenAddress = address(_poolToken);
        uint256 normalizedIncome = lendingPool.getReserveNormalizedIncome(
            address(_underlyingToken)
        );
        address user = suppliersOnPool[poolTokenAddress].getHead();
        uint256 supplyP2PExchangeRate = marketsManagerForAave.supplyP2PExchangeRate(
            poolTokenAddress
        );
        uint256 iterationCount;

        while (matchedSupply < _amount && user != address(0) && iterationCount < NMAX) {
            iterationCount++;
            uint256 onPoolInUnderlying = supplyBalanceInOf[poolTokenAddress][user]
            .onPool
            .mulWadByRay(normalizedIncome);
            uint256 toMatch = Math.min(onPoolInUnderlying, _amount - matchedSupply);
            matchedSupply += toMatch;
            supplyBalanceInOf[poolTokenAddress][user].onPool -= toMatch.divWadByRay(
                normalizedIncome
            );
            supplyBalanceInOf[poolTokenAddress][user].inP2P += toMatch.divWadByRay(
                supplyP2PExchangeRate
            ); // In p2pUnit
            updateSuppliers(poolTokenAddress, user);
            emit SupplierPositionUpdated(
                user,
                poolTokenAddress,
                supplyBalanceInOf[poolTokenAddress][user].onPool,
                supplyBalanceInOf[poolTokenAddress][user].inP2P
            );
            user = suppliersOnPool[poolTokenAddress].getHead();
        }

        if (matchedSupply > 0) {
            matchedSupply = Math.min(matchedSupply, _poolToken.balanceOf(address(this)));
            _withdrawERC20FromPool(_underlyingToken, matchedSupply); // Revert on error
        }
    }

    /// @dev Unmatches suppliers' liquidity in P2P for the given `_amount` and move it to Aave.
    /// @dev Note: p2pExchangeRates must have been updated before calling this function.
    /// @param _poolTokenAddress The address of the market from which to unmatch suppliers.
    /// @param _amount The amount to search for (in underlying).
    function unmatchSuppliers(address _poolTokenAddress, uint256 _amount) public override {
        IAToken poolToken = IAToken(_poolTokenAddress);
        IERC20 underlyingToken = IERC20(poolToken.UNDERLYING_ASSET_ADDRESS());
        uint256 normalizedIncome = lendingPool.getReserveNormalizedIncome(address(underlyingToken));
        uint256 supplyP2PExchangeRate = marketsManagerForAave.supplyP2PExchangeRate(
            _poolTokenAddress
        );
        address user = suppliersInP2P[_poolTokenAddress].getHead();
        uint256 remainingToUnmatch = _amount; // In underlying

        while (remainingToUnmatch > 0 && user != address(0)) {
            uint256 inP2P = supplyBalanceInOf[_poolTokenAddress][user].inP2P; // In poolToken
            uint256 toUnmatch = Math.min(
                inP2P.mulWadByRay(supplyP2PExchangeRate),
                remainingToUnmatch
            ); // In underlying
            remainingToUnmatch -= toUnmatch;
            supplyBalanceInOf[_poolTokenAddress][user].onPool += toUnmatch.divWadByRay(
                normalizedIncome
            );
            supplyBalanceInOf[_poolTokenAddress][user].inP2P -= toUnmatch.divWadByRay(
                supplyP2PExchangeRate
            ); // In p2pUnit
            updateSuppliers(_poolTokenAddress, user);
            emit SupplierPositionUpdated(
                user,
                _poolTokenAddress,
                supplyBalanceInOf[_poolTokenAddress][user].onPool,
                supplyBalanceInOf[_poolTokenAddress][user].inP2P
            );
            user = suppliersInP2P[_poolTokenAddress].getHead();
        }

        // Supply the remaining on Aave
        uint256 toSupply = _amount - remainingToUnmatch;
        if (toSupply > 0) _supplyERC20ToPool(underlyingToken, toSupply); // Revert on error
    }

    /// @dev Matches borrowers' liquidity waiting on Aave for the given `_amount` and move it to P2P.
    /// @dev Note: p2pExchangeRates must have been updated before calling this function.
    /// @param _poolToken The pool token of the market from which to match borrowers.
    /// @param _underlyingToken The underlying token of the market to find liquidity.
    /// @param _amount The amount to search for (in underlying).
    /// @return matchedBorrow The amount of liquidity matched (in underlying).
    function matchBorrowers(
        IAToken _poolToken,
        IERC20 _underlyingToken,
        uint256 _amount
    ) public override returns (uint256 matchedBorrow) {
        address poolTokenAddress = address(_poolToken);
        uint256 normalizedVariableDebt = lendingPool.getReserveNormalizedVariableDebt(
            address(_underlyingToken)
        );
        uint256 borrowP2PExchangeRate = marketsManagerForAave.borrowP2PExchangeRate(
            poolTokenAddress
        );
        address user = borrowersOnPool[poolTokenAddress].getHead();
        uint256 iterationCount;

        while (matchedBorrow < _amount && user != address(0) && iterationCount < NMAX) {
            iterationCount++;
            uint256 onPoolInUnderlying = borrowBalanceInOf[poolTokenAddress][user]
            .onPool
            .mulWadByRay(normalizedVariableDebt);
            uint256 toMatch = Math.min(onPoolInUnderlying, _amount - matchedBorrow);
            matchedBorrow += toMatch;
            borrowBalanceInOf[poolTokenAddress][user].onPool -= toMatch.divWadByRay(
                normalizedVariableDebt
            );
            borrowBalanceInOf[poolTokenAddress][user].inP2P += toMatch.divWadByRay(
                borrowP2PExchangeRate
            );
            updateBorrowers(poolTokenAddress, user);
            emit BorrowerPositionUpdated(
                user,
                poolTokenAddress,
                borrowBalanceInOf[poolTokenAddress][user].onPool,
                borrowBalanceInOf[poolTokenAddress][user].inP2P
            );
            user = borrowersOnPool[poolTokenAddress].getHead();
        }

        if (matchedBorrow > 0)
            _repayERC20ToPool(_underlyingToken, matchedBorrow, normalizedVariableDebt); // Revert on error
    }

    /// @dev Unmatches borrowers' liquidity in P2P for the given `_amount` and move it to Aave.
    /// @dev Note: p2pExchangeRates must have been updated before calling this function.
    /// @param _poolTokenAddress The address of the market from which to unmatch borrowers.
    /// @param _amount The amount to unmatch (in underlying).
    function unmatchBorrowers(address _poolTokenAddress, uint256 _amount) public override {
        IAToken poolToken = IAToken(_poolTokenAddress);
        IERC20 underlyingToken = IERC20(poolToken.UNDERLYING_ASSET_ADDRESS());
        uint256 borrowP2PExchangeRate = marketsManagerForAave.borrowP2PExchangeRate(
            _poolTokenAddress
        );
        uint256 normalizedVariableDebt = lendingPool.getReserveNormalizedVariableDebt(
            address(underlyingToken)
        );
        address user = borrowersInP2P[_poolTokenAddress].getHead();
        uint256 remainingToUnmatch = _amount;

        while (remainingToUnmatch > 0 && user != address(0)) {
            uint256 inP2P = borrowBalanceInOf[_poolTokenAddress][user].inP2P;
            uint256 toUnmatch = Math.min(
                inP2P.mulWadByRay(borrowP2PExchangeRate),
                remainingToUnmatch
            ); // In underlying
            remainingToUnmatch -= toUnmatch;
            borrowBalanceInOf[_poolTokenAddress][user].onPool += toUnmatch.divWadByRay(
                normalizedVariableDebt
            );
            borrowBalanceInOf[_poolTokenAddress][user].inP2P -= toUnmatch.divWadByRay(
                borrowP2PExchangeRate
            );
            updateBorrowers(_poolTokenAddress, user);
            emit BorrowerPositionUpdated(
                user,
                _poolTokenAddress,
                borrowBalanceInOf[_poolTokenAddress][user].onPool,
                borrowBalanceInOf[_poolTokenAddress][user].inP2P
            );
            user = borrowersInP2P[_poolTokenAddress].getHead();
        }

        uint256 toBorrow = _amount - remainingToUnmatch;
        if (toBorrow > 0) _borrowERC20FromPool(underlyingToken, toBorrow); // Revert on error
    }

    /// @dev Updates borrowers matching engine with the new balances of a given account.
    /// @param _poolTokenAddress The address of the market on which to update the borrowers data structure.
    /// @param _account The address of the borrower to move.
    function updateBorrowers(address _poolTokenAddress, address _account) public override {
        uint256 onPool = borrowBalanceInOf[_poolTokenAddress][_account].onPool;
        uint256 inP2P = borrowBalanceInOf[_poolTokenAddress][_account].inP2P;
        uint256 formerValueOnPool = borrowersOnPool[_poolTokenAddress].getValueOf(_account);
        uint256 formerValueInP2P = borrowersInP2P[_poolTokenAddress].getValueOf(_account);

        // Check pool
        bool wasOnPoolAndValueChanged = formerValueOnPool != 0 && formerValueOnPool != onPool;
        if (wasOnPoolAndValueChanged) borrowersOnPool[_poolTokenAddress].remove(_account);
        if (onPool > 0 && (wasOnPoolAndValueChanged || formerValueOnPool == 0)) {
            uint256 totalStaked = IScaledBalanceToken(_poolTokenAddress).scaledTotalSupply();
            (, , address variableDebtTokenAddress) = dataProvider.getReserveTokensAddresses(
                IAToken(_poolTokenAddress).UNDERLYING_ASSET_ADDRESS()
            );
            rewardsManager.updateUserAssetAndAccruedRewards(
                _account,
                variableDebtTokenAddress,
                formerValueOnPool,
                totalStaked
            );
            borrowersOnPool[_poolTokenAddress].insertSorted(_account, onPool, NMAX);
        }

        // Check P2P
        bool wasInP2PAndValueChanged = formerValueInP2P != 0 && formerValueInP2P != inP2P;
        if (wasInP2PAndValueChanged) borrowersInP2P[_poolTokenAddress].remove(_account);
        if (inP2P > 0 && (wasInP2PAndValueChanged || formerValueInP2P == 0))
            borrowersInP2P[_poolTokenAddress].insertSorted(_account, inP2P, NMAX);
    }

    /// @dev Updates suppliers matching engine with the new balances of a given account.
    /// @param _poolTokenAddress The address of the market on which to update the suppliers data structure.
    /// @param _account The address of the supplier to move.
    function updateSuppliers(address _poolTokenAddress, address _account) public override {
        uint256 onPool = supplyBalanceInOf[_poolTokenAddress][_account].onPool;
        uint256 inP2P = supplyBalanceInOf[_poolTokenAddress][_account].inP2P;
        uint256 formerValueOnPool = suppliersOnPool[_poolTokenAddress].getValueOf(_account);
        uint256 formerValueInP2P = suppliersInP2P[_poolTokenAddress].getValueOf(_account);

        // Check pool
        bool wasOnPoolAndValueChanged = formerValueOnPool != 0 && formerValueOnPool != onPool;
        if (wasOnPoolAndValueChanged) suppliersOnPool[_poolTokenAddress].remove(_account);
        if (onPool > 0 && (wasOnPoolAndValueChanged || formerValueOnPool == 0)) {
            uint256 totalStaked = IScaledBalanceToken(_poolTokenAddress).scaledTotalSupply();
            rewardsManager.updateUserAssetAndAccruedRewards(
                _account,
                _poolTokenAddress,
                formerValueOnPool,
                totalStaked
            );
            suppliersOnPool[_poolTokenAddress].insertSorted(_account, onPool, NMAX);
        }

        // Check P2P
        bool wasInP2PAndValueChanged = formerValueInP2P != 0 && formerValueInP2P != inP2P;
        if (wasInP2PAndValueChanged) suppliersInP2P[_poolTokenAddress].remove(_account);
        if (inP2P > 0 && (wasInP2PAndValueChanged || formerValueInP2P == 0))
            suppliersInP2P[_poolTokenAddress].insertSorted(_account, inP2P, NMAX);
    }
}