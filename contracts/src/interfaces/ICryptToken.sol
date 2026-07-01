// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICryptToken is IERC20 {
    function mint(address to, uint256 amount) external;
    function MAX_SUPPLY() external view returns (uint256);
    function MINTER_ROLE() external view returns (bytes32);
}
