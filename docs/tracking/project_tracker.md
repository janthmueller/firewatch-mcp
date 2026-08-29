# Firewatch v2 Project Tracker

## Active Work

- Umbrella issue: [#31](https://github.com/janthmueller/firewatch-mcp/issues/31)
- Active issue: [#32](https://github.com/janthmueller/firewatch-mcp/issues/32)
- Integration branch: `firewatch-v2`
- Legacy branch: `legacy-v1`
- Current phase: supply-chain hardening

## Baselines

| Branch         | Commit    | Purpose                              |
| -------------- | --------- | ------------------------------------ |
| `legacy-v1`    | `da31b55` | Permanent Firewatch v1.5.0 reference |
| `firewatch-v2` | `78356d5` | Clean Mozilla upstream baseline      |

## Phase Status

| Phase                    | Status      | Notes                                                                                                                                       |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve v1              | Complete    | `legacy-v1` is published on origin.                                                                                                         |
| Establish v2 baseline    | Complete    | `firewatch-v2` starts directly from `upstream/main`.                                                                                        |
| Inventory fork features  | Complete    | Decisions are recorded in `docs/v2-feature-inventory.md`.                                                                                   |
| Supply-chain baseline    | Complete    | The initial controls, gaps, and advisory snapshot are documented.                                                                           |
| Supply-chain hardening   | In progress | Production audit gates, immutable Actions, dependency review, CodeQL, and release privilege separation are implemented on the issue branch. |
| Browser context identity | Pending     | Expose stable `contextId` and `userContext`; stop relying on tab indexes for policy.                                                        |
| Central authorization    | Pending     | Trusted startup principal, typed policy, centralized enforcement.                                                                           |
| Extraction and snapshots | Pending     | Restore only approved deltas after authorization exists.                                                                                    |
| Zen mapping              | Pending     | Map labels one-to-one to Firefox user contexts.                                                                                             |
| Threat-model tests       | Pending     | Include negative authorization and dynamic-SPA coverage.                                                                                    |
| Beta release             | Pending     | Documentation, package identity, hardening, and `2.0.0-beta.1`.                                                                             |

## Next Work

1. Review and merge the supply-chain hardening tracked by issue #32.
2. Design and expose browser `contextId` and `userContext` identity.
3. Build the centralized policy boundary before restoring extraction features.

Each implementation phase requires a focused issue and dedicated branch before
code changes begin.
