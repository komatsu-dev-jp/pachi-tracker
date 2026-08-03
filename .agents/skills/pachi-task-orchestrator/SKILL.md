---
name: pachi-task-orchestrator
description: Orchestrate complex, ambiguous, multi-step, cross-area, or high-risk PachiTracker implementation from evidence gathering through Sol planning, bounded implementation, independent verification, final review, and memory-candidate assessment. Use when the user invokes $pachi-task-orchestrator or asks to implement, fix, or change behavior spanning multiple files, React state, persistence, OCR/Delta/PWA/push, protected calculations, money, or data integrity. Do not use for explanations, status checks, documentation-only edits, routine one-file changes, or standalone merge and publishing requests.
---

# PachiTracker Task Orchestrator

Coordinate one PachiTracker task from requirements through verified implementation. Keep the parent agent as the decision-making coordinator and exactly one agent as the writer for overlapping code paths.

## Start safely

1. Read the applicable `AGENTS.md` chain, `../../../memory/INDEX.md`, and `../../../docs/AGENT_ORGANIZATION.md`.
2. Inspect the current branch, `git status --short --branch`, relevant code, tests, package scripts, and existing uncommitted changes.
3. State the objective, acceptance criteria, exclusions, risk level, protected files, editable files, and verification commands.
4. Preserve all unrelated work. Do not stash, reset, overwrite, reformat, commit, push, publish, notify external services, or merge unless the user separately authorizes that action.

## Choose the workflow

Use the parent agent alone for a clear explanation, status check, documentation-only edit, or narrow one-file routine change, even when this skill was explicitly invoked. Explain briefly that specialist delegation adds no value.

Use Plan mode for ambiguous requirements, multiple dependent steps, cross-area changes, or any high-risk scope involving money, calculations, stored data, migration, OCR/Delta automation, PWA, push, authentication, secrets, or broad React state.

When this skill is explicitly invoked, treat the invocation as a request for the staged specialist workflow below. Sequential specialists are allowed even when their work is not parallel, but keep the number of agents proportionate and never use more than one writer on overlapping files.

For implicit invocation, spawn specialists only when their independent contribution has measurable value. Otherwise, follow the same stages in the parent thread without spawning.

## Stage 1: Gather evidence

Use `pachi_explorer` for read-heavy mapping when the execution path, ownership, existing tests, protected behavior, or user changes are not already clear. Keep this role read-only.

Require a short evidence handoff identifying relevant files and symbols, current behavior, tests, protected areas, conflicts, and unresolved questions. Do not accept an implementation proposal as a substitute for evidence.

## Stage 2: Produce the plan with Sol

Use `pachi_architect` for complex, ambiguous, or high-risk work. Its configured model is `gpt-5.6-sol` with high reasoning.

If the custom-agent selector is unavailable, start a read-only agent with `gpt-5.6-sol`, high reasoning, and the instructions from `../../../.codex/agents/pachi_architect.toml`.

Require the plan to specify:

- objective and measurable acceptance criteria;
- exclusions and protected behavior;
- exact files owned by the writer and files that must not change;
- implementation sequence and state or data flow;
- boundaries, failure paths, compatibility, and rollback strategy;
- focused tests, full validation, and any required browser checks;
- assumptions that require user confirmation.

Do not start implementation while a material product decision, data-loss risk, or acceptance criterion remains unresolved. Ask the user only when the missing choice would materially change the result.

## Stage 3: Assign exactly one writer

Choose one implementation role after the plan is accepted:

- Use `pachi_routine_worker` for narrow, mechanical work with fully specified behavior and file ownership.
- Use `pachi_integration_worker` for multiple files, React state, persistence, migrations, OCR/Delta, PWA, push, or component integration.

Pass the complete accepted plan, owned files, forbidden files, protected behavior, existing user changes, acceptance criteria, and verification commands. Instruct the writer not to commit, push, publish, merge, notify Slack, or widen scope.

Stop and return to the planner if implementation discovers a new design decision, data-loss possibility, incompatible saved format, protected-file requirement, or conflict with existing work.

## Stage 4: Freeze and verify

After implementation, freeze the source diff before independent verification. Do not review a moving target.

Use `pachi_verifier` when behavior, executable configuration, data, integration, or multiple files changed. The verifier must not repair failures. Require exact commands, results, failure evidence, and unverified scope.

Run validation in proportion to the change. For application changes, use the repository gates in this order:

```text
npm test
npm run lint
npm run build
git diff --check
```

For documentation or Codex-only configuration, validate links, TOML syntax, unique agent names, required fields, and `git diff --check`; state why application tests were not needed.

## Stage 5: Review material risk

Use `pachi_reviewer` after verification for behavior, data, money, calculation, persistence, security, executable configuration, or multi-area integration changes. Its configured model is `gpt-5.6-sol` with high reasoning.

Require review of the same frozen diff and verification results. Treat unresolved P0 or P1 findings, failed acceptance criteria, or required checks that are not run as `CHANGES_REQUESTED`.

Return findings to the single writer, rerun the required validation from the beginning, and review the new frozen diff. Skip the final reviewer for small documentation-only changes unless a concrete risk justifies it.

## Stage 6: Handle memory and completion

Create a memory candidate only when the task exposed a material, reusable failure pattern. Use `pachi_memory_curator` only after root cause, tested prevention, evidence, non-duplication, and independent verification exist. Never store credentials, personal data, raw logs, or live records.

Use `../../../docs/HANDOFF_TEMPLATE.md` for specialist handoffs. The parent agent must report:

- outcome and changed behavior;
- files changed;
- acceptance-criteria results;
- exact validation results;
- roles and configured models used;
- unresolved risk and unverified scope;
- whether a memory candidate exists;
- whether the task is ready for a separately requested `$merge` workflow.

Do not invoke `$merge` automatically. Use it only when the user explicitly requests merge or publishing.
