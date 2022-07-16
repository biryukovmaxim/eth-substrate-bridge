import { Bridge, Bridge__factory, ERC20, ERC20__factory } from "../typechain";
import { BigNumberish } from "ethers";
import { ContractPromise } from "@polkadot/api-contract";
import { KeyringPair } from "@polkadot/keyring/types";
import { BigNumber } from "@ethersproject/bignumber/src.ts/bignumber";
import { ApiPromise, Keyring } from "@polkadot/api";
import {
  ContractCallOutcome,
  ContractOptions,
} from "@polkadot/api-contract/types";

export class Executor {
  ethBridgeContract: Bridge;

  substrateApi: ApiPromise;
  substrateTokenContract: ContractPromise;
  substrateBridgeExecutor: KeyringPair;

  constructor(
    ethBridgeContract: Bridge,
    substrateTokenContract: ContractPromise,
    substrateBridgeExecutor: KeyringPair,
    substrateApi: ApiPromise
  ) {
    this.ethBridgeContract = ethBridgeContract;
    this.substrateTokenContract = substrateTokenContract;
    this.substrateBridgeExecutor = substrateBridgeExecutor;
    this.substrateApi = substrateApi;
  }

  run() {
    this.ethBridgeContract.on(
      "Queued",
      async (
        id: BigNumber,
        from: string | null,
        to: Uint8Array,
        amount: BigNumber,
        timestamp: BigNumber | null
      ) => {
        console.log(
          "received event:" +
            JSON.stringify({ id, from, to, amount, timestamp })
        );

        const balanceBridge: ContractCallOutcome =
          await this.substrateTokenContract.query.balanceOf(
            this.substrateBridgeExecutor.address,
            { gasLimit: -1 },
            this.substrateBridgeExecutor.address
          );
        // console.log({ balanceBridge: balanceBridge.output?.toHuman() });

        const value = this.substrateApi.createType("Balance", amount);
        const accountId = this.substrateApi.createType("AccountId", to);

        const TransferTx = this.substrateTokenContract.tx.transfer(
          {},
          accountId,
          value
        );

        const unsub = await TransferTx.signAndSend(
          this.substrateBridgeExecutor,
          async (result) => {
            if (result.isError) {
              unsub();
              const ethTx = await this.ethBridgeContract.processTransfer(
                id,
                false
              );
              await ethTx.wait();
            }
            if (result.status.isInBlock || result.status.isFinalized) {
              unsub();
              const ethTx = await this.ethBridgeContract.processTransfer(
                id,
                true
              );
              await ethTx.wait();
            }
          }
        );
      }
    );
  }
}
