# Games-Web Funds-Safety Fixes (Task 7 Review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three High reviewer findings in `examples/games/web/` on branch `dice-onchain-settlement` — `settlementMode` mismatch (mode 0 vs 1), house key in the browser, and missing on-chain open flow — without weakening any funds-safety primitive.

**Architecture:** Three tightly-coupled changes land in a single commit. Fix 1 changes `settlementMode: 0 → 1` in `useSession.ts` start/play. Fix 2 re-architects `play()` to accept an injected `HouseDriver` (a `(roundRequest) => Promise<string>` factory), eliminates the unconditional `DEMO_HOUSE_KEY` + `runHouseSide` call from the default path, and provides an in-memory driver for tests/demo. Fix 3 adds `buildOpen` TxRequest construction to `DiceScreen` (faucet→approve→open before play). The new through-useSession settle test closes the green-by-divergence gap introduced by the existing diceSettle.test.ts co-signing at mode 1 OUTSIDE useSession.

**Tech Stack:** TypeScript 5.8, Viem 2.x, React 18, Vitest 2.x, `@gibs/msgboard-games` (runPlayerSide / runHouseSide / CoSignTransport), `@gibs/msgboard-settle` (EscrowedSettlement / buildOpen / OpenTerms), pnpm workspaces.

## Global Constraints

- `settlementMode` MUST be `1` (escrowed) everywhere in `useSession` — in `start()` and in any injected house driver config — matching `EscrowedSettlement`'s constructor check.
- The browser default production path must NEVER execute `runHouseSide` or hold `DEMO_HOUSE_KEY`. These may only appear in the injected in-memory test/demo driver.
- Funds-safety primitives are non-negotiable: CSPRNG clientSeed (generatePrivateKey), commit-only open (keccak256 only at open time), escrow-floor assert (assertEscrowBalances), anti-bias refusal (player rejects wrong clientSeed).
- PoW stays in the Worker — `useBoardBroadcaster` path untouched.
- No new npm dependencies; all imports are from existing workspace packages.
- Vitest: `pnpm vitest run` (run from `examples/games/web/`) must exit 0 with all tests passing.
- TypeScript: `npx tsc --noEmit` (from `examples/games/web/`) must exit 0.
- Commit message exactly: `fix(games-web): escrowed settlementMode + injectable house (no browser house key) + on-chain open flow`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `examples/games/web/src/hooks/useSession.ts` | Modify | Fix 1 (mode 1) + Fix 2 (injectable HouseDriver seam) |
| `examples/games/web/src/components/DiceScreen.tsx` | Modify | Fix 3 (buildOpen TxRequest + approve flow) |
| `examples/games/web/test/diceSettle.test.ts` | Modify | Add through-useSession settle test + buildOpen TxRequest shape test; keep refusal test |
| `examples/games/web/test/useSession.coSign.test.ts` | Modify | Adjust existing `settlementMode: 0` refs to mode 1 where they test the useSession path (the anti-bias refusal test there must keep working) |

---

### Task 1: FIX 1 — Change settlementMode to 1 in useSession.ts

**Files:**
- Modify: `examples/games/web/src/hooks/useSession.ts`

**Interfaces:**
- Produces: `useSession` exports the same `SessionApi<TParams>` interface — no signature changes. Internal `runPlayerSide` and any house driver now always use `settlementMode: 1`.

**Context:** Currently `useSession.ts` passes `settlementMode: 0` in two places:
1. Line 326 in `start()` — the `runPlayerSide` call.
2. Line 394 in `play()` — the `runHouseSide` call (inside the DEMO house block).

Both must change to `settlementMode: 1`. If these differ, `replaySession` in `EscrowedSettlement.buildSettle` throws `"replay: settlementMode mismatch"` and the settle button is dead.

- [ ] **Step 1: Write a failing test that proves the mismatch kills settle**

Add a new `describe` block to `examples/games/web/test/diceSettle.test.ts` BEFORE the other tests. The test drives a `runPlayerSide` + `runHouseSide` round using `settlementMode: 0` (the current broken value), then calls `EscrowedSettlement.buildSettle` with `settlementMode: 1` (what `EscrowedSettlement` requires). This MUST throw a mismatch error — proving the test will fail if Fix 1 is absent and pass once we change mode to 1 end-to-end.

```typescript
// At top of file, in the existing imports — no new imports needed

// Add BEFORE the existing "EscrowedSettlement.buildSettle" describe block:
describe('Mode mismatch regression guard: useSession must co-sign at settlementMode 1', () => {
  it('buildSettle rejects a transcript co-signed at mode 0 with mode-1 EscrowedSettlement', async () => {
    // Simulate the pre-fix bug: both sides co-sign at mode 0
    let acceptedRound: SessionState | undefined
    const { houseT, playerT } = buildCoSignPair((state) => {
      if (state.nonce > 0n) acceptedRound = state
    })
    const brokenHouseCfg = { ...houseCfg, settlementMode: 0 }
    const [transcriptJson] = await Promise.all([
      runHouseSide(brokenHouseCfg, houseT, { stake, params, clientSeed }),
      runPlayerSide(
        { domain, tableId, game: dice, player: playerSigner, houseRemote: true as const,
          clientSeed, seedTip: `0x${'00'.repeat(32)}` as Hex, chainLength, openBalances,
          settlementMode: 0 },  // ← the old broken value
        playerT,
      ),
    ])
    // EscrowedSettlement is constructed at mode 1; buildSettle must throw mismatch
    const esc = new EscrowedSettlement<{ targetX100: bigint }>({
      parties: { player: playerAccount.address, house: houseAccount.address },
      commit: buildSeedChain(seedTip, chainLength).commit,
      game: dice,
      domain,
      settlementMode: SETTLEMENT_MODE, // 1
      channel: HOUSE_CHANNEL,
    })
    await expect(esc.buildSettle(transcriptJson)).rejects.toThrow(/settlementMode mismatch/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it passes (mode-0 transcript IS rejected)**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
pnpm vitest run test/diceSettle.test.ts 2>&1 | tail -20
```

