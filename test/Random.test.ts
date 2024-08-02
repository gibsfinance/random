import * as utils from '../lib/utils'
import * as viem from 'viem'
import _ from "lodash";
import * as helpers from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai';
import * as expectations from './expectations'
import * as testUtils from './utils'

describe("Random", () => {
  describe('writing preimages', () => {
    it('fails if read occurs before write', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expectations.revertedWithCustomError(testUtils.readPreimages(ctx), 'Misconfigured')
    })
    it('will not err if an index that is presented is out of bounds on random contract', async () => {
      const ctx = await helpers.loadFixture(testUtils.deploy)
      await expect(ctx.random.read.pointer([viem.zeroAddress, 0n]))
        .eventually.to.equal(viem.zeroAddress)
    })
    it('writes them to a known location', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const [secrets] = ctx.secretGroups
      const [readBatches] = await testUtils.readPreimages(ctx)
      const preimages = _.map(secrets, 'preimage')
      expect(preimages).to.deep.equal(readBatches)
    })
  })
  describe('requesting secrets', () => {
    it('emits a Heat event', async function () {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const [signer] = await ctx.hre.viem.getWalletClients()
      const [[s]] = await utils.createPreimages(signer.account!.address)
      const selections = await testUtils.selectPreimages(ctx)
      const keys = _.map(selections, 'providerKeyWithIndex')
      const required = 5n
      const heatHash = await ctx.random.write.heat([required, 12n << 1n, viem.zeroAddress, s.preimage, keys])
      const emitArgs = [ctx, heatHash, ctx.random, 'Heat'] as const
      const expectedUsed = keys.slice(0, Number(required))
      if (Number(required) > expectedUsed.length) {
        return this.skip()
      }
      await Promise.all(expectedUsed.map(async (key) => {
        const parts = utils.providerKeyParts(key)
        await expectations.emit(...emitArgs, {
          to: parts.provider,
          index: parts.index,
        })
      }))
    })
    it('does not allow secrets to be requested twice', async () => {
      const ctx = await helpers.loadFixture(testUtils.deployWithRandomness)
      const [signer] = await ctx.hre.viem.getWalletClients()
      const [[s]] = await utils.createPreimages(signer.account!.address)
      const selections = await testUtils.selectPreimages(ctx)
      const keys = _.map(selections, 'providerKeyWithIndex')
      const required = 5n
      await expectations.revertedWithCustomError(ctx.random.write.heat([required, 12n << 1n, viem.zeroAddress, s.preimage, keys]), 'UnableToService')
      // const emitArgs = [ctx, heatHash, ctx.random, 'Heat'] as const
      // const expectedUsed = keys.slice(0, Number(required))
      // if (Number(required) > expectedUsed.length) {
      //   return this.skip()
      // }
      // await Promise.all(expectedUsed.map(async (key) => {
      //   const parts = utils.providerKeyParts(key)
      //   await expectations.emit(...emitArgs, {
      //     to: parts.provider,
      //     index: parts.index,
      //   })
      // }))
    })
  })
  describe('submitting secrets', () => {
    describe('when to send', async () => {
      it('can detect by checking a section directly', async () => {

      })
    })
  })
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  // async function deployOneYearLockFixture() {
  //   const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;

  //   const lockedAmount = parseGwei("1");
  //   const unlockTime = BigInt((await time.latest()) + ONE_YEAR_IN_SECS);

  //   // Contracts are deployed using the first signer/account by default
  //   const [owner, otherAccount] = await hre.viem.getWalletClients();

  //   const lock = await hre.viem.deployContract("Lock", [unlockTime], {
  //     value: lockedAmount,
  //   });

  //   const publicClient = await hre.viem.getPublicClient();

  //   return {
  //     lock,
  //     unlockTime,
  //     lockedAmount,
  //     owner,
  //     otherAccount,
  //     publicClient,
  //   };
  // }

  // describe("Deployment", function () {
  //   it("Should set the right unlockTime", async function () {
  //     const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

  //     expect(await lock.read.unlockTime()).to.equal(unlockTime);
  //   });

  //   it("Should set the right owner", async function () {
  //     const { lock, owner } = await loadFixture(deployOneYearLockFixture);

  //     expect(await lock.read.owner()).to.equal(
  //       getAddress(owner.account.address)
  //     );
  //   });

  //   it("Should receive and store the funds to lock", async function () {
  //     const { lock, lockedAmount, publicClient } = await loadFixture(
  //       deployOneYearLockFixture
  //     );

  //     expect(
  //       await publicClient.getBalance({
  //         address: lock.address,
  //       })
  //     ).to.equal(lockedAmount);
  //   });

  //   it("Should fail if the unlockTime is not in the future", async function () {
  //     // We don't use the fixture here because we want a different deployment
  //     const latestTime = BigInt(await time.latest());
  //     await expect(
  //       hre.viem.deployContract("Lock", [latestTime], {
  //         value: 1n,
  //       })
  //     ).to.be.rejectedWith("Unlock time should be in the future");
  //   });
  // });

  // describe("Withdrawals", function () {
  //   describe("Validations", function () {
  //     it("Should revert with the right error if called too soon", async function () {
  //       const { lock } = await loadFixture(deployOneYearLockFixture);

  //       await expect(lock.write.withdraw()).to.be.rejectedWith(
  //         "You can't withdraw yet"
  //       );
  //     });

  //     it("Should revert with the right error if called from another account", async function () {
  //       const { lock, unlockTime, otherAccount } = await loadFixture(
  //         deployOneYearLockFixture
  //       );

  //       // We can increase the time in Hardhat Network
  //       await time.increaseTo(unlockTime);

  //       // We retrieve the contract with a different account to send a transaction
  //       const lockAsOtherAccount = await hre.viem.getContractAt(
  //         "Lock",
  //         lock.address,
  //         { client: { wallet: otherAccount } }
  //       );
  //       await expect(lockAsOtherAccount.write.withdraw()).to.be.rejectedWith(
  //         "You aren't the owner"
  //       );
  //     });

  //     it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
  //       const { lock, unlockTime } = await loadFixture(
  //         deployOneYearLockFixture
  //       );

  //       // Transactions are sent using the first signer by default
  //       await time.increaseTo(unlockTime);

  //       await expect(lock.write.withdraw()).to.be.fulfilled;
  //     });
  //   });

  //   describe("Events", function () {
  //     it("Should emit an event on withdrawals", async function () {
  //       const { lock, unlockTime, lockedAmount, publicClient } =
  //         await loadFixture(deployOneYearLockFixture);

  //       await time.increaseTo(unlockTime);

  //       const hash = await lock.write.withdraw();
  //       await publicClient.waitForTransactionReceipt({ hash });

  //       // get the withdrawal events in the latest block
  //       const withdrawalEvents = await lock.getEvents.Withdrawal();
  //       expect(withdrawalEvents).to.have.lengthOf(1);
  //       expect(withdrawalEvents[0].args.amount).to.equal(lockedAmount);
  //     });
  //   });
  // });
});
