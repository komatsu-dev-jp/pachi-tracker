# Research and estimation policy

## Source order

1. Maker specifications, manuals, and official press material.
2. Prefectural inspection/certification documents for model codes.
3. Established databases and analysis sites for allocations and borders.
4. Secondary blogs only as support when stronger sources omit a detail.
5. Reviews only for sentiment, never authoritative specs.

Open the exact page and confirm its machine title. Calendar pages prove listings, not complete allocations. Capture model code, maker, probability, introduction month, every state distribution, payout basis, RUSH definitions, composite/loop rules, and border assumptions. A variant mismatch requires a separate record.

When sources disagree, prefer maker flow and certification identity, preserve conditional wording, do not turn approximate rates into exact splits, and leave unresolved fields unverified.

## P-EVIDENCE branching estimate

Treat flow as a probability tree:

1. Direct mean: `E[X] = Σ(payout × probability)`.
2. Direct branch variance: `Var(X) = Σ(probability × (payout - E[X])²)`.
3. Add transitions and continuations recursively. Treat guaranteed multi-award sets as one payout outcome while preserving actual total rounds in live records.
4. Model repeat additions with the published continuation probability; document any approximation of an unbounded loop.
5. Calibrate volatility against existing records with the same probability band, continuation structure, and maximum/loop payout.

The repository stores a calibrated P-EVIDENCE input, not a complete public simulator. Label estimates, state their structural basis, avoid false precision, and document unpublished assumptions.

Scheduled runs may research, edit an isolated worktree, test, and report. They must not merge, publish, delete data, or overwrite unresolved user work automatically.
