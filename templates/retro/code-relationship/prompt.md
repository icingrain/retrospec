# code-relationship prompt skeleton

## Inputs

- `project_path`: absolute project root selected by retro.
- `categories`: `call_graph`, `dependency`, and/or `data_flow`.
- `ready_handoffs`: Curator-confirmed `structure` and `symbols` rows.
- `run_id`: daemon job/run identifier.
- `survey`: Surveyor language/path/framework summary used to select relationship handlers.
- `status_evidence`: `/analysis/status` summary checked before generation.
- `reference_pack`: `skills/code-relationship/references/parser-strategy.md`.

## Expected writes

- `.retrospec/retro/call_graph.db`
- `.retrospec/retro/dependency.db`
- `.retrospec/retro/data_flow.db`
- `.retrospec/registry.db` handoff/category status rows

## Planning checklist

1. Check `/analysis/status` before graph extraction or graph DB reads.
2. Keep `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` evidence distinct.
3. Preserve nullable unresolved targets instead of inventing entities.
4. Include impact/community outputs only as evidence projections.
5. Name missing capabilities such as `dynamic-dispatch-resolution`, `macro-expansion`, `framework-route-resolution`, or `data-flow-tracing`.

## Generated program contract

1. Generate `generation-contract.json`, `job.json`, and `run.ts` under `.retrospec/generated/retro/code-relationship/`.
2. Record requested and skipped relationship categories, selected AST handlers, fallback handlers, resolver decisions, unresolved-target policy, expected writes, survey inputs, and status evidence in `generation-contract.json`.
3. Record the reference pack path and selected/skipped reference cases in `generation-contract.json`.
4. Keep `job.json.entrypoint` under `.retrospec/generated/` and every write path under `.retrospec/`.
5. Run the validation loop, compare source-authored expected relationship evidence with generated output, and classify gaps as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
6. Write `validation-report.json` and `reference-candidates.jsonl`; fix `bug` gaps before Appraiser and never auto-merge reference candidates into skill references.
7. Send contract, manifest, entrypoint, validation report, and reference candidates to Appraiser before Excavator submission.

## Parser strategy checklist

1. Prefer AST call extraction over regex fallback for languages with parser context.
2. Java handlers should cover `method_invocation`, constructor invocations, `super`/`this` invocations, and `method_reference`.
3. C/C++/Pro*C handlers should cover `call_expression`, `field_expression`, and `subscript_expression`, while excluding control-flow keywords and standard library noise.
4. C# handlers should cover `invocation_expression`, `object_creation_expression`, and `base_expression`.
5. JavaScript/TypeScript/TSX handlers should cover `call_expression`, `new_expression`, `await`, `this`, `super`, object chains, and class-field arrow-function callers where source context names them.
6. Reflection, dynamic calls, XML/XSQL indirection, framework dispatch, and unresolved interface dispatch must remain `INFERRED`/`AMBIGUOUS` unless a resolver is generated.
