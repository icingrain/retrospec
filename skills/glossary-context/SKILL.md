---
name: glossary-context
owner_agent: Archivist
categories: [glossary]
origin: core
trigger_examples: [glossary upload, CSV dictionary import, XLSX dictionary import, term reconciliation, table reconciliation, column reconciliation]
template_path: none
expected_writes: [.retrospec/glossary/glossary.db, .retrospec/uploads/]
refusal_boundary: Refuse memory-note authoring and source-code analysis; do not overwrite glossary rows without explicit import policy.
requires_generation_contract: false
promoted_from: null
created_by: shipped
---

# glossary-context Skill

## Purpose

Import and reconcile user-provided glossary data without mixing it with human memory notes.

## Categories

- `glossary`

## Primary outputs

- `.retrospec/glossary/glossary.db`
- `.retrospec/uploads/` staged source files
- `entity_glossary_matches` references to registry entities

## Capabilities

- Import CSV/XLSX table, column, and term dictionaries from upload staging.
- Normalize glossary keys for matching against registry entities.
- Record entity-glossary match confidence without mutating registry source entities.
- Keep glossary dictionary data separate from `memory_notes` human interpretation context.

## Package layout

- Loader entry point: `skills/glossary-context/SKILL.md`.
- Detailed import and reconciliation rules: `skills/glossary-context/references/import-reconciliation.md`.
- No generated template: glossary import is an upload/import workflow through `.retrospec/uploads/` and `.retrospec/glossary/glossary.db`, not a source-fit static-analysis generator.

## Runbook

### Inputs

- User-uploaded glossary files staged under `.retrospec/uploads/`.
- `skills/glossary-context/references/import-reconciliation.md` for import policy, row evidence, and reconciliation boundaries.
- Import request naming source file, sheet/table selection when applicable, and import policy.
- Existing registry entities and active glossary rows for duplicate/conflict detection.

### Steps

1. Validate that the request is glossary import or reconciliation; do not consume memory-note requests here.
2. Stage the uploaded source and identify supported CSV/XLSX tables, sheets, headers, and row counts.
3. Normalize table, column, and term keys while preserving original uploaded values and source provenance.
4. Import accepted rows into `.retrospec/glossary/glossary.db` according to the explicit import policy.
5. Match glossary entries to registry entities with confidence labels and unresolved-match notes.
6. Report rejected rows, duplicate handling, unmatched entities, and missing parser/reconciliation capabilities.

### Outputs

- Staged upload files under `.retrospec/uploads/`.
- `.retrospec/glossary/glossary.db` dictionary rows with source provenance.
- `entity_glossary_matches` references with match confidence and unresolved-match context.
- Coverage summary for imported rows, rejected rows, unmatched entities, duplicate policy, and missing capabilities.

### Failure handling

- If the file format or sheet selection is unsupported, keep the source staged and report the missing parser capability.
- If import policy is absent for conflicting rows, stop before overwriting existing glossary data.
- If glossary and memory-note content are mixed in one source, import only dictionary-shaped rows and surface the remainder for human review.

### Handoff boundaries

- Glossary data defines names and terms; it does not carry human rationale, corrections, or project decisions.
- Memory notes remain separate and are not created, edited, or superseded by this skill.
- Downstream SQL/spec/export consumers may reference glossary matches but must not treat them as source-code truth.

## Coverage reporting

- Report imported row counts, rejected rows, unmatched entities, and low-confidence matches.
- Name missing capabilities such as `xlsx-sheet-selection`, `term-normalization`, or `entity-anchor-reconciliation`.

## Fallback

- Stage unsupported glossary files without importing and name the missing parser capability.
- Do not convert memory notes into glossary terms.
- Do not overwrite existing glossary rows without an explicit import policy.

## Manual QA

1. Upload a glossary CSV/XLSX and confirm `glossary-context` imports dictionary rows from staging.
2. Seed glossary and memory notes for one entity and confirm they stay separate.
3. Seed unmatched terms and confirm coverage reports unmatched counts and missing reconciliation capability.
