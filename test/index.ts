import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber as BN } from "ethers";

const initSupply = 100000;
const transferAmount = 100;

describe("MyToken", function () {
  before("Preparing eth", async () => {
    const [tokenOwner] = await ethers.getSigners();
    const MyToken = await ethers.getContractFactory("MyToken", tokenOwner);
    const myTokenContract = await MyToken.deploy(initSupply);
    await myTokenContract.deployed();
    const tokenOwnerClient = myTokenContract.connect(tokenOwner);

    const bridgeEthAcc = ethers.Wallet.createRandom();
    const transferTx = await tokenOwnerClient.transfer(
      bridgeEthAcc.address,
      BN.from(transferAmount)
    );
    await transferTx.wait();
    const bridgeAccBalance = await myTokenContract.balanceOf(
      bridgeEthAcc.address
    );
    const tokenOwnerBalance = await myTokenContract.balanceOf(
      tokenOwner.address
    );

    expect(transferAmount).to.equal(bridgeAccBalance);
    expect(initSupply - transferAmount).to.equal(tokenOwnerBalance);
  });
  it("Compare Balance after transfer", async function () {});
});
