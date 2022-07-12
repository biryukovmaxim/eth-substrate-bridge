// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { deployEthBridge } from "../src/deploy";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const [tokenOwner, bridgeExecutor] = await ethers.getSigners();
  console.log("Token owner: ", tokenOwner.address);
  console.log("bridge Executor: ", bridgeExecutor.address);

  const MyToken = await ethers.getContractFactory("MyToken", tokenOwner);
  const myToken = await MyToken.deploy(100000);
  await myToken.deployed();
  console.log("MyToken deployed to:", myToken.address);

  await deployEthBridge(bridgeExecutor, myToken.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
