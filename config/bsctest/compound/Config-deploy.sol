// SPDX-License-Identifier: GNU AGPLv3
pragma solidity >=0.8.0;

import "src/compound/libraries/Types.sol";

contract ConfigDeploy {
    address constant dai = 0x785e3f3379f02cfAA3bBB7504333A1E00da85E9e; //18
    address constant aave = 0x34bF95ab803329343Fb3e945c33e02e18293990a;
    address constant usdc = 0x08D92102145be9D9f64Ee49ed1B26C688a9C27D3;
    address constant wEth = 0xF64c84465282CDc15bC57388B1D599d78b8326D3; //wbnb

    // address constant cBat = 0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0;
    address constant cDai = 0x8f07A18A114f29E34957b134e0260005b6bc003C;
    address constant cEth = 0xb55fA0EF06d73ecA3A579341EfDc07f0808a1067; //vBNB
    address constant cAave = 0x63E9a53BF7AD8eA8E047c3F7b5C48A6e69ab5109;
    // address constant cRep = 0x26DA28954763B92139ED49283625ceCAf52C6f94;//caave
    // address constant cSai = 0x650b940a1033B8A1b1873f78730FcFC73ec11f1f;//cvlink
    address constant cUsdc = 0x249B5B6e907E78E78266230c5d65BCE1c0ce8841;
    // address constant cWbtc2 = 0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B;
    // address constant cZrx = 0xA253295eC2157B8b69C44b2cb35360016DAa25b1;

    address constant comptroller = 0xc6C6117609E45c6B92db6942f7f98b77eCda46A8;

    uint256 constant defaultMaxSortedUsers = 8;
    Types.MaxGasForMatching defaultMaxGasForMatching =
        Types.MaxGasForMatching({supply: 1e5, borrow: 1e5, withdraw: 1e5, repay: 1e5});
}
