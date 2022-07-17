import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import { MyToken, MyToken__factory } from "../typechain";
import { ApiPromise } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";
import { CodePromise, ContractPromise } from "@polkadot/api-contract";
import { Hash, AccountId } from "@polkadot/types/interfaces/runtime/types";
import * as fs from "fs";

export async function deployEthBridge(
  bridgeExecutor: SignerWithAddress,
  myToken: string
): Promise<string> {
  const Bridge = await ethers.getContractFactory("Bridge", bridgeExecutor);
  const bridge = await Bridge.deploy(myToken);
  await bridge.deployed();
  console.log("ETH Bridge deployed to:", bridge.address);
  return bridge.address;
}

export async function deployEthErc20(
  tokenOwner: SignerWithAddress,
  initSupply: BigNumberish
): Promise<MyToken> {
  const MyToken = await ethers.getContractFactory("MyToken", tokenOwner);
  const myTokenContract = await MyToken.deploy(initSupply);
  await myTokenContract.deployed();
  console.log("ETH MyToken deployed to:", myTokenContract.address);

  return MyToken__factory.connect(myTokenContract.address, tokenOwner);
}

export async function deploySubstrateErc20(
  substrateTokenOwner: KeyringPair,
  initSupply: BigNumberish,
  api: ApiPromise
): Promise<ContractPromise> {
  console.log(`current folder is ${process.cwd()}`);
  const wasm = fs.readFileSync("contracts/erc20/target/ink/erc20.wasm");
  const metadata = fs.readFileSync("contracts/erc20/target/ink/metadata.json");

  const erc = await deploySubstrateContract(
    substrateTokenOwner,
    initSupply,
    api,
    wasm,
    metadata
  );
  console.log("Substrate MyToken deployed to:", erc.address.toString());

  return erc;
}

export async function deploySubstrateBridge(
  contractOwner: KeyringPair,
  api: ApiPromise,
  address: AccountId
): Promise<ContractPromise> {
  console.log(`current folder is ${process.cwd()}`);
  const wasm = fs.readFileSync("contracts/bridge/target/ink/bridge.wasm");
  const metadata = fs.readFileSync("contracts/bridge/target/ink/metadata.json");

  const bridge = await deploySubstrateContract(
    contractOwner,
    address,
    api,
    wasm,
    metadata
  );
  console.log("Substrate Bridge deployed to:", bridge.address.toString());

  return bridge;
}

async function deploySubstrateContract(
  contractOwner: KeyringPair,
  initArgs: any,
  api: ApiPromise,
  wasm: Buffer,
  metadata: Buffer
): Promise<ContractPromise> {
  const code = new CodePromise(api, metadata.toString(), wasm);
  const { address, hash } = await deploySubstrateCode(
    api,
    code,
    contractOwner,
    initArgs
  );

  // The address is the actual on-chain address as ss58 or AccountId object.
  return new ContractPromise(api, metadata.toString(), address);
}

async function deploySubstrateCode(
  api: ApiPromise,
  code: CodePromise,
  contractOwner: KeyringPair,
  initArgs: any
): Promise<{ address: string; hash: Hash }> {
  // maximum gas to be consumed for the instantiation. if limit is too small the instantiation will fail.
  const gasLimit: BigNumberish = 100000 * 1000000;
  // a limit to how much Balance to be used to pay for the storage created by the instantiation
  // if null is passed, unlimited balance can be used
  const storageDepositLimit = null;
  const tx = code.tx.new({ gasLimit, storageDepositLimit }, initArgs);

  const myPromise: Promise<{ address: string; hash: Hash }> = new Promise(
    async (resolve) => {
      const unsub = await tx.signAndSend(
        contractOwner,
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
