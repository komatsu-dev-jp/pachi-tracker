# Machine master schema

## Files

- `src/machineDB.js`: built-in master and `machineModelRegistry`.
- `src/components/machines/machineSpecModel.js`: normalization, TSV, saved overrides.
- `src/components/record/machineRoundOptions.js`: live-record round options.
- Matching `__tests__` files: regression coverage.

## Identity and sources

`name` is the app name. `modelName` is the exact inspected model code. `modelVerified` requires `modelSourceUrl` and `modelUpdatedAt`. Never copy allocations based only on a similar `name`; also match model code, probability, maker, and introduction timing.

`machineDB` contains every master record, while `machineModelRegistry` is the exact-model registry subset. Their counts do not have to match unless the task explicitly requires every master record to have a confirmed model. The audit reports both counts and `unregisteredRecords` separately.

## Allocations

- `allocationVerified`: whether the UI may use the table.
- `hesoModes` / `rushModes`: state-specific tables containing `name`, optional `note`, and `rows`.
- Rows use `rounds` or `roundsLabel`, `payout`, and `rate`. Use transition `label` when the outcome changes or continues a gameplay state. A terminal or no-RUSH mode may omit it when the mode `name` or `note` explicitly says there is no transition.
- `roundDist` / `rushDist` are summaries; mode tables are authoritative for complex machines.
- `allocationNote` records payout basis, conditional rates, and assumptions.
- `sourceUrls` supports displayed data; `dataUpdatedAt` controls saved-override precedence.

Each complete mode totals 100% within published rounding. RUSH entry rate is not an initial-jackpot distribution.

For guaranteed sets, use `{ roundsLabel: "10R×2", payout: 3000, rate: 50, label: "RUSH継続" }`.

For repeat additions, use the exact `roundLoops` keys consumed by `machineRoundOptions.js`: `phase`, `rounds`, `baseMultipliers`, `loopBaseMult`, `incrementMult`, `incrementPayout`, rate metadata, and `sourceUrl`. Add tests for increasing and decreasing the multiplier.

## P-EVIDENCE and persistence

Keep `avgPayoutPerHit`, `hesoAvgPayout`, `rushAvgPayout`, `stdDev`, `stdDevLabel`, `stdDevMethod`, `rushEntryRate`, and `rushContinueRate` semantically distinct. Mark branch estimates as `p-evidence-branching-v2`.

`getEffectiveMachineList` can retain a saved custom record with the same or newer `dataUpdatedAt`. Update the master date and test effective-list behavior so users receive corrections without reinstalling.
