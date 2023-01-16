// SPDX-License-Identifier: GNU AGPLv3
pragma solidity >=0.8.0;

import "src/compound/interfaces/compound/ICompound.sol";
import {IIncentivesVault} from "src/compound/interfaces/IIncentivesVault.sol";
import {IPositionsManager} from "src/compound/interfaces/IPositionsManager.sol";
import {IInterestRatesManager} from "src/compound/interfaces/IInterestRatesManager.sol";
import {IMorpho} from "src/compound/interfaces/IMorpho.sol";

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

import {RewardsManager} from "src/compound/RewardsManager.sol";
import {Lens} from "src/compound/lens/Lens.sol";
import {Morpho} from "src/compound/Morpho.sol";
import "src/compound/libraries/Types.sol";

interface IERC20 {
    function balanceOf(address) external returns (uint256);
}

contract Config {
    address constant dai = 0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3; //18
    address constant aave = 0xfb6115445Bff7b52FeB98650C87f44907E58f802;
    address constant usdc = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address constant wEth = 0xF64c84465282CDc15bC57388B1D599d78b8326D3; //wbnb

    address constant usdt = 0x55d398326f99059fF775485246999027B3197955;
    address constant wbtc = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    address constant comp = 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63; //xvs
    address constant bat = 0x47BEAd2563dCBf3bF2c9407fEa4dC236fAbA485A; //sxp
    address constant uni = 0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD; //link

    address constant cBat = 0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0; //vsxp
    address constant cComp = 0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D;
    address constant cDai = 0x5bEaC3A30dd5011d8ae35A6732701D036Df4e249;
    address constant cEth = 0x3E1a76bF7dAc221d9665924Ad2F925D2ea8f0fd8;
    address constant cAave = 0x4a4AfD0779eA0e781656fDf1192F701c87D68A5A;
    address constant cRep = 0x26DA28954763B92139ED49283625ceCAf52C6f94; //caave
    address constant cSai = 0x650b940a1033B8A1b1873f78730FcFC73ec11f1f; //cvlink
    address constant cUsdc = 0x8d9C23687645ed2310E3DD062fF67D8Ef685B3D2;
    address constant cWbtc = 0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B;
    address constant cUsdt = 0xfD5840Cd36d94D7229439859C0112a4185BC0255;
    address constant cUni = 0x650b940a1033B8A1b1873f78730FcFC73ec11f1f; //vlink
    // address constant cWbtc2 = 0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B;
    // address constant cZrx = 0xA253295eC2157B8b69C44b2cb35360016DAa25b1;

    // uint256 balanceBefore = IERC20(dai).balanceOf(0x55d398326f99059fF775485246999027B3197955);

    // address constant wEth = 0xF64c84465282CDc15bC57388B1D599d78b8326D3;
    address constant comptroller = 0xfD36E2c2a6789Db23113685031d7F16329158384;

    uint256 constant defaultMaxSortedUsers = 8;
    Types.MaxGasForMatching defaultMaxGasForMatching =
        Types.MaxGasForMatching({supply: 1e5, borrow: 1e5, withdraw: 1e5, repay: 1e5});
}