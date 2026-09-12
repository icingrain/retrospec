# Pro*C dynamic SQL example pack

This pack is the source-backed example set for `sql-data-access` Pro*C/embedded SQL generation. Use it after `parser-strategy.md` when Surveyor reports Pro*C, `.pc`, `.pcc`, C, or C++ files with `EXEC SQL` evidence.

## Parser strategy references

- `dynamic_sql_patterns`: `sprintf`, multiline `sprintf`, `snprintf`, `strcat`, struct member `strcat`, offset-chain `sprintf`, and `memset` block boundaries.
- `prepare_pattern`: `EXEC SQL PREPARE <stmt> FROM :<buffer>`.
- `declare_cursor_from_var_pattern`: `EXEC SQL DECLARE <cursor> CURSOR FOR|FROM :<buffer>`.
- `execute_immediate_pattern`: `EXEC SQL EXECUTE IMMEDIATE :<buffer>`.
- `_restore_c_string_literal()`: adjacent string literals and backslash continuation.
- `_append_split_sql_queries()`: `sprintf_offset_chain` split by `COMMIT;` and session-setting filtering.
- `_extract_all_table_references()`: Oracle `DELETE <table> WHERE ...` alongside standard `DELETE FROM`.
- Pro*C parser context keeps C function context, `EXEC SQL` directives, host variables, cursor/open/fetch/close statements, and K&R-style function extraction.
- Dynamic SQL extraction covers `sprintf`, multiline `sprintf`, `strcpy`, `strcat`, `snprintf`, `PREPARE`, and `EXECUTE IMMEDIATE`.
- Expected metadata includes `source_type: proc_dynamic`, `dynamic_sql_variable`, `prepare_statement_name`, `sql_definition_line`, `parent_method`, tables, columns, and host parameters.
- Embedded SQL coverage includes `EXEC SQL`, cursor SQL, host variables, CRUD classification, table extraction, and Pro*C dynamic SQL as supported analysis cases.

## Required example coverage

Generated SQL analyzers must represent these cases in their selected/skipped reference cases. If a case is not implemented for the current run, record a named missing capability instead of emitting confident CRUD evidence.

| Case | Source pattern | Expected extraction | Confidence condition |
| --- | --- | --- | --- |
| `prepare_multiline_sprintf` | multiline `sprintf(sqltmp, "DELETE" " FROM ...")` then `EXEC SQL PREPARE stmt FROM :sqltmp` | one `proc_dynamic` DELETE query; table from `FROM`; host params from `:param`; `prepare_statement_name` set | high when assignment precedes PREPARE in same function/file context |
| `execute_immediate_strcpy` | `strcpy(sqltmp, "UPDATE ...")` then `EXEC SQL EXECUTE IMMEDIATE :sqltmp` | one `proc_dynamic` UPDATE query; `dynamic_sql_variable` set; SQL definition line preserved | high when literal is fully restored |
| `declare_cursor_from_buffer` | SQL buffer assigned, then `EXEC SQL DECLARE c CURSOR FOR :sqltmp` or `FROM :sqltmp` | one cursor-backed `proc_dynamic` SELECT query; `cursor_name` set | high when cursor buffer maps to a SELECT |
| `snprintf_select` | `snprintf(buf, sizeof(buf), "SELECT ...")` and PREPARE/DECLARE usage | one SELECT query from buffer | high when first arg normalizes to the SQL buffer |
| `strcat_accumulation` | `strcpy(buf, "SELECT ..."); strcat(buf, " FROM ..."); strcat(buf, " WHERE ...")` | one normalized SELECT query assembled in line order | reduced if nonliteral fragments are missing |
| `struct_member_buffer` | `(char *)dynstmt.arr`, `ptr->arr`, or `holder.sql` receives SQL and EXEC SQL uses host variable/member alias | query maps through struct member or backing host variable | high only when member map is explicit; otherwise `AMBIGUOUS` linkage |
| `offset_chain_commit_split` | `j = sprintf(BUF, ...); j += sprintf(BUF+j, ...);` with `COMMIT;` boundaries | multiple query records split by transaction SQL chunk, not one giant SQL blob | high when `memset(BUF, ...)` separates blocks and chunks contain explicit DML |
| `oracle_delete_without_from` | `DELETE UCX_CUSTOMER WHERE CUSNO = :cusno` inside dynamic or static SQL | DELETE CRUD, table `UCX_CUSTOMER` | high when `DELETE <identifier>` is followed by `WHERE`, `;`, or end |
| `file_or_function_context_fallback` | PREPARE text is not direct DML but file/function name contains CRUD hints | may annotate fallback context only; do not create table/CRUD facts without SQL text | inferred/reduced confidence only |
| `unsupported_runtime_construction` | SQL text built through loops, conditionals, macros, pointer arithmetic, function args, or runtime table names | no confident query; write `dynamic-sql-resolution` or a more specific missing capability | unsupported unless generated resolver validates the concrete run |

