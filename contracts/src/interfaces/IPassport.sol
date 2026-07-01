// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IPassport {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function isCitizen(address who) external view returns (bool);
    function totalCitizens() external view returns (uint256);
}
