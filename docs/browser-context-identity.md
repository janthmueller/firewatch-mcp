# Browser Context Identity

## Purpose

Firewatch v2 uses WebDriver BiDi browsing-context and user-context identifiers
as its browser resource identity. This contract is the prerequisite for later
container-scoped authorization; it does not implement authorization itself.

These user-context commands and fields require Firefox 124 or newer.

## Identity Model

- `contextId` is the opaque BiDi identifier of a live top-level browsing
  context. It remains stable across navigation, repeated discovery, and tab
  reordering. Closing the page invalidates it.
- `userContext` is the opaque BiDi identifier of the Firefox container that
  owns the page. The default container is identified by `default`.
- `isCurrent` identifies the MCP server's current automation context. It does
  not claim that the tab is the human-visible foreground tab.
- Display order is not identity. Clients must not retain or target list
  positions.

## Tool Contracts

### `list_pages`

Returns every top-level page without activating tabs merely to inspect them.
Both readable text and MCP `structuredContent` are returned. The structured
shape is:

```json
{
  "pages": [
    {
      "contextId": "opaque-context-id",
      "userContext": "default",
      "url": "https://example.com/",
      "title": "Example Domain",
      "isCurrent": true
    }
  ]
}
```

Page discovery and title collection fail explicitly when required BiDi data is
unavailable. Firewatch does not fabricate a fallback page.

### `list_user_contexts`

Returns the available Firefox user contexts:

```json
{
  "userContexts": [{ "userContext": "default" }]
}
```

### `new_page`

Requires `url` and an explicit `userContext`. The optional `background`
argument follows BiDi semantics: omitted or `false` activates and selects the
new page for automation; `true` leaves the current automation context
unchanged. The response contains the complete `PageInfo` under `page`.

### `select_page`

Requires `contextId`. Selection validates the live context before changing the
current automation context. URL, title, and list-index targeting are not part of
the v2 contract.

### `close_page`

Requires `contextId`. Closing a non-current page does not select it first. If
the current page is closed, Firewatch selects a remaining live context and
returns its ID. The response identifies both the closed and resulting current
contexts. Closing the final page is rejected because the BiDi specification
leaves its browser/session effect implementation-defined.

## Failure Semantics

Unknown, closed, or stale IDs are errors. Errors name the operation and target
context where applicable. Protocol failures are propagated with context rather
than converted into synthetic browser state.

## Security Boundary

These identifiers make resources addressable but do not authorize access.
Issue #31 tracks the later centralized policy layer that will filter and reject
resources according to a trusted startup principal.
