# Retrospec skill readiness catalog

This catalog is the entry point for repo-local skill loading. It fixes the first routing decision before any generated analysis program is prepared.

## Operating flow

1. `retrospec` summarizes the current project and daemon state.
2. `Surveyor` inspects the source tree, language mix, build/package hints, generated/vendor/test paths, large-file risk, and requested analysis scope.
3. The owner agent checks `GET /analysis/status?project_path=<path>` before large source walks, DB reads, export planning, or generated program planning.
4. The owner agent loads the matching skill from `skills/` and selects the matching template directory.
5. If no built-in static-analysis skill matches a source-backed extraction request, `retro` loads `custom-analysis-interview` and interviews for target, extractability conditions, impossible conditions, completion criteria, and Surveyor-confirmed source samples before generation.
6. Static-analysis skills generate source-fit programs under `.retrospec/generated/` only after the survey/status context is known.
7. The owner agent validates the generated program against source-backed samples, writes `validation-report.json`, and records repeated reference gaps in `reference-candidates.jsonl` without auto-merging them into skill references.
8. `Appraiser` reviews the generated program, manifest, expected writes, status-first evidence, validation report, and reference-candidate boundary.
9. `Excavator` submits only approved manifests to the daemon.
10. Results are written under `.retrospec/` and surfaced through handoff rows, `/analysis/status`, graph/export APIs, or dashboard downloads.

Agents must not skip this flow by running generated scripts directly or writing analysis DBs outside the daemon/job boundary.

## Minimum SKILL.md front matter

Every repo-local `SKILL.md` starts with the same routing contract so agents, reviews, and future sync tooling can inspect skill ownership without re-reading prose.

```yaml
---
name: <kebab-case, globally unique>
owner_agent: retro | spec | Archivist
categories: [structure, symbols]
origin: core | custom
trigger_examples: [source inventory, SQL extraction]
template_path: templates/<owner>/<skill>/ | none
expected_writes: [.retrospec/...]
refusal_boundary: <what this skill must refuse or downgrade>
requires_generation_contract: true | false
promoted_from: null | <origin-skill-name>
created_by: shipped | interview:<date> | promoted:<reference-candidate-id>
---
```

Rules:

- `owner_agent` is exactly one of `retro`, `spec`, or `Archivist`; the `retrospec` router does not own analysis skills.
- `origin: core` means the skill ships with this package. `origin: custom` remains future work and must not be promoted without Appraiser or explicit user approval.
- Every `expected_writes` entry stays under `.retrospec/`.
- Static-analysis skills set `requires_generation_contract: true` and follow the generated program contract below.
- Import/export or AI-analysis skills set `requires_generation_contract: false` unless they create project-fit generated programs.

## Skill load matrix

