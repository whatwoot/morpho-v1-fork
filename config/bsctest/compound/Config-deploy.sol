// SPDX-License-Identifier: GNU AGPLv3
pragma solidity >=0.8.0;

import "src/compound/libraries/Types.sol";

contract ConfigDeploy {

    address constant dai = 0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3;//18
    address constant aave = 0xfb6115445Bff7b52FeB98650C87f44907E58f802;
    address constant usdc = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address constant wEth = 0xF64c84465282CDc15bC57388B1D599d78b8326D3;//wbnb

    // address constant cBat = 0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0;
    address constant cDai = 0x5bEaC3A30dd5011d8ae35A6732701D036Df4e249;
    address constant cEth = 0x3E1a76bF7dAc221d9665924Ad2F925D2ea8f0fd8;
    address constant cAave = 0x4a4AfD0779eA0e781656fDf1192F701c87D68A5A;
    address constant cRep = 0x26DA28954763B92139ED49283625ceCAf52C6f94;//caave
    address constant cSai = 0x650b940a1033B8A1b1873f78730FcFC73ec11f1f;//cvlink
    address constant cUsdc = 0x8d9C23687645ed2310E3DD062fF67D8Ef685B3D2;
    // address constant cWbtc2 = 0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B;
    // address constant cZrx = 0xA253295eC2157B8b69C44b2cb35360016DAa25b1;

    address constant comptroller = 0x7C50CC8cccc5DE2B1eB92bC994fF0762303c65B0;

    uint256 constant defaultMaxSortedUsers = 8;
    Types.MaxGasForMatching defaultMaxGasForMatching =
        Types.MaxGasForMatching({supply: 1e5, borrow: 1e5, withdraw: 1e5, repay: 1e5});
        
}
