/**
 * Page navigation and management tools for MCP
 */

import {
  successResponse,
  structuredResponse,
  previewExcerpt,
  truncationFooter,
} from '../utils/response-helpers.js';
import { saveOutput } from '../utils/save-output.js';
import { READINESS_STATES, isReadinessState, type ReadinessState } from '../firefox/pages.js';
import type { ClosePageResult, PageInfo, UserContextInfo } from '../firefox/types.js';
import {
  defineModule,
  defineToolHandler,
  type JsonSchemaProperty,
  type ToolDefinition,
} from './module.js';
import type { McpToolResponse } from '../types/common.js';

const DEFAULT_MAX_CONTENT_CHARS = 20_000;

const WAIT_DESCRIPTION =
  "When to return: 'none' (navigation started), 'interactive' (DOMContentLoaded), " +
  "'complete' (load event fired, including subresources). Omit for the default: " +
  "'interactive' for http/https/data/blob/file, 'none' for other schemes. Use " +
  "'complete' when the page must be fully loaded, e.g. before stopping a performance recording.";

const waitSchema = {
  type: 'string',
  enum: [...READINESS_STATES],
  description: WAIT_DESCRIPTION,
} satisfies JsonSchemaProperty;

const pageInfoSchema = {
  type: 'object',
  properties: {
    contextId: {
      type: 'string',
      description: 'Stable WebDriver BiDi browsing context identifier',
    },
    userContext: {
      type: 'string',
      description: 'Firefox user context (container) identifier',
    },
    url: { type: 'string' },
    title: { type: 'string' },
    isCurrent: {
      type: 'boolean',
      description: 'Whether this is the MCP server current automation context',
    },
  },
  required: ['contextId', 'userContext', 'url', 'title', 'isCurrent'],
} satisfies JsonSchemaProperty;

const userContextInfoSchema = {
  type: 'object',
  properties: {
    userContext: {
      type: 'string',
      description: 'Opaque Firefox user context (container) identifier',
    },
  },
  required: ['userContext'],
} satisfies JsonSchemaProperty;

function parseArguments(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tool arguments must be an object');
  }
  return value as Record<string, unknown>;
}

function requireStringArgument(argumentsObject: Record<string, unknown>, name: string): string {
  const value: unknown = argumentsObject[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} parameter is required and must be a non-empty string`);
  }
  return value;
}

function optionalBooleanArgument(
  argumentsObject: Record<string, unknown>,
  name: string,
  defaultValue: boolean
): boolean {
  const value: unknown = argumentsObject[name];
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${name} parameter must be a boolean`);
  }
  return value;
}

/**
 * Validate the optional `wait` argument.
 *
 * An unknown value is rejected rather than ignored: silently falling back to the
 * default would leave the caller believing it waited for something it did not.
 */
function parseWait(value: unknown): ReadinessState | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isReadinessState(value)) {
    throw new Error(
      `wait must be one of ${READINESS_STATES.join(', ')} (got ${JSON.stringify(value)})`
    );
  }
  return value;
}

/** Echo the readiness state back only when the caller asked for one. */
function waitSuffix(wait: ReadinessState | undefined): string {
  return wait ? ` (waited for: ${wait})` : '';
}

// Tool definitions
export const listPagesTool = {
  name: 'list_pages',
  description:
    'List top-level pages with stable contextId, Firefox userContext, URL, title, and current automation state. This inspects pages without activating tabs. Use contextId for subsequent page operations; list position is not an identifier.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
  outputSchema: {
    type: 'object',
    properties: {
      pages: {
        type: 'array',
        items: pageInfoSchema,
      },
    },
    required: ['pages'],
  },
} satisfies ToolDefinition;

export const listUserContextsTool = {
  name: 'list_user_contexts',
  description:
    'List Firefox userContext identifiers available for page creation. The default Firefox container is "default"; other values identify isolated Firefox containers.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
  outputSchema: {
    type: 'object',
    properties: {
      userContexts: {
        type: 'array',
        items: userContextInfoSchema,
      },
    },
    required: ['userContexts'],
  },
} satisfies ToolDefinition;

