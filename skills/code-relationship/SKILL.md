---
name: code-relationship
owner_agent: retro
categories: [call_graph, dependency, data_flow]
origin: core
trigger_examples: [call graph, dependency graph, data flow, impact radius, community candidates, usage metrics]
template_path: templates/retro/code-relationship/
expected_writes: [.retrospec/retro/call_graph.db, .retrospec/retro/dependency.db, .retrospec/retro/data_flow.db, .retrospec/registry.db]
refusal_boundary: Refuse when structure or symbols handoff is not ready; keep unresolved targets as AMBIGUOUS.
requires_generation_contract: true
promoted_from: null
created_by: shipped
---

# code-relationship Skill

## Purpose

Extract and explain relationships between code entities for retro and downstream spec/report work.

## Categories

- `call_graph`
- `dependency`
- `data_flow`

## Primary outputs

- `.retrospec/retro/call_graph.db`
- `.retrospec/retro/dependency.db`
- `.retrospec/retro/data_flow.db`
- `registry.db.workflow_handoff` rows for completed relationship categories

## Capabilities

### Confidence labeling

- Store both numeric `confidence` and `confidence_label` for relationship evidence.
- Use `EXTRACTED` for directly observed relationships.
- Use `INFERRED` for derived or heuristic relationships.
- Use `AMBIGUOUS` for unresolved or review-needed relationships.
- Preserve nullable unresolved targets, such as unknown `callee_entity_id`, instead of inventing entities.

### Impact radius

- Answer entity blast-radius questions through `/graph/impact` after checking `/analysis/status`.
- Return impacted entities, impacted files, usage metrics when available, and confidence summaries.
- Count the same call evidence once per impact result even when multiple traversal paths reach it.
- Treat impact results as analysis evidence, not as permission to edit affected files.

### Community candidates

- Generate graph communities as migration/spec grouping candidates.
- Name results as community or EPIC candidates, never confirmed business EPICs.
- Include ambiguous-edge counts so spec and Archivist can surface review needs.
- Preserve the algorithm name used by the implementation, such as `connected-components-candidate`.

### Hub, bridge, and usage indicators

- Calculate usage/reference metrics from call/dependency/data-flow evidence.
- Use hub/bridge/god-node style indicators only as coupling and migration-risk hints.
- Do not present high usage or bridge position as a business-criticality fact without spec or human review.

### Parser strategy

- Before generating or reviewing a relationship program, read `skills/code-relationship/references/parser-strategy.md` as the detailed parser strategy reference pack for this skill.
- Treat parser strategy cases as the reference library for call/dependency extraction strategy.
- Prefer AST call extraction over regex for languages with available parser context.
- If parser context requires a missing parser/runtime/language pack and package installation is allowed, attempt the minimal install before regex fallback. Record installed version or failed install/load evidence in the generated contract and validation report.
- For Java, target `method_invocation`, `constructor_invocation`, `super_constructor_invocation`, `explicit_constructor_invocation`, and `method_reference` nodes; preserve `this`, `super`, interface/abstract method, and unresolved dispatch as lower-confidence evidence when exact targets cannot be resolved.
- For C/C++/Pro*C, target `call_expression`, `field_expression`, and `subscript_expression`; exclude control-flow keywords and standard library noise before writing relationship rows.
- For C#, target `invocation_expression`, `object_creation_expression`, and `base_expression`.
- For JavaScript, TypeScript, and TSX, target `call_expression` and `new_expression`, including `this`, `super`, `await`, object chains, and class-field arrow-function callers when source context supports naming them.
- Regex call patterns are fallback only after parser availability and install/load attempts are exhausted or forbidden by policy. They must produce `INFERRED` or `AMBIGUOUS` evidence, never full-confidence relationship rows.
- Dynamic calls, reflection, XML/XSQL indirection, framework dispatch, and unresolved interface dispatch must be named as missing capability or ambiguous evidence unless the generated program contains a resolver for that case.

### Generated program contract

- Generate `.retrospec/generated/retro/code-relationship/generation-contract.json`, `job.json`, and `run.ts` only after `structure`/`symbols` readiness, Surveyor output, and `/analysis/status` evidence are available.
- The contract must record requested/skipped relationship categories, selected AST call/dependency handlers, regex fallback handlers, dynamic/reflection/XML/XSQL/framework resolver decisions, expected writes, and unresolved-target policy.
- The contract must include a validation loop: source-backed relationship samples, agent-authored expected edges/dependencies, generated result comparison, `bug`/`unsupported`/`ambiguous`/`reference-missing` gap classification, `validation-report.json`, and `reference-candidates.jsonl` promotion queue.
- Refuse generation when prerequisite inventory handoffs are missing, stale, failed, or incomplete.
- If a resolver is not generated for a relationship case, the contract must predeclare the result as `INFERRED`, `AMBIGUOUS`, or missing capability; it must not claim full relationship coverage.
- Fix validation `bug` gaps before Appraiser; preserve unresolved relationship gaps as `INFERRED`, `AMBIGUOUS`, unsupported, or incomplete handoff.
- Send the generated files to Appraiser; do not submit the manifest to Excavator until Appraiser approves contract, manifest, entrypoint, validation report, and write boundaries together.