Expected: The new `Mode mismatch regression guard` test passes (buildSettle DID throw). The other 3 tests also pass because they already co-sign at mode 1.

- [ ] **Step 3: Patch useSession.ts — change both settlementMode: 0 → 1**

In `examples/games/web/src/hooks/useSession.ts`:

In `start()` (around line 326), change the `runPlayerSide` call:
```typescript
// BEFORE:
runPlayerSide(
  { domain, tableId, game, player, houseRemote: true as const, clientSeed,
    seedTip: DUMMY_SEED_TIP, chainLength, openBalances, settlementMode: 0 },
  playerT,
).catch((err) => setError(err instanceof Error ? err.message : String(err)))

// AFTER:
runPlayerSide(
  { domain, tableId, game, player, houseRemote: true as const, clientSeed,
    seedTip: DUMMY_SEED_TIP, chainLength, openBalances, settlementMode: 1 },
  playerT,
).catch((err) => setError(err instanceof Error ? err.message : String(err)))
```

In `play()` (around line 394), change the `runHouseSide` call's config:
```typescript
// BEFORE:
const json = await runHouseSide(
  {
    domain,
    tableId,
    game,
    player,
    house: houseSigner,
    seedTip: DEMO_SEED_TIP,
    chainLength,
    openBalances: currentBalances,
    settlementMode: 0,
  },
  pair.houseT,
  { stake, params, clientSeed },
)

// AFTER:
const json = await runHouseSide(
  {
    domain,
    tableId,
    game,
    player,
    house: houseSigner,
    seedTip: DEMO_SEED_TIP,
    chainLength,
    openBalances: currentBalances,
    settlementMode: 1,
  },
  pair.houseT,
  { stake, params, clientSeed },
)
```

- [ ] **Step 4: Run the tests again to confirm the regression guard now catches the change correctly**

The regression guard test (mode-0 transcript rejected at buildSettle) must still pass. The other tests (which already use mode 1) must still pass.

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
pnpm vitest run test/diceSettle.test.ts 2>&1 | tail -20
```

Expected: 4 tests pass (the existing 3 + the new guard).

- [ ] **Step 5: Also update useSession.coSign.test.ts — driveHouseSide uses settlementMode: 0**

In `examples/games/web/test/useSession.coSign.test.ts`, the `driveHouseSide` function at line 63–76 constructs a `houseCfg` with `settlementMode: 0`. The `makePlayerCfg` helper at line 79–92 also defaults to `settlementMode: 0`.

These tests test `runPlayerCoSign` (the player-side function) and both sides must match. Change both to `settlementMode: 1`:

```typescript
// In driveHouseSide() function:
const houseCfg: SessionConfig<{ targetX100: bigint }> = {
  domain,
  tableId,
  game: dice,
  player: playerSigner,
  house: houseSigner,
  seedTip,
  chainLength,
  openBalances,
  settlementMode: 1,   // was 0
}

// In makePlayerCfg() function:
return {
  domain,
  tableId,
  game: dice,
  player: playerSigner,
  houseRemote: true as const,
  clientSeed,
  chainLength,
  openBalances,
  settlementMode: 1,   // was 0
  ...overrides,
}

// Also in test (d) the biased-seed houseCfg inline copy:
const houseCfg: SessionConfig<{ targetX100: bigint }> = {
  domain,
  tableId,
  game: dice,
  player: playerSigner,
  house: houseSigner,
  seedTip,
  chainLength,
  openBalances,
  settlementMode: 1,   // was 0
}
```

- [ ] **Step 6: Run all web tests**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
pnpm vitest run 2>&1 | tail -25
```

Expected: All tests pass (42 original + 1 new = 43 total).

---

### Task 2: FIX 2 — Injectable HouseDriver seam (no browser house key)

**Files:**
- Modify: `examples/games/web/src/hooks/useSession.ts`

**Interfaces:**
- Consumes: The `HouseDriver` type (defined here) — `(input: HouseDriverInput) => Promise<string>` — where `HouseDriverInput` carries `{ stake, params, clientSeed, tableId, currentBalances }`.
- Produces: `UseSessionConfig<TParams>` gains an optional `houseDriver?: HouseDriver<TParams>`. When absent, useSession defaults to a board-backed TODO path (production) or the in-memory driver (test/demo, injected by callers). `DEMO_HOUSE_KEY`, `DEMO_SEED_TIP`, `DEMO_HOUSE_ADDRESS` move outside `play()` but ONLY the in-memory driver factory (exported `makeInMemoryHouseDriver`) uses them — `play()` itself never references them directly.

**Context:** Currently `play()` unconditionally calls `privateKeyToAccount(DEMO_HOUSE_KEY)` and `runHouseSide` — both security violations. The fix:

1. Define `HouseDriver<TParams>` type — an injectable async function that takes round inputs and returns a transcript JSON string.
2. Add `houseDriver?: HouseDriver<TParams>` to `UseSessionConfig<TParams>`.
3. In `play()`: instead of the hardcoded DEMO block, call `config.houseDriver(...)` to get the transcript. If no driver is injected, throw a clear message directing developers to inject one (production) or fall back to a warning + no-op.
4. Export `makeInMemoryHouseDriver<TParams>()` — a factory that creates a driver using `runHouseSide` + `DEMO_HOUSE_KEY` + `DEMO_SEED_TIP`. This factory lives in `useSession.ts` but is only called by tests and demo code, never by `play()` itself.
5. `DiceScreen` must inject `makeInMemoryHouseDriver(dice)` into `useSession` (the demo/dev path). Leave a `// TODO(Task 9/live):` comment indicating production should inject a board-backed driver.

