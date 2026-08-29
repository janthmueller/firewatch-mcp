/**
 * Unit tests for pages tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listPagesTool,
  listUserContextsTool,
  selectPageTool,
  navigatePageTool,
  newPageTool,
  closePageTool,
  getPageTextTool,
} from '../../src/tools/pages.js';
import type { ClosePageResult, PageInfo, UserContextInfo } from '../../src/firefox/types.js';

describe('Pages Tools', () => {
  describe('Tool Definitions', () => {
    it('should have correct tool names', () => {
      expect(listPagesTool.name).toBe('list_pages');
      expect(listUserContextsTool.name).toBe('list_user_contexts');
      expect(selectPageTool.name).toBe('select_page');
      expect(navigatePageTool.name).toBe('navigate_page');
      expect(newPageTool.name).toBe('new_page');
      expect(closePageTool.name).toBe('close_page');
    });

    it('should have valid descriptions', () => {
      expect(listPagesTool.description).toContain('contextId');
      expect(listPagesTool.description).toContain('without activating');
      expect(listUserContextsTool.description).toContain('userContext');
      expect(selectPageTool.description).toContain('Select');
      expect(navigatePageTool.description).toContain('Navigate');
      expect(newPageTool.description).toContain('Open');
      expect(closePageTool.description).toContain('Close');
    });

    it('should have valid input schemas', () => {
      expect(listPagesTool.inputSchema.type).toBe('object');
      expect(listUserContextsTool.inputSchema.type).toBe('object');
      expect(selectPageTool.inputSchema.type).toBe('object');
      expect(navigatePageTool.inputSchema.type).toBe('object');
      expect(newPageTool.inputSchema.type).toBe('object');
      expect(closePageTool.inputSchema.type).toBe('object');
    });
  });

  describe('Schema Properties', () => {
    it('selectPageTool should require only a stable contextId', () => {
      const { properties, required } = selectPageTool.inputSchema;
      expect(Object.keys(properties)).toEqual(['contextId']);
      expect(properties.contextId.type).toBe('string');
      expect(required).toEqual(['contextId']);
    });

    it('navigatePageTool should require url', () => {
      const { properties } = navigatePageTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.url).toBeDefined();
      expect(properties?.url.type).toBe('string');
    });

    it('newPageTool should require URL and explicit userContext', () => {
      const { properties, required } = newPageTool.inputSchema;
      expect(properties.url).toBeDefined();
      expect(properties.userContext.type).toBe('string');
      expect(properties.background.type).toBe('boolean');
      expect(required).toEqual(['url', 'userContext']);
    });

    it.each([
      ['navigatePageTool', navigatePageTool],
      ['newPageTool', newPageTool],
    ])('%s should expose an optional wait enum', (_name, tool) => {
      const schema = tool.inputSchema as {
        properties?: Record<string, { type: string; enum?: readonly string[] }>;
        required?: string[];
      };
      expect(schema.properties?.wait).toBeDefined();
      expect(schema.properties?.wait.type).toBe('string');
      expect(schema.properties?.wait.enum).toEqual(['none', 'interactive', 'complete']);
      expect(schema.required).not.toContain('wait');
    });

    it('closePageTool should require contextId', () => {
      const { properties, required } = closePageTool.inputSchema;
      expect(Object.keys(properties)).toEqual(['contextId']);
      expect(properties.contextId.type).toBe('string');
      expect(required).toContain('contextId');
    });

    it('identity tools publish machine-readable output schemas', () => {
      expect(listPagesTool.outputSchema.properties.pages.type).toBe('array');
      expect(listUserContextsTool.outputSchema.properties.userContexts.type).toBe('array');
      expect(newPageTool.outputSchema.properties.page.type).toBe('object');
      expect(selectPageTool.outputSchema.properties.page.type).toBe('object');
      expect(closePageTool.outputSchema.properties.currentContextId.type).toEqual([
        'string',
        'null',
      ]);
    });
  });

  describe('Content Tools', () => {
    it('should have correct tool name', () => {
      expect(getPageTextTool.name).toBe('get_page_text');
    });

    it('should expose maxLength, saveTo, and preview without marking them required', () => {
      const schema = getPageTextTool.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(schema.properties?.maxLength).toBeDefined();
      expect(schema.properties?.saveTo).toBeDefined();
      expect(schema.properties?.preview).toBeDefined();
      expect(schema.required).toBeUndefined();
    });
  });

  describe('Content Tools: handler behavior', () => {
    const LONG_TEXT = 'y'.repeat(30000);
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `pages-test-${Date.now()}`);

      vi.doMock('../../src/index.js', () => ({
        args: { unrestrictedSavePaths: true },
        getFirefox: vi.fn().mockResolvedValue({
          evaluate: vi.fn().mockResolvedValue(LONG_TEXT),
        }),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should truncate inline output to maxLength with an escape-hatch footer', async () => {
      const { handleGetPageText } = await import('../../src/tools/pages.js');
      const result = await handleGetPageText({ maxLength: 100 });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('chars hidden');
      expect(text).toContain('saveTo');
      expect(text.length).toBeLessThan(LONG_TEXT.length);
    });

    it('should return content inline with a completeness marker when it fits maxLength', async () => {
      const { handleGetPageText } = await import('../../src/tools/pages.js');
      const result = await handleGetPageText({ maxLength: LONG_TEXT.length });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain(LONG_TEXT);
      expect(text).toContain(`[full content, ${LONG_TEXT.length} chars]`);
    });

    it('should save the full text untruncated when saveTo is used', async () => {
      const { handleGetPageText } = await import('../../src/tools/pages.js');
      const filePath = join(tempDir, 'page.txt');
      const result = await handleGetPageText({ saveTo: filePath, maxLength: 100 });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('saved to:');
      expect(readFileSync(filePath, 'utf8')).toBe(LONG_TEXT);
    });

    it('should include a preview when preview is given', async () => {
      const { handleGetPageText } = await import('../../src/tools/pages.js');
      const result = await handleGetPageText({ saveTo: join(tempDir, 'page.txt'), preview: 100 });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Preview:');
    });
  });

  describe('Page identity handlers', () => {
    const PAGE: PageInfo = {
      contextId: 'ctx-1',
      userContext: 'container-work',
      url: 'https://example.com/',
      title: 'Example',
      isCurrent: true,
    };
    const USER_CONTEXTS: UserContextInfo[] = [
      { userContext: 'default' },
      { userContext: 'container-work' },
    ];
    const CLOSE_RESULT: ClosePageResult = {
      closedContextId: 'ctx-2',
      currentContextId: 'ctx-1',
    };
    let navigate: ReturnType<typeof vi.fn>;
    let createNewPage: ReturnType<typeof vi.fn>;
    let listPages: ReturnType<typeof vi.fn>;
    let listUserContexts: ReturnType<typeof vi.fn>;
    let selectPage: ReturnType<typeof vi.fn>;
    let closePage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      navigate = vi.fn().mockResolvedValue(undefined);
      createNewPage = vi.fn().mockResolvedValue(PAGE);
      listPages = vi.fn().mockResolvedValue([PAGE]);
      listUserContexts = vi.fn().mockResolvedValue(USER_CONTEXTS);
      selectPage = vi.fn().mockResolvedValue(PAGE);
      closePage = vi.fn().mockResolvedValue(CLOSE_RESULT);

      vi.doMock('../../src/index.js', () => ({
        args: {},
        getFirefox: vi.fn().mockResolvedValue({
          navigate,
          createNewPage,
          listPages,
          listUserContexts,
          selectPage,
          closePage,
          getCurrentContextId: vi.fn().mockReturnValue('ctx-1'),
        }),
      }));
    });

    it('returns pages as structured content', async () => {
      const { handleListPages } = await import('../../src/tools/pages.js');

      const result = await handleListPages({});

      expect(listPages).toHaveBeenCalledTimes(1);
      expect(result.structuredContent).toEqual({ pages: [PAGE] });
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('contextId=ctx-1'),
      });
    });

    it('returns user contexts as structured content', async () => {
      const { handleListUserContexts } = await import('../../src/tools/pages.js');

      const result = await handleListUserContexts({});

      expect(listUserContexts).toHaveBeenCalledTimes(1);
      expect(result.structuredContent).toEqual({ userContexts: USER_CONTEXTS });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.resetModules();
    });

    it('passes an explicit wait through to navigate', async () => {
      const { handleNavigatePage } = await import('../../src/tools/pages.js');
      const result = await handleNavigatePage({ url: 'https://example.com', wait: 'complete' });

      expect(navigate).toHaveBeenCalledWith('https://example.com', 'complete');
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('waited for: complete');
    });

    it('leaves the default in place when wait is omitted', async () => {
      const { handleNavigatePage } = await import('../../src/tools/pages.js');
      const result = await handleNavigatePage({ url: 'https://example.com' });

      expect(navigate).toHaveBeenCalledWith('https://example.com', undefined);
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).not.toContain('waited for');
    });

    it('passes an explicit wait through to new_page', async () => {
      const { handleNewPage } = await import('../../src/tools/pages.js');
      const result = await handleNewPage({
        url: 'https://example.com',
        userContext: 'container-work',
        wait: 'complete',
      });

      expect(createNewPage).toHaveBeenCalledWith(
        'https://example.com',
        { userContext: 'container-work', background: false },
        'complete'
      );
      expect(result.structuredContent).toEqual({ page: PAGE });
    });

    it('passes background creation through explicitly', async () => {
      const { handleNewPage } = await import('../../src/tools/pages.js');

      await handleNewPage({
        url: 'https://example.com',
        userContext: 'container-work',
        background: true,
      });

      expect(createNewPage).toHaveBeenCalledWith(
        'https://example.com',
        { userContext: 'container-work', background: true },
        undefined
      );
    });

    it('selects and closes by contextId', async () => {
      const { handleSelectPage, handleClosePage } = await import('../../src/tools/pages.js');

      const selected = await handleSelectPage({ contextId: 'ctx-1' });
      const closed = await handleClosePage({ contextId: 'ctx-2' });

      expect(selectPage).toHaveBeenCalledWith('ctx-1');
      expect(closePage).toHaveBeenCalledWith('ctx-2');
      expect(selected.structuredContent).toEqual({ page: PAGE });
      expect(closed.structuredContent).toEqual(CLOSE_RESULT);
    });

    it('rejects an unknown wait value instead of silently ignoring it', async () => {
      const { handleNavigatePage } = await import('../../src/tools/pages.js');
      const result = await handleNavigatePage({ url: 'https://example.com', wait: 'load' });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('wait must be one of none, interactive, complete');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('rejects missing stable identity and user-context arguments', async () => {
      const { handleNewPage, handleSelectPage, handleClosePage } = await import(
        '../../src/tools/pages.js'
      );

      const newResult = await handleNewPage({ url: 'https://example.com' });
      const selectResult = await handleSelectPage({});
      const closeResult = await handleClosePage({ contextId: '' });

      expect(newResult).toMatchObject({ isError: true });
      expect(selectResult).toMatchObject({ isError: true });
      expect(closeResult).toMatchObject({ isError: true });
      expect(createNewPage).not.toHaveBeenCalled();
      expect(selectPage).not.toHaveBeenCalled();
      expect(closePage).not.toHaveBeenCalled();
    });

    it('rejects non-boolean background values', async () => {
      const { handleNewPage } = await import('../../src/tools/pages.js');

      const result = await handleNewPage({
        url: 'https://example.com',
        userContext: 'default',
        background: 'yes',
      });

      expect(result).toMatchObject({ isError: true });
      expect(createNewPage).not.toHaveBeenCalled();
    });
  });
});