| Skill | Owner agent | Trigger examples | Categories | Template path | Expected writes | Fallback/refusal boundary |
|---|---|---|---|---|---|---|
| `code-inventory` | `retro` | structure scan, source inventory, symbols, functions, classes, LOC, language distribution | `structure`, `symbols` | `templates/retro/code-inventory/` | `.retrospec/retro/structure.db`, `.retrospec/retro/symbols.db`, `.retrospec/registry.db` | Refuse graph, SQL, risk, spec, export, or glossary-only work. Route unsupported language/parser cases to `other` or incomplete handoff with a named missing capability. |
| `code-relationship` | `retro` | call graph, dependency graph, data flow, impact radius, community candidates, usage/reference metrics | `call_graph`, `dependency`, `data_flow` | `templates/retro/code-relationship/` | `.retrospec/retro/call_graph.db`, `.retrospec/retro/dependency.db`, `.retrospec/retro/data_flow.db`, `.retrospec/registry.db` | Refuse when `structure`/`symbols` are not ready. Keep unresolved targets as `AMBIGUOUS`; do not fabricate entities or confirmed EPICs. |
| `sql-data-access` | `retro` | embedded SQL, JDBC, MyBatis, JPA, Pro*C SQL, table references, CRUD matrix | `sql` | `templates/retro/sql-data-access/` | `.retrospec/retro/sql.db`, `.retrospec/registry.db` | Refuse non-SQL requests. Do not infer CRUD intent from table-like tokens. Preserve glossary matches as references only. |
| `quality-risk-scan` | `retro` | complexity, hotspot, security-pattern candidate, hardcoded secret, unsafe call, risky API usage | `complexity`, `security` | `templates/retro/quality-risk-scan/` | `.retrospec/retro/complexity.db`, `.retrospec/retro/security.db`, `.retrospec/registry.db` | Refuse confirmed vulnerability/business-risk wording. Downgrade or withhold findings that require unsupported taint, interprocedural, framework, or language-specific analysis. |
| `custom-analysis-interview` | `retro` | interview-backed unmatched static-analysis, custom extraction target, project-specific source pattern, non-core source evidence request | `custom_analysis` | `templates/retro/custom-analysis-interview/` | `.retrospec/generated/retro/custom-analysis-interview/*`, `.retrospec/registry.db` | Use only when the request is source-backed static analysis but no built-in retro skill fits. Require Surveyor-confirmed source samples, generated-program validation, Appraiser review, and no auto-promotion to `origin: custom`. |
| `glossary-context` | `Archivist` | glossary upload, CSV/XLSX dictionary import, term/table/column reconciliation, entity glossary match | `glossary` | Upload staging under `.retrospec/uploads/`; no generated analysis template is required for glossary import. | `.retrospec/glossary/glossary.db`, `.retrospec/uploads/`, registry glossary match references | Refuse memory-note authoring and source-code analysis. Do not overwrite glossary rows without an explicit import policy. |
| `ai-spec-analysis` | `spec` | risk analysis, migration analysis, business summary, community grouping, memory-aware analysis, ambiguous-evidence review | `spec`, `risk`, `migration`, `summary` | `templates/spec/ai-spec-analysis/` | `.retrospec/spec/ai_analysis.db` | Refuse when required Curator-confirmed handoffs are missing. Keep `AMBIGUOUS` evidence as review-needed and glossary/memory context separate. |
| `report-export` | `Archivist` | CSV, XLSX, Markdown SOT, community wiki, Mermaid, DOCX, PPTX, export manifest, render delegation | `export` | `templates/report-export/` | `.retrospec/exports/manifest.json`, `.retrospec/exports/*` | Refuse destinations outside `.retrospec/exports/`. Delegate render-heavy work through Excavator and preserve confidence/provenance labels. |

## Source-fit generation boundary

The static-analysis skills do not represent one fixed analyzer script. They use parser strategy and fixture-backed cases as reference material, then generate a project-specific program for the current survey and request.

Before a generated program chooses regex/basic extraction, the owner agent must perform parser dependency preflight: check whether a parser, AST, compiler API, XML parser, SQL parser, or other structure-extraction library is already available; when missing and package installation is allowed, attempt the minimal install needed for the run; and record the installed version, load result, failed install/load evidence, or explicit no-install policy reason. Regex/basic fallback is allowed only after that evidence exists and must be labeled reduced coverage.

The generated program contract belongs to these skills:

- `code-inventory`
- `code-relationship`
- `sql-data-access`
- `quality-risk-scan`
- `custom-analysis-interview`

Each generated program must declare:

- survey inputs used for language/framework/path selection;
- requested categories and skipped categories;
- selected parser or extraction strategy;
- parser/structure library availability, install attempt, and load result when fallback is considered;
- expected `.retrospec/` writes;
- missing capabilities and fallback behavior;
- status-first evidence for Appraiser review;
- manifest path and entrypoint under `.retrospec/generated/`;
- validation samples, expected evidence, generated-result comparison, gap classifications, validation report path, and reference-candidate path.

The canonical template is `templates/generated-program/`. A generated program must produce `generation-contract.json`, `job.json`, `run.ts`, `validation-report.json`, and `reference-candidates.jsonl` under `.retrospec/generated/<actor>/<skill>/`. `generation-contract.json` is the audit record that proves the generated program is survey-fit: it names the survey inputs, status evidence, reference cases, selected strategies, skipped strategies, fallbacks, expected writes, validation loop, and reference-candidate policy.

Validation gap taxonomy is fixed as `bug`, `unsupported`, `ambiguous`, and `reference-missing`. `bug` gaps must be fixed before Appraiser approval. `unsupported` and `ambiguous` gaps must reduce coverage or block handoff when they would mislead downstream agents. `reference-missing` gaps go to `reference-candidates.jsonl` for later reviewed promotion; generated programs must never auto-merge project-local cases into `skills/*/references/`.

## Custom skill promotion queue

Validated custom analysis runs can become reusable user assets only through `.retrospec/generated/<actor>/<skill>/skill-promotion-candidates.jsonl`. This queue records the proposed extension-ladder level and review evidence; it does not write to `skills/`.

