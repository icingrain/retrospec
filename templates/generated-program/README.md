# source-fit generated program template

Use this template when a static-analysis skill generates a project-specific analyzer from Surveyor output, `/analysis/status`, reference cases, and the requested category.

The generated program is not a fixed copied analyzer script. It is a source-fit program that selects only the parser, extraction, fallback, and write behavior needed for the current project.

Generated programs must prefer parser, AST, compiler API, XML parser, SQL parser, or other structure-extraction libraries over regex/basic extraction whenever such a library is available for the surveyed language and requested category. Regex/basic extraction is a fallback, not the default.

## Required files under `.retrospec/generated/`

```text
.retrospec/generated/<actor>/<skill>/
├── generation-contract.json
├── job.json
├── run.ts
├── validation-report.json
├── reference-candidates.jsonl
└── skill-promotion-candidates.jsonl   # optional; only when the user wants a reusable custom skill candidate
```

This repository template stores only the contract and manifest skeleton. The concrete `run.ts` is generated per project under `.retrospec/generated/`.

## Required generation-contract fields

- `project_path`: absolute project root.
- `actor`: `retro`, `spec`, or `archivist`.
- `skill`: repo-local skill name.
- `categories`: requested categories handled by this generated program.
- `status_evidence`: `/analysis/status` summary used before generation.
- `survey`: language mix, include/exclude paths, framework hints, generated/vendor/test path policy, and large-file limits.
- `reference_cases`: parser/static-analysis cases used as templates.
- `language_capability`: matrix path, language, category support, parser backend, evidence label, and unsupported categories.
- `selected_strategies`: parser/extractor/check strategies selected for this source tree; each entry must include `parser_backend`, `categories`, and `evidence_label`.
- `skipped_strategies`: supported cases intentionally not generated for this request, with a reason.
- `fallbacks`: missing capabilities, unsupported constructs, and reduced-confidence paths; every fallback must include `reason`, `missing_capability`, non-`EXTRACTED` `evidence_label`, and parser dependency preflight evidence when fallback replaces an available parser-backed strategy.
- `expected_writes`: `.retrospec/` outputs the manifest will write.
- `handoff`: `ready_for_analysis`, `incomplete`, or `blocked` plus reason. Fallbacks, unsupported categories, and open unsupported/ambiguous validation gaps cannot use `ready_for_analysis`.
- `validation_loop`: analysis-target-file sample policy, selected validation samples, expected evidence source, generated-result comparison policy, gap taxonomy, report paths, stop conditions, and iteration limit.

## Parser dependency preflight

Before selecting regex/basic fallback, the owner agent must:

1. Check whether the needed parser/structure library is already loadable from the generated program runtime or project package environment.
2. If missing and the run policy allows package installation, attempt the smallest install required for the generated run, such as a tree-sitter runtime plus the matching language pack or a language/framework-specific parser.
3. Record the install command or load check, installed version when available, exit code/error when it fails, and the resulting `parser_backend` decision in `generation-contract.json`, `validation-report.json`, or the fallback reason/evidence fields.
4. Use regex/basic extraction only when the parser cannot load, install fails, the language pack is unavailable, or policy forbids installation. The fallback must use `INFERRED` or `AMBIGUOUS` evidence and name the missing capability.

Do not silently choose regex because it is easier to generate. If parser-backed extraction is possible, generate the parser-backed program and validate it against samples.

## Validation loop contract

Before Appraiser review, the owner agent must run a validation loop over representative samples for the generated program. The candidate set is the already-confirmed analysis target files after include paths, exclude paths, extension filters, generated/vendor/test policy, and large-file policy are applied.

1. Select validation samples from source survey evidence, reference packs, and fixture/example packs relevant to the requested categories.
   - Default policy: deterministic-stratified sampling from analysis target files.
   - Recommended bounds: `min_count: 3`, `max_count: 12`, `ratio: 0.1`.
   - Small projects may use fewer than `min_count` only when the eligible target set is smaller than the minimum.
   - Random sampling is allowed only when the seed is recorded in the contract.
2. Write expected evidence by directly inspecting the sample source through agent tools, not by trusting the generated program output.
3. Run or dry-run the generated program against the selected sample set according to the daemon/job boundary available for the task.
4. Compare expected evidence with generated results and classify every gap as exactly one of:
   - `bug`: generated program should support the case and produced wrong/missing evidence.
   - `unsupported`: the case is outside the selected resolver scope for this run.
   - `ambiguous`: source evidence supports multiple interpretations or unresolved targets.
   - `reference-missing`: repeated source-backed case is not yet covered by the skill reference pack.
