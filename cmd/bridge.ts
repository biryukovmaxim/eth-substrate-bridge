import { ethers } from "hardhat";
import { Bridge__factory, MyToken__factory } from "../typechain";
import { Signer } from "ethers";
import { Executor } from "../src/executor";
import { ContractPromise } from "@polkadot/api-contract";
import fs from "fs";
import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";

async function main() {
  const envEthBridgeAddress: string | undefined =
    process.env.ETHEREUM_BRIDGE_ADDRESS;
  if (envEthBridgeAddress === undefined) {
    throw new Error("undefined ethereum bridge address");
  }
  const envEthMyTokenAddress: string | undefined =
    process.env.ETHEREUM_MYTOKEN_ADDRESS;
  if (envEthMyTokenAddress === undefined) {
    throw new Error("undefined ethereum bridge address");
  }
  let ethBridgeExecutor: Signer;
  const envEthBridgeExecutorPrivateKey: string | undefined =
    process.env.ETHEREUM_BRIDGE_EXECUTOR_PRIVATE_KEY;
  if (envEthBridgeExecutorPrivateKey === undefined) {
    throw new Error("undefined ethereum bridge executor private key");
  } else {
    ethBridgeExecutor = new ethers.Wallet(envEthBridgeExecutorPrivateKey);
  }

  let substrateWsEndpoint: string;
  const envSubstrateWsEndpoint: string | undefined =
    process.env.SUBSTRATE_WS_URI;
  if (envSubstrateWsEndpoint === undefined) {
    throw new Error("undefined substrate ws uri");
  } else {
    substrateWsEndpoint = envSubstrateWsEndpoint as string;
  }
  const envSubstrateMyTokenAddress: string | undefined =
    process.env.SUBSTRATE_MYTOKEN_ADDRESS;
  if (envSubstrateMyTokenAddress === undefined) {
    throw new Error("undefined substrate erc20 token address");
  }
  const envSubstrateBridgeAddress: string | undefined =
    process.env.SUBSTRATE_BRIDGE_ADDRESS;
  if (envSubstrateBridgeAddress === undefined) {
    throw new Error("undefined substrate bridge address");
  }

  const keyring = new Keyring({ type: "sr25519" });
  let substrateBridgeOwner: KeyringPair;
  const envSubstrateBridgeOwnerSeed: string | undefined =
    process.env.SUBSTRATE_BRIDGE_OWNER_PRIVATE_KEY;
  if (envSubstrateBridgeOwnerSeed === undefined) {
    throw new Error("undefined substrate bridge owner seed");
  } else {
    substrateBridgeOwner = keyring.addFromUri(envSubstrateBridgeOwnerSeed);
  }
  const api = await ApiPromise.create({
    provider: new WsProvider(substrateWsEndpoint),
  });
  const substrateErc20Metadata = fs.readFileSync(
    "contracts/erc20/target/ink/metadata.json"
  );
  const substrateBridgeMetadata = fs.readFileSync(
    "contracts/bridge/target/ink/metadata.json"
  );

  new Executor(
    Bridge__factory.connect(envEthBridgeAddress, ethBridgeExecutor),
    MyToken__factory.connect(envEthMyTokenAddress, ethBridgeExecutor),
    new ContractPromise(
      api,
      substrateErc20Metadata.toString(),
      envSubstrateMyTokenAddress
    ),
    substrateBridgeOwner,
    api,
    new ContractPromise(
      api,
      substrateBridgeMetadata.toString(),
      envSubstrateBridgeAddress
    )
  ).run();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