- L0-L2 candidates propose reviewed updates to an existing skill reference pack, category list, or template subpath.
- L3 candidates propose a new `origin: custom` skill package with required front matter and source artifacts from the validated run.
- Every candidate must set `approval_required:true` and `auto_write_skills:false`.
- Appraiser approval or explicit user confirmation is required before any later task writes into `skills/` or updates `skill_load_policy`.

Parser strategy details and the adaptive generated-program contract are recorded in the skill packages. This catalog intentionally records the routing surface first.

## Package structure contract

Current package layout remains flat for shipped core skills: `skills/<skill>/SKILL.md`. The Phase 3 migration decision is to keep this flat core layout for now and use the required `owner_agent`/`origin` front matter as the authoritative routing metadata. A physical `skills/<owner>/core|custom` move is deferred to a dedicated migration before the first `origin: custom` skill is promoted, because current agents, templates, fixtures, and tests still carry flat-path references and there are no custom skill packages yet.

Future target layout:

```text
skills/
├── retro/core/<static-analysis-skill>/
├── retro/custom/<custom-static-analysis-skill>/
├── spec/core/ai-spec-analysis/
├── spec/custom/<custom-ai-analysis-skill>/
├── archivist/core/<export-or-import-skill>/
├── archivist/custom/<custom-export-or-import-skill>/
└── _meta/retrospec-skill-builder/
```

Migration trigger: before writing the first approved `origin: custom` skill to `skills/`, add a dedicated migration that updates `.opencode/retrospec.jsonc`, agent prompt paths, template references, fixture `must_read` paths, and readiness tests in one verified step.

| Skill | Loader entry point | Reference pack | Template or fixture surface |
|---|---|---|---|
| `code-inventory` | `skills/code-inventory/SKILL.md` | `skills/code-inventory/references/parser-strategy.md` | `templates/retro/code-inventory/`, `templates/fixtures/code-inventory/c-cpp-java-symbols/` |
| `code-relationship` | `skills/code-relationship/SKILL.md` | `skills/code-relationship/references/parser-strategy.md` | `templates/retro/code-relationship/`, `templates/fixtures/code-relationship/c-java-calls/` |
| `sql-data-access` | `skills/sql-data-access/SKILL.md` | `skills/sql-data-access/references/parser-strategy.md`, `skills/sql-data-access/references/proc-dynamic-sql-examples.md` | `templates/retro/sql-data-access/`, `templates/fixtures/sql-data-access/` |
| `quality-risk-scan` | `skills/quality-risk-scan/SKILL.md` | `skills/quality-risk-scan/references/parser-strategy.md` | `templates/retro/quality-risk-scan/`, `templates/fixtures/quality-risk-scan/c-cpp-java-risk/` |
| `custom-analysis-interview` | `skills/custom-analysis-interview/SKILL.md` | Interview questions in `templates/retro/custom-analysis-interview/prompt.md`; source samples must come from Surveyor. | `templates/retro/custom-analysis-interview/` and the canonical `templates/generated-program/` validation loop. |
| `glossary-context` | `skills/glossary-context/SKILL.md` | `skills/glossary-context/references/import-reconciliation.md` | No generated template; use upload staging under `.retrospec/uploads/` and glossary DB writes under `.retrospec/glossary/`. |
| `ai-spec-analysis` | `skills/ai-spec-analysis/SKILL.md` | No static-parser reference; consumes Curator-confirmed evidence. | `templates/spec/ai-spec-analysis/` |
| `report-export` | `skills/report-export/SKILL.md` | No static-parser reference; consumes approved analysis/export records. | `templates/report-export/` |

## Readiness checklist

Use this checklist before calling a skill ready:

- The requested user intent maps to exactly one owner agent and primary skill.
- `/analysis/status` has been checked before broad analysis or export planning.
- The matching template directory exists or the skill explicitly documents why no generated template is used.
- Expected writes stay under `.retrospec/`.
- Generated programs and manifests stay under `.retrospec/generated/`.
- Appraiser review is required before Excavator submission.
- `generation-contract.json` exists for generated static-analysis programs and matches the manifest category, actor, capability, entrypoint, and write paths.
- `validation-report.json` exists for generated static-analysis programs and has no unresolved `bug` gaps.
- `reference-candidates.jsonl` is present when `reference-missing` gaps exist and is treated only as a reviewed promotion queue.
- `skill-promotion-candidates.jsonl` is present when a reusable custom skill is requested and is treated only as a reviewed promotion queue with `approval_required:true` and `auto_write_skills:false`.
- `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` evidence labels are preserved where applicable.
- Unsupported capability, coverage gap, and refusal messages name the missing capability or boundary violation.
