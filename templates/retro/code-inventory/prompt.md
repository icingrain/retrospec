# code-inventory prompt skeleton

## Inputs

- `project_path`: absolute project root selected by retro.
- `categories`: `structure`, `symbols`, or both.
- `include_paths` / `exclude_paths`: source walk boundaries.
- `run_id`: daemon job/run identifier.
- `survey`: Surveyor language/path/framework summary used to select parser handlers.
- `status_evidence`: `/analysis/status` summary checked before generation.
- `reference_pack`: `skills/code-inventory/references/parser-strategy.md`.

## Expected writes

- `.retrospec/retro/structure.db`
- `.retrospec/retro/symbols.db`
- `.retrospec/registry.db`

## Planning checklist

1. Check `/analysis/status` before scanning.
2. Confirm the request maps to `code-inventory`, not graph, SQL, risk, spec, or export work.
3. Name skipped generated/vendor/test paths and unsupported languages.
4. Require `workflow_handoff` rows for `structure` and `symbols` only when coverage is sufficient.
5. Route unsupported parser work to `other` with a named missing capability.

## Generated program contract

1. Generate `generation-contract.json`, `job.json`, and `run.ts` under `.retrospec/generated/retro/code-inventory/`.
2. Record requested and skipped categories, selected parser handlers, fallback handlers, expected writes, missing capabilities, survey inputs, and status evidence in `generation-contract.json`.
3. Record the reference pack path and selected/skipped reference cases in `generation-contract.json`.
4. Keep `job.json.entrypoint` under `.retrospec/generated/` and every write path under `.retrospec/`.
5. Run the validation loop, compare source-authored expected file/symbol evidence with generated output, and classify gaps as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
6. Write `validation-report.json` and `reference-candidates.jsonl`; fix `bug` gaps before Appraiser and never auto-merge reference candidates into skill references.
7. Send contract, manifest, entrypoint, validation report, and reference candidates to Appraiser before Excavator submission.

## Parser strategy checklist

1. Prefer tree-sitter for C, C++, Java, Pro*C-as-C, C#, JavaScript, TypeScript, and TSX when the generated program can load the language pack.
2. For C/C++/Pro*C, include handlers for function definitions/declarations, structs, unions, enums, typedefs, includes, parameters, return types, source ranges, and file/header comments.
3. For Java, include handlers for classes, interfaces, enums, methods, imports, JavaDoc, parameters, return types, modifiers, visibility, extends, and implements.
4. For JavaScript/TypeScript/TSX, include handlers for function declarations, method definitions, named arrow functions, class-field arrow functions, imports, parameters, and return types when available.
5. Use basic/regex extraction only as a reduced-coverage fallback and record the missing tree-sitter/parser capability.
