// SPDX-License-Identifier: GNU AGPLv3
pragma solidity ^0.8.0;

import "src/compound/interfaces/compound/ICompound.sol";

/// Price Oracle for liquidation tests
contract SimplePriceOracle is ICompoundOracle {
    // address public constant wEth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    // address public constant cEth = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address public constant wEth = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public constant cEth = 0xA07c5b74C9B40447a954e1466938b865b6BBea36;

    mapping(address => uint256) public prices;

    function getUnderlyingPrice(address _cToken) public view returns (uint256) {
        if (_cToken == cEth) return prices[wEth];
        return prices[ICToken(_cToken).underlying()];
    }

    function setUnderlyingPrice(address _cToken, uint256 _underlyingPriceMantissa) public {
        if (_cToken == cEth) prices[wEth] = _underlyingPriceMantissa;
        else prices[ICToken(_cToken).underlying()] = _underlyingPriceMantissa;
    }

    function setDirectPrice(address _asset, uint256 _price) public {
        prices[_asset] = _price;
    }
}