5. Fix `bug` gaps and rerun the loop until no `bug` remains or the iteration limit is reached.
   - Stop early when all required samples pass, no unresolved bug gap remains, the same gap repeats, there is no meaningful improvement, or the configured budget is exceeded.
6. Record unresolved `unsupported` and `ambiguous` gaps as reduced coverage or incomplete handoff, not as successful full-confidence evidence.
7. Write `validation-report.json` and `reference-candidates.jsonl` under the same `.retrospec/generated/<actor>/<skill>/` directory.

`reference-candidates.jsonl` is a promotion queue only. Project-specific cases must not be auto-merged into `skills/*/references/`; only repeated, source-backed `reference-missing` cases should become a later reviewed task.

## Custom skill promotion queue

When a validated custom analysis run should become a reusable user asset, write a candidate row to `.retrospec/generated/<actor>/<skill>/skill-promotion-candidates.jsonl`. This queue is higher level than `reference-candidates.jsonl`: it proposes either an L0/L1/L2 update to an existing skill or an L3 `origin: custom` skill package, but it never writes into `skills/` by itself.

Each row must include:

- `candidate_version`: `1`.
- `source_generated_dir`: `.retrospec/generated/<actor>/<skill>/` directory containing the validated run.
- `promotion_level`: `L0`, `L1`, `L2`, or `L3` from the skill extension ladder.
- `target_owner_agent`: proposed owner agent.
- `target_skill`: existing skill for L0-L2 or proposed custom skill name for L3.
- `source_artifacts`: `generation-contract.json`, `validation-report.json`, and generated `run.ts` evidence used for review.
- `required_frontmatter`: proposed `SKILL.md` front matter values when a new package is proposed.
- `approval_required`: `true`.
- `auto_write_skills`: `false`.

Appraiser must reject promotion candidates when `approval_required` is not true, when `auto_write_skills:false` is missing, when source artifacts are not under `.retrospec/generated/`, or when the candidate implies direct writes into `skills/` before explicit Appraiser approval or user confirmation.

## Required validation-report fields

- `report_version`: validation report schema version.
- `run_id`: generated run or job id.
- `skill`: repo-local skill name.
- `categories`: validated categories.
- `samples`: source files/snippets selected for validation, why they were selected, and which requested categories they cover.
- `expected_evidence`: agent-authored expected outputs with source anchors.
- `generated_results`: generated-program outputs or dry-run result summaries.
- `comparisons`: per-sample pass/fail comparison records.
- `gaps`: gap records with `bug`, `unsupported`, `ambiguous`, or `reference-missing` classification.
- `iterations`: validation attempts and fixes made for `bug` gaps. The count must not exceed `validation_loop.iteration_limit`.
- `stop_reason`: why the authoring loop stopped. It must be one of the contract `stop_conditions`.
- `status`: `passed`, `passed_with_gaps`, or `failed`.

## Appraiser requirements

Appraiser must reject the generated program when any of these is true:

- `generation-contract.json`, `job.json`, or `run.ts` is outside `.retrospec/generated/`.
- `job.json.entrypoint` is outside `.retrospec/generated/`.
- Any `job.json.writes` path is outside `.retrospec/`.
- The contract lacks status-first evidence for broad analysis work.
- The selected strategies do not match the survey language/category scope.
- Any selected strategy lacks `parser_backend`, requested `categories`, or `evidence_label`.
- Any fallback lacks `missing_capability`, lacks a reason, or claims `EXTRACTED` evidence.
- The program claims full coverage while relying on fallback, regex-only, ambiguous, or missing-capability evidence.
- The contract marks handoff `ready_for_analysis` while fallback, unsupported category, open unsupported gap, or open ambiguous gap evidence exists.
- `validation_loop` is missing, `validation-report.json` is missing, sample policy/report sample structure is inconsistent, iteration count exceeds the limit, stop reason is not allowed, a `bug` gap remains unresolved, or `reference-candidates.jsonl` is treated as an auto-merge into skill references.
- `skill-promotion-candidates.jsonl` is present but lacks `approval_required:true`, lacks `auto_write_skills:false`, points at generated artifacts outside `.retrospec/generated/`, or implies automatic writes into `skills/`.

## Excavator boundary

Excavator receives only Appraiser-approved manifests. It submits the manifest to the daemon and observes daemon job state; it does not select skills, rewrite generated code, or run `run.ts` directly.
