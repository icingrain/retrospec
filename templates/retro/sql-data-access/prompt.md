# sql-data-access prompt skeleton

## Inputs

- `project_path`: absolute project root selected by retro.
- `category`: `sql`.
- `ready_handoffs`: Curator-confirmed source inventory.
- `glossary_context`: optional table, column, and term dictionaries.
- `run_id`: daemon job/run identifier.
- `survey`: Surveyor language/framework summary used to select SQL handlers.
- `status_evidence`: `/analysis/status` summary checked before generation.
- `reference_pack`: `skills/sql-data-access/references/parser-strategy.md`.
- `proc_example_pack`: `skills/sql-data-access/references/proc-dynamic-sql-examples.md` when Pro*C/embedded SQL is detected.

## Expected writes

- `.retrospec/retro/sql.db`
- `.retrospec/registry.db` table/query entities and handoff status

## Planning checklist

1. Check `/analysis/status` before SQL extraction.
2. Extract embedded SQL, JDBC, MyBatis, JPA, and Pro*C only where supported.
3. Do not fabricate CRUD intent from table-like tokens.
4. Preserve glossary matches as references, not source mutations.
5. Name missing capabilities such as `stored-procedure-resolution`, `orm-mapping-resolution`, or `dynamic-sql-resolution`.
6. For Pro*C, select or skip the example-pack cases for PREPARE, EXECUTE IMMEDIATE, cursor buffers, `sprintf`/`snprintf`/`strcpy`/`strcat`, struct member buffers, offset-chain `COMMIT;` splitting, Oracle `DELETE <table>`, and unsupported runtime construction.

## Generated program contract

1. Generate `generation-contract.json`, `job.json`, and `run.ts` under `.retrospec/generated/retro/sql-data-access/`.
2. Record selected JDBC/JPA/MyBatis/Hibernate/Pro*C handlers, skipped framework cases, dynamic SQL/ORM/XML/host-variable fallbacks, expected writes, glossary policy, survey inputs, and status evidence in `generation-contract.json`.
3. Record the reference pack path and selected/skipped reference cases in `generation-contract.json`.
   - If Pro*C is in scope, also record `proc_example_pack`, selected/skipped Pro*C example cases, and fixture expectations from `templates/fixtures/sql-data-access/proc-dynamic-sql/`.
4. Keep `job.json.entrypoint` under `.retrospec/generated/` and every write path under `.retrospec/`.
5. Send contract, manifest, and entrypoint to Appraiser before Excavator submission.
6. Run the validation loop, compare source-authored expected SQL/table/CRUD evidence with generated output, and classify gaps as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
7. Write `validation-report.json` and `reference-candidates.jsonl`; fix `bug` gaps before Appraiser and never auto-merge reference candidates into skill references.
8. Send contract, manifest, entrypoint, validation report, and reference candidates to Appraiser before Excavator submission.

## Parser strategy checklist

1. Java/JDBC handlers should cover `executeQuery`, `executeUpdate`, `prepareStatement`, and `createStatement().execute` string literals.
2. JPA handlers should cover `@Query`, `@NamedQuery`, and `@NamedQueries` SQL/JPQL strings.
3. MyBatis handlers should cover XML `<select>`, `<insert>`, `<update>`, and `<delete>` blocks.
4. Hibernate handlers should cover `createQuery` and `createSQLQuery` string literals.
5. Table extraction may use `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, and `DELETE FROM`; CRUD intent must come from explicit SQL verbs.
6. Dynamic SQL, stored procedures, ORM mapping indirection, XML namespace resolution, and Pro*C host-variable SQL require named resolvers or reduced-confidence evidence.
7. Pro*C dynamic SQL handlers must preserve SQL definition line, execution line, parent function or file fallback context, dynamic buffer variable, statement/cursor name, and ambiguity/missing-capability labels.