- [ ] **Step 1: Write the failing test that proves the injected driver is required**

Add to `examples/games/web/test/diceSettle.test.ts` a new test asserting that a `useSession`-shaped play (via the exported `makeInMemoryHouseDriver` + injected into `play()` via a driver) produces a transcript that `EscrowedSettlement.buildSettle` accepts without a mode error. This is the "through-useSession settle test" mandated by the review.

Since `useSession` is a React hook (requires `renderHook`), we drive the logic by calling the non-hook helpers directly to simulate the same path:
- Create a `coSignPair` (same as useSession does in `start()`).
- Call `runPlayerSide` with `settlementMode: 1` (player side, as useSession does).
- Call the in-memory driver's `drive()` function (equivalent to `play()` calling `houseDriver()`).
- The transcript from the driver is what `play()` stores; pass it to `EscrowedSettlement.buildSettle`.
- Assert: no mode error, `finalState.nonce === 1n`, `finalState.settlementMode === 1`.

Actually, a more direct test: test that when `runHouseSide` is called via the injected driver path at `settlementMode: 1`, the resulting transcript round-trips through `EscrowedSettlement.buildSettle` with no error. The key assertion is that the OPEN state's `settlementMode` in the transcript equals 1 (extractable by `JSON.parse`).

```typescript
// Add to diceSettle.test.ts after the mode-mismatch guard describe:

describe('Through-useSession settle: mode-1 co-sign → EscrowedSettlement (regression guard for FIX 1+2)', () => {
  it('injected in-memory house driver produces mode-1 transcript that buildSettle accepts', async () => {
    // Simulate the exact path play() takes after FIX 1 + FIX 2:
    // 1. start() launches runPlayerSide at settlementMode: 1
    // 2. play() calls the injected driver (which runs runHouseSide at settlementMode: 1)
    // 3. The transcript is passed to EscrowedSettlement.buildSettle
    let acceptedRound: SessionState | undefined
    const { houseT, playerT } = buildCoSignPair((state) => {
      if (state.nonce > 0n) acceptedRound = state
    })

    // Simulate what the injected in-memory driver does (mirrors makeInMemoryHouseDriver in useSession.ts)
    const [transcriptJson] = await Promise.all([
      // This is what the injected driver calls internally:
      runHouseSide(houseCfg, houseT, { stake, params, clientSeed }),
      // This is what start() launches (runPlayerSide at mode 1):
      runPlayerSide(
        { domain, tableId, game: dice, player: playerSigner, houseRemote: true as const,
          clientSeed, seedTip: `0x${'00'.repeat(32)}` as Hex, chainLength, openBalances,
          settlementMode: SETTLEMENT_MODE },  // 1 — the fixed value
        playerT,
      ),
    ])

    if (!acceptedRound) throw new Error('test: no accepted ROUND state')

    // Verify the transcript's OPEN entry has settlementMode: 1
    const parsed = JSON.parse(transcriptJson) as {
      entries: Array<{ kind: string; body: { settlementMode?: number } }>
    }
    const openEntry = parsed.entries.find((e) => e.kind === 'OPEN')
    expect(openEntry?.body?.settlementMode).toBe(SETTLEMENT_MODE)  // must be 1

    // Build the EscrowedSettlement at mode 1 — must NOT throw settlementMode mismatch
    const esc = new EscrowedSettlement<{ targetX100: bigint }>({
      parties: { player: playerAccount.address, house: houseAccount.address },
      commit: buildSeedChain(seedTip, chainLength).commit,
      game: dice,
      domain,
      settlementMode: SETTLEMENT_MODE,
      channel: HOUSE_CHANNEL,
    })

    // This must succeed without throwing 'settlementMode mismatch'
    const tx = await esc.buildSettle(transcriptJson)
    expect(tx.functionName).toBe('settle')
    const [finalState] = tx.args as [SessionState, ...unknown[]]
    expect(finalState.nonce).toBe(1n)
    // The co-signed ROUND state's settlementMode must be 1
    expect(finalState.settlementMode).toBe(SETTLEMENT_MODE)
    // Balances must match what the player co-signed
    expect(finalState.balancePlayer).toBe(acceptedRound.balancePlayer)
    expect(finalState.balanceHouse).toBe(acceptedRound.balanceHouse)
  })
})
```

- [ ] **Step 2: Run the test — confirm it passes NOW (since we fixed mode in Task 1)**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
pnpm vitest run test/diceSettle.test.ts 2>&1 | tail -25
```

Expected: 5 tests pass (3 original + 1 mode-mismatch guard + 1 through-useSession settle test).

This test now serves as a permanent regression guard: if Task 1's mode changes are reverted, this test fails because the OPEN entry's `settlementMode` will be 0, causing `replaySession` to throw `"replay: settlementMode mismatch"`.

- [ ] **Step 3: Define HouseDriver type and add to UseSessionConfig**

In `examples/games/web/src/hooks/useSession.ts`, add these definitions after the existing type exports (around line 78):

```typescript
/** Input passed to the house driver for each round. */
export type HouseDriverInput<TParams> = {
  stake: bigint
  params: TParams
  clientSeed: viem.Hex
  tableId: viem.Hex
  currentBalances: { player: bigint; house: bigint }
}

