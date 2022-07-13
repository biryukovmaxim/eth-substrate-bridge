import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Bridge, Bridge__factory, ERC20, ERC20__factory } from "../typechain";
import { BigNumberish } from "ethers";
import { ContractPromise } from "@polkadot/api-contract";

export class Executor {
  ethBridgeAddress: string;
  ethBridgeSigner: SignerWithAddress;
  ethBridgeContract: Bridge;

  substrateTokenContract: ContractPromise;

  constructor(
    ethBridgeAddress: string,
    signer: SignerWithAddress,
    substrateTokenContract: ContractPromise
  ) {
    this.ethBridgeAddress = ethBridgeAddress;
    this.ethBridgeSigner = signer;
    this.ethBridgeContract = Bridge__factory.connect(ethBridgeAddress, signer);
    this.substrateTokenContract = substrateTokenContract;
  }

  run() {
    this.ethBridgeContract.on(
      "Queued",
      async (
        id?: BigNumberish | null,
        from?: string | null,
        to?: null,
        amount?: null,
        timestamp?: BigNumberish | null
      ) => {
        console.log(
          "received event:" +
            JSON.stringify({ id, from, to, amount, timestamp })
        );

        // const gasLimit: BigNumberish = 3000 * 1000000;
        // const storageDepositLimit = null;
        //
        // this.substrateTokenContract.tx;
        // await this.substrateTokenContract.tx
        //   .inc({ storageDepositLimit, gasLimit }, incValue)
        //   .signAndSend(alicePair, (result) => {
        //     if (result.status.isInBlock) {
        //       console.log("in a block");
        //     } else if (result.status.isFinalized) {
        //       console.log("finalized");
        //     }
        //   });
      }
    );
  }
}
