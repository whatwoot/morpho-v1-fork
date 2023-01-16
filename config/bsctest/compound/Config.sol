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

interface IERC20 {
    function balanceOf(address) external returns (uint256);
}

contract Config {
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

    // uint256 balanceBefore = IERC20(dai).balanceOf(0x55d398326f99059fF775485246999027B3197955);

    address public morphoDao = 0xF08910aff16cE891591943E13f777C70A8E4d222;
    IComptroller public comptroller = IComptroller(0xc6C6117609E45c6B92db6942f7f98b77eCda46A8);
    ICompoundOracle public oracle = ICompoundOracle(comptroller.oracle());

    ProxyAdmin public proxyAdmin = ProxyAdmin(0x914A42e4c6341edBc719e2518e942ee202EF5CA5);

    TransparentUpgradeableProxy public lensProxy =
        TransparentUpgradeableProxy(payable(0x833d75776A866f72E43D569592ACBE79d2F14513));
    TransparentUpgradeableProxy public morphoProxy =
        TransparentUpgradeableProxy(payable(0x098EA763E4B682a723DbfA7Cf19a35Fc22481633));
    TransparentUpgradeableProxy public rewardsManagerProxy;

    Lens public lensImplV1;
    Morpho public morphoImplV1;
    RewardsManager public rewardsManagerImplV1;

    Lens public lens;
    Morpho public morpho;
    RewardsManager public rewardsManager;
    IIncentivesVault public incentivesVault;
    IPositionsManager public positionsManager;
    IInterestRatesManager public interestRatesManager;
}
