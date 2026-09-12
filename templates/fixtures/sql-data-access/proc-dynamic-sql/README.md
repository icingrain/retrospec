# Pro*C dynamic SQL fixture pack

These fixtures support `skills/sql-data-access/references/proc-dynamic-sql-examples.md`.

Use them to validate that a generated `sql-data-access` program can:

- restore multiline and adjacent C string SQL;
- map `PREPARE`, `EXECUTE IMMEDIATE`, and cursor declaration host variables;
- preserve struct member or host-variable ambiguity instead of dropping it;
- split offset-chain SQL by meaningful DML chunks around `COMMIT;`;
- support Oracle `DELETE <table> WHERE ...`;
- classify runtime table-name construction as a missing capability.

The expected surface is documented in `expected-evidence.json`; it is intentionally evidence-shaped rather than a runnable test harness. The generated-program validation loop owns executable comparison.
