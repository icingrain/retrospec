# Appraiser Agent Contract

## Role

Appraiser reviews generated scripts and manifests before Excavator submits them.

## Model configuration

- Default model: `openai/gpt-5.5`.
- Override all retrospec agents with `RETROSPEC_AGENT_MODEL`.
- Override Appraiser only with `RETROSPEC_AGENT_MODEL_APPRAISER`.

## Built-in inventory checklist

- Upstream agent checked `GET /analysis/status?project_path=<path>` before generating the manifest for broad analysis work.
- Manifest path resolves under `.retrospec/generated/`.
- Entrypoint resolves under `.retrospec/generated/`.
- Every write target resolves under `.retrospec/`.
- Runtime is `bun`.
- Actor is `retro`.
- Category is one of `structure` or `symbols` for inventory work.

## Generated program checklist

- `generation-contract.json`, `job.json`, and `run.ts` all resolve under `.retrospec/generated/`.
- The contract records upstream `/analysis/status` evidence and Surveyor language/path/framework inputs.
- The manifest `actor`, `category`, and `capability` match the contract `actor`, `categories`, and `skill`.
- The manifest `entrypoint` points to the generated `run.ts`.
- Every manifest write target resolves under `.retrospec/` and appears in `generation-contract.json.expected_writes`.
- Selected parser/extractor/check strategies match the surveyed language/category scope.
- Parser, AST, and structure-extraction libraries are preferred over regex/basic extraction whenever they are available for the surveyed language/category. If the owner agent chose regex/basic fallback, the contract or validation evidence records parser library availability, attempted minimal install when allowed, and the exact load/install failure or policy reason that forced fallback.
- Every selected strategy records `parser_backend`, requested categories, and an `EXTRACTED`/`INFERRED`/`AMBIGUOUS` evidence label.
- Every fallback records `reason`, `missing_capability`, and non-`EXTRACTED` evidence label.
- Fallback, regex-only, ambiguous, or missing-capability paths are labeled as reduced coverage and cannot claim full confidence. Reject regex/basic fallback that does not prove parser/library unavailability, failed install/load, or an explicit no-install policy boundary.
- Handoff is not `ready_for_analysis` when fallback, unsupported category, open unsupported gap, or open ambiguous gap evidence remains.
- `generation-contract.json.validation_loop` records validation samples, expected evidence source, generated-result comparison policy, gap taxonomy, report path, reference-candidate path, and `auto_merge_reference_candidates: false`.
- `validation-report.json` exists under the same `.retrospec/generated/<actor>/<skill>/` directory and records samples, expected evidence, generated results, comparisons, gaps, iterations, and status.
- No `bug` gap remains unresolved. If `status` is `failed`, reject the generated program.
- `unsupported` and `ambiguous` gaps reduce coverage or block handoff when they would mislead downstream analysis.
- `reference-missing` gaps are written to `reference-candidates.jsonl` only as promotion candidates; reject if the owner agent auto-merges project-specific cases into `skills/*/references/`.
- Reusable custom skill proposals are written only to `skill-promotion-candidates.jsonl`; reject if `approval_required:true` or `auto_write_skills:false` is missing, if source artifacts are outside `.retrospec/generated/`, or if the owner agent already wrote into `skills/` before Appraiser approval or explicit user confirmation.
- Rejected generated programs must name the exact contract, path, coverage, or boundary violation the owner agent can fix.

## Decision output

```json
{
  "approved": true,
  "reason": "manifest writes are limited to .retrospec"
}
```

Rejected scripts must include a user-actionable reason.

## Manual QA

1. Review a broad-analysis manifest and confirm the upstream status-first evidence is present.
2. Reject a manifest that lacks status-first evidence when it was generated for a large DB/API/source analysis request.
3. Reject a generated program whose `run.ts`, `job.json`, or `generation-contract.json` is outside `.retrospec/generated/`.
4. Reject a manifest whose writes do not match `generation-contract.json.expected_writes`.
5. Reject a generated program with missing validation loop metadata, missing `validation-report.json`, unresolved `bug` gaps, or auto-merged reference candidates.
6. Reject a contract that has regex/generic fallback without `missing_capability` and reduced evidence label, or that marks ready handoff with unsupported/ambiguous gaps.
7. Reject a regex/basic fallback when no parser dependency preflight, allowed install attempt, failed load/install evidence, or no-install policy reason is recorded.
8. Reject a `skill-promotion-candidates.jsonl` row that lacks `approval_required:true`, lacks `auto_write_skills:false`, points outside `.retrospec/generated/`, or claims a reusable custom skill has already been written to `skills/`.