## Agent contract

- retro loads this skill for `call_graph`, `dependency`, or `data_flow` requests.
- retro checks `/analysis/status` before graph extraction, graph DB reads, `/graph/impact`, or `/graph/communities`.
- Curator and spec must keep `AMBIGUOUS` evidence as review-needed context.
- Archivist must preserve confidence labels and uncertainty wording in reports.

## Runbook

### Inputs

- `skills/code-relationship/references/parser-strategy.md` for detailed parser/generator criteria.
- Curator-confirmed `structure` and `symbols` handoff rows.
- Requested relationship categories: `call_graph`, `dependency`, and/or `data_flow`.
- Registry entities, source locations, prior coverage gaps, and optional file fingerprints.
- Surveyor language/path/framework summary and `/analysis/status` evidence for generated-program planning.

### Steps

1. Check `/analysis/status`; stop if required inventory handoffs are missing, stale, failed, or incomplete.
2. Select only the requested relationship categories and load the minimum evidence/entity context for each category.
3. Select AST call/dependency node handlers for the surveyed languages, install/load parser libraries when missing and allowed, and choose regex fallback only after that preflight fails or is forbidden.
4. Extract directly observed AST edges first and store them as `EXTRACTED`.
5. Add heuristic, regex, dynamic, reflection, XML/XSQL, or framework-derived edges only when the evidence source can be named; store them as `INFERRED` or `AMBIGUOUS`.
6. Preserve unresolved or competing targets as `AMBIGUOUS` with nullable target ids instead of fabricating entities.
7. Update impact-radius and community-candidate projections from stored relationship evidence, counting duplicate evidence once per result.
8. Write handoff rows only after category counts and confidence summaries are available.
9. Validate generated relationship output against selected source-backed samples and write `validation-report.json` before Appraiser review.

### Outputs

- `.retrospec/retro/call_graph.db`, `.retrospec/retro/dependency.db`, and/or `.retrospec/retro/data_flow.db`.
- Relationship rows with source entity, target entity when known, source location, confidence, and confidence label.
- `/graph/impact` and `/graph/communities` evidence suitable for Curator/spec/Archivist consumption.
- Coverage summary by category, confidence label, skipped input, unsupported construct, and missing capability.
- `.retrospec/generated/retro/code-relationship/validation-report.json` and optional `reference-candidates.jsonl` for repeated reference-missing relationship cases.

### Failure handling

- If prerequisite inventory is not ready, return a status-first failure and do not write empty graph success.
- If a category produces no useful evidence, mark that category missing or failed rather than successful with empty data.
- If graph traversal finds ambiguous edges, keep them review-needed; do not drop them to make the graph cleaner.
- If only regex fallback is available for a requested relationship category, write reduced-confidence coverage and name the missing AST resolver capability.

### Handoff boundaries

- This skill produces technical relationship evidence, not business EPICs or migration decisions.
- Spec may group findings by community candidates, but confirmation belongs to human/spec review.
- Archivist must preserve confidence labels and cannot flatten ambiguous evidence into confirmed facts.

## Fallback

- If a language construct is unsupported, record best-effort evidence with lower confidence instead of fabricating precise relationships.
- If relationship extraction cannot produce useful evidence, mark the category failed or missing in handoff rather than writing empty success.
- Unsupported future constructs should be routed to `other` fallback with the missing capability named.

## Coverage reporting

- Report which relationship categories were attempted: `call_graph`, `dependency`, and `data_flow`.
- Include counts for extracted, inferred, ambiguous, unsupported, and skipped relationship evidence.
- Name missing capabilities such as `dynamic-dispatch-resolution`, `macro-expansion`, `framework-route-resolution`, or `data-flow-tracing` when they force `other` fallback.
- Surface coverage gaps through `/analysis/status` summaries before any large graph query or spec handoff.

## Manual QA

1. Ask retro for a call graph run and confirm it selects `code-relationship` after `/analysis/status`.
2. Query `/graph/impact` for one entity and confirm confidence summary includes `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` counts when present.
3. Query `/graph/communities` and confirm communities are described as candidates, not confirmed EPICs.
4. Seed ambiguous call evidence and confirm downstream wording remains review-needed.