export const newPageTool = {
  name: 'new_page',
  description:
    'Open a tab at URL in an explicitly selected Firefox userContext. Call list_user_contexts first. Returns stable page identity. background defaults to false, which activates the tab; pass true to avoid changing the current automation context or visible tab.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Target URL',
      },
      userContext: {
        type: 'string',
        description: 'Firefox userContext from list_user_contexts, including "default"',
      },
      background: {
        type: 'boolean',
        description:
          'Create without activating or selecting the tab. Defaults to false according to WebDriver BiDi.',
      },
      wait: waitSchema,
    },
    required: ['url', 'userContext'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      page: pageInfoSchema,
    },
    required: ['page'],
  },
} satisfies ToolDefinition;

export const navigatePageTool = {
  name: 'navigate_page',
  description: 'Navigate selected tab to URL.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Target URL',
      },
      wait: waitSchema,
    },
    required: ['url'],
  },
} satisfies ToolDefinition;

export const selectPageTool = {
  name: 'select_page',
  description:
    'Select a live page by stable contextId. This changes the MCP automation context and activates the corresponding visible browser tab. Obtain contextId from list_pages.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      contextId: {
        type: 'string',
        description: 'Stable contextId returned by list_pages',
      },
    },
    required: ['contextId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      page: pageInfoSchema,
    },
    required: ['page'],
  },
} satisfies ToolDefinition;

export const closePageTool = {
  name: 'close_page',
  description:
    'Close a live page by stable contextId. A non-current page is closed without selecting it first. Closing the final page is rejected because browser/session behavior is not portable.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      contextId: {
        type: 'string',
        description: 'Stable contextId returned by list_pages',
      },
    },
    required: ['contextId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      closedContextId: {
        type: 'string',
      },
      currentContextId: {
        type: ['string', 'null'],
      },
    },
    required: ['closedContextId', 'currentContextId'],
  },
} satisfies ToolDefinition;

export const getPageTextTool = {
  name: 'get_page_text',
  description:
    'Get the visible text of the page (document.body.innerText). Caps at maxLength (default 20000 chars); saveTo saves the full text to a file.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      maxLength: {
        type: 'number',
        description:
          'Max characters to return inline (default: 20000). Ignored when saveTo is used.',
      },
      saveTo: {
        type: ['boolean', 'string'],
        description:
          'Save the full untruncated text to a file instead of returning it inline. Pass a file path, an existing directory (generated file inside), or true (generated file under ~/.firefox-devtools-mcp/output/). Relative paths resolve against the current working directory.',
      },
      preview: {
        type: 'number',
        description:
          'Number of characters of the saved text to return inline as a preview when saveTo is used. Omit for no preview.',
      },
    },
  },
} satisfies ToolDefinition;

/**
 * Format page list compactly
 */
function formatPageList(pages: readonly PageInfo[]): string {
  if (pages.length === 0) {
    return 'No pages';
  }
  const lines: string[] = [`${pages.length} pages`];
  for (const page of pages) {
    const marker: string = page.isCurrent ? '>' : ' ';
    const title: string = page.title.length > 0 ? page.title.substring(0, 80) : '(untitled)';
    const url: string = page.url.substring(0, 200);
    lines.push(
      `${marker} ${title} (${url}) [contextId=${page.contextId}, userContext=${page.userContext}]`
    );
  }
  return lines.join('\n');
}

function formatUserContextList(userContexts: readonly UserContextInfo[]): string {
  const lines: string[] = [`${userContexts.length} user contexts`];
  for (const context of userContexts) {
    lines.push(`- ${context.userContext}`);
  }
  return lines.join('\n');
}

// Handlers
export const handleListPages = defineToolHandler(async function handleListPages(
  _args: unknown
): Promise<McpToolResponse> {
  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const pages: PageInfo[] = await firefox.listPages();

  return structuredResponse(formatPageList(pages), { pages });
});

export const handleListUserContexts = defineToolHandler(async function handleListUserContexts(
  _args: unknown
): Promise<McpToolResponse> {
  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const userContexts: UserContextInfo[] = await firefox.listUserContexts();
  return structuredResponse(formatUserContextList(userContexts), { userContexts });
});

