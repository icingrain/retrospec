# code-inventory parser reference pack

## Parser strategy references

- Parser initialization: language packs for C, C++ as C, Java, C#, JavaScript, TypeScript, TSX.
- Inventory node extraction: `function_definition`, `method_declaration`, `method_definition`, `declaration` with `function_declarator`, `class_declaration`, `struct_declaration`, `interface_declaration`, `enum_declaration`, `arrow_function`.
- Complexity side data: per-file and per-function complexity/cognitive complexity may be collected, but risk scoring belongs to `quality-risk-scan`.

## Survey-fit selection rules

- Use this pack after Surveyor reports language mix, include/exclude paths, generated/vendor/test policy, and requested `structure`/`symbols` categories.
- Prefer tree-sitter for C, C++, Java, C#, JavaScript, TypeScript, and TSX when the generated program can load the required parser.
- If the required parser/runtime/language pack is not loadable and package installation is allowed, attempt the minimal install before selecting fallback. Record the install command, package/version when available, load result, or failure reason in the generated contract/validation report.
- Treat Pro*C as C only for structural and function inventory; embedded SQL extraction is delegated to `sql-data-access`.
- Use basic or regex extraction only as reduced-coverage fallback when the parser cannot load, install fails, language pack is unavailable, or policy forbids install. The generated contract must name the missing parser capability.

## Extraction targets

### C, C++, Pro*C-as-C

- Functions: `function_definition`, `declaration` containing `function_declarator`, pointer declarators containing `function_declarator`.
- Types: `struct_declaration`, `union_declaration`, `enum_declaration`, `typedef_declaration`.
- Includes and file context: `preproc_include`, source ranges, byte ranges, return type, parameters, file/header comments.

### Java

- Types: `class_declaration`, `interface_declaration`, `enum_declaration`.
- Methods: `method_declaration`, constructor context, parameters, return type, modifiers, visibility.
- Relationships recorded as symbol metadata only: imports, JavaDoc, `extends`, `implements`.

### JavaScript, TypeScript, TSX

- Functions: `function_declaration`, `method_definition`, named `arrow_function` through `variable_declarator`, class-field arrow functions.
- Metadata: imports, parameters, source ranges, return type when available.

## High-confidence conditions

- Parser initialized for the surveyed language.
- File is inside selected source scope and outside generated/vendor/test skip rules unless explicitly included.
- Extracted symbol has a source anchor, name, type, and line/range.
- Handoff only marks `structure`/`symbols` ready after coverage counts and named gaps are written.

## Fallback and refusal conditions

- Refuse graph, SQL, risk, spec, export, and glossary-only requests.
- Downgrade to reduced coverage when parser initialization fails or a language pack is missing.
- Route unsupported constructs to `other` or incomplete handoff with a named missing capability.
- Do not infer calls, CRUD intent, security findings, or business semantics from inventory evidence.

## Generated program requirements

- Generate under `.retrospec/generated/retro/code-inventory/`.
- `generation-contract.json` must include surveyed languages, selected parser handlers, skipped handlers, fallback cases, expected writes, coverage thresholds, and missing capabilities.
- Contract entries must use the canonical Phase 7 fields: `parser_backend`, `evidence_label`, fallback `reason`, fallback `missing_capability`, and `handoff.status`.
- `job.json` must keep `actor: "retro"`, `capability: "code-inventory"`, and every write path under `.retrospec/`.
- Send `generation-contract.json`, `job.json`, and `run.ts` to Appraiser before Excavator submission.

## Validation loop requirements

- Minimum fixture pack: `templates/fixtures/code-inventory/c-cpp-java-symbols/expected-evidence.json` for C/C++/Java file and symbol evidence.
- Select samples that cover the surveyed language mix, include/exclude policy, and requested `structure`/`symbols` categories.
- Expected evidence must be agent-authored from source samples: file rows, symbol names, kinds, signatures, source ranges when available, and skipped-path reasons.
- Compare generated results before Appraiser and classify gaps only as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
- Fix `bug` gaps before approval; record unsupported parser/language cases as reduced coverage or incomplete handoff.
- Write `validation-report.json` and queue repeated reference-missing inventory cases in `reference-candidates.jsonl`; do not auto-merge candidates into this reference pack.
