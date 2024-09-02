# Random [![Coverage Status](https://coveralls.io/repos/github/gibsfinance/random/badge.svg?branch=master)](https://coveralls.io/github/gibsfinance/random?branch=master)

a repo for generating randomness on chain

### deployment notes

```bash
npx hardhat ignition deploy ignition/modules/Random.ts --network pulsechainV4
npx hardhat ignition deploy ignition/modules/Reader.ts --network pulsechainV4
npx hardhat ignition deploy ignition/modules/Consumer.ts --network pulsechainV4
npx hardhat ignition verify chain-943 --include-unrelated-contracts
```

### randomness providing

Providing randomness, at the end of the day, is a numbers game (excuse the pun).

You need to be able to ensure that validators have a reason to stay online and keep their stack of preimages up to date, but you want it to happen at as little of a cost and complexity as possible so that providers do not have a high barrier to cross to get you the randomness you request.

This game is achieved using the following mechanics:
- providers stake a number of tokens that they expect to be paid (on average) for providing their seeds this occurs when preimages are written
- consumers stake an amount to cover the total randomness seeds requested. the prices can be different for each provider's preimages
- any provider that gets their secret on chain, either via the consumer or by writing it themselves, before the consumer asks for the campaign to end will not be slashed
- consumers can "slash" any validator by taking the preimages that they requested and were not delivered
- failing to get all secrets on chain means that providers will not be rewarded with the funds that the consumer staked
- providers must either put secrets on chain themselves or come up with mechanism to do so in batches if gas is a consideration
- consumers must request a number of seeds that make the number that is generated credibly neutral, luckily, only one actor must be honest for the seed to be credibly random

consider the following example

alice requests randomness from bob, charlie, and david. bob's preimage costs 90 PLS while charlie's costs 125 and david's costs 100. Alice will have to stake 315 PLS (90+125+100) to properly request randomness inputs from the 3 sources. From here, the following results could occur:

- all 3 providers expose their secrets to the public and alice, who writes the data on chain, distributes the pot to david who was randomly chosen by the resulting seed.
- all 3 providers expose their secrets to the public, however alice has faulted and does not write the secrets on chain quickly. at some point, david notes that he is the winner of the pot and notes that the timeline is expiring. he decides to write the randomness on chain, distributing tokens to each of the validators and the pot to himself.
- all 3 providers expose their secrets, alice faults, then all 3 of the providers fault. in this case, any address that has the appropriate data and secrets can submit them on chain. bob is the first to come back online and he decides to submit all 3 secrets. releasing each of the 3 providers staked tokens back to themselves and distributing the pot to david.
- providers expose, alice and providers fault. bob comes online and only knows his secret. he submits that secret to make sure that he is not slashed. alice comes online next and has all 3 secrets, but chooses to cancel the timeline because it has expired. she is reimbersed with her stake as well as charlie and david's staked tokens.