## Example snippets

### PREPARE from multiline `sprintf`

```c
void delete_customer(void) {
    char sqltmp251[1024];

    sprintf(sqltmp251,
        "DELETE        \n"
        " FROM UCX_HALD_AAA     \n"
        " WHERE CUSNO = :cusno   \n"
    );

    EXEC SQL PREPARE stmt2 FROM :sqltmp251;
    EXEC SQL EXECUTE stmt2 USING :cusno_val;
}
```

Expected evidence:

- `source_type`: `proc_dynamic`
- `query_type`: `DELETE`
- `sql_text`: `DELETE FROM UCX_HALD_AAA WHERE CUSNO = :cusno`
- `tables`: `UCX_HALD_AAA`
- `sql_params`: `:cusno`
- `config_data.dynamic_sql_variable`: `sqltmp251`
- `config_data.prepare_statement_name`: `stmt2`

### EXECUTE IMMEDIATE from `strcpy`

```c
void activate_customer(void) {
    char sqltmp251[1024];

    strcpy(sqltmp251,
        "UPDATE UCX_STATUS SET STATUS = 'ACTIVE' WHERE CUSNO = :cusno");

    EXEC SQL EXECUTE IMMEDIATE :sqltmp251;
}
```

Expected evidence: `UPDATE`, table `UCX_STATUS`, param `:cusno`, dynamic variable `sqltmp251`, query identifier tied to the `EXECUTE IMMEDIATE` line.

### Cursor declared from a dynamic buffer

```c
void open_active_cursor(void) {
    char sqlbuf[1024];

    snprintf(sqlbuf, sizeof(sqlbuf),
        "SELECT CUSNO, STATUS FROM UCX_STATUS WHERE STATUS = :status");

    EXEC SQL DECLARE active_cur CURSOR FOR :sqlbuf;
    EXEC SQL OPEN active_cur USING :status_val;
}
```

Expected evidence: `SELECT`, table `UCX_STATUS`, columns `CUSNO` and `STATUS` when column extraction is selected, cursor metadata `cursor_name: active_cur`.

### Struct member buffer and adjacent literals

```c
typedef struct {
    char arr[2048];
} dynstmt_t;

void insert_audit(dynstmt_t *ptr) {
    strcpy((char *)ptr->arr,
        "INSERT INTO UCX_AUDIT "
        "(CUSNO, EVENT_CD) "
        "VALUES (:cusno, :event_cd)");

    EXEC SQL PREPARE audit_stmt FROM :ptr;
}
```

Expected evidence: generated resolver must either map `ptr->arr` to the host variable/member used by `EXEC SQL`, or mark query-to-host linkage `AMBIGUOUS`. Do not silently drop the member path.

### Offset-chain SQL split by `COMMIT;`

```c
void rebuild_status(void) {
    char BUF[4096];
    int j;

    memset(BUF, 0x00, sizeof(BUF));
    j = sprintf(BUF, "DELETE UCX_CUSTOMER WHERE CUSNO = :cusno; COMMIT;");
    j += sprintf(BUF+j, "UPDATE UCX_STATUS SET STATUS = 'R' WHERE CUSNO = :cusno; COMMIT;");

    EXEC SQL PREPARE rebuild_stmt FROM :BUF;
}
```

Expected evidence: two DML query records rather than one concatenated record: DELETE table `UCX_CUSTOMER`, UPDATE table `UCX_STATUS`. `COMMIT` alone is not a CRUD row.

### Unsupported runtime construction

```c
void unsupported_runtime_table(const char *table_name) {
    char sqlbuf[1024];

    strcpy(sqlbuf, "SELECT * FROM ");
    strcat(sqlbuf, table_name);

    EXEC SQL PREPARE runtime_stmt FROM :sqlbuf;
}
```

Expected evidence: keep as `dynamic-sql-resolution` or `runtime-table-name-resolution` missing capability unless the generated resolver validates `table_name` values for this run. Do not emit a fabricated table name.

## Fixture pack

The companion fixture directory is `templates/fixtures/sql-data-access/proc-dynamic-sql/`.

- `dynamic_sql_cases.pc` contains positive extraction examples for PREPARE, EXECUTE IMMEDIATE, cursor buffers, struct member buffers, offset-chain splitting, and Oracle DELETE without `FROM`.
- `unsupported_runtime_construction.pc` contains examples that must remain fallback or reduced-confidence unless a generated resolver proves the runtime value.
- `expected-evidence.json` records the expected query identifiers, SQL text, CRUD/table evidence, confidence notes, and missing capabilities.

Generated analyzers may use these fixtures as dry-run samples, but project-specific cases must go to `reference-candidates.jsonl` first. Do not auto-merge one-off project cases into this reference pack.
