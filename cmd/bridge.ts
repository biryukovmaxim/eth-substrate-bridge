import { ethers } from "hardhat";
import { Bridge } from "../typechain";
import {  utils } from "ethers";

async function main() {
  const envEthBridgeAddress: string | undefined =
    process.env.ETHEREUM_BRIDGE_ADDRESS;
  if (envEthBridgeAddress === undefined) {
    throw new Error("undefined ethereum bridge address");
  }
  const envEthBridgeExecutorPrivateKey: string | undefined =
    process.env.ETHEREUM_BRIDGE_EXECUTOR_PRIVATE_KEY;
  if (envEthBridgeExecutorPrivateKey === undefined) {
    throw new Error("undefined ethereum bridge executor private key");
  }
  console.log(envEthBridgeExecutorPrivateKey as string);

  const executor = new ethers.Wallet(envEthBridgeExecutorPrivateKey, ethers.provider);
  const bridgeContract = await ethers.getContractFactory("Bridge");
  const bridgeClient: Bridge = await bridgeContract.connect(executor);
  const filter = {
    address: envEthBridgeAddress,
    topics: [
      // the name of the event, parnetheses containing the data type of each event, no spaces
      utils.id("Queued(uint256,address,uint8[32],uint256,uint256)")
    ]
  };
  ethers.provider.on(filter, (event: any) => {
    console.log(event)
  })
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
