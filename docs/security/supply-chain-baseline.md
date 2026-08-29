# Supply-Chain Security

## Scope

This document records the repository controls and point-in-time npm advisory
results for Firewatch v2 as of 2026-08-29. GitHub repository settings such as
branch protection, secret scanning, trusted-publisher configuration, and
environment protection are not enforced by files in this repository and must be
verified separately.

## Implemented Controls

### Dependencies

- CI and release builds install the committed lockfile with `npm ci`.
- Direct runtime and development dependencies use exact versions.
- `npm run audit:production` rejects high or critical production advisories in
  pull-request, push, release, and publish build jobs.
- Dependency Review rejects pull requests that introduce high or critical
  advisories.
- Dependabot checks npm and GitHub Actions dependencies weekly against the
  `firewatch-v2` integration branch.
- The lockfile records registry URLs and integrity hashes.

### Workflows

- Every third-party GitHub Action is pinned to a full commit SHA. Version
  comments allow Dependabot to propose reviewed SHA updates.
- Workflows declare explicit permissions, and checkout does not persist GitHub
  credentials into the working tree.
- CodeQL analyzes JavaScript, TypeScript, and GitHub Actions workflows on
  relevant pushes, pull requests, and a weekly schedule.
- Pull-request workflows use `pull_request`, not `pull_request_target`.

### Releases

- Jobs that install dependencies, run tests, or build project code have only
  `contents: read` permission.
- The GitHub Release job receives prebuilt artifacts and has only
  `contents: write` permission. It does not check out or execute project code.
- The npm publish job receives prebuilt tarballs and has only `contents: read`
  and `id-token: write` permissions.
- npm publishing uses OIDC trusted publishing and provenance. It passes
  `--ignore-scripts`, so package lifecycle hooks cannot execute with publish
  authority.
- Publishing is triggered once by the `release.published` event; the release
  workflow no longer dispatches a duplicate publish run.

## Advisory Snapshot

The lockfile was updated and reviewed with:

```text
npm audit --omit=dev --audit-level=high --json
npm audit --audit-level=high --json
```

The production tree reports zero known advisories at every severity. The full
tree retains one high-severity advisory path and low-severity findings in
development-only tooling:

- `@anthropic-ai/mcpb` reaches an unfixed `tmp` version through its interactive
  prompt dependencies.
- `tsx` reaches a low-severity `esbuild` advisory.
- The remaining low-severity findings are in the same MCPB prompt dependency
  chain.

MCPB runs only while producing a release artifact in an unprivileged build job.
The repository supplies fixed paths to it rather than untrusted command input.
This reduces exposure but does not remove the vulnerable dependency. The full
tree must be reviewed when MCPB or its prompt dependencies can be upgraded.

## Development Advisory Policy

Production high and critical advisories block CI. Development-only advisories
are reviewed individually because build tools do not ship in the npm runtime
package, but they still execute while producing artifacts. An accepted finding
must be documented with its reachability and privilege boundary. A newly
introduced high or critical advisory is rejected by Dependency Review.

The known MCPB advisory is temporarily accepted because no upstream fix is
available and the affected tool runs without release credentials. It must not
be treated as permanently waived.

## Repository Settings Snapshot

A read-only GitHub API audit on 2026-08-29 found:

- Secret scanning and secret-scanning push protection are enabled.
- Dependabot vulnerability alerts and automatic security updates are disabled.
- Neither `main` nor `firewatch-v2` has branch protection, and the repository
  has no rulesets.
- CodeQL default setup is not configured, so the repository workflow provides
  advanced setup without conflicting with a server-managed scan.

These settings are not changed by this branch. Until branch and release-tag
rules are configured, repository write access is sufficient to push changes or
matching release tags without a required review gate.

## Remaining Work

- Enable Dependabot vulnerability alerts and automatic security updates.
- Add branch and release-tag rulesets with required reviews and status checks.
- Define and test an explicit npm install-script allowlist. A clean npm 11
  install currently identifies `esbuild` and `geckodriver` lifecycle scripts.
- Verify environment protection and npm trusted-publisher settings outside the
  repository.
- Evaluate npm registry signature verification for installed dependencies.
- Generate and publish release SBOMs.
- Retarget Dependabot from `firewatch-v2` to `main` when v2 becomes the default
  branch.

`npm audit` is only one signal. Integrity hashes, dependency review, static
analysis, immutable Actions, and narrow release permissions remain necessary
because a newly compromised package may not have an advisory.
