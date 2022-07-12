import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, BigNumber as BN } from "ethers";
import {
  Bridge,
  Bridge__factory,
  MyToken__factory,
} from "../typechain";
import { deployEthBridge, deployEthErc20 } from "../src/deploy";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Executor } from "../src/executor";

const initSupply = 100000;
const transferAmount = 100;

let user: SignerWithAddress;
let bridgeClient: Bridge;
let tokenOwner: SignerWithAddress;
let bridgeExecutor: SignerWithAddress;
let tokenContractAddress: string;

describe("Test", function () {
  before("Preparing eth", async () => {
    [tokenOwner, bridgeExecutor, user] = await ethers.getSigners();

    const tokenOwnerClient = await deployEthErc20(tokenOwner,initSupply);
    tokenContractAddress = tokenOwnerClient.address;
    const bridgeContractAddress = await deployEthBridge(
      bridgeExecutor,
      tokenOwnerClient.address
    );
    const transferTx = await tokenOwnerClient.transfer(
      bridgeContractAddress,
      BN.from(transferAmount)
    );
    await transferTx.wait();

    const transferTx2 = await tokenOwnerClient.transfer(
      user.address,
      BN.from(transferAmount)
    );
    await transferTx2.wait();

    const bridgeAccBalance = await tokenOwnerClient.balanceOf(
      bridgeContractAddress
    );
    const tokenOwnerBalance = await tokenOwnerClient.balanceOf(
      tokenOwner.address
    );
    const userBalance = await tokenOwnerClient.balanceOf(user.address);
    expect(transferAmount).to.equal(bridgeAccBalance);
    expect(transferAmount).to.equal(userBalance);

    expect(initSupply - transferAmount * 2).to.equal(tokenOwnerBalance);

    bridgeClient = Bridge__factory.connect(bridgeContractAddress, user);

    new Executor(bridgeContractAddress, bridgeExecutor).run();
  });
  it("Eth add to transfer queue", async function () {
    const tokenCli = MyToken__factory.connect(tokenContractAddress, user);
    const approveTx = await tokenCli.approve(
      bridgeClient.address,
      transferAmount
    );
    await approveTx.wait();

    const addToQueueTx = await bridgeClient.transfer(
      transferAmount,
      [
        0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
      ]
    );
    await addToQueueTx.wait();
    const firstTransfer = await bridgeClient.getTransfer(1);
    // console.log(firstTransfer);

    await new Promise((r) => setTimeout(r, 20000));
  });
});