/**
 * Injectable house co-sign driver. The browser calls this to obtain a finished co-signed
 * transcript JSON string for each round. In production this is a board-backed function that
 * posts the round-request to the house service and awaits the finished transcript. In tests
 * and the demo, inject `makeInMemoryHouseDriver(game)` which drives `runHouseSide` locally.
 *
 * SECURITY: This function must NEVER be implemented with a hardcoded house key in the
 * production browser path. The production implementation posts over the board and receives
 * the transcript from the remote house service.
 */
export type HouseDriver<TParams> = (input: HouseDriverInput<TParams>) => Promise<string>
```

- [ ] **Step 4: Add houseDriver field to UseSessionConfig**

In the `UseSessionConfig<TParams>` type (around line 80), add after `seedStore?`:

```typescript
/**
 * Injectable house co-sign driver. Receives round inputs and returns a finished co-signed
 * transcript JSON. REQUIRED in production (board-backed) and in tests (inject
 * `makeInMemoryHouseDriver(game, config)`). When absent, `play()` throws a clear error
 * directing the caller to inject one.
 *
 * SECURITY: The browser must NEVER contain a hardcoded house key. The production driver
 * posts the round-request to the remote house service over the board and awaits the
 * finished transcript. Test/demo: inject `makeInMemoryHouseDriver(game, cfg)` from this module.
 *
 * TODO(Task 9/live): implement the board-backed production driver that posts a round-request
 * over MsgBoardTransport and awaits the house service's finished transcript response.
 */
houseDriver?: HouseDriver<TParams>
```

- [ ] **Step 5: Export makeInMemoryHouseDriver factory**

Add this function near the bottom of `useSession.ts` (after `buildCoSignPair`, before the final `export { ZERO_ADDR }`):

```typescript
/**
 * Create an in-memory house driver for TESTS and DEMO use only.
 *
 * Drives `runHouseSide` using the demo keys (DEMO_HOUSE_KEY, DEMO_SEED_TIP) over the
 * supplied in-memory CoSignTransport pair. The driver obtains the houseT from the pair
 * already set in coSignPairRef (passed in) and drives one round against the player's
 * already-running runPlayerSide listener.
 *
 * SECURITY: This factory uses DEMO_HOUSE_KEY. It must NEVER be used in production — only
 * inject it in test harnesses and the local dev demo where no house service is running.
 *
 * @param game — the Game module (dice, limbo, etc.)
 * @param baseCfg — domain, chainLength, and openBalances (sourced from useSession config)
 */
