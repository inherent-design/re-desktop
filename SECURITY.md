# Security

Report vulnerabilities privately to [mannie@inherent.design](mailto:mannie@inherent.design), the contact listed on the organization's public profile. Include the affected revision or release, operating system, reproduction, impact, and any known mitigation. Do not include credentials or unrelated private data in a public issue.

Security fixes target the maintained source and latest preview. The project is experimental. Renovate opens reviewed dependency/security updates against dev; Trivy scans source, locked dependencies, misconfiguration, and potential secrets in CI and daily. HIGH/CRITICAL findings fail the gate. Reports omit credential matches and source excerpts. Code-scanning reports are uploaded when the repository is public; private execution uses job summaries without enabling paid features. These scans do not establish complete coverage of Electron/Chromium binary vulnerabilities. Native previews are unsigned; release checksums from the same HTTPS origin are not independent publisher signatures.

## Scope

re:desktop coordinates voluntary desktop access. It does not intercept human input, stop external programs, or grant an agent permission to perform desktop actions. Human pause controls grants; agents must observe their ownership and lease deadlines.

The local IPC boundary assumes the current user's account and runtime credentials are trusted. Protection against hostile processes already acting as that user is outside this cooperative model. Peer names, workspaces, and messages are untrusted data. [Protocol](docs/protocol.md) describes authentication, bounds, and reconnect capabilities.
