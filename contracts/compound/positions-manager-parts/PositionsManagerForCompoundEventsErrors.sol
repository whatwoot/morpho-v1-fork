// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.7;

import "./PositionsManagerForCompoundStorage.sol";

/// @title PositionsManagerForCompoundEventsErrors.
/// @notice Events and Errors for PositionsManagerForCompound.
abstract contract PositionsManagerForCompoundEventsErrors is PositionsManagerForCompoundStorage {
    /// EVENTS ///

    /// @notice Emitted when a supply happens.
    /// @param _user The address of the supplier.
    /// @param _poolTokenAddress The address of the market where assets are supplied into.
    /// @param _amount The amount of assets supplied (in underlying).
    /// @param _balanceOnPool The supply balance on pool after update (in underlying).
    /// @param _balanceInP2P The supply balance in P2P after update (in underlying).
    /// @param _referralCode The referral code of an integrator that may receive rewards. 0 if no referral code.
    event Supplied(
        address indexed _user,
        address indexed _poolTokenAddress,
        uint256 _amount,
        uint256 _balanceOnPool,
        uint256 _balanceInP2P,
        uint16 indexed _referralCode
    );

    /// @notice Emitted when a withdrawal happens.
    /// @param _user The address of the withdrawer.
    /// @param _poolTokenAddress The address of the market from where assets are withdrawn.
    /// @param _amount The amount of assets withdrawn (in underlying).
    /// @param _balanceOnPool The supply balance on pool after update.
    /// @param _balanceInP2P The supply balance in P2P after update.
    event Withdrawn(
        address indexed _user,
        address indexed _poolTokenAddress,
        uint256 _amount,
        uint256 _balanceOnPool,
        uint256 _balanceInP2P
    );

    /// @notice Emitted when a borrow happens.
    /// @param _user The address of the borrower.
    /// @param _poolTokenAddress The address of the market where assets are borrowed.
    /// @param _amount The amount of assets borrowed (in underlying).
    /// @param _balanceOnPool The borrow balance on pool after update.
    /// @param _balanceInP2P The borrow balance in P2P after update.
    /// @param _referralCode The referral code of an integrator that may receive rewards. 0 if no referral code.
    event Borrowed(
        address indexed _user,
        address indexed _poolTokenAddress,
        uint256 _amount,
        uint256 _balanceOnPool,
        uint256 _balanceInP2P,
        uint16 indexed _referralCode
    );

    /// @notice Emitted when a repayment happens.
    /// @param _user The address of the repayer.
    /// @param _poolTokenAddress The address of the market where assets are repaid.
    /// @param _amount The amount of assets repaid (in underlying).
    /// @param _balanceOnPool The borrow balance on pool after update.
    /// @param _balanceInP2P The borrow balance in P2P after update.
    event Repaid(
        address indexed _user,
        address indexed _poolTokenAddress,
        uint256 _amount,
        uint256 _balanceOnPool,
        uint256 _balanceInP2P
    );

    /// @notice Emitted when a liquidation happens.
    /// @param _liquidator The address of the liquidator.
    /// @param _liquidatee The address of the liquidatee.
    /// @param _amountRepaid The amount of borrowed asset repaid (in underlying).
    /// @param _poolTokenBorrowedAddress The address of the borrowed asset.
    /// @param _amountSeized The amount of collateral asset seized (in underlying).
    /// @param _poolTokenCollateralAddress The address of the collateral asset seized.
    event Liquidated(
        address indexed _liquidator,
        address indexed _liquidatee,
        uint256 _amountRepaid,
        address _poolTokenBorrowedAddress,
        uint256 _amountSeized,
        address _poolTokenCollateralAddress
    );

    /// @dev Emitted when a new value for `NDS` is set.
    /// @param _newValue The new value of `NDS`.
    event NDSSet(uint8 _newValue);

    /// @dev Emitted when a new `maxGas` is set.
    /// @param _maxGas The new `maxGas`.
    event MaxGasSet(MaxGas _maxGas);

    /// @dev Emitted the address of the `treasuryVault` is set.
    /// @param _newTreasuryVaultAddress The new address of the `treasuryVault`.
    event TreasuryVaultSet(address _newTreasuryVaultAddress);

    /// @notice Emitted the address of the `rewardsManager` is set.
    /// @param _newRewardsManagerAddress The new address of the `rewardsManager`.
    event RewardsManagerSet(address _newRewardsManagerAddress);

    /// @notice Emitted the address of the `aaveIncentivesController` is set.
    /// @param _aaveIncentivesController The new address of the `aaveIncentivesController`.
    event CompoundIncentivesControllerSet(address _aaveIncentivesController);

    /// @notice Emitted when a market is paused or unpaused.
    /// @param _poolTokenAddress The address of the pool token concerned..
    /// @param _newStatus The new pause status of the market.
    event PauseStatusSet(address _poolTokenAddress, bool _newStatus);

    /// @notice Emitted when the DAO claims fees.
    /// @param _poolTokenAddress The address of the pool token concerned.
    /// @param _amountClaimed The amount of underlying token claimed.
    event FeesClaimed(address _poolTokenAddress, uint256 _amountClaimed);

    /// @notice Emitted when a reserve fee is claimed.
    /// @param _poolTokenAddress The address of the pool token concerned.
    /// @param _amountClaimed The amount of reward token claimed.
    event ReserveFeeClaimed(address _poolTokenAddress, uint256 _amountClaimed);

    /// @notice Emitted when a user claims rewards.
    /// @param _user The address of the claimer.
    /// @param _amountClaimed The amount of reward token claimed.
    event RewardsClaimed(address _user, uint256 _amountClaimed);

    /// @dev Emitted when a user claims rewards and swaps them to Morpho tokens.
    /// @param _user The address of the claimer.
    /// @param _amountIn The amount of reward token swapped.
    /// @param _amountOut The amount of tokens received.
    event RewardsClaimedAndSwapped(address _user, uint256 _amountIn, uint256 _amountOut);

    /// ERRORS ///

    /// @notice Thrown when the amount is equal to 0.
    error AmountIsZero();

    /// @notice Thrown when the market is not created yet.
    error MarketNotCreated();

    /// @notice Thrown when the market is paused.
    error MarketPaused();

    /// @notice Thrown when the market is not listed on Compound.
    error MarketIsNotListedOnCompound();

    /// @notice Thrown when the debt value is above the maximum debt value.
    error DebtValueAboveMax();

    /// @notice Thrown when the debt value is not above the maximum debt value.
    error DebtValueNotAboveMax();

    /// @notice Thrown when the amount of collateral to seize is above the collateral amount.
    error ToSeizeAboveCollateral();

    /// @notice Thrown when the amount repaid during the liquidation is above what is allowed to be repaid.
    error AmountAboveWhatAllowedToRepay();

    /// @notice Thrown when the Compound's oracle failed.
    error CompoundOracleFailed();

    /// @notice Thrown when the borrow on Compound failed.
    error BorrowOnCompoundFailed();

    /// @notice Thrown when the redeem on Compound failed .
    error RedeemOnCompoundFailed();

    /// @notice Thrown when the repay on Compound failed.
    error RepayOnCompoundFailed();

    /// @notice Thrown when the mint on Compound failed.
    error MintOnCompoundFailed();
}