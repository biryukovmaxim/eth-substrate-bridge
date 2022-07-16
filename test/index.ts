import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, BigNumber as BN, BigNumberish } from "ethers";
import { Bridge, Bridge__factory, MyToken__factory } from "../typechain";
import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";

import {
  deployEthBridge,
  deployEthErc20,
  deploySubstrateBridge,
  deploySubstrateErc20,
} from "../src/deploy";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Executor } from "../src/executor";
import { randomAsU8a } from "@polkadot/util-crypto/random/asU8a";
import { KeyringPair } from "@polkadot/keyring/types";
import { ContractPromise } from "@polkadot/api-contract";
import { ContractCallOutcome } from "@polkadot/api-contract/types";

const initSupply = 100000;
const transferAmount = 100;

let ethUser: SignerWithAddress;
let bridgeEthClient: Bridge;
let ethTokenOwner: SignerWithAddress;
let ethBridgeExecutor: SignerWithAddress;
let ethTokenContractAddress: string;
let ethBridgeClient: Bridge;

let substrateTokenContract: ContractPromise;
let substrateBridgeContract: ContractPromise;

let substrateAlice: KeyringPair;
let substrateBob: KeyringPair;
let substrateBridgeOwner: KeyringPair;

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
    substrateAlice = keyring.addFromUri("//Alice", { name: "Alice default" });
    const wsProvider = new WsProvider("ws://127.0.0.1:9944");

    substrateBob = keyring.addFromUri("//Bob", { name: "Bob default" });
    substrateBridgeOwner = keyring.addFromUri("//Dave", {
      name: "Dave default",
    });

    const api: ApiPromise = await ApiPromise.create({ provider: wsProvider });
    substrateTokenContract = await deploySubstrateErc20(
      substrateAlice,
      initSupply,
      api
    );
    substrateBridgeContract = await deploySubstrateBridge(
      substrateBridgeOwner,
      api,
      substrateTokenContract.address
    );
    ethBridgeClient = Bridge__factory.connect(
      bridgeContractAddress,
      ethBridgeExecutor
    );
    new Executor(
      ethBridgeClient,
      substrateTokenContract,
      substrateAlice,
      api
    ).run();
  });
  it("Eth transfer to substrate bob", async function () {
    const tokenCli = MyToken__factory.connect(ethTokenContractAddress, ethUser);
    const approveTx = await tokenCli.approve(
      bridgeEthClient.address,
      transferAmount
    );
    await approveTx.wait();

    const destination: Array<BigNumberish> = Array.from(
      substrateBob.addressRaw
    );
    const addToQueueTx = await bridgeEthClient.transfer(
      transferAmount,
      // @ts-ignore
      destination
    );
    await addToQueueTx.wait();

    // todo replace by listening to successful transfer event
    await new Promise((r) => setTimeout(r, 5000));
    const res = await ethBridgeClient.getTransfer(1);
    expect(res.exists).to.equal(false);

    const txResult: ContractCallOutcome =
      await substrateTokenContract.query.balanceOf(
        substrateBob.address,
        { gasLimit: -1 },
        substrateBob.address
      );
    expect(txResult.output?.toHuman()).to.equal(transferAmount.toString());
  });

  // it("Eth transfer to substrate bob", async function () {
  //   const tokenCli = MyToken__factory.connect(ethTokenContractAddress, ethUser);
  //   const approveTx = await tokenCli.approve(
  //     bridgeEthClient.address,
  //     transferAmount
  //   );
  //   await approveTx.wait();
  //
  //   const destination: Array<BigNumberish> = Array.from(
  //     substrateBob.addressRaw
  //   );
  //   const addToQueueTx = await bridgeEthClient.transfer(
  //     transferAmount,
  //     // @ts-ignore
  //     destination
  //   );
  //   await addToQueueTx.wait();
  //
  //   // todo replace by listening to successful transfer event
  //   await new Promise((r) => setTimeout(r, 5000));
  //   const res = await ethBridgeClient.getTransfer(1);
  //   expect(res.exists).to.equal(false);
  //
  //   const txResult: ContractCallOutcome =
  //     await substrateTokenContract.query.balanceOf(
  //       substrateBob.address,
  //       { gasLimit: -1 },
  //       substrateBob.address
  //     );
  //   expect(txResult.output?.toHuman()).to.equal(transferAmount.toString());
  // });
});
