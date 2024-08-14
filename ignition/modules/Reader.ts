import { buildModule } from "@nomicfoundation/hardhat-ignition/modules"
import RandomModule from "./Random"

const ReaderModule = buildModule("ReaderModule", (m) => {
  const { random } = m.useModule(RandomModule)
  const randomContract = m.contractAt('Random', random, {
    after: [random],
  })
  const reader = m.contract('Reader', [randomContract.address], {
    after: [randomContract],
  })

  return { reader }
})

export default ReaderModule
