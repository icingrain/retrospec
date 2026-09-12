# code-relationship parser reference pack

## Parser strategy references

- AST call node map: Java, C, C++, C#, JavaScript, TypeScript, TSX.
- Regex fallback maps and language-specific exclude keywords.
- Java interface/abstract-method handling, reflection patterns, XSQL path resolution, recursive-call detection.
- Symbol/function extraction context used to anchor caller entities.

## Survey-fit selection rules

- Use this pack only after `structure` and `symbols` handoffs are ready and `/analysis/status` confirms they are not failed or stale.
- Generate only the requested relationship categories: `call_graph`, `dependency`, and/or `data_flow`.
- Prefer AST call extraction when parser context exists. If the parser/runtime/language pack is missing and package installation is allowed, attempt the minimal install before fallback. Regex fallback is allowed only after parser load/install fails or policy forbids install, and only as `INFERRED` or `AMBIGUOUS` evidence.
- Generate resolvers only for surveyed frameworks and configured patterns; do not include universal dynamic-dispatch logic by default.

## Extraction targets

### Java

- AST nodes: `method_invocation`, `constructor_invocation`, `super_constructor_invocation`, `explicit_constructor_invocation`, `method_reference`.
- Preserve `this`, `super`, interface methods, abstract methods, recursive calls, reflection calls, and XSQL calls as separate evidence cases.
- Interface and abstract dispatch stays unresolved unless the generated program includes a resolver.

### C, C++, Pro*C-as-C

- AST nodes: `call_expression`, `field_expression`, `subscript_expression`.
- Exclude control-flow keywords and standard-library noise before writing relationship rows.
- Header dependencies may support dependency evidence, but unresolved macro expansion must be named as a gap.

### C#, JavaScript, TypeScript, TSX

- C#: `invocation_expression`, `object_creation_expression`, `base_expression`.
- JavaScript/TypeScript/TSX: `call_expression`, `new_expression`, `await`, `this`, `super`, object chains, nested call expressions, class-field arrow-function callers when source context can name them.

## High-confidence conditions

- Caller entity exists in `registry.db` from ready inventory handoff.
- Callee entity is directly resolved from AST and registry evidence.
- Source line and file path are anchored to the observed call node.
- Confidence labels remain separate: `EXTRACTED`, `INFERRED`, `AMBIGUOUS`.

## Fallback and refusal conditions

- Refuse when inventory handoff is missing, failed, stale, or incomplete.
- Preserve unresolved targets as nullable target ids with `AMBIGUOUS` label.
- Reflection, dynamic dispatch, framework routes, XML/XSQL indirection, macro expansion, and unresolved interface dispatch require explicit generated resolvers; otherwise name the missing capability.
- Regex/basic fallback must record parser dependency preflight evidence: already-unavailable parser, install command/version or failure, load error, or explicit no-install policy reason.
- Do not promote community candidates to confirmed EPICs or business domains.

## Generated program requirements

- Generate under `.retrospec/generated/retro/code-relationship/`.
- `generation-contract.json` must include requested relationship categories, selected AST handlers, parser dependency preflight evidence when fallback is used, fallback handlers, resolver decisions, unresolved-target policy, expected writes, and missing capabilities.
- Contract entries must use the canonical Phase 7 fields: `parser_backend`, `evidence_label`, fallback `reason`, fallback `missing_capability`, and `handoff.status`.
- `job.json` must keep `actor: "retro"`, relationship capability/category values, and every write path under `.retrospec/`.
- Appraiser must approve confidence handling, unresolved-target handling, and daemon write boundaries before Excavator submission.

## Validation loop requirements

- Minimum fixture pack: `templates/fixtures/code-relationship/c-java-calls/expected-evidence.json` for C and Java call-edge evidence.
- Select samples that cover requested `call_graph`, `dependency`, and/or `data_flow` categories plus the surveyed language dispatch patterns.
- Expected evidence must be agent-authored from source samples: caller/callee or dependency anchors, confidence labels, unresolved target policy, and duplicate-counting expectations.
- Compare generated relationship rows/projections before Appraiser and classify gaps only as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
- Fix `bug` gaps before approval; preserve unresolved dispatch, reflection, framework, XML/XSQL, or data-flow gaps as `INFERRED`, `AMBIGUOUS`, unsupported, or incomplete handoff.
- Write `validation-report.json` and queue repeated reference-missing relationship cases in `reference-candidates.jsonl`; do not auto-merge candidates into this reference pack.
