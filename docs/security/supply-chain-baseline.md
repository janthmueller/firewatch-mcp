# Supply-Chain Security Baseline

## Scope

This baseline records the repository state at the start of Firewatch v2 on
2026-08-29. It covers controls visible in the repository and a point-in-time npm
advisory scan. GitHub repository settings such as secret scanning and branch
protection were not audited here.

## Existing Controls

- CI installs the committed lockfile with `npm ci`.
- The lockfile records registry URLs and integrity hashes.
- Direct runtime and development dependencies use exact versions.
- Pull-request checks use the `pull_request` event, not `pull_request_target`.
- The npm publish workflow grants only `contents: read` and `id-token: write`.
- npm publishing uses OIDC trusted publishing and `--provenance`.
- Build, type, format, lint, and test checks run before normal releases.

These controls improve reproducibility and release traceability. They do not by
themselves detect a compromised dependency, malicious lockfile update, or
compromised GitHub Action.

## Current Gaps

- CI, pull-request checks, and release jobs explicitly install with
  `--no-audit`; no advisory threshold gates those workflows.
- No dependency-review workflow rejects vulnerable dependency changes.
- No Dependabot or Renovate configuration is present.
- No CodeQL or equivalent static-analysis workflow is present.
- GitHub Actions use mutable version tags. `browser-actions/setup-firefox@latest`
  is especially broad, and the other actions are not pinned to commit SHAs.
- CI and pull-request workflows do not declare explicit least-privilege job
  permissions.
- Privileged release jobs run `npm ci` and project build scripts while holding
  write or OIDC permissions. A compromised install or build dependency would
  execute inside that privileged boundary.
- No workflow verifies npm registry signatures or package provenance for the
  installed dependency tree.
- No SBOM is generated for release artifacts.

## Advisory Snapshot

The following commands were run against the committed lockfile:

```text
npm audit --audit-level=high --json
npm audit --omit=dev --audit-level=high --json
```

The full dependency tree reported 11 advisories: 5 high, 1 moderate, and 5 low.
The production dependency tree reported:

- 1 high advisory in `fast-uri`, reached through `@modelcontextprotocol/sdk` and
  its Ajv dependency.
- 1 moderate advisory group in `hono`, reached through
  `@modelcontextprotocol/sdk`.

The npm report states that fixes are available for both production findings.
This is a point-in-time result and must be rerun after every lockfile update.

## Required Hardening

Before the first v2 beta release:

1. Update the lockfile to remove fixable production advisories and review all
   remaining high-severity development advisories.
2. Add an advisory gate for production dependencies and a documented policy for
   development-only findings.
3. Add dependency review for pull requests and automated dependency updates.
4. Pin every GitHub Action to a reviewed full commit SHA and remove `@latest`.
5. Declare explicit least-privilege permissions for every workflow and job.
6. Separate unprivileged build and test work from jobs holding release, write,
   or OIDC permissions. Privileged jobs should consume reviewed artifacts.
7. Add CodeQL for JavaScript/TypeScript and verify repository secret-scanning
   settings.
8. Evaluate npm signature verification and release SBOM generation.

`npm audit` is only one signal. The layered controls above are needed because an
unknown or newly compromised package will not necessarily have an advisory.
