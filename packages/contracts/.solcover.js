module.exports = {
  // should always be 100% because they are abstract contracts
  skipFiles: [
    'implementations',
    'test',
    'FundedConsumer.sol',
    'SlotDerivation.sol',
    'StorageSlot.sol',
  ]
};
