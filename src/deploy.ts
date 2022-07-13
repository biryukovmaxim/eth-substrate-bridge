import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { BigNumber, BigNumberish } from "ethers";
import { MyToken, MyToken__factory } from "../typechain";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";
import {
  BlueprintPromise,
  CodePromise,
  ContractPromise,
} from "@polkadot/api-contract";
import { Hash } from "@polkadot/types/interfaces/runtime/types";
import * as fs from "fs";

import { ContractCallOutcome } from "@polkadot/api-contract/types";

export async function deployEthBridge(
  bridgeExecutor: SignerWithAddress,
  myToken: string
): Promise<string> {
  const Bridge = await ethers.getContractFactory("Bridge", bridgeExecutor);
  const bridge = await Bridge.deploy(myToken);
  await bridge.deployed();
  console.log("Bridge deployed to:", bridge.address);
  return bridge.address;
}

export async function deployEthErc20(
  tokenOwner: SignerWithAddress,
  initSupply: BigNumberish
): Promise<MyToken> {
  const MyToken = await ethers.getContractFactory("MyToken", tokenOwner);
  const myTokenContract = await MyToken.deploy(initSupply);
  await myTokenContract.deployed();
  console.log("MyToken deployed to:", myTokenContract.address);

  return MyToken__factory.connect(myTokenContract.address, tokenOwner);
}

export async function deploySubstrateErc20(
  substrateTokenOwner: KeyringPair,
  initSupply: BigNumberish
): Promise<ContractPromise> {
  const wsProvider = new WsProvider("ws://127.0.0.1:9944");
  const api = await ApiPromise.create({ provider: wsProvider });
  console.log(`current folder is ${process.cwd()}`);
  const wasm = fs.readFileSync("contracts/erc20/target/ink/erc20.wasm");
  const metadata = fs.readFileSync("contracts/erc20/target/ink/metadata.json");

  const code = new CodePromise(api, metadata.toString(), wasm);
  const { address, hash } = await deploySubstrateCode(
    api,
    code,
    substrateTokenOwner,
    initSupply
  );
  console.log({ address });

  // The address is the actual on-chain address as ss58 or AccountId object.
  const contract = new ContractPromise(api, metadata.toString(), address);

  // let contractCallOutcome: ContractCallOutcome;
  // const txResult: ContractCallOutcome = await contract.query.balanceOf(
  //   substrateTokenOwner.address,
  //   { gasLimit: -1 },
  //   substrateTokenOwner.address
  // );
  // console.log({
  //   debugMessage: txResult.debugMessage,
  //   gasConsumed: txResult.gasConsumed.toHuman(),
  //   gasRequired: txResult.gasRequired.toHuman(),
  //   output: txResult.output?.toHuman(),
  //   result: txResult.result.toHuman(),
  //   resultData: txResult.result.asOk.data.toUtf8(),
  //   storageDeposit: txResult.storageDeposit.toHuman(),
  // });

  return contract;
}

async function deploySubstrateCode(
  api: ApiPromise,
  code: CodePromise,
  substrateTokenOwner: KeyringPair,
  initSupply: BigNumberish
): Promise<{ address: string; hash: Hash }> {
  // maximum gas to be consumed for the instantiation. if limit is too small the instantiation will fail.
  const gasLimit: BigNumberish = 100000 * 1000000;
  // a limit to how much Balance to be used to pay for the storage created by the instantiation
  // if null is passed, unlimited balance can be used
  const storageDepositLimit = null;
  const tx = code.tx.new({ gasLimit, storageDepositLimit }, initSupply);

  const myPromise: Promise<{ address: string; hash: Hash }> = new Promise(
    async (resolve) => {
      const unsub = await tx.signAndSend(
        substrateTokenOwner,
        ({
          status,
          // @ts-ignore
          contract,
          txHash,
        }) => {
          if (status.isInBlock || status.isFinalized) {
            unsub();
            resolve({
              address: contract.address.toString(),
              hash: txHash,
            });
          }
        }
      );
    }
  );

  return await myPromise;
}

async function deployBlueprint(
  blueprint: BlueprintPromise,
  substrateTokenOwner: KeyringPair
): Promise<string> {
  // maximum gas to be consumed for the instantiation. if limit is too small the instantiation will fail.
  const gasLimit: BigNumberish = 100000 * 1000000;
  // a limit to how much Balance to be used to pay for the storage created by the instantiation
  // if null is passed, unlimited balance can be used
  const storageDepositLimit = null;
  // used to derive contract address,
  // use null to prevent duplicate contracts
  const salt = new Uint8Array();

  const tx = blueprint.tx.default({ gasLimit, storageDepositLimit, salt });

  const myPromise: Promise<string> = new Promise(async (resolve) => {
    const unsub = await tx.signAndSend(
      substrateTokenOwner,
      ({
        // @ts-ignore
        contract,
        status,
      }) => {
        if (status.isInBlock || status.isFinalized) {
          unsub();
          resolve(contract.address.toString());
        }
      }
    );
  });

  return await myPromise;
}
