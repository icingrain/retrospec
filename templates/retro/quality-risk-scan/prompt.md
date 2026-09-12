# quality-risk-scan prompt skeleton

## Inputs

- `project_path`: absolute project root selected by retro.
- `categories`: `complexity` and/or `security`.
- `ready_handoffs`: Curator-confirmed source inventory.
- `enabled_checks`: risk/complexity checks approved for this run.
- `run_id`: daemon job/run identifier.
- `survey`: Surveyor language/path summary used to select check handlers.
- `status_evidence`: `/analysis/status` summary checked before generation.
- `reference_pack`: `skills/quality-risk-scan/references/parser-strategy.md`.

## Expected writes

- `.retrospec/retro/complexity.db`
- `.retrospec/retro/security.db`
- `.retrospec/registry.db` handoff/category status rows

## Planning checklist

1. Check `/analysis/status` before scanning.
2. Label all findings as candidates with source anchors and confidence.
3. Do not upgrade patterns to confirmed vulnerabilities.
4. Withhold findings that require unsupported taint or interprocedural analysis.
5. Name missing capabilities such as `taint-analysis`, `interprocedural-security-scan`, or `language-specific-complexity-parser`.

## Generated program contract

1. Generate `generation-contract.json`, `job.json`, and `run.ts` under `.retrospec/generated/retro/quality-risk-scan/`.
2. Record selected complexity/cognitive-complexity handlers, selected security-pattern detectors, skipped checks, fallback cases, expected writes, missing capabilities, survey inputs, and status evidence in `generation-contract.json`.
3. Record the reference pack path and selected/skipped reference cases in `generation-contract.json`.
4. Keep `job.json.entrypoint` under `.retrospec/generated/` and every write path under `.retrospec/`.
5. Run the validation loop, compare source-authored expected complexity/security evidence with generated output, and classify gaps as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
6. Write `validation-report.json` and `reference-candidates.jsonl`; fix `bug` gaps before Appraiser and never auto-merge reference candidates into skill references.
7. Send contract, manifest, entrypoint, validation report, and reference candidates to Appraiser before Excavator submission.

## Parser strategy checklist

1. Prefer AST-backed file/function complexity over regex or line-count heuristics.
2. File complexity increments on conditionals, loops, switch/case, catch, and conditional expressions.
3. Function complexity should use body nodes: `compound_statement`, `block`, `method_body`, or `statement_block`.
4. Cognitive complexity should account for nesting, jump/throw/return nodes, and logical operators.
5. Security-pattern findings are candidates only; taint, exploitability, framework-specific flow, and interprocedural proof require explicit generated resolvers.
6. If AST function bodies are unavailable, report reduced-confidence file-level metrics or mark category incomplete.
