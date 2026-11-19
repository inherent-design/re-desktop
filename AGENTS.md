# re:desktop

Own the task end to end. Prefer a focused, reviewable change and preserve unrelated work. Read `docs/README.md`, then the contracts for the affected boundary. Keep personal intents and checkpoints in the host task store or Moment, outside the repository. Keep maintained product specifications in `docs/`, and generated local evidence in ignored `artifacts/`. Do not add personal store identifiers or machine-specific paths to tracked guidance.

This app coordinates voluntary desktop access. It never blocks human input or guarantees another program has stopped. Use “has access”, “waiting for access” and “available” in product language.

Bend owns the access state machine. Do not duplicate its scheduling or lease decisions in the host adapter. Read `bend guide` when learning or changing Bend. Keep important invariants in `LAWS.bend` and their implementations in `PROOF.bend`; run `bend PROOF.bend` before committing. Changes to laws must preserve the product contract and be explained. Use parallel calls only for independent, substantial work; the tiny sequential coordinator has no useful parallel workload.

Use the pinned local toolchain through project scripts. Test the actual running boundary when a change affects transport, lifecycle or native tray behavior. Record what the check exercised; do not equate configured cross-platform CI with observed execution. Keep Markdown prose unwrapped.

Do not push, publish a release, deploy, rewrite history or modify unrelated projects without authorization. Ordinary checks must run without credentials. Avoid logging reconnect capabilities or other secrets.

Use `dev` for substantial rework or big changes, and qualify CI there before returning to `main`. Preserve this branch convention when continuing the project.

Use complete, direct sentences, progressive disclosure, and one owner for each contract. Keep installation and current behavior in README, detailed contracts in reference documents, and accepted future work explicitly separate from implemented commands. Avoid marketing language and historical delivery diaries. Preserve technical identifiers and CLI flags verbatim.
