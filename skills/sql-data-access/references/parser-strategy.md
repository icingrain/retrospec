# sql-data-access parser reference pack

## Parser strategy references

- JDBC patterns: `executeQuery`, `executeUpdate`, `prepareStatement`, `createStatement().execute`.
- JPA patterns: `@Query`, `@NamedQuery`, `@NamedQueries`.
- MyBatis XML tags: `<select>`, `<insert>`, `<update>`, `<delete>`.
- Hibernate patterns: `createQuery`, `createSQLQuery`.
- Table extraction: `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM`.
- Column extraction: `SELECT ... FROM` with validation.
- XSQL/reflection evidence may provide links from Java/C# calls to mapper/query identifiers, but only when a generated resolver is selected.
- Pro*C dynamic SQL cases: `sprintf`, multiline `sprintf`, `snprintf`, `strcpy`, `strcat`, struct member buffers, offset-chain `sprintf`, `memset` block boundaries, `PREPARE`, `EXECUTE IMMEDIATE`, and cursor declaration from host variables.
- Pro*C context cases: C/K&R function context, host variables, `EXEC SQL` directives, cursor/open/fetch/close statements, and file/function fallback context.
- `skills/sql-data-access/references/proc-dynamic-sql-examples.md`
  - Source-backed example pack for Pro*C dynamic SQL construction, expected evidence, fixture paths, and unsupported runtime-construction cases.

## Survey-fit selection rules

- Use this pack after source inventory is ready, Surveyor identifies languages/frameworks, and `/analysis/status` confirms SQL analysis prerequisites.
- Generate only for requested `sql` category.
- Select handlers by observed framework evidence: JDBC, JPA, MyBatis XML, Hibernate, Pro*C host SQL, XSQL/reflection mapping.
- Prefer framework/XML/SQL parser libraries over regex/text slicing when they can produce source-anchored evidence. If a needed parser is missing and package installation is allowed, attempt the minimal install and record version, load result, or failure before selecting fallback.
- Dynamic SQL, concatenation, ORM indirection, stored procedures, XML namespace resolution, and host variables require explicit generated resolvers.
- For Pro*C dynamic SQL, read `proc-dynamic-sql-examples.md` before choosing support/fallback. It fixes the minimum source-backed examples for PREPARE, EXECUTE IMMEDIATE, cursor buffers, struct member buffers, offset-chain splitting, Oracle DELETE without `FROM`, and unsupported runtime construction.

## Extraction targets

### Java and JVM data access

- JDBC string literals passed to `executeQuery`, `executeUpdate`, `prepareStatement`, or `createStatement().execute`.
- JPA/JPQL annotation strings in `@Query`, `@NamedQuery`, and `@NamedQueries`.
- Hibernate query strings from `createQuery` and `createSQLQuery`.

### Mapper and XML data access

- MyBatis XML `<select>`, `<insert>`, `<update>`, and `<delete>` blocks.
- Preserve namespace/query id linkage separately from SQL text.
- If XML cannot map back to a source method/entity, record the SQL evidence with ambiguous linkage.

### Table, column, and CRUD evidence

- Table references come only from explicit SQL clauses: `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM`.
- CRUD intent comes only from explicit SQL verbs.
- Column extraction is allowed only when statement shape supports it and column names can be normalized/validated.

### Pro*C dynamic SQL evidence

