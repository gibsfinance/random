module.exports = {
  // solidity-coverage instruments by injecting statements and turns the optimizer down,
  // which makes the heavy vendored uzkge assembly (PlonkVerifier and friends) hit
  // "Stack too deep" — that graph only compiles with the optimizer on (hardhat builds it
  // viaIR:false/runs:200). configureYulOptimizer re-enables a Yul optimizer pass during the
  // coverage compile to relieve the stack pressure so the whole tree compiles under coverage.
  configureYulOptimizer: true,
  skipFiles: [
    // should always be 100% because they are abstract contracts
    'implementations',
    'test',
    'FundedConsumer.sol',
    'SlotDerivation.sol',
    'StorageSlot.sol',
    // vendored uzkge verifiers are pinned third-party code (verbatim @ 2ae729db) — we do
    // not measure coverage on them; they're exercised via fixtures + foundry negative fuzz.
    'vendor',
  ],
};
