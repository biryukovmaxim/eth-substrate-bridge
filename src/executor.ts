import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Bridge, Bridge__factory, ERC20, ERC20__factory } from "../typechain";
import { BigNumberish } from "ethers";

export class Executor {
  ethBridgeAddress: string;
  signer: SignerWithAddress;
  contract: Bridge;

  constructor(ethBridgeAddress: string, signer: SignerWithAddress) {
    this.ethBridgeAddress = ethBridgeAddress;
    this.signer = signer;
    this.contract = Bridge__factory.connect(ethBridgeAddress, signer);
  }

  run() {
    this.contract.on(
      "Queued",
      (
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


      }
    );
  }
}