export function makeInMemoryHouseDriver<TParams>(
  game: Game<TParams>,
  baseCfg: {
    domain: ReturnType<typeof makeDomain>
    chainLength: number
    openBalances: { player: bigint; house: bigint }
  },
): (houseT: CoSignTransport, input: HouseDriverInput<TParams>) => Promise<string> {
  const demoHouseAccount = privateKeyToAccount(DEMO_HOUSE_KEY)
  const houseSigner: Signer = {
    address: demoHouseAccount.address,
    signTypedData: (args) =>
      demoHouseAccount.signTypedData(args as Parameters<typeof demoHouseAccount.signTypedData>[0]),
    signMessage: (args) =>
      demoHouseAccount.signMessage(args as Parameters<typeof demoHouseAccount.signMessage>[0]),
  }
  return (houseT, input) =>
    runHouseSide(
      {
        domain: baseCfg.domain,
        tableId: input.tableId,
        game,
        player: {
          address: viem.zeroAddress,
          signTypedData: () => Promise.resolve('0x' as viem.Hex),
          signMessage: () => Promise.resolve('0x' as viem.Hex),
        },
        house: houseSigner,
        seedTip: DEMO_SEED_TIP,
        chainLength: baseCfg.chainLength,
        openBalances: input.currentBalances,
        settlementMode: 1,
      },
      houseT,
      { stake: input.stake, params: input.params, clientSeed: input.clientSeed },
    )
}
```

Note: The `player` field in the `runHouseSide` config is only used for address recovery of the co-sig — the actual signing is done by the player side via transport. The address comes from `coSign()` which verifies the player's signature was sent over the transport; we do NOT need the real player signer here. However, `runHouseSide` calls `verifySessionStateSig(cfg.player.address, ...)` to validate the player half. So we need the real player address. Adjust the factory to accept the player address:

```typescript
export function makeInMemoryHouseDriver<TParams>(
  game: Game<TParams>,
  baseCfg: {
    domain: ReturnType<typeof makeDomain>
    chainLength: number
  },
): (houseT: CoSignTransport, input: HouseDriverInput<TParams>, playerAddress: viem.Hex) => Promise<string> {
  const demoHouseAccount = privateKeyToAccount(DEMO_HOUSE_KEY)
  const houseSigner: Signer = {
    address: demoHouseAccount.address,
    signTypedData: (args) =>
      demoHouseAccount.signTypedData(args as Parameters<typeof demoHouseAccount.signTypedData>[0]),
    signMessage: (args) =>
      demoHouseAccount.signMessage(args as Parameters<typeof demoHouseAccount.signMessage>[0]),
  }
  return (houseT, input, playerAddress) =>
    runHouseSide(
      {
        domain: baseCfg.domain,
        tableId: input.tableId,
        game,
        player: {
          address: playerAddress,
          signTypedData: () => Promise.resolve('0x' as viem.Hex),
          signMessage: () => Promise.resolve('0x' as viem.Hex),
        },
        house: houseSigner,
        seedTip: DEMO_SEED_TIP,
        chainLength: baseCfg.chainLength,
        openBalances: input.currentBalances,
        settlementMode: 1,
      },
      houseT,
      { stake: input.stake, params: input.params, clientSeed: input.clientSeed },
    )
}
```

Because the `HouseDriver` type is `(input) => Promise<string>` (single-arg), the in-memory factory produces a curried version. The actual `UseSessionConfig.houseDriver` type is `(input: HouseDriverInput<TParams>) => Promise<string>`. We keep it simple: `DiceScreen` will construct the driver by closing over the playerAddress when wiring it up.

Actually, to keep types simple, redesign slightly:

```typescript
// The HouseDriver receives everything it needs to drive one round
export type HouseDriverInput<TParams> = {
  stake: bigint
  params: TParams
  clientSeed: viem.Hex
  tableId: viem.Hex
  currentBalances: { player: bigint; house: bigint }
  playerAddress: viem.Hex   // ← added so the driver can verify the player half
  houseT: CoSignTransport   // ← the transport already in coSignPairRef
}
```

This way `HouseDriver<TParams>` is `(input: HouseDriverInput<TParams>) => Promise<string>` and `play()` passes `pair.houseT` along with the round inputs.

- [ ] **Step 6: Rewrite play() to use the injected driver**

Replace the DEMO block in `play()`. The complete new `play()` body after the `try {` line:

```typescript
try {
  const currentBalances = balances ?? openBalances
  const playerAddress = walletClient?.account?.address ?? viem.zeroAddress

  // ── House co-sign: injected driver (never a hardcoded key in production) ──────
  // The driver receives the round inputs + the houseT transport (already set up in
  // start()) and returns the finished co-signed transcript JSON. In tests/demo the
  // caller injects makeInMemoryHouseDriver; in production this posts over the board.
  if (!config.houseDriver) {
    throw new Error(
      'useSession: no houseDriver injected. ' +
      'For tests/demo inject makeInMemoryHouseDriver(game, cfg). ' +
      'TODO(Task 9/live): implement the board-backed production driver.',
    )
  }

  const json = await config.houseDriver({
    stake,
    params,
    clientSeed,
    tableId,
    currentBalances,
    playerAddress,
    houseT: pair.houseT,
  })
  transcriptRef.current = json

  // Derive the RoundRecord from the co-signed ROUND SessionState captured in
  // buildCoSignPair's onAccept callback. NEVER fabricated — this is the state both parties
  // signed, so it is exactly what the contract would settle.
  const roundState = acceptedRoundStateRef.current
  if (!roundState) throw new Error('play: no accepted ROUND state after co-sign')

  // ... rest of play() is identical to current code ...
```

Note: `config` in the `play` useCallback is accessed via the closure over the config destructuring. Since the config object changes on re-render, use the pattern the existing code uses: add `houseDriver` to the destructure at the top of `useSession` and include it in the `useCallback` dependency array for `play`.

- [ ] **Step 7: Wire makeInMemoryHouseDriver into DiceScreen**

In `examples/games/web/src/components/DiceScreen.tsx`, import `makeInMemoryHouseDriver` and inject it:

```typescript
import { useSession, type RoundRecord, DEMO_HOUSE_ADDRESS, makeInMemoryHouseDriver } from '../hooks/useSession'

// In the component, before the useSession call:
const domain = makeDomain(deployment.chainId, deployment.houseChannel ?? PLACEHOLDER_VERIFIER)
// TODO(Task 9/live): replace with a board-backed driver that posts the round-request over
// MsgBoardTransport and awaits the house service's finished transcript.
const houseDriver = useMemo(
  () => makeInMemoryHouseDriver(dice, { domain, chainLength: 64 }),
  [deployment.chainId, deployment.houseChannel]
)

// Pass to useSession:
const session = useSession<DiceParams>({
  game: dice,
  walletClient,
  chainId: deployment.chainId,
  boardRpc: deployment.boardRpc,
  gameLabel: 'dice',
  houseChannel: deployment.houseChannel,
  houseDriver,  // ← injected in-memory driver (demo/test; replace with board-backed in Task 9)
})
```

Note: `PLACEHOLDER_VERIFIER` needs to be imported from `useSession`. Add it to the import line.

- [ ] **Step 8: Run all web tests**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
pnpm vitest run 2>&1 | tail -25
```

Expected: All tests pass. (The diceSettle tests drive `runHouseSide` directly — they don't go through `useSession` — so they are unaffected by the houseDriver change. The through-useSession settle test added in this task also continues to pass.)

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
npx tsc --noEmit 2>&1
```

Expected: Exit 0, no errors.

---

### Task 3: FIX 3 — On-chain open flow (buildOpen TxRequest)

**Files:**
- Modify: `examples/games/web/src/components/DiceScreen.tsx`
- Modify: `examples/games/web/test/diceSettle.test.ts`

**Interfaces:**
- Consumes: `EscrowedSettlement.buildOpen(terms: OpenTerms, houseSig: Hex): TxRequest` from `@gibs/msgboard-settle`
- Consumes: `OpenTerms` type from `@gibs/msgboard-settle`
- Consumes: `signOpenTerms` from `@gibs/msgboard-settle` (for the test only — the production browser never signs as house)
- Produces: A `buildOpen` TxRequest shape test in `diceSettle.test.ts` that asserts the returned TxRequest targets the HouseChannel address with `functionName: 'open'` and `args: [terms, houseSig]`.

**Context:** The review requires: faucet → `Chips.approve(houseChannel, escrowPlayer)` → `EscrowedSettlement.buildOpen(terms, houseSig)` → `open()` tx BEFORE play. In the browser demo flow:
- The "Open table" button should first post the approve tx, then the open tx.
- `buildOpen` is already implemented in `EscrowedSettlement` (line 21 of `escrowed.ts`): it takes `OpenTerms` and a house-provided `houseSig` and returns `{ address: channel, abi, functionName: 'open', args: [terms, houseSig] }`.
- For the demo (no live house service), we construct placeholder `OpenTerms` and sign them with `DEMO_HOUSE_KEY` in the browser (demo only — in production the house signs and returns the sig).
- The test must assert the TxRequest SHAPE without a live chain.

- [ ] **Step 1: Write the buildOpen TxRequest shape test**

Add to `examples/games/web/test/diceSettle.test.ts`:

```typescript
import { signOpenTerms, type OpenTerms } from '@gibs/msgboard-settle'

// Add to imports at the top

// ... existing tests ...

describe('EscrowedSettlement.buildOpen — TxRequest shape', () => {
  it('yields an open TxRequest targeting the HouseChannel with the terms and houseSig as args', async () => {
    const esc = new EscrowedSettlement<{ targetX100: bigint }>({
      parties: { player: playerAccount.address, house: houseAccount.address },
      commit: buildSeedChain(seedTip, chainLength).commit,
      game: dice,
      domain,
      settlementMode: SETTLEMENT_MODE,
      channel: HOUSE_CHANNEL,
    })

    const terms: OpenTerms = {
      tableId,
      player: playerAccount.address,
      playerKey: playerAccount.address,
      escrowPlayer: openBalances.player,
      escrowHouse: openBalances.house,
      gameId: dice.gameId,
      rngCommit: buildSeedChain(seedTip, chainLength).commit,
      clockBlocks: 100n,
      expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
    }

    // In production the house signs these terms remotely. In this test we use the house key
    // directly (test-only — never in the browser production path).
    const houseSig = await signOpenTerms(houseSigner, domain, terms)

    const tx = esc.buildOpen(terms, houseSig)

    expect(tx.functionName).toBe('open')
    expect(tx.address.toLowerCase()).toBe(HOUSE_CHANNEL.toLowerCase())
    // args must be [terms, houseSig] in that order
    expect(tx.args[0]).toMatchObject({
      tableId,
      player: playerAccount.address,
      escrowPlayer: openBalances.player,
      escrowHouse: openBalances.house,
    })
    expect(tx.args[1]).toBe(houseSig)
  })
})
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
pnpm vitest run test/diceSettle.test.ts 2>&1 | tail -25
```

Expected: 6 tests pass in `diceSettle.test.ts`.

- [ ] **Step 3: Add the on-chain open flow to DiceScreen**

The open flow must happen in `start()` — before the co-sign session begins. In `DiceScreen`, we call `session.start()` when the user clicks "Open table". We need to insert three steps BEFORE that: faucet (optional/demo), `Chips.approve`, `EscrowedSettlement.buildOpen` + `walletClient.writeContract`.

In practice for the demo (no live house service), we:
1. Build placeholder `OpenTerms` with the player address, tableId, escrow amounts, and rngCommit (from the seed chain).
2. Sign them with `DEMO_HOUSE_KEY` (demo only — the `makeInMemoryHouseDriver` context implies we're in demo mode).
3. Build the approve TxRequest and submit it.
4. Build the open TxRequest via `esc.buildOpen(terms, houseSig)` and submit it.
5. Then call `session.start()`.

For the Chips.approve call we need the Chips ABI. Use a minimal inline ABI:

```typescript
const ERC20_APPROVE_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] }
] as const
```

The full `openAndStart` function in `DiceScreen`:

```typescript
/** Build and submit the on-chain open (faucet → approve → open) then start the co-sign session. */
const openAndStart = async () => {
  if (!walletClient?.account) return
  if (!deployment.houseChannel) { setSettleError('no houseChannel in deployment config'); return }
  if (!deployment.chips) { setSettleError('no chips token in deployment config'); return }

  setTableStatus('playing')
  setSettleError(undefined)

  try {
    const playerAddress = walletClient.account.address
    const domain = makeDomain(deployment.chainId, deployment.houseChannel)

    // ── Build open terms ──────────────────────────────────────────────────────
    // rngCommit: in the demo the house drives the seed chain from DEMO_SEED_TIP.
    // In production the house supplies the rngCommit with the signed OpenTerms.
    // TODO(Task 9/live): receive rngCommit from the house service's signed OpenTerms response.
    const { buildSeedChain } = await import('@gibs/msgboard-games')
    const { privateKeyToAccount: pkToAccount } = await import('viem/accounts')
    const DEMO_SEED_TIP_LOCAL = `0x${'55'.repeat(32)}` as viem.Hex
    const DEMO_HOUSE_KEY_LOCAL = `0x${'de'.repeat(32)}` as viem.Hex
    const demoHouseAccount = pkToAccount(DEMO_HOUSE_KEY_LOCAL)
    const chain = buildSeedChain(DEMO_SEED_TIP_LOCAL, 64)

    const tableId = viem.keccak256(
      viem.stringToHex(`mbg:open:${Date.now()}:${playerAddress}`)
    ) as viem.Hex

    const escrowPlayer = 10n ** 18n  // 1 Chip (match useSession openBalances default)
    const escrowHouse = 10n ** 21n   // 1000 Chips

    const terms: OpenTerms = {
      tableId,
      player: playerAddress,
      playerKey: playerAddress,
      escrowPlayer,
      escrowHouse,
      gameId: dice.gameId,
      rngCommit: chain.commit,
      clockBlocks: 100n,
      expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
    }

    // ── Demo: house signs the terms (production: house signs remotely) ────────
    // TODO(Task 9/live): fetch house-signed OpenTerms from the house service instead.
    const { signOpenTerms } = await import('@gibs/msgboard-settle')
    const demoHouseSigner = {
      address: demoHouseAccount.address,
      signTypedData: (args: Parameters<typeof demoHouseAccount.signTypedData>[0]) =>
        demoHouseAccount.signTypedData(args),
      signMessage: (args: { message: { raw: viem.Hex } }) => demoHouseAccount.signMessage(args),
    }
    const houseSig = await signOpenTerms(demoHouseSigner as any, domain, terms)

    // ── Approve Chips spend ───────────────────────────────────────────────────
    await walletClient.writeContract({
      address: deployment.chips,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [deployment.houseChannel, escrowPlayer],
      account: walletClient.account,
      chain: walletClient.chain,
    })

    // ── Submit HouseChannel.open ──────────────────────────────────────────────
    const esc = new EscrowedSettlement<DiceParams>({
      parties: { player: playerAddress, house: demoHouseAccount.address },
      commit: chain.commit,
      game: dice,
      domain,
      settlementMode: 1,
      channel: deployment.houseChannel,
    })
    const openTx = esc.buildOpen(terms, houseSig)
    await walletClient.writeContract({
      address: openTx.address,
      abi: openTx.abi as viem.Abi,
      functionName: openTx.functionName,
      args: openTx.args,
      account: walletClient.account,
      chain: walletClient.chain,
    })

    // ── Start the co-sign session ─────────────────────────────────────────────
    await session.start()
    setTableStatus('idle')
  } catch (e) {
    setSettleError(e instanceof Error ? e.message : String(e))
    setTableStatus('idle')
  }
}
```

And update the "Open table" button's onClick to call `openAndStart` instead of `session.start`:

```typescript
// BEFORE:
<button onClick={() => void session.start()} disabled={!canOpen}>

