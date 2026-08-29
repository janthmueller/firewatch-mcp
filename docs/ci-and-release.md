# CI and Release

## Pull Request Gates

- `pr-check.yml` installs the lockfile, audits production dependencies, and runs
  lint, formatting, type checks, unit tests, and a build.
- `dependency-review.yml` rejects dependency changes with new high or critical
  advisories.
- `codeql.yml` analyzes JavaScript, TypeScript, and GitHub Actions workflows.

PR Check and Dependency Review use read-only permissions. CodeQL additionally
receives `security-events: write` so it can upload analysis results. The jobs
run with the `pull_request` event and do not persist checkout credentials.

## Push CI

`ci.yml` runs on pushes to `main`, `develop`, and `firewatch-v2` with Node.js 20
and 22. It audits production dependencies, runs all static checks, builds the
server, runs tests with coverage, and uploads the Node.js 20 build artifact.
Both workflows also smoke-test the public and privileged-context npm package
archives. Codecov upload is non-blocking.

Dependabot checks npm packages and SHA-pinned GitHub Actions weekly. GitHub reads
the configuration from the default branch, so the same v2-targeting file is
temporarily mirrored to `main` while `firewatch-v2` remains non-default.
Dependabot security updates still target default `main`; the production audit
and Dependency Review gates protect v2 changes until the default-branch cutover.
The target must be changed to `main` and the temporary mirror removed at that
point.

## Release Boundary

`release.yml` starts when a `v*` tag is pushed. Its read-only build job verifies
that the tag matches `package.json`, audits production dependencies, builds,
tests, and creates the tar and MCPB assets. A separate `contents: write` job
downloads those artifacts and creates the GitHub Release without checking out
or executing project code.

Publishing starts from the resulting `release.published` event. The read-only
build job in `publish.yml` validates the tag, runs checks and unit tests, builds
both npm variants, and packs fixed tarball artifacts. A separate OIDC job
downloads the tarballs and publishes them with provenance and
`--ignore-scripts`. No dependency install or repository script runs with npm
publish authority.

The two npm packages must each configure `publish.yml` as their trusted GitHub
Actions publisher. No long-lived `NPM_TOKEN` is used.

## Release Process

1. Set the intended version in `package.json` and update `package-lock.json`.
2. Commit the release change and create the matching tag, for example `v0.10.2`.
3. Push the tag. The release workflow rejects a tag that does not match the
   package version.
4. The GitHub Release is created from the workflow-produced artifacts.
5. Publishing runs once from the release event and publishes both npm packages.

`CODECOV_TOKEN` is the only workflow secret referenced by CI, and it is
optional. npm publishing uses GitHub OIDC instead of a repository secret.

## Windows Integration Tests

Vitest has known process-forking problems for integration tests that spawn
Firefox on Windows. `scripts/run-integration-tests-windows.mjs` provides a
separate runner for that environment. Unit tests continue to run through
Vitest.
