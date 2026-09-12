---
name: ai-spec-analysis
owner_agent: spec
categories: [spec, risk, migration, summary]
origin: core
trigger_examples: [risk analysis, migration analysis, business summary, community grouping, memory-aware analysis, ambiguous-evidence review]
template_path: templates/spec/ai-spec-analysis/
expected_writes: [.retrospec/spec/ai_analysis.db]
refusal_boundary: Refuse when required Curator-confirmed handoffs are missing; keep AMBIGUOUS evidence as review-needed.
requires_generation_contract: false
promoted_from: null
created_by: shipped
---

# ai-spec-analysis Skill

## Purpose

Analyze retro handoff entities and store spec analysis runs.

## Built-in analysis capability

- Require Curator-confirmed `structure` and `symbols` handoffs.
- Build batch input from `registry.db.entities` for ready categories only.
- Write `.retrospec/spec/ai_analysis.db` with `analysis_runs` rows.
- Write `.retrospec/spec/ai_analysis.db` with `risk_findings` rows.
- Use manifest `capability: "ai-analysis"` so the daemon runs the trusted built-in spec runner.
- Expose completed runs through `/analysis/status`.

## Current analyzer support

- Deterministic local driver, env-provider driver, and opencode-broker driver.
- Generates low-severity `inventory_review` findings for symbol entities.
- Records `analysis_run_id`, `model`, and `prompt_version` for every run.

## Capability contract

- Group risk and migration findings by `community/EPIC candidate` only when Curator provides graph community context.
- Preserve community wording as a candidate grouping; do not present it as a confirmed business EPIC.
- Inject active, anchor-relevant `memory_notes` into prompt/run context for entity, community, analysis run, or project anchors.
- Keep memory notes separate from glossary matches: glossary defines names and terms, memory notes carry human corrections, constraints, rationale, or project context.
- Treat `AMBIGUOUS` relationship evidence as `review_needed_evidence`; do not promote it to confirmed findings, dependencies, migration blockers, or business facts.
- Label `INFERRED` relationship evidence as inferred whenever it supports a hypothesis.

## Package layout

- Loader entry point: `skills/ai-spec-analysis/SKILL.md`.
- Analysis-type templates: `templates/spec/risk/`, `templates/spec/migration/`, `templates/spec/summary/`.
- Compatibility job template: `templates/spec/ai-spec-analysis/`.
- Detailed static-parser references: none. This skill consumes Curator-confirmed evidence and uses the trusted spec analysis job surface rather than generating parser code.

## Runbook

### Inputs

- Curator-confirmed handoff rows for requested retro categories.
- Registry entities, graph/community candidates, SQL evidence, quality/risk candidates, glossary matches, and active anchor-relevant memory notes.
- Analysis request containing run id, prompt version, target scope, and deterministic or provider driver selection.

### Steps

1. Check `/analysis/status`; continue only with ready categories and explicitly list missing upstream capabilities.
2. Build batch input from registry entities and available evidence, preserving source category and confidence labels.
3. Attach graph community context only as community/EPIC candidates and keep ambiguous edges as review-needed evidence.
4. Attach glossary matches as dictionary context and active memory notes as human interpretation context with separate provenance.
5. Run deterministic analysis by default, env-provider only from runtime provider env, or opencode-broker only through an explicit broker endpoint.
6. Validate the selected template package and generated `spec-validation-report.json` before daemon submission.
7. Store analysis run metadata, prompt version, model/driver, input coverage, and generated findings.
8. Expose run completion, missing capabilities, and review-needed evidence through `/analysis/status`.

### Outputs

- `.retrospec/spec/ai_analysis.db` `analysis_runs` rows with input scope, driver/model, prompt version, and coverage metadata.
- `.retrospec/spec/ai_analysis.db` `risk_findings` rows or equivalent spec findings linked to evidence anchors.
- `.retrospec/spec/ai_analysis.db` `migration_groups`, `migration_findings`, or `summary_sections` rows for matching templates.
- `.retrospec/generated/spec/<analysis-type>/spec-validation-report.json` before job submission.
- Review-needed records for ambiguous evidence and missing upstream capabilities.
- Status summary suitable for Archivist export planning.

### Failure handling

- If required handoffs are missing, write a failed or blocked run state rather than generating findings from incomplete context.
- If community, memory, glossary, or graph context is absent, state the absence and fall back to available entity/category grouping.
- If evidence is ambiguous or inferred, preserve that label in the finding rather than converting it into a confirmed dependency or risk.

### Handoff boundaries

- This skill analyzes existing retro/spec evidence; it does not mutate retro DBs, glossary rows, or memory notes.
- Provider API keys stay out of generated scripts, manifests, ledger rows, and docs; only runtime env or the broker process may hold secrets.
- Archivist consumes completed runs and must preserve provenance and uncertainty in reports.

## Provider driver boundary

- External LLM provider calls require explicit `RETROSPEC_SPEC_PROVIDER_MODE` or complete legacy env-provider variables.
- `env-provider` calls the configured API-compatible provider directly and sends the API key only in the authorization header.
- `opencode-broker` calls `POST <RETROSPEC_SPEC_BROKER_URL>/spec/analyze`; login/session lifecycle stays inside that broker.
- The deterministic driver remains the default when no provider config exists.

## Fallback

- If graph community context is missing, group findings by available entity/category context instead of inventing communities.
- If relevant memory notes are missing, state that no active memory context was supplied rather than synthesizing human intent.
- If evidence is ambiguous, produce a review-needed item or uncertainty note instead of a confident conclusion.

## Coverage reporting

- Report which input categories, graph capabilities, glossary matches, and memory-note anchors were available for the run.
- Name missing upstream capabilities before using fallback grouping, for example `community-detection`, `impact-radius`, `memory-note-injection`, or `glossary-match`.
- Preserve missing-capability notes in run context so later exports can explain why a finding was category-level rather than community/entity-specific.
- Do not hide missing capability gaps by writing generic findings as if full context existed.

## Non-goals

- Migration difficulty scoring.
- Business summary generation.
- Cross-run diff analysis.
- Glossary mutation or memory-note authoring.

## Manual QA

1. Seed Curator context with a community candidate and confirm findings are grouped as candidates, not confirmed EPICs.
2. Seed active memory notes and glossary matches for the same entity and confirm prompt context keeps their roles separate.
3. Seed `AMBIGUOUS` evidence and confirm output is review-needed evidence rather than a confirmed finding.
