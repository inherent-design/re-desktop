# Publishing a preview

[Distribution](distribution.md) owns the artifact, API, cache, and trust contracts. This procedure publishes an intentionally selected source revision. Only unsigned previews are configured; stable signed delivery needs separate implementation and qualification.

## Prepare the source

Make substantial changes on dev. Update the host and bootstrap product versions together in both `package.json` files and lockfiles. Use a new `0.x.y-preview.n` identity; never change bytes under a published version. Update independent agent/host/shared API declarations in [`api.json`](../api.json) only when those contracts change.

Run `npm run check`, `npm run proof:kernel`, and the affected native/package checks. Review the diff, commit, and push only with authorization. Require the complete Build and qualify workflow on dev, then promote the qualified source to main and observe its CI. The release preflight requires a successful dev/main branch run for the exact tagged source. If a documentation-only change skipped automatic CI, dispatch that workflow explicitly before tagging it.

## Publish

An authorized maintainer creates and pushes the exact release tag:

```sh
git tag v0.2.0-preview.1
git push origin v0.2.0-preview.1
gh run list --workflow release.yml
```

The tag must match both product versions. `.github/workflows/release.yml` rejects a branch dispatch, an unqualified source, or a stable version. It repeats security/proof/native checks, compiles the Bend core once, and uploads qualified native archives directly to a draft GitHub Release. After all three targets succeed, it downloads and verifies the complete inventory, attaches the bootstrap npm tarball, uploads `release.json` last, publishes the GitHub preview, and publishes npm with the `preview` dist-tag.

The repository can remain private for a preview, requiring recipient gh reader access. Public source visibility is a separate consequential decision. Make that decision before triggering the release so the workflow's npm provenance policy reflects the actual source visibility. Public delivery must pass an unauthenticated recipient installation.

Incomplete target jobs leave a draft. Diagnose the failed job; do not clobber changed assets or rewrite a tag to get a pass. Identical draft uploads are checked before reuse. If npm fails after GitHub publication, the native release remains complete and the previous npm selection remains intact. Rerun the failed publish job; the npm step accepts an already published version only when its registry integrity matches the verified tarball. Changed bytes require a new version.

## npm credentials

The initial workflow uses the organization Actions secret `NPM_TOKEN`. It must be an npm granular token with package/scope read and write publication access for `@inherent-design` and automation-compatible 2FA settings. Organization-management access is unnecessary. The token is injected as `NODE_AUTH_TOKEN` only in the final npm step; it is never read locally, copied to recipients, or made available to scans/PR jobs. Rotate it before its chosen expiry.

Public-source publication requests npm provenance using the workflow's OIDC permission. That attestation is separate from npm trusted publishing. Trusted publishing is a future credential migration: after the package exists, enroll GitHub Actions for owner `inherent-design`, repository `re-desktop`, workflow `release.yml`, then remove token injection and qualify another publication. Revoke or restrict the bootstrap token only after that path works; an organization-wide secret may serve other repositories.

## Recipient verification

Install the exact published npm version into an owned prefix, run `re-desktop setup`, and use its generated absolute MCP entry. Verify a cold download, warm/offline reuse, discovery, compatibility negotiation, and actual native lifecycle in an isolated profile. On macOS, `scripts/installed-check.mjs --cli /absolute/installed/bin/re-desktop.mjs` exercises native Allow, Pause, Quit refusal, operator restart, bridge teardown, and handoff. `scripts/codex-check.mjs --agent-suite --entry /absolute/installed/bin/re-desktop.mjs --entry-arg mcp` tests the installed entry through real Codex threads and model scenarios. Neither command edits global client settings.

Record the release source, run URLs, registry integrity, installed entry, commands, and observed limitations. [Verification](verification.md) distinguishes executed coverage from configured gates. Signing/notarization, additional architectures, physical Linux desktop usability, and automatic channels need their own evidence.
