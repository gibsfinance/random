I got to thinking about randomness over the weekend. I think it is a perfect first app for msgboard. Here are some thoughts:

* it is difficult to make randomness synchronously available, but we can make it available async in a heavily gas optimized way, allowing it to be readily accessible
* preimages can be placed on chain (as randomness for sale) for very cheap as immutable data using sstore2 batches (written into contract bytecode)
* immutable preimages can be stored on chain and can be written when gas prices are low, to arbitrage gas prices
* So 5 preimage providers would spend ~$1 total per 100k gwei to put preimages on chain and provide randomness for every single block.
* the other half of this is of course the revealing of the preimages
* consumer pays for preimages, which triggers the randomness providers to publish their randomness on msgboard.
* providers will have to monitor to make sure that it gets on chain and we can even do things like let the providers post the data to the contract themselves
* the only other issue that occurs is the censorship by ommission that can occur.
* this can be solved by requiring the consumer to also post a preimage with a block deadline that the consumer (or someone with the secret) has to meet.
* so in order to cheat, the consumer would need to have access to all of the producers' preimages and put up a preimage of their own that would allow them to "win"
* in order to be "random" the consumer only needs 1 provider to be honest.
* consumers can also be producers and are incented to be in order to increase the trustworthiness of their randomness
* the consumer also defines the order of the revealed secrets by providing a preimage of their own when they first purchase the providers' preimages

```
cost to cover a day's worth of preimages from the producer side
blocks = 86400/10
preimages = 24576/32
gas_cost = 4244998
100k_gwei = 100_000*1e9
pls_price = 0.0000452
((blocks/preimages)*gas_cost*100k_gwei/1e18)*0.0000452 = $0.2158581483 per 100k gwei in base fee
4775.62275 PLS - probably closer to 6_000 PLS with other gas costs
6_000/(86400/10) - 0.695 PLS per preimage per 100k gwei in base fee
```

1) providers write many preimages on chain
1) consumers request some subset of preimages, preferably across providers, to be revealed, some tokens are put up as payment (say 100 PLS)
1) providers publish secrets on msgboard (zero cost payment)
  - either A (ideal scenario)
    1) consumer publishes the secrets and reveals their own secret, closing out the roll
  - or B
    1) an entity that is acting as the mob / rule enforcer captures the secrets
    1) the consumer fails to / desires not to publish the secrets
    1) the rule enforcer puts the secrets on chain and names its own order (probably to something that the consumer will loose money on)
    1) this only makes sense if the rule enforcer knows how to make the consumer loose. random order means that the consumer gets another chance
  - or C
    1) producers publish secrets on chain to get paid immediately
    1) the final state of the consumer's roll is left up to the consumer / rule enforcer to work out via A/B

1) if the consumer is to win, then they should be willing to write the verification data on chain with their order and prove it to release the funds
1) if the rule enforcer is to win, they have a mechanism for closing out the hand / roll in their favor
1) if no one is to win, then the producers will still be paid
1) staking mechanism with time delays can be introduced to penalize randomness providers to reduce omissions further (but this may be optional)
