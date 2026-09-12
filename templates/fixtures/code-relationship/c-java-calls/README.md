# code-relationship C and Java call fixture

This pack fixes the minimum expected call-edge evidence for generated `code-relationship` programs that claim high-confidence C and Java call graph coverage.

Expected coverage:

- C direct calls anchored to `call_expression` nodes;
- recursive C calls and unresolved macro/function-pointer calls kept separate;
- Java method invocations, constructor invocations, `this`/`super` calls, and method references;
- interface dispatch, reflection, and framework indirection preserved as `AMBIGUOUS` unless an explicit resolver is selected.
