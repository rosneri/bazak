# Working agreements

- Keep functions at 50 lines or fewer and source files at 400 lines or fewer, including comments and blank lines. Name each extracted function for the operation or decision it owns.
- Organize code by domain. Keep business rules pure and put external I/O behind narrow interfaces.
- Define data once with executable schemas. Validate at boundaries and enforce invariants when creating or changing a model.
- Use `.describe(...)` to explain the meaning of every Zod schema and every field, including nested, optional, and composed fields. Apply the description to the final schema instance after wrapping or composition.
- Let models interpret intent. Let application code choose permitted operations and verify their results.
- Reuse shared UI primitives and keep rendering decisions in the presentation layer.
- Verify the user journey end to end, including failures, retries, and recovery. Record the trade-offs you can defend.
