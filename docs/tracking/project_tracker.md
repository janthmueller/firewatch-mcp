# Firewatch v2 Project Tracker

## Active Work

- Umbrella issue: [#31](https://github.com/janthmueller/firewatch-mcp/issues/31)
- Active issue: [#41](https://github.com/janthmueller/firewatch-mcp/issues/41)
- Last completed issue: [#32](https://github.com/janthmueller/firewatch-mcp/issues/32)
- Integration branch: `firewatch-v2`
- Legacy branch: `legacy-v1`
- Current phase: browser context identity implementation

## Baselines

| Branch         | Commit    | Purpose                              |
| -------------- | --------- | ------------------------------------ |
| `legacy-v1`    | `da31b55` | Permanent Firewatch v1.5.0 reference |
| `firewatch-v2` | `78356d5` | Clean Mozilla upstream baseline      |

## Phase Status

| Phase                    | Status      | Notes                                                                                                                                                                               |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve v1              | Complete    | `legacy-v1` is published on origin.                                                                                                                                                 |
| Establish v2 baseline    | Complete    | `firewatch-v2` starts directly from `upstream/main`.                                                                                                                                |
| Inventory fork features  | Complete    | Decisions are recorded in `docs/v2-feature-inventory.md`.                                                                                                                           |
| Supply-chain baseline    | Complete    | The initial controls, gaps, and advisory snapshot are documented.                                                                                                                   |
| Supply-chain hardening   | Complete    | PRs #33 and #40 implement production audit gates, immutable Actions, dependency review, CodeQL, release privilege separation, and the required default-branch Dependabot bootstrap. |
| Browser context identity | In Progress | Issue #41 exposes stable `contextId` and `userContext`, removes index-based targeting, and adds typed MCP output.                                                                   |
| Central authorization    | Pending     | Trusted startup principal, typed policy, centralized enforcement.                                                                                                                   |
| Extraction and snapshots | Pending     | Restore only approved deltas after authorization exists.                                                                                                                            |
| Zen mapping              | Pending     | Map labels one-to-one to Firefox user contexts.                                                                                                                                     |
| Threat-model tests       | Pending     | Include negative authorization and dynamic-SPA coverage.                                                                                                                            |
| Beta release             | Pending     | Documentation, package identity, hardening, and `2.0.0-beta.1`.                                                                                                                     |

## Next Work

1. Complete issue #41 on a dedicated branch and validate the BiDi identity
   contract in Firefox integration tests.
2. Merge the identity work into `firewatch-v2` after the merge gate passes.
3. Define the centralized policy-boundary issue before restoring extraction
   features.

Each implementation phase requires a focused issue and dedicated branch before
code changes begin.
