import { buildModule } from "@nomicfoundation/hardhat-ignition/modules"
import RandomModule from "./Random"

const ConsumerModule = buildModule("ConsumerModule", (m) => {
  const { random } = m.useModule(RandomModule)
  const randomContract = m.contractAt('Random', random, {
    after: [random],
  })
  const consumer = m.contract('Consumer', [randomContract.address], {
    after: [randomContract],
  })

  return { consumer }
})

export default ConsumerModule
