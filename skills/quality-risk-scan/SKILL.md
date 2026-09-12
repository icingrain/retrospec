---
name: quality-risk-scan
owner_agent: retro
categories: [complexity, security]
origin: core
trigger_examples: [complexity, hotspot, security-pattern candidate, hardcoded secret, unsafe call, risky API usage]
template_path: templates/retro/quality-risk-scan/
expected_writes: [.retrospec/retro/complexity.db, .retrospec/retro/security.db, .retrospec/registry.db]
refusal_boundary: Refuse confirmed vulnerability, exploitability, business-risk, taint-proof, or interprocedural-proof claims.
requires_generation_contract: true
promoted_from: null
created_by: shipped
---

# quality-risk-scan Skill

## Purpose

Detect static quality and security risk candidates for retro and downstream spec work.

## Categories

- `complexity`
- `security`

## Primary outputs

- `.retrospec/retro/complexity.db`
- `.retrospec/retro/security.db`
- `registry.db.workflow_handoff` rows for completed quality/risk categories

## Capabilities

- Compute complexity and hotspot candidates from source and symbol evidence.
- Detect security-pattern candidates such as hardcoded secret, unsafe call, and risky API usage when supported.
- Label results as static-analysis candidates until spec or human review confirms business impact.
- Preserve source location, entity id, confidence, and missing-capability context.

## Parser strategy

- Before generating or reviewing a quality/risk program, read `skills/quality-risk-scan/references/parser-strategy.md` as the detailed parser strategy reference pack for this skill.
- Treat parser strategy cases as the reference library for quality metrics.
- Prefer AST/parser-backed complexity, cognitive-complexity, and source-anchor extraction over regex/pattern-only scans. If a required parser/runtime/language pack is missing and package installation is allowed, attempt the minimal install before fallback and record installed version or failure evidence.
- File complexity starts at 1 and increments on branch/loop/exception/conditional nodes such as `if_statement`, `for_statement`, `while_statement`, `switch_statement`, `catch_clause`, and `conditional_expression`.
- Function complexity must prefer function body nodes: C/C++ `compound_statement`, Java `block`, C# `method_body`, and JavaScript/TypeScript `statement_block`.
- Per-function complexity increments for conditionals, loops, switch/case, exception nodes, calls, lambda/arrow/function expressions, `break`, and `continue`; `case`, `break`, and `continue` are lower-weight increments.
- Cognitive complexity tracks nesting for conditionals, loops, switch/case, try/catch/finally, enhanced-for, lambda/arrow/function expressions, method/function declarations, and conditional expressions, plus flat penalties for jump/throw/return nodes and logical operator nodes.
- Security-pattern scans may use pattern detectors only as candidate evidence. They must not imply taint, exploitability, or interprocedural proof unless the generated program contains that resolver.
- Parser or AST gaps for a language downgrade complexity/security coverage only after parser availability and install/load preflight fails or is forbidden, and must name `language-specific-complexity-parser`, `taint-analysis`, or `interprocedural-security-scan` as applicable.

## Generated program contract

- Generate `.retrospec/generated/retro/quality-risk-scan/generation-contract.json`, `job.json`, and `run.ts` only after source inventory readiness, Surveyor output, and `/analysis/status` evidence are available.
- The contract must record requested `complexity`/`security` categories, enabled checks, selected complexity/cognitive-complexity handlers, selected security-pattern detectors, skipped checks, fallback cases, expected writes, and missing capabilities.
- The contract must include a validation loop: source-backed complexity/security samples, agent-authored expected metrics/candidate evidence, generated result comparison, `bug`/`unsupported`/`ambiguous`/`reference-missing` gap classification, `validation-report.json`, and `reference-candidates.jsonl` promotion queue.
- Refuse generation when the request expects confirmed vulnerability, exploitability, business risk, taint proof, or interprocedural proof that this skill cannot support.
- If AST function bodies are unavailable, the contract must predeclare reduced-confidence file-level metrics or incomplete handoff behavior.
- Fix validation `bug` gaps before Appraiser; keep unsupported or ambiguous risk evidence as candidate/reduced coverage or incomplete handoff.
- Send the generated files to Appraiser; do not submit the manifest to Excavator until Appraiser approves contract, manifest, entrypoint, validation report, and write boundaries together.

## Runbook

### Inputs

- `skills/quality-risk-scan/references/parser-strategy.md` for detailed parser/generator criteria.
- Curator-confirmed structure/symbol handoff and requested `complexity` and/or `security` categories.
- Source locations, symbol entities, relationship evidence when available, and prior coverage gaps.
- Enabled risk checks and project skip rules.
- Surveyor language/path summary and `/analysis/status` evidence for generated-program planning.

### Steps

1. Check `/analysis/status`; continue only when prerequisite inventory is ready and the requested risk category is available.
2. Select AST-backed complexity/cognitive-complexity strategy for supported languages, install/load parser libraries when missing and allowed, and name fallback when only file-level or regex/pattern evidence remains available.
3. Run complexity checks over supported files/functions and attach hotspot candidates to registry entities where possible.
4. Run security-pattern checks over supported files and preserve exact source locations for each candidate.
5. Label findings as candidates with confidence, check id, evidence category, parser strategy, and missing-capability context.
6. Downgrade or withhold findings when the evidence requires unsupported taint, interprocedural, framework, or language-specific analysis.
7. Write category handoff only after coverage and disabled-check summaries are recorded.
8. Validate generated quality/risk evidence against selected source-backed samples and write `validation-report.json` before Appraiser review.

### Outputs

- `.retrospec/retro/complexity.db` and/or `.retrospec/retro/security.db`.
- Candidate findings linked to files/entities with source location, confidence, check id, and review wording.
- `workflow_handoff` rows for completed quality/risk categories.
- Coverage summary with scanned languages, skipped paths, enabled/disabled checks, unsupported constructs, and missing capabilities.
- `.retrospec/generated/retro/quality-risk-scan/validation-report.json` and optional `reference-candidates.jsonl` for repeated reference-missing quality/risk cases.

### Failure handling

- If a check cannot distinguish a real issue from an unsupported pattern, record a gap instead of a finding.
- If coverage is too low for a category, mark the handoff incomplete to prevent misleading downstream summaries.
- If a finding lacks a usable source anchor, keep it out of reportable outputs until the anchor can be resolved.
- If AST function bodies are unavailable, report only reduced-confidence file-level complexity or mark the category incomplete when hotspots would be misleading.

### Handoff boundaries

- This skill produces static-analysis candidates, not confirmed vulnerabilities or business risks.
- Spec or human review confirms severity, priority, exploitability, and migration impact.
- Archivist must export candidate wording and missing-capability context rather than overstating certainty.

## Coverage reporting

- Report scanned languages, skipped paths, enabled checks, disabled checks, and unsupported constructs.
- Name missing capabilities such as `taint-analysis`, `interprocedural-security-scan`, or `language-specific-complexity-parser`.

## Fallback

- Route unsupported risk patterns to `other` fallback with the missing capability named.
- Do not upgrade pattern matches to confirmed vulnerabilities without review.
- Mark handoff incomplete when coverage gaps make a risk category misleading.

## Manual QA

1. Ask retro for security or complexity analysis and confirm it selects `quality-risk-scan` after `/analysis/status`.
2. Seed unsupported language files and confirm coverage gaps name the missing parser/check capability.
3. Confirm findings are described as candidates, not confirmed vulnerabilities.
