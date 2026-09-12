# Skill fixture dry-run QA

This fixture pack validates the repo-local skill readiness flow before the final readiness gate.

It covers this fixture matrix scope only:

- retro/spec/Archivist happy paths;
- unsupported capability fallback;
- write-boundary refusal;
- missing handoff refusal;
- source-fit generated program paths;
- generated-program validation loop paths;
- static-analysis fixture packs for C/C++/Java inventory, C/Java calls, JVM SQL, Pro*C SQL, and C/C++/Java quality risk;
- reference-candidate recording without automatic promotion.

Run the checker:

```bash
bun run scripts/check-skill-dry-run-fixtures.mjs
```

The checker reads the fixture case matrix, verifies referenced artifacts exist, validates the required case counts, and confirms the generated-program validation-loop artifacts are connected.
