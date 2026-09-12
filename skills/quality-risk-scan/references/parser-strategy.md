# quality-risk-scan parser reference pack

## Parser strategy references

- File complexity starts at 1 and increments on branch/loop/exception/conditional nodes.
- Function complexity uses body nodes and weighted increments for branches, loops, switch/case, calls, lambdas/arrows, `break`, and `continue`.
- Cognitive complexity tracks nesting plus flat penalties for jump/throw/return and logical operators.
- Relationship evidence may support hotspot context, but confirmed risk impact belongs to spec/human review.

## Survey-fit selection rules

- Use this pack after source inventory is ready and Surveyor reports language/path coverage.
- Generate only requested `complexity` and/or `security` categories.
- Prefer AST-backed file/function complexity for languages with parser support. If the required parser/runtime/language pack is missing and package installation is allowed, attempt the minimal install before fallback and record version, load result, or failure evidence.
- Security scans are static pattern candidates unless the generated program includes a specific resolver for taint, interprocedural flow, framework behavior, or exploitability.

## Extraction targets

### File complexity

- Start at 1.
- Increment on `if_statement`, `for_statement`, `while_statement`, `switch_statement`, `catch_clause`, and `conditional_expression`.
- Include language-specific branch equivalents only when the parser names are known in the generated program.

### Function complexity

- Prefer function body nodes: C/C++ `compound_statement`, Java `block`, C# `method_body`, JavaScript/TypeScript `statement_block`.
- Increment on conditionals, loops, switch/case, exception nodes, calls, lambda/arrow/function expressions, `break`, and `continue`.
- Treat `case`, `break`, and `continue` as lower-weight increments when preserving parser strategy behavior.

### Cognitive complexity

- Track nesting for conditionals, loops, switch/case, try/catch/finally, enhanced-for, lambda/arrow/function expressions, method/function declarations, and conditional expressions.
- Add flat penalties for jump/throw/return nodes and logical operator nodes.

### Security-pattern candidates

- Emit only source-anchored candidate findings with check id, evidence type, confidence, and missing-capability context.
- Do not claim taint, exploitability, data-flow proof, or business impact unless a supported resolver exists and its evidence is recorded.

## High-confidence conditions

- AST parser and function body nodes are available for the target language.
- Finding has source file, line/range, entity id when available, check id, parser strategy, and confidence label.
- Category handoff includes coverage counts and disabled/unsupported checks.

## Fallback and refusal conditions

- Refuse requests for confirmed vulnerabilities, exploitability, severity, business risk, taint proof, or interprocedural proof that this skill cannot support.
- If body nodes are unavailable, report reduced-confidence file-level metrics or mark the category incomplete.
- Regex/basic fallback must record parser dependency preflight evidence: unavailable parser, install command/version or failure, load error, or explicit no-install policy reason.
- Withhold findings that cannot be anchored to source evidence.
- Name missing capabilities such as `language-specific-complexity-parser`, `taint-analysis`, `interprocedural-security-scan`, or `framework-specific-risk-resolver`.

## Generated program requirements

- Generate under `.retrospec/generated/retro/quality-risk-scan/`.
- `generation-contract.json` must include requested categories, enabled checks, selected complexity/cognitive-complexity handlers, selected security pattern detectors, parser dependency preflight evidence when fallback is used, skipped checks, fallback cases, expected writes, and missing capabilities.
- Contract entries must use the canonical Phase 7 fields: `parser_backend`, `evidence_label`, fallback `reason`, fallback `missing_capability`, and `handoff.status`.
- `job.json` must keep `actor: "retro"`, `complexity`/`security` category values, and write paths under `.retrospec/`.
- Appraiser must approve candidate wording, missing-capability handling, source anchors, and daemon write boundaries before Excavator submission.

## Validation loop requirements

- Minimum fixture pack: `templates/fixtures/quality-risk-scan/c-cpp-java-risk/expected-evidence.json` for C/C++/Java complexity and source-anchored risk candidates.
- Select samples that cover requested `complexity` and/or `security` categories, enabled checks, surveyed languages, and known unsupported proof boundaries.
- Expected evidence must be agent-authored from source samples: complexity increments, source anchors, check ids, candidate wording, confidence labels, and withheld finding reasons.
- Compare generated metrics/findings before Appraiser and classify gaps only as `bug`, `unsupported`, `ambiguous`, or `reference-missing`.
- Fix `bug` gaps before approval; preserve unsupported taint, interprocedural, framework, or parser gaps as reduced coverage or incomplete handoff.
- Write `validation-report.json` and queue repeated reference-missing quality/risk cases in `reference-candidates.jsonl`; do not auto-merge candidates into this reference pack.