export const handleNewPage = defineToolHandler(async function handleNewPage(
  args: unknown
): Promise<McpToolResponse> {
  const argumentsObject: Record<string, unknown> = parseArguments(args);
  const url: string = requireStringArgument(argumentsObject, 'url');
  const userContext: string = requireStringArgument(argumentsObject, 'userContext');
  const background: boolean = optionalBooleanArgument(argumentsObject, 'background', false);
  const waitFor: ReadinessState | undefined = parseWait(argumentsObject.wait);

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const page: PageInfo = await firefox.createNewPage(url, { userContext, background }, waitFor);

  return structuredResponse(
    `new page ${page.contextId} in user context ${page.userContext} → ${url}${waitSuffix(waitFor)}`,
    { page }
  );
});

export const handleNavigatePage = defineToolHandler(async function handleNavigatePage(
  args: unknown
): Promise<McpToolResponse> {
  const argumentsObject: Record<string, unknown> = parseArguments(args);
  const url: string = requireStringArgument(argumentsObject, 'url');
  const waitFor: ReadinessState | undefined = parseWait(argumentsObject.wait);

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const contextId: string | null = firefox.getCurrentContextId();
  if (!contextId) {
    throw new Error('No page selected');
  }

  await firefox.navigate(url, waitFor);

  return successResponse(`${contextId} → ${url}${waitSuffix(waitFor)}`);
});

export const handleSelectPage = defineToolHandler(async function handleSelectPage(
  args: unknown
): Promise<McpToolResponse> {
  const argumentsObject: Record<string, unknown> = parseArguments(args);
  const contextId: string = requireStringArgument(argumentsObject, 'contextId');

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const page: PageInfo = await firefox.selectPage(contextId);
  return structuredResponse(`selected ${contextId}`, { page });
});

export const handleClosePage = defineToolHandler(async function handleClosePage(
  args: unknown
): Promise<McpToolResponse> {
  const argumentsObject: Record<string, unknown> = parseArguments(args);
  const contextId: string = requireStringArgument(argumentsObject, 'contextId');

  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const result: ClosePageResult = await firefox.closePage(contextId);
  return structuredResponse(`closed ${contextId}`, { ...result });
});

async function respondWithContent(
  content: string,
  args: unknown,
  baseName: string,
  extension: string
): Promise<McpToolResponse> {
  const {
    maxLength = DEFAULT_MAX_CONTENT_CHARS,
    saveTo,
    preview,
  } = (args as { maxLength?: number; saveTo?: boolean | string; preview?: number }) || {};

  if (saveTo) {
    const saved = await saveOutput(
      content,
      saveTo === true ? undefined : saveTo,
      baseName,
      extension
    );
    let output = `${baseName} saved to: ${saved.path} (${(saved.bytes / 1024).toFixed(1)}KB)`;
    const excerpt = previewExcerpt(content, preview);
    if (excerpt) {
      output += '\nPreview:\n' + excerpt;
    }
    return successResponse(output);
  }

  // Always end with a status marker so the model can tell "this is everything"
  // from "this was cut" instead of inferring completeness from a missing footer.
  if (content.length <= maxLength) {
    return successResponse(content + `\n\n[full content, ${content.length} chars]`);
  }

  const footer = truncationFooter(content.length - maxLength, 'chars', [
    'maxLength to show more',
    'saveTo to save the full content to a file',
  ]);
  return successResponse(content.slice(0, maxLength) + '\n\n' + footer);
}

export const handleGetPageText = defineToolHandler(async function handleGetPageText(
  args: unknown
): Promise<McpToolResponse> {
  const { getFirefox } = await import('../index.js');
  const firefox = await getFirefox();

  const text = (await firefox.evaluate(
    'document.body ? document.body.innerText : document.documentElement.innerText'
  )) as string | null | undefined;

  return respondWithContent(text ?? '', args, 'page-text', 'txt');
});

export const module = defineModule({
  name: 'pages',
  description: 'Discover Firefox containers and manage pages by stable context identity.',
  tools: [
    [listPagesTool, handleListPages],
    [listUserContextsTool, handleListUserContexts],
    [newPageTool, handleNewPage],
    [navigatePageTool, handleNavigatePage],
    [selectPageTool, handleSelectPage],
    [closePageTool, handleClosePage],
    [getPageTextTool, handleGetPageText],
  ],
});
