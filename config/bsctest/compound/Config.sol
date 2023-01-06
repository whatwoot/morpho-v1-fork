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

interface IERC20{
    function balanceOf(address) external returns ( uint256 );
}

contract Config {
    address constant dai = 0x785e3f3379f02cfAA3bBB7504333A1E00da85E9e;//18
    address constant aave = 0x34bF95ab803329343Fb3e945c33e02e18293990a;
    address constant usdc = 0x08D92102145be9D9f64Ee49ed1B26C688a9C27D3;
    address constant wEth = 0xF64c84465282CDc15bC57388B1D599d78b8326D3;//wbnb

    // address constant cBat = 0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0;
    address constant cDai = 0x5bEaC3A30dd5011d8ae35A6732701D036Df4e249;
    address constant cEth = 0x3E1a76bF7dAc221d9665924Ad2F925D2ea8f0fd8;//vBNB
    address constant cAave = 0x4a4AfD0779eA0e781656fDf1192F701c87D68A5A;
    address constant cRep = 0x26DA28954763B92139ED49283625ceCAf52C6f94;//caave
    address constant cSai = 0x650b940a1033B8A1b1873f78730FcFC73ec11f1f;//cvlink
    address constant cUsdc = 0x8d9C23687645ed2310E3DD062fF67D8Ef685B3D2;
    // address constant cWbtc2 = 0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B;
    // address constant cZrx = 0xA253295eC2157B8b69C44b2cb35360016DAa25b1;
    
    // uint256 balanceBefore = IERC20(dai).balanceOf(0x55d398326f99059fF775485246999027B3197955);

    address public morphoDao = 0xF08910aff16cE891591943E13f777C70A8E4d222;
    IComptroller public comptroller = IComptroller(0x7C50CC8cccc5DE2B1eB92bC994fF0762303c65B0);
    ICompoundOracle public oracle = ICompoundOracle(comptroller.oracle());

    ProxyAdmin public proxyAdmin = ProxyAdmin(0xf3a2599D90A69F296fC017F2dd701b00Ee3d209A);

    TransparentUpgradeableProxy public lensProxy =
        TransparentUpgradeableProxy(payable(0x00108c97BD3B104A7541d3ECB5Ab181203c4aa6F));
    TransparentUpgradeableProxy public morphoProxy =
        TransparentUpgradeableProxy(payable(0xb421df841324d3356c94383352c8F8fd3A59CcE9));
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
