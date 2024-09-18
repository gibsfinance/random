# @gibs/random

This repository provides a platform for actors on any evm blockchain to provide high fidelity randomness in low trust situations via a commit/reveal scheme.

## contracts

The evm executable contracts that hold preimages, facilitate staking, and distribute funds for providers and consumers.

## indexer

A [ponder.sh](https://ponder.sh) indexer that collects data in order to present it to any willing consumer. This could be privately, to a backend randomness provider, a front end to allow consumers to request randomness.

## provider

A basic example of how randomness could be requested and provided. The provider and consumer scripts both use the indexer to read the latest state of the blockchain, and the contracts abis to write to the blockchain.
