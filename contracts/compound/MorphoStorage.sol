// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.13;

import "./interfaces/compound/ICompound.sol";
import "./interfaces/IPositionsManager.sol";
import "./interfaces/IIncentivesVault.sol";
import "./interfaces/IRewardsManager.sol";
import "./interfaces/IInterestRatesManager.sol";

import "../common/libraries/DoubleLinkedList.sol";
import "./libraries/Types.sol";

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

abstract contract MorphoStorage is OwnableUpgradeable, ReentrancyGuardUpgradeable {
    /// GLOBAL STORAGE ///

    uint8 public constant CTOKEN_DECIMALS = 8; // The number of decimals for cToken.
    uint16 public constant MAX_BASIS_POINTS = 10_000; // 100% in basis points.
    uint16 public constant MAX_CLAIMABLE_RESERVE = 9_000; // The max propotion of reserve fee claimable by the DAO at once (90% in basis points).
    uint256 public constant WAD = 1e18;

    uint256 public maxSortedUsers; // The max number of users to sort in the data structure.
    uint256 public dustThreshold; // The minimum amount to keep in the data stucture.
    Types.MaxGasForMatching public defaultMaxGasForMatching; // The default max gas to consume within loops in matching engine functions.

    /// POSITIONS STORAGE ///

    mapping(address => DoubleLinkedList.List) internal suppliersInP2P; // For a given market, the suppliers in peer-to-peer.
    mapping(address => DoubleLinkedList.List) internal suppliersOnPool; // For a given market, the suppliers on Compound.
    mapping(address => DoubleLinkedList.List) internal borrowersInP2P; // For a given market, the borrowers in peer-to-peer.
    mapping(address => DoubleLinkedList.List) internal borrowersOnPool; // For a given market, the borrowers on Compound.
    mapping(address => mapping(address => Types.SupplyBalance)) public supplyBalanceInOf; // For a given market, the supply balance of a user. cToken -> user -> balances.
    mapping(address => mapping(address => Types.BorrowBalance)) public borrowBalanceInOf; // For a given market, the borrow balance of a user. cToken -> user -> balances.
    mapping(address => mapping(address => bool)) public userMembership; // Whether the user is in the market or not. cToken -> user -> bool.
    mapping(address => address[]) public enteredMarkets; // The markets entered by a user. user -> cTokens.

    /// MARKETS STORAGE ///

    address[] public marketsCreated; // Keeps track of the created markets.
    mapping(address => bool) public p2pDisabled; // Whether the peer-to-peer market is open or not.
    mapping(address => uint256) public p2pSupplyIndex; // Current index from supply peer-to-peer unit to underlying (in wad).
    mapping(address => uint256) public p2pBorrowIndex; // Current index from borrow peer-to-peer unit to underlying (in wad).
    mapping(address => Types.LastPoolIndexes) public lastPoolIndexes; // Last pool index stored.
    mapping(address => Types.MarketParameters) public marketParameters; // Market parameters.
    mapping(address => Types.MarketStatus) public marketStatus; // Market status.
    mapping(address => Types.Delta) public deltas; // Delta parameters for each market.

    /// CONTRACTS AND ADDRESSES ///

    IPositionsManager public positionsManager;
    IIncentivesVault public incentivesVault;
    IRewardsManager public rewardsManager;
    IInterestRatesManager public interestRatesManager;
    IComptroller public comptroller;
    address public treasuryVault;
    address public cEth;
    address public wEth;
}
