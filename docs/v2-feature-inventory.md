# Firewatch v2 Feature Inventory

## Baselines

- Legacy Firewatch: `legacy-v1` at `da31b55`, released as `v1.5.0`.
- Mozilla baseline: `upstream/main` at `78356d5`, package version `0.10.1`.
- Firewatch v2 integration branch: `firewatch-v2`, created directly from that Mozilla baseline.
- Tracking issue: [#31](https://github.com/janthmueller/firewatch-mcp/issues/31).

This inventory groups the unique v1 commits by capability. It does not treat a
file-level diff as a port plan because Mozilla continued changing the same
subsystems after the fork diverged.

## Decision Labels

- **Already upstream**: current Mozilla code provides the required capability.
- **Retain**: the capability remains useful and can be ported with a focused design.
- **Redesign**: retain the user need, but do not copy the v1 implementation.
- **Defer**: required later, but not part of the authorization foundation.
- **Obsolete**: no longer applies to the v2 baseline.
- **Insecure**: conflicts with the v2 trust model and must not be ported.

## Inventory

| Area                       | Legacy v1 capability                                                                                   | Current Mozilla baseline                                                                                                                                   | Decision         | V2 action                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Page text                  | `extract_text` reads rendered or DOM text at page, selector, or UID scope.                             | `get_page_text` already returns full rendered page text with inline limits, file output, and previews.                                                     | Redesign         | Keep Mozilla's full-page path. Add only the missing DOM-source and selector/UID-scoped behavior through one coherent API.                      |
| Text limits                | `extract_text` exposes `maxLength`.                                                                    | `get_page_text` already has inline `maxLength` and uncapped file output.                                                                                   | Already upstream | Reuse upstream response and file-output behavior. Do not restore the v1 response wrapper.                                                      |
| Snapshot text limits       | `take_snapshot` exposes collector and formatter per-node text caps, where `null` means uncapped.       | Collection and formatting limits exist internally, while file output disables formatter truncation, but the per-node limits are not public tool arguments. | Retain           | Reintroduce typed collector and formatter controls without weakening upstream's total-output limits.                                           |
| UID-rooted snapshots       | A UID can become the root of a deeper snapshot while retaining the current UID namespace.              | Selector scoping exists, and UIDs now map directly to live elements through a weak registry. UID-rooted snapshots are not exposed.                         | Redesign         | Resolve the root directly from the upstream live UID registry and walk that element. Do not copy the v1 selector/XPath fallback resolver.      |
| UID reliability            | v1 stores selectors and XPath values, then re-finds elements after cache misses.                       | Upstream assigns stable UIDs to live elements and holds them through weak references until removal or navigation.                                          | Already upstream | Keep the upstream registry and resolver as the source of truth.                                                                                |
| Snapshot diagnostics       | Injected snapshot exceptions preserve their original message, with an actionable rooted-snapshot hint. | The injected catch block still discards exceptions, which can surface as `Unknown error`.                                                                  | Retain           | Return a typed failure reason and preserved message. Add dynamic-SPA tests before introducing any target fallback.                             |
| Compact high-volume output | v1 proposed reducers, but did not add a separate compact snapshot format.                              | Console and network tools already provide filters and detail levels; snapshots provide relevance filtering, line caps, selector scoping, and file output.  | Already upstream | Keep upstream reducers. Track a compact snapshot representation separately in #3 only if measurements show a worthwhile gain.                  |
| Workspace-local state      | Selected pages and snapshot managers are keyed by a caller-provided `workspaceId`.                     | Selected page and snapshot state are global to the connected client.                                                                                       | Redesign         | Target stable browsing contexts explicitly and associate mutable state with trusted principal/context scope, not an arbitrary MCP argument.    |
| Workspace ownership        | Tool arguments can supply `callerId`; in-memory metadata records human, shared, or agent ownership.    | No equivalent authorization layer exists.                                                                                                                  | Insecure         | Do not port. Identity must come from server startup configuration, and centralized policy must enforce access.                                 |
| Workspace labels           | v1 documents human-friendly workspaces and supervision relationships.                                  | Firefox exposes browser concepts but no Firewatch workspace vocabulary.                                                                                    | Retain           | Treat labels as aliases for Firefox `userContext` values. Zen Spaces may map one-to-one to those labels but cannot grant isolation themselves. |
| Tab identity               | v1 continues exposing mutable tab indexes and layers workspace selection above them.                   | Mozilla also exposes indexes, while stable BiDi context IDs are used internally.                                                                           | Redesign         | Expose `contextId` and `userContext` for every page and make context identity the authorization target.                                        |
| Branding                   | Package, binary, plugin, links, and output strings are renamed to Firewatch.                           | The clean baseline is Mozilla-branded.                                                                                                                     | Defer            | Reapply minimal Firewatch package identity only after the v2 API and release shape stabilize. Keep Mozilla attribution.                        |
| Release automation         | v1 uses semantic-release, Conventional Commits, generated changelogs, and release-after-CI ordering.   | Mozilla uses tag-driven GitHub releases and a separate npm publish workflow.                                                                               | Redesign         | Preserve automated prereleases and changelogs, but adapt them to current workflows and `2.0.0-beta.1`. Do not copy old workflow files.         |
| npm publishing             | v1 switched publishing to OIDC.                                                                        | Upstream already publishes with OIDC and npm provenance.                                                                                                   | Already upstream | Retain upstream trusted publishing and harden the privileged job boundary before release.                                                      |
| Package artifact check     | v1 builds and executes the packed artifact to catch broken runtime paths.                              | Current upstream builds packages but has no equivalent artifact smoke check in PR CI.                                                                      | Retain           | Add a package-install/startup smoke test before the beta release.                                                                              |
| Test teardown fixes        | v1 bounds Firefox teardown and removes global worker cleanup to avoid CI hangs.                        | Upstream test helpers and lifecycle code have since changed substantially.                                                                                 | Obsolete         | Do not port unless the current baseline reproduces the failure.                                                                                |
| v1 stability statement     | README states that breaking changes can occur during 1.x.                                              | V2 will begin as a beta prerelease.                                                                                                                        | Obsolete         | Replace with explicit beta/pre-2.0 compatibility expectations during release documentation.                                                    |
| Project documentation      | v1 added workspace proposals and a lightweight tracker.                                                | Those documents describe the rejected v1 trust model.                                                                                                      | Redesign         | Keep fresh v2 architecture, policy, threat-model, setup, and tracking documents under `docs/`. Leave v1 documents on `legacy-v1`.              |
| Development shell          | v1 adds `shell.nix`.                                                                                   | Mozilla uses the Node package scripts directly.                                                                                                            | Defer            | Add a Nix developer environment only if it is maintained as a first-class tested entry point.                                                  |

## Explicit Non-Port Decisions

The following v1 implementation details must not enter v2:

- `callerId`, principal, role, or permission values supplied through MCP arguments.
- Authorization based on client-selected `workspaceId` values.
- In-memory ownership metadata as a security boundary.
- Selector/XPath fallback as the primary UID identity mechanism.
- A merge or rebase of `legacy-v1` into `firewatch-v2`.
- Old workflow files copied over the newer Mozilla release and CI baseline.

## Required Port Order

1. Harden dependency and workflow supply-chain controls that affect all later work.
2. Expose stable browsing context and Firefox user-context identity.
3. Add trusted startup principal and centralized deny-by-default policy.
4. Enforce context filtering and authorization across every tool and event stream.
5. Restore approved extraction and snapshot capabilities against that foundation.
6. Add optional Zen labels and mappings.
7. Complete packaging and release automation, then publish the first beta.

Extraction work must follow context authorization. Otherwise a correctly scoped
text or snapshot tool could still read a forbidden container.

## Existing Backlog

- #2, browser selection extraction, remains a valid but non-core read primitive.
- #3, compact snapshot formatting, remains open pending measurements against the
  current upstream snapshot and file-output behavior.

Neither issue blocks the v2 authorization foundation.
