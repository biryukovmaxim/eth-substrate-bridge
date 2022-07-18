import { Bridge, MyToken } from "../typechain";
import { ContractPromise } from "@polkadot/api-contract";
import { KeyringPair } from "@polkadot/keyring/types";
import { BigNumber } from "@ethersproject/bignumber/src.ts/bignumber";
import { ApiPromise } from "@polkadot/api";
import { AccountId } from "@polkadot/types/interfaces/runtime/types";
import { Bytes } from "@polkadot/types-codec/extended/Bytes";
import { IEventRecord } from "@polkadot/types/types/events";

export class Executor {
  ethBridgeContract: Bridge;
  ethTokenContract: MyToken;

  substrateApi: ApiPromise;
  substrateTokenContract: ContractPromise;
  substrateBridgeExecutor: KeyringPair;
  substrateBridgeContract: ContractPromise;

  constructor(
    ethBridgeContract: Bridge,
    ethTokenContractClient: MyToken,
    substrateTokenContract: ContractPromise,
    substrateBridgeExecutor: KeyringPair,
    substrateApi: ApiPromise,
    substrateBridgeContract: ContractPromise
  ) {
    this.ethBridgeContract = ethBridgeContract;
    this.substrateTokenContract = substrateTokenContract;
    this.substrateBridgeExecutor = substrateBridgeExecutor;
    this.substrateApi = substrateApi;
    this.substrateBridgeContract = substrateBridgeContract;
    this.ethTokenContract = ethTokenContractClient;
  }
  async subscribeToSubstrateBridgeEvents() {
    let lastID = 0;
    while (true) {
      try {
        // @ts-ignore
        let events: Array<IEventRecord> =
          await this.substrateApi.query.system.events();
        if (events.length == 0) {
          continue;
        }
        events.forEach((object: IEventRecord<any>) => {
          const [updateLastId, newLastID] = this.processSubstrateEvent(
            object,
            lastID
          );
          if (updateLastId) {
            lastID = newLastID;
          }
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }
  }

  private processSubstrateEvent(
    object: IEventRecord<any>,
    lastID: number
  ): [boolean, number] {
    let localLastID: number = lastID;
    if (!this.substrateApi.events.contracts.ContractEmitted.is(object.event)) {
      return [false, 0];
    }
    // @ts-ignore
    const [account_id, contract_evt]: [AccountId, Uint8Array | Bytes] =
      object.event.data;
    if (
      account_id.toString() !== this.substrateBridgeContract.address.toHuman()
    ) {
      return [false, 0];
    }

    const decoded = this.substrateBridgeContract.abi.decodeEvent(contract_evt);
    // @ts-ignore
    let [id, from, _, amount, timestamp]: [
      number,
      string,
      string,
      number,
      number
    ] = decoded.args.map((arg) => arg.toJSON());
    if (decoded.event.identifier != "Queued" || id <= lastID) {
      return [false, 0];
    }
    if (id > lastID) {
      localLastID = id;
    }

    const toRaw: Buffer = Buffer.from(decoded.args[2].toU8a());
    const to = toRaw.toString("hex");

    console.log("received substrate queued event: ", {
      id,
      from,
      to,
      amount,
      timestamp: new Date(timestamp),
    });
    this.ethTokenContract.transfer(to as string, amount).then(async (tx) => {
      await tx.wait();

      const processTx = await this.substrateBridgeContract.tx.processTransfer(
        {},
        this.substrateApi.createType("u128", id),
        true
      );
      const txPromise: Promise<void> = new Promise(async (resolve) => {
        const unsub = await processTx.signAndSend(
          this.substrateBridgeExecutor,
          ({ status }) => {
            if (status.isInBlock || status.isFinalized) {
              unsub();
              resolve();
            }
          }
        );
      });
      await txPromise;
    });
    return [true, localLastID];
  }

  private async processEthEvent(
    id: BigNumber,
    from: string | null,
    to: Uint8Array,
    amount: BigNumber,
    timestamp: BigNumber | null
  ) {
    console.log(
      "received eth queued event:" +
        JSON.stringify({ id, from, to, amount, timestamp })
    );

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
          const ethTx = await this.ethBridgeContract.processTransfer(id, false);
          await ethTx.wait();
        }
        if (result.status.isInBlock || result.status.isFinalized) {
          unsub();
          const ethTx = await this.ethBridgeContract.processTransfer(id, true);
          await ethTx.wait();
        }
      }
    );
  }

  public run() {
    this.ethBridgeContract.on(
      "Queued",
      async (
        id: BigNumber,
        from: string | null,
        to: Uint8Array,
        amount: BigNumber,
        timestamp: BigNumber | null
      ) => {
        await this.processEthEvent(id, from, to, amount, timestamp);
      }
    );
    this.subscribeToSubstrateBridgeEvents().then(() =>
      console.log("stop listening to substrate bridge events")
    );
  }
}