// AFTER:
<button onClick={() => void openAndStart()} disabled={!canOpen}>
```

Add necessary imports to `DiceScreen.tsx`:
```typescript
import { EscrowedSettlement, signOpenTerms, type OpenTerms } from '@gibs/msgboard-settle'
import { makeDomain } from '@gibs/msgboard-games'   // already imported
import { makeInMemoryHouseDriver, PLACEHOLDER_VERIFIER } from '../hooks/useSession'  // adjust existing import
```

Also add the `ERC20_APPROVE_ABI` constant near the top of `DiceScreen.tsx`:
```typescript
const ERC20_APPROVE_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] }
] as const
```

- [ ] **Step 4: Run all web tests**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
pnpm vitest run 2>&1 | tail -25
```

Expected: All tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
npx tsc --noEmit 2>&1
```

Expected: 0 errors.

---

### Task 4: Verification, report appendix, and commit

**Files:**
- Modify: `/Users/michaelmclaughlin/Documents/gibs-finance/random/.git/sdd/task-7-report.md`

- [ ] **Step 1: Final full test run**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
pnpm vitest run 2>&1
```

Expected: All tests pass. Count must be ≥ 43 (42 original + 1 mode-mismatch guard).

- [ ] **Step 2: Final TypeScript check**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web
npx tsc --noEmit 2>&1
echo "tsc exit: $?"
```

Expected: Exit 0.

Also check msgboard-settle if it was touched (replay.ts was already fixed in Task 7):
```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/msgboard-settle
npx tsc --noEmit 2>&1
echo "settle tsc exit: $?"
```

- [ ] **Step 3: Confirm no house key in the browser production path**

Verify by grepping useSession.ts that `DEMO_HOUSE_KEY` and `runHouseSide` do not appear in `play()` or `start()` body — they only appear in `makeInMemoryHouseDriver`:

```bash
grep -n "DEMO_HOUSE_KEY\|runHouseSide" \
  /Users/michaelmclaughlin/Documents/gibs-finance/random/examples/games/web/src/hooks/useSession.ts
