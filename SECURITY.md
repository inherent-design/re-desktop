# Security

Report vulnerabilities privately to [mannie@inherent.design](mailto:mannie@inherent.design), the contact listed on the organization's public profile. Include the affected revision or release, operating system, reproduction, impact, and any known mitigation. Do not include credentials or unrelated private data in a public issue.

Security fixes target the maintained source and latest supported release. The project is experimental and has no published release yet. Update and scan automation is being prepared; configuration will be distinguished from observed execution in the development documentation.

## Scope

re:desktop coordinates voluntary desktop access. It does not intercept human input, stop external programs, or grant an agent permission to perform desktop actions. Human pause controls grants; agents must observe their ownership and lease deadlines.

The local IPC boundary assumes the current user's account and runtime credentials are trusted. Protection against hostile processes already acting as that user is outside this cooperative model. Peer names, workspaces, and messages are untrusted data. [Protocol](docs/protocol.md) describes authentication, bounds, and reconnect capabilities.