- Restore SQL buffers from `sprintf`, multiline `sprintf`, `snprintf`, `strcpy`, and ordered `strcat` calls only when the generated resolver can preserve assignment order.
- Resolve `EXEC SQL PREPARE <stmt> FROM :<buffer>`, `EXEC SQL EXECUTE IMMEDIATE :<buffer>`, and `EXEC SQL DECLARE <cursor> CURSOR FOR|FROM :<buffer>` against the closest prior SQL buffer assignment.
- Preserve source metadata: source file, line, function or `<global_file>` context, dynamic SQL variable, statement/cursor name, SQL definition line, and whether linkage is conditional or ambiguous.
- Treat struct member buffers such as `ptr->arr`, `dynstmt.arr`, and casted `(char *)ptr->arr` as explicit cases; if the host variable/member cannot be tied to `EXEC SQL`, keep linkage `AMBIGUOUS`.
- Split offset-chain SQL assembled by `j = sprintf(BUF, ...)` and `j += sprintf(BUF+j, ...)` around meaningful DML chunks; `COMMIT` or session settings alone are not CRUD evidence.
- Support Oracle `DELETE <table> WHERE ...` as DELETE table evidence alongside standard `DELETE FROM <table>`.
- Record runtime table names, macro-built SQL, loop-built SQL, function-argument SQL, and unresolved pointer arithmetic as missing capabilities unless the generated resolver validates concrete values for the current run.

## High-confidence conditions

- SQL text contains a recognized SQL keyword and has sufficient length/content to be query evidence.
- Source file, source line, extraction style, and method/query identifier are recorded when available.
- Table/CRUD evidence is derived from explicit SQL grammar cues, not table-like tokens.
- Glossary/table matches are references only and do not mutate glossary rows.

## Fallback and refusal conditions

- Refuse non-SQL requests or SQL analysis without ready source inventory.
- Mark dynamic SQL, stored procedures, ORM mapping gaps, XML namespace gaps, and Pro*C host-variable gaps as reduced-confidence or missing-capability evidence unless a resolver is generated.
- Regex/text fallback must record parser dependency preflight evidence: unavailable parser, install command/version or failure, load error, or explicit no-install policy reason.
- Mark Pro*C runtime table-name construction, conditional branch-dependent SQL shape, cross-function SQL buffer flow, macro SQL construction, and unresolved struct/pointer member flow as reduced-confidence or missing-capability evidence unless a generated resolver proves the current run.
- Do not fabricate CRUD intent, source-method linkage, or glossary-normalized table identity.
- Keep ambiguous query-to-entity links as `AMBIGUOUS` or incomplete handoff.

## Generated program requirements

- Generate under `.retrospec/generated/retro/sql-data-access/`.
- `generation-contract.json` must include selected framework handlers, skipped framework cases, parser dependency preflight evidence when fallback is used, dynamic/ORM/XML/host-variable fallback decisions, table/column extraction policy, glossary reference policy, expected writes, and missing capabilities.
- Contract entries must use the canonical Phase 7 fields: `parser_backend`, `evidence_label`, fallback `reason`, fallback `missing_capability`, and `handoff.status`.
- For Pro*C projects, `generation-contract.json` must also list selected/skipped cases from `proc-dynamic-sql-examples.md` and fixture expectations from `templates/fixtures/sql-data-access/proc-dynamic-sql/`.
- `job.json` must keep `actor: "retro"`, `category: "sql"`, and write paths under `.retrospec/`.
- Appraiser must approve SQL evidence confidence, glossary boundary, and daemon write boundaries before Excavator submission.

## Validation loop requirements

- Minimum fixture packs: `templates/fixtures/sql-data-access/jvm-data-access/expected-evidence.json` for JDBC/MyBatis/JPA/Hibernate and `templates/fixtures/sql-data-access/proc-dynamic-sql/expected-evidence.json` for Pro*C.
- Select samples that cover the detected SQL styles: JDBC/JPA/MyBatis/Hibernate, Pro*C static SQL, Pro*C dynamic SQL example-pack cases, and explicit fallback cases.
- Expected evidence must be agent-authored from source samples: SQL text, source anchors, query type, table/column evidence, host params, dynamic buffer metadata, and ambiguous linkage notes.
- Compare generated SQL rows before Appraiser and classify gaps only as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
- Fix `bug` gaps before approval; preserve dynamic SQL, ORM/XML namespace, Pro*C host-variable, runtime table-name, or glossary-linkage gaps as reduced coverage or incomplete handoff.
- Write `validation-report.json` and queue repeated reference-missing SQL/data-access cases in `reference-candidates.jsonl`; do not auto-merge candidates into this reference pack.