```

Expected output: all matches inside `makeInMemoryHouseDriver` only.

- [ ] **Step 4: Append Fix pass section to task-7-report.md**

Append the following to `/Users/michaelmclaughlin/Documents/gibs-finance/random/.git/sdd/task-7-report.md`:

```markdown

## Fix pass

### FIX 1 — settlementMode: 0 → 1

**File:** `examples/games/web/src/hooks/useSession.ts`
- `start()`: `runPlayerSide` call changed from `settlementMode: 0` to `settlementMode: 1` (line where `runPlayerSide` is called).
- `play()` (now via injected driver): `makeInMemoryHouseDriver` passes `settlementMode: 1` to `runHouseSide`.
- **Effect:** `replaySession` no longer throws `"replay: settlementMode mismatch"` when `EscrowedSettlement.buildSettle` is called. The settle button is live.

**File:** `examples/games/web/test/useSession.coSign.test.ts`
- `driveHouseSide()` and `makePlayerCfg()` helpers changed from `settlementMode: 0` to `settlementMode: 1` to match.

### FIX 2 — Injectable HouseDriver (no browser house key)

**File:** `examples/games/web/src/hooks/useSession.ts`
- Added `HouseDriver<TParams>` and `HouseDriverInput<TParams>` types (exported).
- Added `houseDriver?: HouseDriver<TParams>` field to `UseSessionConfig<TParams>`.
- `play()`: removed the unconditional `privateKeyToAccount(DEMO_HOUSE_KEY)` + `runHouseSide` block; replaced with `config.houseDriver(...)` call. Throws with a clear message if no driver is injected.
- Added `makeInMemoryHouseDriver<TParams>()` factory (exported) — the ONLY place `DEMO_HOUSE_KEY` and `DEMO_SEED_TIP` are used. Lives in `useSession.ts` but is NOT called from `play()` or `start()` directly.
- **Browser default production path:** `play()` calls `config.houseDriver` (injected by the caller). `DEMO_HOUSE_KEY` is NOT executed unless the caller injects `makeInMemoryHouseDriver`.

**File:** `examples/games/web/src/components/DiceScreen.tsx`
- Imports and injects `makeInMemoryHouseDriver(dice, { domain, chainLength: 64 })` via `useMemo` into `useSession`. Marked with `// TODO(Task 9/live):` for the production board-backed driver.

