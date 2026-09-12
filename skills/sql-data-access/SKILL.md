---
name: sql-data-access
owner_agent: retro
categories: [sql]
origin: core
trigger_examples: [embedded SQL, JDBC, MyBatis, JPA, Pro*C SQL, table references, CRUD matrix]
template_path: templates/retro/sql-data-access/
expected_writes: [.retrospec/retro/sql.db, .retrospec/registry.db]
refusal_boundary: Refuse non-SQL requests and do not infer CRUD intent from table-like tokens.
requires_generation_contract: true
promoted_from: null
created_by: shipped
---

# sql-data-access Skill

## Purpose

Extract SQL and data-access relationships for retro and downstream spec/report work.

## Categories

- `sql`

## Primary outputs

- `.retrospec/retro/sql.db`
- `registry.db` table/query entities and glossary match references
- `registry.db.workflow_handoff` row for `sql`

## Capabilities

- Detect embedded SQL, JDBC, MyBatis, JPA, and Pro*C SQL where supported.
- Normalize table references and CRUD intent when evidence is available.
- Link SQL/table evidence to registry entities without mutating glossary source data.
- Preserve confidence labels for inferred or partial SQL matches.

## Parser strategy

- Before generating or reviewing a SQL/data-access program, read `skills/sql-data-access/references/parser-strategy.md` as the detailed parser strategy reference pack for this skill.
- When Pro*C or embedded SQL appears in the source survey, also read `skills/sql-data-access/references/proc-dynamic-sql-examples.md` before selecting support or fallback.
- Treat parser strategy cases as the reference library for SQL/data-access extraction.
- Prefer language/framework/XML/SQL parser libraries over regex when they can produce source-anchored SQL evidence. If a needed parser package is missing and package installation is allowed, attempt the minimal install before fallback and record the version or failure evidence.
- For Java, detect JDBC `executeQuery`, `executeUpdate`, `prepareStatement`, and `createStatement().execute` string literals.
- Detect JPA `@Query`, `@NamedQuery`, and `@NamedQueries` annotation SQL/JPQL strings.
- Detect MyBatis XML `<select>`, `<insert>`, `<update>`, and `<delete>` blocks, preserving that XML evidence may not map to a Java method without namespace/mapping context.
- Detect Hibernate `createQuery` and `createSQLQuery` string literals.
- Extract tables from `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, and `DELETE FROM` clauses and derive CRUD intent only from explicit SQL verbs.
- Extract columns only when the statement shape supports it and normalize/validate column names before linking to glossary or registry references.
- Dynamic SQL, concatenated SQL, stored procedures, ORM mapping indirection, XML namespace resolution, and Pro*C host-variable SQL require explicit resolvers; otherwise they remain reduced-confidence or missing-capability evidence.
- Pro*C dynamic SQL support must explicitly select or skip the example-pack cases: `PREPARE`, `EXECUTE IMMEDIATE`, cursor declaration from buffers, `sprintf`/`snprintf`/`strcpy`/`strcat`, struct member buffers, offset-chain `COMMIT;` splitting, Oracle `DELETE <table>`, and unsupported runtime construction.

## Generated program contract

- Generate `.retrospec/generated/retro/sql-data-access/generation-contract.json`, `job.json`, and `run.ts` only after source inventory readiness, Surveyor output, and `/analysis/status` evidence are available.
- The contract must record requested `sql` category, selected JDBC/JPA/MyBatis/Hibernate/Pro*C handlers, skipped framework cases, dynamic SQL/ORM/XML namespace/host-variable fallback decisions, expected writes, and glossary reference policy.
- The contract must include a validation loop: source-backed SQL/data-access samples, agent-authored expected SQL/table/CRUD evidence, generated result comparison, `bug`/`unsupported`/`ambiguous`/`reference-missing` gap classification, `validation-report.json`, and `reference-candidates.jsonl` promotion queue.
- Refuse generation for non-SQL requests or when source inventory is unavailable.
- If a query cannot be mapped back to a source method/entity, the contract must predeclare ambiguous linkage or incomplete handoff behavior.
- Fix validation `bug` gaps before Appraiser; keep unresolved dynamic SQL, ORM, XML, Pro*C, or glossary-linkage gaps as reduced coverage or incomplete handoff.
- Send the generated files to Appraiser; do not submit the manifest to Excavator until Appraiser approves contract, manifest, entrypoint, validation report, and write boundaries together.

## Runbook

### Inputs

- `skills/sql-data-access/references/parser-strategy.md` for detailed parser/generator criteria.
- `skills/sql-data-access/references/proc-dynamic-sql-examples.md` for Pro*C dynamic SQL construction examples and fixture expectations when Pro*C is in scope.
- Curator-confirmed file/symbol inventory and requested `sql` category.
- Source files or extracted snippets containing embedded SQL, ORM mappings, or data-access calls.
- Optional glossary table/column dictionaries and existing registry entities.
- Surveyor language/framework summary and `/analysis/status` evidence for generated-program planning.

### Steps

1. Check `/analysis/status`; continue only when source inventory is ready for SQL analysis.
2. Select supported data-access patterns for the detected languages and frameworks: JDBC, JPA, MyBatis XML, Hibernate, Pro*C SQL, or explicit fallback. Install/load missing parser libraries when allowed before selecting fallback.
   - For Pro*C, record which `proc-dynamic-sql-examples.md` cases are supported for this run and which remain named missing capabilities.
3. Extract SQL text, query identifiers, mapped statements, table references, columns, and CRUD intent when explicit evidence exists.
4. Resolve table/query entities against registry and glossary references without rewriting either source.
5. Store uncertain dynamic SQL, unresolved ORM mappings, XML namespace gaps, host-variable gaps, and partial table matches with reduced confidence.
6. Report unsupported frameworks and missing capabilities before writing the SQL handoff.
7. Validate generated SQL evidence against selected source-backed samples, including Pro*C fixtures when in scope, and write `validation-report.json` before Appraiser review.

### Outputs

- `.retrospec/retro/sql.db` rows for queries, table references, CRUD evidence, and confidence labels.
- Registry references for table/query entities and `entity_glossary_matches` where available.
- `workflow_handoff` row for `sql` when the evidence can support downstream analysis.
- Coverage summary for detected data-access styles, skipped files, unsupported frameworks, unmatched tables, and missing capabilities.
- `.retrospec/generated/retro/sql-data-access/validation-report.json` and optional `reference-candidates.jsonl` for repeated reference-missing SQL/data-access cases.

### Failure handling

- If SQL evidence is only a table-like token, record an uncertainty or skip; do not fabricate CRUD intent.
- If dynamic SQL or ORM resolution is unsupported, name the missing capability and keep the handoff incomplete when needed.
- If glossary data conflicts with source evidence, preserve both as references and surface the conflict for review.
- If XML, annotation, or string-literal extraction cannot map a query back to a source method/entity, preserve the query evidence but mark the linkage `AMBIGUOUS` or incomplete.

### Handoff boundaries

- This skill extracts data-access evidence; it does not define business data models or rewrite glossary terms.
- Spec and report consumers must keep inferred SQL/table links labeled as inferred or review-needed.
- Security implications of SQL usage are passed to `quality-risk-scan`, not concluded here.

## Coverage reporting

- Report supported data-access styles, skipped files, unsupported frameworks, and unmatched table references.
- Name missing capabilities such as `stored-procedure-resolution`, `orm-mapping-resolution`, or `dynamic-sql-resolution`.

## Fallback

- Route unsupported SQL/data-access constructs to `other` fallback with the missing capability named.
- Do not fabricate CRUD intent when only a table-like token is found.
- Mark handoff failed or incomplete when SQL evidence is insufficient for downstream analysis.

## Manual QA

1. Ask retro for SQL analysis and confirm it selects `sql-data-access` after `/analysis/status`.
2. Seed dynamic SQL and confirm output records a missing capability rather than a confident CRUD row.
3. Confirm glossary matches remain references and are not rewritten by this skill.
