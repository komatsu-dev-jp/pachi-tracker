---
name: audit-pachinko-machine-specs
description: Research, audit, and safely update pachinko machine master data in this pachi-tracker repository. Use when adding machines, correcting jackpot allocation summaries, verifying exact model codes, borders, payouts, RUSH transitions, multi-award or loop behavior, P-EVIDENCE standard-deviation estimates, source URLs, search registration, or live-record round options in src/machineDB.js and related tests.
---

# Audit Pachinko Machine Specs

Maintain machine data without mixing similar models or flattening state-dependent allocations.

## Start safely

1. Read `AGENTS.md`, inspect `git status --short`, and preserve unrelated changes.
2. Read [references/machine-schema.md](references/machine-schema.md) and [references/research-policy.md](references/research-policy.md).
3. Run `node .agents/skills/audit-pachinko-machine-specs/scripts/audit-machine-db.mjs` before editing.
4. State the scope: named machines, missing allocations, an introduction month, all master records, or only exact-model registry entries. These are different sets.
5. Treat exit code 0 as "no structural errors," not "no warnings." Classify every warning as fixed, accepted legacy data, or unresolved in the report. Use `--strict` when a warning-clean run is required.

## Research the exact model

1. Browse current sources; do not rely on remembered specs.
2. Confirm the official model code before accepting allocation data. Cross-check probability, maker, introduction period, and suffix.
3. Prefer maker pages and prefectural inspection notices for identity. Use established analysis sites for detailed tables when official pages omit them.
4. Seek two independent sources for disputed or complex allocations and store supporting pages in `sourceUrls`.
5. If sources disagree, do not average or silently choose. Report the conflict and leave the field unverified.

## Model gameplay states

1. Keep normal-start, RUSH, upper-RUSH, chance-time, and special-judgment tables in separate `hesoModes` or `rushModes` entries.
2. Store 3000 balls made from two 10R awards as `roundsLabel: "10R×2"`, not a single 20R award unless the product defines it that way.
3. Add `roundLoops` when award sets can repeat. Preserve base multipliers and increments so live records store actual total rounds.
4. Keep conditional percentages in their published state. Do not combine a conditional loop rate with the top-level RUSH allocation.
5. Set `allocationVerified: true` only after complete displayed tables are sourced and each state totals 100% within rounding tolerance.

## Estimate P-EVIDENCE values

1. Calculate direct allocation averages from published payouts and rates.
2. Model continuation, transitions, guaranteed sets, and repeat loops as separate branches.
3. Calibrate against records with the same probability band and flow structure.
4. Label derived values with `stdDevMethod: "p-evidence-branching-v2"` and a specific `stdDevLabel`; never describe them as published values.
5. Document an assumption for unpublished inner splits or leave the value unverified. Never invent a precise split.

## Implement and validate

1. Update `src/machineDB.js` and `machineModelRegistry` for every newly supported exact model.
2. Update `dataUpdatedAt` so older saved overrides do not hide the fix.
3. Add live-record regression coverage for every composite or looping award.
4. Add model, normalization, or persistence tests when their behavior changes.
5. Use `apply_patch`; do not overwrite unrelated work or use destructive Git operations.
6. Run:

```text
node .agents/skills/audit-pachinko-machine-specs/scripts/audit-machine-db.mjs
node src/components/machines/__tests__/machineModels.test.mjs
node src/components/record/__tests__/machineRoundOptions.test.mjs
npm.cmd run lint
npm.cmd run build
```

Report changed machines and model codes, sources and conflicts, live-record loop behavior, estimated P-EVIDENCE values, validation results, and possible saved-data overrides.

For scheduled runs, use an isolated worktree, prepare a reviewable change and report, and never merge automatically unless the user explicitly requests it after reviewing that run.
