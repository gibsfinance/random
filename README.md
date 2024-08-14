# Random [![Coverage Status](https://coveralls.io/repos/github/gibsfinance/random/badge.svg?branch=master)](https://coveralls.io/github/gibsfinance/random?branch=master)

a repo for generating randomness on chain

### deployment notes

```bash
npx hardhat ignition deploy ignition/modules/Random.ts --network pulsechainV4 --verify
npx hardhat ignition deploy ignition/modules/Reader.ts --network pulsechainV4 --verify
npx hardhat ignition deploy ignition/modules/Consumer.ts --network pulsechainV4 --verify
npx hardhat ignition verify chain-943 --include-unrelated-contracts
```
