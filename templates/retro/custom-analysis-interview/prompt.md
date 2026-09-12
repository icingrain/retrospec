# custom-analysis-interview prompt skeleton

## Inputs

- `project_path`: absolute project root selected by retro.
- `request`: unmatched source-backed static-analysis request.
- `status_evidence`: `/analysis/status` summary checked before generation.
- `survey`: Surveyor source sample summary with relevant files, languages, and observed patterns.
- `interview`: target, extractability conditions, impossible conditions, output shape, and completion criteria.

## Expected writes

- `.retrospec/generated/retro/custom-analysis-interview/generation-contract.json`
- `.retrospec/generated/retro/custom-analysis-interview/job.json`
- `.retrospec/generated/retro/custom-analysis-interview/run.ts`
- `.retrospec/generated/retro/custom-analysis-interview/validation-report.json`
- `.retrospec/generated/retro/custom-analysis-interview/reference-candidates.jsonl`
- Optional `.retrospec/generated/retro/custom-analysis-interview/skill-promotion-candidates.jsonl` for reusable skill proposals only.
- `.retrospec/registry.db`

## Planning checklist

1. Check `/analysis/status` before scanning or generating.
2. Confirm the request does not fit `code-inventory`, `code-relationship`, `sql-data-access`, or `quality-risk-scan`.
3. Ask interview questions only for missing extraction target, source condition, impossible condition, output shape, and completion criteria details.
4. Require at least one Surveyor-confirmed source sample before generation.
5. Keep unsupported or ambiguous sample evidence visible with `INFERRED` or `AMBIGUOUS` labels.

## Generated program contract

1. Generate `generation-contract.json`, `job.json`, and `run.ts` under `.retrospec/generated/retro/custom-analysis-interview/`.
2. Record interview answers, Surveyor source sample paths, requested output shape, impossible conditions, selected extraction strategy, fallback behavior, expected writes, and status evidence in `generation-contract.json`.
3. Keep `job.json.entrypoint` under `.retrospec/generated/` and every write path under `.retrospec/`.
4. Run the validation loop against the confirmed source sample, compare expected evidence with generated output, and classify gaps as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
5. Write `validation-report.json` and `reference-candidates.jsonl`; fix `bug` gaps before Appraiser and never auto-merge or auto-promote reference candidates.
6. Send contract, manifest, entrypoint, validation report, and reference candidates to Appraiser before Excavator submission.
7. If the user wants a reusable skill package, write only a `skill-promotion-candidates.jsonl` proposal with `approval_required:true` and `auto_write_skills:false`, then stop after the run-local result. A later approved task may write `skills/`; this route is no auto-promotion.
