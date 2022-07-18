// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import {
  deployEthBridge,
  deployEthErc20,
  deploySubstrateBridge,
  deploySubstrateErc20,
} from "../src/deploy";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Signer, Wallet } from "ethers";
import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const [ethTokenOwnerDefault, ethBridgeExecutorDefault] =
    await ethers.getSigners();

  let initSupply: number;
  const envInitSupply: string | undefined = process.env.INIT_SUPPLY;
  if (envInitSupply === undefined) {
    initSupply = 100000;
  } else {
    initSupply = parseInt(envInitSupply as string);
  }

  let ethTokenOwner: Signer;
  const ethTokenOwnerPrivateKey: string | undefined =
    process.env.ETHEREUM_TOKEN_OWNER_PRIVATE_KEY;
  if (ethTokenOwnerPrivateKey === undefined) {
    ethTokenOwner = ethTokenOwnerDefault;
  } else {
    ethTokenOwner = new ethers.Wallet(ethTokenOwnerPrivateKey);
  }

  let ethBridgeExecutor: Signer;
  const envEthBridgeExecutorPrivateKey: string | undefined =
    process.env.ETHEREUM_BRIDGE_EXECUTOR_PRIVATE_KEY;
  if (envEthBridgeExecutorPrivateKey === undefined) {
    ethBridgeExecutor = ethBridgeExecutorDefault;
  } else {
    ethBridgeExecutor = new ethers.Wallet(envEthBridgeExecutorPrivateKey);
  }

  let substrateWsEndpoint: string;
  const envSubstrateWsEndpoint: string | undefined =
    process.env.SUBSTRATE_WS_URI;
  if (envSubstrateWsEndpoint === undefined) {
    substrateWsEndpoint = "ws://127.0.0.1:9944";
  } else {
    substrateWsEndpoint = envSubstrateWsEndpoint as string;
  }

  const keyring = new Keyring({ type: "sr25519" });
  let substrateTokenOwner: KeyringPair;
  const envSubstrateTokenOwnerSeed: string | undefined =
    process.env.SUBSTRATE_TOKEN_OWNER_PRIVATE_KEY;
  if (envSubstrateTokenOwnerSeed === undefined) {
    substrateTokenOwner = keyring.addFromUri("//Alice", {
      name: "Alice default",
    });
  } else {
    substrateTokenOwner = keyring.addFromUri(envSubstrateTokenOwnerSeed);
  }
  let substrateBridgeOwner: KeyringPair;
  const envSubstrateBridgeOwnerSeed: string | undefined =
    process.env.SUBSTRATE_BRIDGE_OWNER_PRIVATE_KEY;
  if (envSubstrateBridgeOwnerSeed === undefined) {
    substrateBridgeOwner = keyring.addFromUri("//Dave", {
      name: "Dave default",
    });
  } else {
    substrateBridgeOwner = keyring.addFromUri(envSubstrateBridgeOwnerSeed);
  }

  // deploy eth contracts
  const tokenOwnerClient = await deployEthErc20(ethTokenOwner, initSupply);
  await deployEthBridge(ethBridgeExecutor, tokenOwnerClient.address);

  // deploy substrate contracts
  const wsProvider = new WsProvider(substrateWsEndpoint);
  const api = await ApiPromise.create({ provider: wsProvider });

  const substrateTokenContract = await deploySubstrateErc20(
    substrateTokenOwner,
    initSupply,
    api
  );
  await deploySubstrateBridge(
    substrateBridgeOwner,
    api,
    substrateTokenContract.address
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
