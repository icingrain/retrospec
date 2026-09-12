# glossary-context import and reconciliation reference

## Package role

This reference pack keeps glossary import rules separate from the loader-facing `SKILL.md` runbook. Use it when Archivist receives glossary CSV/XLSX uploads, dictionary reconciliation requests, or entity glossary match requests.

## Import surface

- Staged source files live under `.retrospec/uploads/`.
- Accepted rows are written to `.retrospec/glossary/glossary.db` with source provenance.
- CSV import is the current concrete import path; XLSX sheet selection remains a named capability boundary unless the runtime confirms support.
- Import requests must include a conflict policy before existing glossary rows are overwritten.

## Dictionary row expectations

- Preserve original table, column, and term strings from the uploaded source.
- Store normalized keys only as lookup aids; do not replace original user-provided values.
- Record rejected rows with a reason such as `missing-required-header`, `empty-dictionary-value`, or `conflict-policy-required`.
- Keep uploaded file provenance attached to imported rows.

## Reconciliation boundary

- Entity glossary matches are references to registry entities, not mutations of source-code entities.
- Unmatched terms and low-confidence matches must remain reviewable output, not silent success.
- Reconciliation can be deferred when registry anchors are absent, stale, or too ambiguous.
- Memory notes carry human interpretation; glossary rows carry dictionary terms. Do not convert one into the other.

## No generated-template rationale

Glossary import does not need a generated analysis template because it is an upload/import workflow, not a source-fit static analyzer. Archivist should use upload staging and the glossary import API surface, then report coverage and unresolved reconciliation items.