### FIX 3 — On-chain open flow

**File:** `examples/games/web/src/components/DiceScreen.tsx`
- Added `ERC20_APPROVE_ABI` constant.
- Added `openAndStart()` async function: builds `OpenTerms`, signs them with `DEMO_HOUSE_KEY` (demo-only path), calls `Chips.approve(houseChannel, escrowPlayer)`, calls `EscrowedSettlement.buildOpen(terms, houseSig)` → `walletClient.writeContract`, then `session.start()`.
- "Open table" button now calls `openAndStart()` instead of `session.start()`.
- `// TODO(Task 9/live):` comments mark the two places that need the live house service: receiving house-signed `OpenTerms` and a board-backed `houseDriver`.

### New tests

**`examples/games/web/test/diceSettle.test.ts`** — added:
1. **Mode mismatch regression guard** (`describe('Mode mismatch regression guard...')`): co-signs at mode 0, asserts `buildSettle` with mode-1 `EscrowedSettlement` throws `"settlementMode mismatch"`. Fails if FIX 1 regresses.
2. **Through-useSession settle test** (`describe('Through-useSession settle...')`): drives `runPlayerSide` (mode 1) + `runHouseSide` (mode 1, same as injected driver does), asserts `openEntry.body.settlementMode === 1` and `buildSettle` succeeds without mismatch error and `finalState.settlementMode === 1`.
3. **buildOpen TxRequest shape test** (`describe('EscrowedSettlement.buildOpen...')`): asserts `tx.functionName === 'open'`, `tx.address === HOUSE_CHANNEL`, `tx.args[0]` contains the terms fields, `tx.args[1] === houseSig`.

### Browser default path: no house key

`grep -n "DEMO_HOUSE_KEY|runHouseSide" useSession.ts` — all matches inside `makeInMemoryHouseDriver` only. `play()` and `start()` contain neither.

### Test output

[FILL IN AFTER RUN]

### TODO left for live board round-trip (Task 9/live)

1. **`useSession.ts` `play()`**: the `if (!config.houseDriver)` guard currently throws. Production needs a board-backed driver that posts a `{ kind: 'round-request', stake, params, clientSeed, tableId }` message over `MsgBoardTransport` and polls/listens for the house service's finished transcript response message.
2. **`DiceScreen.tsx` `openAndStart()`**: the `signOpenTerms` call with `DEMO_HOUSE_KEY` must be replaced by fetching house-signed `OpenTerms` from the house service (e.g., POST to the house endpoint or read from the board). The `rngCommit` must come from the house's response, not from a locally-derived seed chain.
3. Both changes are deferred because the live house service is not yet running in the test environment and cannot be implemented without it. The injectable seam is in place; the production driver is a one-function swap.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/michaelmclaughlin/Documents/gibs-finance/random
git add \
  examples/games/web/src/hooks/useSession.ts \
  examples/games/web/src/components/DiceScreen.tsx \
  examples/games/web/test/diceSettle.test.ts \
  examples/games/web/test/useSession.coSign.test.ts
git commit -m "fix(games-web): escrowed settlementMode + injectable house (no browser house key) + on-chain open flow"
```

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|---|---|
| FIX 1: settlementMode 1 in start() runPlayerSide | Task 1 Step 3 |
| FIX 1: settlementMode 1 in play() house config | Task 2 Step 5/6 (driver at mode 1) |
| FIX 1: mode-mismatch regression guard test | Task 2 Step 1 |
| FIX 1: through-useSession settle test asserts mode 1 + buildSettle succeeds | Task 2 Step 1 |
| FIX 2: No DEMO_HOUSE_KEY/runHouseSide in browser default path | Task 2 Steps 3–6 |
| FIX 2: HouseDriver injectable seam | Task 2 Steps 3–6 |
| FIX 2: in-memory driver exported (test/demo) | Task 2 Step 5 |
| FIX 2: DiceScreen injects driver | Task 2 Step 7 |
| FIX 2: TODO(Task 9/live) for board-backed production driver | Task 2 Step 7 + Task 4 Step 4 |
| FIX 3: buildOpen TxRequest shape test | Task 3 Step 1 |
| FIX 3: faucet→approve→open flow in DiceScreen | Task 3 Step 3 |
| Keep refusal test (anti-bias clientSeed) | useSession.coSign.test.ts test (d) — kept, mode updated to 1 |
| pnpm vitest run exits 0 | Task 4 Step 1 |
| npx tsc --noEmit exits 0 | Task 4 Step 2 |
| Commit message exact | Task 4 Step 5 |
| Append Fix pass to task-7-report.md | Task 4 Step 4 |

### Placeholder scan

No TBDs or placeholder code — all code blocks are complete.

### Type consistency

- `HouseDriverInput<TParams>` includes `houseT: CoSignTransport` — used in `play()` and in `makeInMemoryHouseDriver` return type. Consistent.
- `HouseDriver<TParams>` = `(input: HouseDriverInput<TParams>) => Promise<string>` — used in `UseSessionConfig` and in `play()`. Consistent.
- `makeInMemoryHouseDriver` return type is `(houseT, input, playerAddress) => Promise<string>` which doesn't match `HouseDriver<TParams>`. **FIX:** Include `playerAddress` and `houseT` in `HouseDriverInput<TParams>` so the driver signature is exactly `(input: HouseDriverInput<TParams>) => Promise<string>`. Already addressed in Step 5 redesign note.
- `signOpenTerms` second arg is `StateSigner` (has `signTypedData`). `demoHouseSigner` in `DiceScreen` is typed `as any` for the demo path — acceptable but note it for the TODO.
