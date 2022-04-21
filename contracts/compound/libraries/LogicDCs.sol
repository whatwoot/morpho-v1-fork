// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.13;

import "../interfaces/ILogic.sol";

import "@openzeppelin/contracts/utils/Address.sol";

library LogicDCs {
    using Address for address;

    function _supplyDC(
        ILogic _logic,
        address _poolTokenAddress,
        uint256 _amount,
        uint256 _maxGasToConsume
    ) internal {
        address(_logic).functionDelegateCall(
            abi.encodeWithSelector(
                _logic.supply.selector,
                _poolTokenAddress,
                _amount,
                _maxGasToConsume
            )
        );
    }

    function _borrowDC(
        ILogic _logic,
        address _poolTokenAddress,
        uint256 _amount,
        uint256 _maxGasToConsume
    ) internal {
        address(_logic).functionDelegateCall(
            abi.encodeWithSelector(
                _logic.borrow.selector,
                _poolTokenAddress,
                _amount,
                _maxGasToConsume
            )
        );
    }

    function _withdrawDC(
        ILogic _logic,
        address _poolTokenAddress,
        uint256 _amount,
        address _supplier,
        address _receiver,
        uint256 _maxGasToConsume
    ) internal {
        address(_logic).functionDelegateCall(
            abi.encodeWithSelector(
                _logic.withdraw.selector,
                _poolTokenAddress,
                _amount,
                _supplier,
                _receiver,
                _maxGasToConsume
            )
        );
    }

    function _repayDC(
        ILogic _logic,
        address _poolTokenAddress,
        address _user,
        uint256 _amount,
        uint256 _maxGasToConsume
    ) internal {
        address(_logic).functionDelegateCall(
            abi.encodeWithSelector(
                _logic.repay.selector,
                _poolTokenAddress,
                _user,
                _amount,
                _maxGasToConsume
            )
        );
    }
}