import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber as BN, BigNumberish } from "ethers";
import {
  Bridge,
  Bridge__factory,
  MyToken,
  MyToken__factory,
} from "../typechain";
import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";

import {
  deployEthBridge,
  deployEthErc20,
  deploySubstrateBridge,
  deploySubstrateErc20,
} from "../src/deploy";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Executor } from "../src/executor";
import { KeyringPair } from "@polkadot/keyring/types";
import { ContractPromise } from "@polkadot/api-contract";
import { ContractCallOutcome } from "@polkadot/api-contract/types";

const initSupply = 100000;
const transferAmount: number = 100;

let ethUser: SignerWithAddress;
let bridgeEthClient: Bridge;
let ethTokenOwner: SignerWithAddress;
let ethBridgeExecutor: SignerWithAddress;
let ethTokenContractAddress: string;
let ethBridgeClient: Bridge;
let ethTokenContractClient: MyToken;
let ethReceiver: SignerWithAddress;

let substrateTokenContract: ContractPromise;
let substrateBridgeContract: ContractPromise;

let substrateTokenOwner: KeyringPair;
let substrateReceiver: KeyringPair;
let substrateBridgeOwner: KeyringPair;
let substrateSender: KeyringPair;
let api: ApiPromise;

describe("Test", function () {
  before("Preparing eth", async () => {
    [ethTokenOwner, ethBridgeExecutor, ethUser, ethReceiver] =
      await ethers.getSigners();

    const tokenOwnerClient = await deployEthErc20(ethTokenOwner, initSupply);
    ethTokenContractAddress = tokenOwnerClient.address;
    const bridgeContractAddress = await deployEthBridge(
      ethBridgeExecutor,
      tokenOwnerClient.address
    );
    const transferTx = await tokenOwnerClient.transfer(
      ethBridgeExecutor.address,
      BN.from(transferAmount)
    );
    await transferTx.wait();

    const transferTx2 = await tokenOwnerClient.transfer(
      ethUser.address,
      BN.from(transferAmount)
    );
    await transferTx2.wait();

    const ethBridgeExecutorBalance = await tokenOwnerClient.balanceOf(
      ethBridgeExecutor.address
    );
    const tokenOwnerBalance = await tokenOwnerClient.balanceOf(
      ethTokenOwner.address
    );
    const userBalance = await tokenOwnerClient.balanceOf(ethUser.address);
    expect(transferAmount).to.equal(ethBridgeExecutorBalance);
    expect(transferAmount).to.equal(userBalance);

    expect(initSupply - transferAmount * 2).to.equal(tokenOwnerBalance);

    bridgeEthClient = Bridge__factory.connect(bridgeContractAddress, ethUser);

    const keyring = new Keyring({ type: "sr25519" });
    // const seed = randomAsU8a(32);
    // const substrateTokenOwner: KeyringPair = keyring.addFromSeed(seed)
    substrateTokenOwner = keyring.addFromUri("//Alice", {
      name: "Alice default",
    });
    const wsProvider = new WsProvider("ws://127.0.0.1:9944");

    substrateReceiver = keyring.addFromUri("//Bob", { name: "Bob default" });
    substrateBridgeOwner = keyring.addFromUri("//Dave", {
      name: "Dave default",
    });
    substrateSender = keyring.addFromUri("//Ferdie", {
      name: "Ferdie default",
    });

    api = await ApiPromise.create({ provider: wsProvider });

    substrateTokenContract = await deploySubstrateErc20(
      substrateTokenOwner,
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
    ethTokenContractClient = MyToken__factory.connect(
      ethTokenContractAddress,
      ethBridgeExecutor
    );

    const toSenderTransferTx = substrateTokenContract.tx.transfer(
      {},
      substrateSender.address,
      transferAmount
    );

    const txPromise: Promise<void> = new Promise(async (resolve) => {
      const unsub = await toSenderTransferTx.signAndSend(
        substrateTokenOwner,
        ({ status }) => {
          if (status.isInBlock || status.isFinalized) {
            unsub();
            resolve();
          }
        }
      );
    });
    await txPromise;
    const txResult: ContractCallOutcome =
      await substrateTokenContract.query.balanceOf(
        substrateSender.address,
        { gasLimit: -1 },
        substrateSender.address
      );
    expect(txResult.output?.toHuman()).to.equal(transferAmount.toString());

    const toSenderTransferTx2 = substrateTokenContract.tx.transfer(
      {},
      substrateBridgeOwner.address,
      transferAmount
    );
    const txPromise2: Promise<void> = new Promise(async (resolve) => {
      const unsub = await toSenderTransferTx2.signAndSend(
        substrateTokenOwner,
        ({ status }) => {
          if (status.isInBlock || status.isFinalized) {
            unsub();
            resolve();
          }
        }
      );
    });
    await txPromise2;
    const txResult2: ContractCallOutcome =
      await substrateTokenContract.query.balanceOf(
        substrateBridgeOwner.address,
        { gasLimit: -1 },
        substrateBridgeOwner.address
      );
    expect(txResult2.output?.toHuman()).to.equal(transferAmount.toString());

    new Executor(
      ethBridgeClient,
      ethTokenContractClient,
      substrateTokenContract,
      substrateBridgeOwner,
      api,
      substrateBridgeContract
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
      substrateReceiver.addressRaw
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
        substrateReceiver.address,
        { gasLimit: -1 },
        substrateReceiver.address
      );
    expect(txResult.output?.toHuman()).to.equal(transferAmount.toString());
  });

  it("Substrate transfer to eth bob", async function () {
    const amount = api.createType("Balance", transferAmount);

    const balanceBeforeTx: ContractCallOutcome =
      await substrateTokenContract.query.balanceOf(
        substrateSender.address,
        { gasLimit: -1 },
        substrateSender.address
      );
    expect(balanceBeforeTx.output?.toHuman()).to.equal(
      transferAmount.toString()
    );

    const approveTx = await substrateTokenContract.tx.approve(
      {},
      substrateBridgeContract.address,
      amount
    );

    const txPromise: Promise<void> = new Promise(async (resolve) => {
      const unsub = await approveTx.signAndSend(
        substrateSender,
        ({
          status,
          // @ts-ignore
          contract,
        }) => {
          if (status.isInBlock || status.isFinalized) {
            unsub();
            resolve();
          }
        }
      );
    });
    await txPromise;
    const b = Buffer.from(ethReceiver.address.substring(2), "hex");
    const bridgeTx = substrateBridgeContract.tx.transfer(
      {},
      BN.from(transferAmount),
      b
    );

    const bridgeTxPromise: Promise<void> = new Promise(async (resolve) => {
      const unsub = await bridgeTx.signAndSend(
        substrateSender,
        ({ status }) => {
          if (status.isInBlock || status.isFinalized) {
            unsub();
            resolve();
          }
        }
      );
    });
    await bridgeTxPromise;
    const balanceAfterTx: ContractCallOutcome =
      await substrateTokenContract.query.balanceOf(
        substrateSender.address,
        { gasLimit: -1 },
        substrateSender.address
      );
    expect(balanceAfterTx.output?.toHuman()).to.equal("0");

    // todo replace by listening to successful transfer event
    await new Promise((r) => setTimeout(r, 10000));
    const tokenCli = MyToken__factory.connect(
      ethTokenContractAddress,
      ethReceiver
    );

    const balance = await tokenCli.balanceOf(ethReceiver.address);
    expect(balance.toNumber()).to.equal(transferAmount);
  });
});
