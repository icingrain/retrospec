# code-inventory C/C++/Java symbol fixture

This pack fixes the minimum source-authored expected evidence for high-confidence inventory validation.

Use it when a generated `code-inventory` program claims parser-backed coverage for C, C++, or Java. The generated program should compare its extracted file and symbol rows against `expected-evidence.json` before Appraiser approval.

Expected coverage:

- C function definitions, function declarations, structs, enums, and typedefs;
- C++ namespaces, classes, constructors, methods, free functions, and templates as named symbols;
- Java packages, classes, interfaces, enums, constructors, and methods;
- skipped generated/vendor/test paths recorded as explicit skip reasons.
