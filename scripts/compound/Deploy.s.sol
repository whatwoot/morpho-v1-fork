// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.13;

import "src/compound/interfaces/IRewardsManager.sol";
import "src/compound/interfaces/IIncentivesVault.sol";
import "src/compound/interfaces/IInterestRatesManager.sol";
import "src/compound/interfaces/IPositionsManager.sol";
import "src/compound/interfaces/compound/ICompound.sol";

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

import {IncentivesVault} from "src/compound/IncentivesVault.sol";
import {RewardsManager} from "src/compound/RewardsManager.sol";
import {InterestRatesManager} from "src/compound/InterestRatesManager.sol";
import {PositionsManager} from "src/compound/PositionsManager.sol";
import {Morpho} from "src/compound/Morpho.sol";
import {Lens} from "src/compound/lens/Lens.sol";
import {MorphoToken} from "src/common/token/MorphoToken.sol";
import {RewardsDistributor} from "src/common/rewards-distribution/RewardsDistributor.sol";

import "@config/Config.sol";
import "forge-std/Script.sol";
import "@forge-std/console.sol";

contract Deploy is Script, Config {
    ProxyAdmin public proxyAdmin;

    Lens public lens;
    Morpho public morpho;
    IPositionsManager public positionsManager;
    IInterestRatesManager public interestRatesManager;
    IIncentivesVault public incentivesVault;
    RewardsManager public rewardsManager;

    function run() external {
        console.log("chain:", block.chainid);
        vm.label(comptroller, "Comptroller");
        vm.label(cDai, "cDAI");
        vm.label(cEth, "cETH");
        vm.label(cAave, "cAAVE");
        vm.label(cUsdc, "cUSDC");
        // vm.label(cWbtc2, "cWBTC");
        // vm.label(cBat, "cBAT");
        vm.label(wEth, "WETH");

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        proxyAdmin = new ProxyAdmin();

        // Deploy Morpho's dependencies
        interestRatesManager = new InterestRatesManager();
        positionsManager = new PositionsManager();

        // Deploy Morpho
        Morpho morphoImpl = new Morpho();
        TransparentUpgradeableProxy morphoProxy = new TransparentUpgradeableProxy(
            address(morphoImpl),
            address(proxyAdmin),
            abi.encodeWithSelector(
                morphoImpl.initialize.selector,
                positionsManager,
                interestRatesManager,
                comptroller,
                defaultMaxGasForMatching,
                1,
                defaultMaxSortedUsers,
                cEth,
                wEth
            )
        );
        morpho = Morpho(payable(morphoProxy));

        // Deploy RewardsManager
        RewardsManager rewardsManagerImpl = new RewardsManager();

        TransparentUpgradeableProxy rewardsManagerProxy = new TransparentUpgradeableProxy(
            address(rewardsManagerImpl),
            address(proxyAdmin),
            abi.encodeWithSelector(rewardsManagerImpl.initialize.selector, address(morpho))
        );
        rewardsManager = RewardsManager(address(rewardsManagerProxy));

        morpho.setRewardsManager(IRewardsManager(address(rewardsManager)));

        // Deploy Lens
        Lens lensImpl = new Lens(address(morpho));
        // Lens lensImpl = new Lens();
        // TransparentUpgradeableProxy lensProxy = new TransparentUpgradeableProxy(
        //     address(lensImpl),
        //     address(proxyAdmin),
        //     abi.encodeWithSelector(lensImpl.initialize.selector, address(morpho))
        // );
        // lens = Lens(address(lensProxy));

        // Create markets
        Types.MarketParameters memory defaultMarketParameters = Types.MarketParameters({
            reserveFactor: 0,
            p2pIndexCursor: 3333
        });
        morpho.createMarket(cDai, defaultMarketParameters);
        morpho.createMarket(cUsdc, defaultMarketParameters);
        morpho.createMarket(cEth, defaultMarketParameters);
        morpho.createMarket(cAave, defaultMarketParameters);
        // morpho.createMarket(cWbtc2, defaultMarketParameters);
        // morpho.createMarket(cBat, defaultMarketParameters);

        //rewards
        MorphoToken morphoToken = new MorphoToken(0xF08910aff16cE891591943E13f777C70A8E4d222);
        RewardsDistributor rewardsDistributor = new RewardsDistributor(address(morphoToken));

        vm.stopBroadcast();
    }

    function run_upgrade() external {
        console.log("chain:", block.chainid);
        vm.label(comptroller, "Comptroller");
        vm.label(cDai, "cDAI");
        vm.label(cEth, "cETH");
        vm.label(cAave, "cAAVE");
        vm.label(cUsdc, "cUSDC");
        // vm.label(cWbtc2, "cWBTC");
        // vm.label(cBat, "cBAT");
        vm.label(wEth, "WETH");

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        proxyAdmin = ProxyAdmin(0x914A42e4c6341edBc719e2518e942ee202EF5CA5);
        Lens lensImpl = new Lens(0x098EA763E4B682a723DbfA7Cf19a35Fc22481633);

        proxyAdmin.upgrade(
            TransparentUpgradeableProxy(payable(0x833d75776A866f72E43D569592ACBE79d2F14513)),
            address(lensImpl)
        );
        vm.stopBroadcast();
    }
}
