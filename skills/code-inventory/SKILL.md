---
name: code-inventory
owner_agent: retro
categories: [structure, symbols]
origin: core
trigger_examples: [structure scan, source inventory, symbols, functions, classes, LOC, language distribution]
template_path: templates/retro/code-inventory/
expected_writes: [.retrospec/retro/structure.db, .retrospec/retro/symbols.db, .retrospec/registry.db]
refusal_boundary: Refuse graph, SQL, risk, spec, export, or glossary-only work.
requires_generation_contract: true
promoted_from: null
created_by: shipped
---

# code-inventory Skill

## Purpose

Extract file inventory and first-pass symbols for retro.

## Built-in inventory capability

- Scan C, C header, and Java files.
- Write `.retrospec/retro/structure.db` with `files` rows.
- Write `.retrospec/retro/symbols.db` with `symbols` rows.
- Register file and symbol entities in `.retrospec/registry.db`.
- Mark `structure` and `symbols` handoff rows as `ready_for_analysis`.
- Use manifest `capability: "code-inventory"` so the daemon runs the trusted built-in inventory runner.

## Current symbol support

- Java `class` and `interface` declarations.
- Java method declarations with simple signatures.
- C function declarations with simple signatures.

## Parser strategy

- Before generating or reviewing an inventory program, read `skills/code-inventory/references/parser-strategy.md` as the detailed parser strategy reference pack for this skill.
- Treat parser strategy cases as the reference library for high-confidence parsing strategy, not as a fixed script to copy.
- Prefer tree-sitter AST extraction for C, C++, Java, Pro*C-as-C, C#, JavaScript, TypeScript, and TSX when the source survey identifies those languages and the generated program can load the matching parser.
- If the matching parser/runtime/language pack is missing and package installation is allowed, attempt the minimal install needed for the generated program before falling back. Record installed version or install/load failure evidence in the generated contract and validation report.
- For C/C++/Pro*C inventory, target `function_definition`, function `declaration` with `function_declarator`, `struct_declaration`, `union_declaration`, `enum_declaration`, `typedef_declaration`, `preproc_include`, source ranges, byte ranges, return type, parameters, and file/header comments.
- For Java inventory, target `class_declaration`, `interface_declaration`, `enum_declaration`, `method_declaration`, `import_declaration`, JavaDoc comments, method parameters, return type, modifiers, visibility, `extends`, and `implements`.
- For TypeScript/JavaScript inventory, target `function_declaration`, `method_definition`, named `arrow_function` via `variable_declarator`, class-field arrow functions, imports, parameters, return type when available, and TSX files through a TSX parser.
- Constructors are recorded as class structure context, not as ordinary callable functions for unused-code style analysis.
- Basic or regex extraction is allowed only as a labeled fallback when tree-sitter parser initialization, installation, or a language pack load fails or policy forbids install; it must emit reduced coverage and the missing capability name.

## Generated program contract

- Generate `.retrospec/generated/retro/code-inventory/generation-contract.json`, `job.json`, and `run.ts` only after Surveyor output and `/analysis/status` are available.
- The contract must record surveyed languages, include/exclude paths, generated/vendor/test skip policy, requested `structure`/`symbols` categories, selected parser strategy, skipped parser cases, fallback cases, expected writes, and missing capabilities.
- The contract must include a validation loop: source-backed file/symbol samples, agent-authored expected evidence, generated result comparison, `bug`/`unsupported`/`ambiguous`/`reference-missing` gap classification, `validation-report.json`, and `reference-candidates.jsonl` promotion queue.
- Select source-fit handlers from the parser strategy section instead of generating one fixed inventory script for every project.
- Refuse generation when the request is graph, SQL, risk, spec, export, or glossary-only work.
- Fix validation `bug` gaps before Appraiser; keep unsupported or ambiguous inventory shapes as reduced coverage or incomplete handoff.
- Send the generated files to Appraiser; do not submit the manifest to Excavator until Appraiser approves contract, manifest, entrypoint, validation report, and write boundaries together.

## Coverage reporting

- Report covered languages and categories before writing handoff rows.
- Record unsupported languages, skipped generated/vendor/test paths, and unsupported symbol shapes as coverage gaps.
- If a requested inventory capability is missing, name the missing capability in the status or fallback note.

## Runbook

### Inputs

- `skills/code-inventory/references/parser-strategy.md` for detailed parser/generator criteria.
- Project source root selected by retro.
- Inventory request containing requested categories, include/exclude path rules, and run id.
- Existing `.retrospec/registry.db` project row and any prior file fingerprints.
- Surveyor language/path/framework summary and `/analysis/status` evidence for generated-program planning.

### Steps

1. Confirm the request needs `structure` or `symbols`; do not run for graph, SQL, risk, glossary, spec, or export-only work.
2. Enumerate candidate files and apply generated, vendor, test, binary, and unsupported-extension skip rules before parsing.
3. Classify each included file by language and category, then write `files` rows to `.retrospec/retro/structure.db`.
4. Select the parser strategy from the source survey: tree-sitter high-confidence for supported language packs, install/load the required parser when missing and allowed, language-specific basic fallback only when parser install/load fails or is forbidden, and `other` for unsupported constructs.
5. Extract supported symbols, declarations, imports/includes, source ranges, byte ranges when available, parameters, return types, modifiers, visibility, file/header comments, and language-specific stats.
6. Register file and symbol entities in `.retrospec/registry.db` with stable source references.
7. Write coverage counts and named gaps before marking handoff rows `ready_for_analysis`.
8. Validate generated output against selected source-backed file/symbol samples and write `validation-report.json` before Appraiser review.

### Outputs

- Updated `.retrospec/retro/structure.db` and `.retrospec/retro/symbols.db`.
- Registered `file` and `symbol` entities in `.retrospec/registry.db`.
- `workflow_handoff` rows for `structure` and `symbols` when coverage is sufficient.
- Coverage note containing scanned, skipped, unsupported, extracted, and missing-capability counts.
- `.retrospec/generated/retro/code-inventory/validation-report.json` and optional `reference-candidates.jsonl` for repeated reference-missing inventory cases.

### Failure handling

- If the source root is unavailable or unsafe to scan, fail the handoff before writing partial success rows.
- If a parser only partly understands a file, keep extracted evidence but label the gap and avoid full-coverage wording.
- If symbol coverage is too low for downstream analysis, write incomplete/failed handoff with the exact missing capability.
- If tree-sitter is unavailable for an otherwise high-confidence language, downgrade to basic extraction with `missing capability: tree-sitter-language-pack` or fail the symbols handoff when the reduced output would mislead downstream analysis.

### Handoff boundaries

- Curator may consume only handoff rows marked `ready_for_analysis`.
- Relationship, SQL, quality, and AI interpretation are downstream responsibilities and must not be inferred here.
- Human memory notes and glossary terms are not authored or modified by this skill.

## Fallback

- Route unsupported source constructs to the `other` fallback policy with the missing capability named.
- Use best-effort extraction only when the output can be labeled with reduced coverage; do not silently mark unsupported constructs as fully covered.
- Mark `workflow_handoff` as failed or incomplete when coverage is too low to support downstream analysis.

## Non-goals

- Full parser accuracy.
- Call graph extraction.
- SQL extraction.
- AI analysis.
