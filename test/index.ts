import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber as BN } from "ethers";
import { Bridge, Bridge__factory, MyToken__factory } from "../typechain";
import { Keyring } from "@polkadot/api";

import {
  deployEthBridge,
  deployEthErc20,
  deploySubstrateErc20,
} from "../src/deploy";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Executor } from "../src/executor";
import { randomAsU8a } from "@polkadot/util-crypto/random/asU8a";
import { KeyringPair } from "@polkadot/keyring/types";
import { ContractPromise } from "@polkadot/api-contract";

const initSupply = 100000;
const transferAmount = 100;

let ethUser: SignerWithAddress;
let bridgeEthClient: Bridge;
let ethTokenOwner: SignerWithAddress;
let ethBridgeExecutor: SignerWithAddress;
let ethTokenContractAddress: string;

let substrateTokenContract: ContractPromise;

describe("Test", function () {
  before("Preparing eth", async () => {
    [ethTokenOwner, ethBridgeExecutor, ethUser] = await ethers.getSigners();

    const tokenOwnerClient = await deployEthErc20(ethTokenOwner, initSupply);
    ethTokenContractAddress = tokenOwnerClient.address;
    const bridgeContractAddress = await deployEthBridge(
      ethBridgeExecutor,
      tokenOwnerClient.address
    );
    const transferTx = await tokenOwnerClient.transfer(
      bridgeContractAddress,
      BN.from(transferAmount)
    );
    await transferTx.wait();

    const transferTx2 = await tokenOwnerClient.transfer(
      ethUser.address,
      BN.from(transferAmount)
    );
    await transferTx2.wait();

    const bridgeAccBalance = await tokenOwnerClient.balanceOf(
      bridgeContractAddress
    );
    const tokenOwnerBalance = await tokenOwnerClient.balanceOf(
      ethTokenOwner.address
    );
    const userBalance = await tokenOwnerClient.balanceOf(ethUser.address);
    expect(transferAmount).to.equal(bridgeAccBalance);
    expect(transferAmount).to.equal(userBalance);

    expect(initSupply - transferAmount * 2).to.equal(tokenOwnerBalance);

    bridgeEthClient = Bridge__factory.connect(bridgeContractAddress, ethUser);

    const keyring = new Keyring({ type: "sr25519" });
    // const seed = randomAsU8a(32);
    // const substrateTokenOwner: KeyringPair = keyring.addFromSeed(seed)
    const alice = keyring.addFromUri("//Alice", { name: "Alice default" });
    substrateTokenContract = await deploySubstrateErc20(alice, initSupply);

    new Executor(
      bridgeContractAddress,
      ethBridgeExecutor,
      substrateTokenContract
    ).run();
  });
  it("Eth add to transfer queue", async function () {
    const tokenCli = MyToken__factory.connect(ethTokenContractAddress, ethUser);
    const approveTx = await tokenCli.approve(
      bridgeEthClient.address,
      transferAmount
    );
    await approveTx.wait();

    const addToQueueTx = await bridgeEthClient.transfer(
      transferAmount,
      [
        0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
      ]
    );
    await addToQueueTx.wait();
    const firstTransfer = await bridgeEthClient.getTransfer(1);
    // console.log(firstTransfer);

    await new Promise((r) => setTimeout(r, 20000));
  });
});
