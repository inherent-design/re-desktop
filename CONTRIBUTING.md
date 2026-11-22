# Contributing

Start with [development](docs/development.md) for the pinned toolchain and [documentation](docs/README.md) for the owning contracts. Use `dev` for substantial changes and qualify them before moving to `main`.

## Checks

```sh
npm ci
npm run setup:bend
npm run check
```

Changes to Bend laws or their implementation also require the independent kernel check:

```sh
npm run setup:kernel
npm run proof:kernel
```

Exercise the actual boundary changed: sockets and SDK stdio for transport, native tray behavior for UI, and the packaged MCP entry for distribution. Codex model checks are opt-in and use the configured account; ordinary tests require no credentials or inference. [Verification](docs/verification.md) explains the scope of each check.

## Changes and documentation

Keep changes focused, preserve unrelated work, and retain a reproduction for a corrected defect where practical. Do not duplicate Bend's scheduler in an adapter or weaken a test to obtain a pass. Describe the problem, resulting behavior, executed checks, and material limitations in the pull request.

Use complete, direct prose and one owner for each contract. README owns getting started; reference documents own detailed behavior. Keep proposed or accepted future commands separate from released interfaces. Put run-specific evidence in CI, pull requests, or the task store, rather than adding competing delivery logs to the repository. Never commit credentials, private diagnostics, personal store identifiers, or machine-specific setup.

Contributions are distributed under the project's [Apache-2.0 license](LICENSE). Preserve upstream licenses and [third-party notices](THIRD_PARTY_NOTICES.md).
