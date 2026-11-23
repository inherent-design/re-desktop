# Publishing a preview

[Distribution](distribution.md) owns the artifact, API, cache, and trust contracts. This procedure publishes an intentionally selected source revision. Only unsigned previews are configured; stable signed delivery needs separate implementation and qualification.

## Prepare the source

Make substantial changes on dev. Update the host and bootstrap product versions together in both `package.json` files and lockfiles. Use a new `0.x.y-preview.n` identity; never change bytes under a published version. Update independent agent/host/shared API declarations in [`api.json`](../api.json) only when those contracts change.

Run `npm run check` (including Knip), `npm run proof:kernel`, and the affected native/package checks. Heartbeat or client integration changes also need the real warning and lifecycle checks described in [development](development.md), with model inference explicitly opt-in. Review the diff, commit, and push only with authorization. Require the complete Build and qualify workflow on dev, then promote the qualified source to main and observe its CI. Check prior run durations and poll long jobs every 5–15 minutes; the previous preview's roughly 3–4 minute native pipeline supports a five-minute interval. The release preflight requires a successful dev/main branch run for the exact tagged source. If a documentation-only change skipped automatic CI, dispatch that workflow explicitly before tagging it.

## Publish

An authorized maintainer creates and pushes the exact release tag:

```sh
version=$(node -p "require('./package.json').version")
git tag "v$version"
git push origin "v$version"
gh run list --workflow release.yml
```

The tag must match both product versions. `.github/workflows/release.yml` rejects a branch dispatch, an unqualified source, or a stable version. It repeats security and proof checks, compiles the Bend core once, and uses the same native checks as branch CI. The draft job passes its release ID to the qualified native upload jobs. After all three targets succeed, the publish job downloads and verifies the complete inventory, attaches the bootstrap npm tarball, uploads `release.json` last, publishes the GitHub preview, and publishes npm with the `preview` dist-tag.

The repository can remain private for a preview, requiring recipient gh reader access. Public source visibility is a separate consequential decision. Make that decision before triggering the release so the workflow's npm provenance policy reflects the actual source visibility. Public delivery must pass an unauthenticated recipient installation.

Incomplete target jobs leave a draft. Diagnose the failed job; do not clobber changed assets or rewrite a tag to get a pass. Identical draft uploads are checked before reuse. If npm fails after GitHub publication, the native release remains complete and the previous npm selection remains intact. Rerun the failed publish job; the npm step accepts an already published version only when its registry integrity matches the verified tarball. Changed bytes require a new version.

An accepted npm publication can remain unavailable during registry processing. The final gate waits up to 20 minutes for the public package metadata to contain the exact version and verifies its SHA-512 integrity against the attached tarball. Checking only the version-specific endpoint is insufficient: it became available before the package metadata needed by mise. A timeout requires inspection of npm processing before another publication attempt.

## Stage an existing preview

If direct npm publication fails after GitHub publication, dispatch `stage-npm.yml` on main with the exact published preview version. It downloads the attached tarball, checks its digest and package identity against the published release, and sends those bytes to npm under the `preview` dist-tag. The stage step uses the existing `NPM_TOKEN`. A maintainer approves the resulting stage ID with `npm stage approve <stage-id>` or from the npm website after reviewing the staged package. Approval requires the maintainer's 2FA. [npm staged publishing](https://docs.npmjs.com/staged-publishing/)

Recipients can install the GitHub tarball while registry publication is pending. Download the bootstrap attachment named in `release.json`, check it against `npm.sha256`, then run `npm install --global ./<downloaded-bootstrap>.tgz` and `re-desktop setup`.

## npm credentials

The GitHub repository is `inherent-design/re-desktop`. Its npm package is `@inherent.design/re-desktop`. The npm steps use the GitHub organization Actions secret `NPM_TOKEN`. The npm account that issues it needs permission to create or write the package. Grant the token package and scope write access for `@inherent.design`. Staging supports **Read and write (stage only)**, with the maintainer's 2FA challenge at approval. Direct publishing needs **Read and write (publish and stage)** and an npm policy that permits direct token publication. The workflow supplies `NODE_AUTH_TOKEN` only to the npm step. Rotate the token before expiry. [npm access token permissions](https://docs.npmjs.com/about-access-tokens/)

An authenticated credential can still lack the scope grant or npm organization role. Verify both when npm denies publishing. Once scope access is restored, retry the verified staging workflow or publish the attached tarball from an authorized npm session with 2FA.

Public-source publication requests npm provenance using the workflow's OIDC permission. That attestation is separate from npm trusted publishing. Trusted publishing is a future credential migration: after the package exists, enroll GitHub Actions for owner `inherent-design`, repository `re-desktop`, workflow `release.yml`, then remove token injection and qualify another publication. Revoke or restrict the bootstrap token only after that path works; an organization-wide secret may serve other repositories.

## Recipient verification

Install the exact version from the npm registry or the verified GitHub tarball into an owned prefix. Run `re-desktop setup` and use its generated absolute MCP entry. Verify a cold download, warm/offline reuse, discovery, compatibility negotiation, and actual native lifecycle in an isolated profile. On macOS, `scripts/installed-check.mjs --cli /absolute/installed/bin/re-desktop.mjs` exercises native Allow, immediate Pause, Pause after/renewal/cancellation/final Pause, Quit refusal, operator restart, bridge teardown, and handoff. `scripts/codex-check.mjs --agent-suite --entry /absolute/installed/bin/re-desktop.mjs --entry-arg mcp` tests the installed entry through real Codex threads and five model scenarios, including current-holder continuation and waiting-agent refusal during Pause after. Both tools use temporary profiles and their own client configuration.

For Codex integration, run `codex-install` through the installed CLI, inspect hook trust, and reconnect the MCP client. An authorized daemon restart should preserve the managed daemon version; do not replace it with an older PATH CLI. Save a durable checkpoint before restart because the current client connection may end. Afterward verify actual tool calls, common API agreement, heartbeat fields, startup, notices and cleanup; a listed tool count or Codex's `unknown` runtime label alone is insufficient.

Record the release source, run URLs, registry integrity, installed entry, commands, and observed limitations. [Verification](verification.md) distinguishes executed coverage from configured gates. Signing/notarization, additional architectures, physical Linux desktop usability, and automatic channels need their own evidence.
