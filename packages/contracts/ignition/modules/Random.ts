import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const RandomModule = buildModule('RandomModule', (m) => {
  const random = m.contract('Random')

  return { random }
})

export default RandomModule
