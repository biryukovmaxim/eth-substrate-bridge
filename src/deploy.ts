import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import { MyToken, MyToken__factory } from "../typechain";

export async function deployEthBridge(bridgeExecutor: SignerWithAddress, myToken: string):Promise<string> {
  const Bridge = await ethers.getContractFactory("Bridge", bridgeExecutor);
  const bridge = await Bridge.deploy(myToken);
  await bridge.deployed();
  console.log("Bridge deployed to:", bridge.address);
  return bridge.address;
}

export async function deployEthErc20(tokenOwner: SignerWithAddress, initSupply: BigNumberish): Promise<MyToken> {
  const MyToken = await ethers.getContractFactory("MyToken", tokenOwner);
  const myTokenContract = await MyToken.deploy(initSupply);
  await myTokenContract.deployed();
  console.log("MyToken deployed to:", myTokenContract.address);

  return MyToken__factory.connect(myTokenContract.address,tokenOwner);
}

function deploySubstrateErc20() {

}