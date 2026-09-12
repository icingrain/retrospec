---
name: custom-analysis-interview
owner_agent: retro
categories: [custom_analysis]
origin: core
trigger_examples: [interview-backed unmatched static-analysis, custom extraction target, project-specific source pattern, non-core source evidence request]
template_path: templates/retro/custom-analysis-interview/
expected_writes: [.retrospec/generated/retro/custom-analysis-interview/, .retrospec/registry.db]
refusal_boundary: Use only for source-backed static-analysis requests that do not fit built-in retro skills; no auto-promotion to custom skill packages.
requires_generation_contract: true
promoted_from: null
created_by: shipped
---

# custom-analysis-interview Skill

## Purpose

Turn an unmatched, source-backed static-analysis request into a precise generated-program plan without lowering Retrospec safety gates.

Use this skill only after `retro` has checked `/analysis/status` and confirmed the request does not fit `code-inventory`, `code-relationship`, `sql-data-access`, or `quality-risk-scan`.

## Runbook

1. Restate the requested extraction target and name why the four built-in retro skills do not cover it.
2. Ask only for missing information needed to define the source target, extractability conditions, impossible conditions, output shape, and completion criteria.
3. Have Surveyor inspect at least one relevant source sample before writing a generated-program contract. Do not rely on the user's description alone.
4. Use `templates/retro/custom-analysis-interview/prompt.md` to prepare `generation-contract.json`, `job.json`, and `run.ts` under `.retrospec/generated/retro/custom-analysis-interview/`.
5. Validate generated output against Surveyor-confirmed source samples, write `validation-report.json`, and classify gaps as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
6. Send the generated program, manifest, validation report, and reference candidates to Appraiser before Excavator submission.
7. Treat any future skill package as a separate reviewed promotion task; this interview route is no auto-promotion.

## Inputs

- User's unmatched static-analysis request.
- `/analysis/status?project_path=<path>` evidence.
- Surveyor source sample summary with file paths, languages, and observed patterns.
- Interview answers for target, conditions, impossible cases, output shape, and completion criteria.

## Outputs

- `.retrospec/generated/retro/custom-analysis-interview/generation-contract.json`
- `.retrospec/generated/retro/custom-analysis-interview/job.json`
- `.retrospec/generated/retro/custom-analysis-interview/run.ts`
- `.retrospec/generated/retro/custom-analysis-interview/validation-report.json`
- `.retrospec/generated/retro/custom-analysis-interview/reference-candidates.jsonl`
- Optional `.retrospec/generated/retro/custom-analysis-interview/skill-promotion-candidates.jsonl` when the user wants a reusable custom skill candidate; the row must set `approval_required:true` and `auto_write_skills:false`.

## Failure handling

- If no source sample can be confirmed, stop at interview summary and do not generate a program.
- If the request is not source-backed static analysis, route it back to retrospec for the correct owner agent.
- If validation has unresolved `bug` gaps, do not send the manifest to Excavator.
- If the user asks to save a reusable skill, write only a `skill-promotion-candidates.jsonl` proposal under `.retrospec/generated/retro/custom-analysis-interview/`; no auto-promotion is allowed here, and no `skills/` write happens before Appraiser approval or explicit user confirmation.
