# Language capability matrix

Agents use this matrix before generated static-analysis work. It makes language confidence visible before analysis so agents do not imply full coverage for unsupported languages or constructs.

Machine-readable artifact: `templates/generated-program/language-capability-matrix.json`.

## Confidence terms

| Term | Meaning | Evidence handling |
| --- | --- | --- |
| `high-confidence` | The language/category is covered by reference packs or fixtures and can produce source-backed evidence for the named scope. | Prefer `EXTRACTED` when source anchors are directly observed. |
| `best-effort` | The language/category may run with parser libraries installed for this run, generic parsing, regex, or reduced strategies, but coverage is partial. | Prefer parser-backed source anchors when a library can be loaded or minimally installed. Label regex/basic fallback as `INFERRED` unless the generated program validation loop proves extracted evidence for this run. |
| `unsupported` | The language/category has no safe resolver in the current matrix. | Do not fabricate output; route to `other.db`. |

## High-confidence languages

| Language | High-confidence basis | Primary skills |
| --- | --- | --- |
| C | Tree-sitter/parser strategy and static-analysis reference packs. | `code-inventory`, `code-relationship`, `quality-risk-scan` |
| C++ | Tree-sitter/parser strategy and static-analysis reference packs. | `code-inventory`, `code-relationship`, `quality-risk-scan` |
| Java | Parser, call graph, SQL/data-access, and complexity reference coverage. | `code-inventory`, `code-relationship`, `sql-data-access`, `quality-risk-scan` |
| Pro*C | `sql-data-access` Pro*C/embedded SQL example pack including dynamic SQL and unsupported runtime construction cases. | `sql-data-access`, `code-inventory` |

## Best-effort baseline

Languages outside C, C++, Java, and Pro*C start as `best-effort` only for categories explicitly marked in `templates/generated-program/language-capability-matrix.json`. Current baseline examples:

- TypeScript: `structure`, `symbols`, and `complexity` are `best-effort`; graph, SQL, data-flow, and security categories are `unsupported`.
- Python: `structure`, `symbols`, and `complexity` are `best-effort`; graph, SQL, data-flow, and security categories are `unsupported`.

Unsupported categories must be named as missing capabilities and recorded in `.retrospec/retro/other.db`. They must not be presented as completed high-confidence analysis.


## Generated program contract

Generated static-analysis programs must copy the relevant matrix entry into `generation-contract.json` under a `language_capability` field before Appraiser review. The entry must include:

- selected language key and display name;
- overall confidence term;
- requested categories and their support levels;
- expected evidence labels: `EXTRACTED`, `INFERRED`, or `AMBIGUOUS`;
- fallback or unsupported category notes;
- parser dependency preflight result, including installed parser version, load/install failure, or no-install policy reason when fallback is used;
- whether a validation loop promoted a best-effort case to supported for this run.

Promotion is run-local only. Repeated `reference-missing` cases still go through `reference-candidates.jsonl` and reviewed promotion; generated programs must not auto-merge them into `skills/*/references/`.
