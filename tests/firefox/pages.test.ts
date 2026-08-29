/**
 * Unit tests for PageManagement and isCommonScheme
 *
 * Navigation uses BiDi browsingContext.navigate for all URLs.
 * Common schemes (http/https/data/blob/file) use wait:"interactive".
 * Uncommon schemes (moz-extension:, about:, etc.) use wait:"none"
 */

import { describe, it, expect, vi } from 'vitest';
import type { WebDriver } from 'selenium-webdriver';
import {
  isCommonScheme,
  isReadinessState,
  PageManagement,
  READINESS_STATES,
  type PageBiDi,
  type ScriptEvaluateResult,
} from '@/firefox/pages.js';
import type { BrowsingContext, BrowsingContextId } from '@/firefox/types.js';

const HTTPS_URL = 'https://example.com/test.html';
const HTTP_URL = 'http://example.com/test.html';
const FILE_URL = 'file:///some/path/test.html';
const MOZ_EXT_URL = 'moz-extension://a1b2c3d4-e5f6-7890-abcd-ef1234567890/popup.html';
const BLOB_URL = 'blob:https://example.org/40a5fb5a-d56d-4a33-b4e2-0acf6a8e5f64';
const DATA_URL = 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==';

describe('isCommonScheme', () => {
  it('returns true for common URL schemes', () => {
    expect(isCommonScheme(HTTPS_URL)).toBe(true);
    expect(isCommonScheme(HTTP_URL)).toBe(true);
    expect(isCommonScheme(FILE_URL)).toBe(true);
    expect(isCommonScheme(DATA_URL)).toBe(true);
    expect(isCommonScheme(BLOB_URL)).toBe(true);
  });

  it('returns false for moz-extension:// URLs', () => {
    expect(isCommonScheme(MOZ_EXT_URL)).toBe(false);
  });

  it('returns false for about: URLs', () => {
    expect(isCommonScheme('about:blank')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(isCommonScheme('not-a-url')).toBe(false);
  });
});

describe('isReadinessState', () => {
  it('accepts the three BiDi readiness states', () => {
    expect(READINESS_STATES).toEqual(['none', 'interactive', 'complete']);
    for (const state of READINESS_STATES) {
      expect(isReadinessState(state)).toBe(true);
    }
  });

  it('rejects anything else, including the DOM event name "load"', () => {
    expect(isReadinessState('load')).toBe(false);
    expect(isReadinessState('COMPLETE')).toBe(false);
    expect(isReadinessState(undefined)).toBe(false);
    expect(isReadinessState(true)).toBe(false);
  });
});

// -- PageManagement -----------------------------------------------------------

describe('PageManagement', () => {
  const FIRST_CONTEXT: BrowsingContext = {
    context: 'ctx-1',
    userContext: 'default',
    url: 'https://one.example/',
  };
  const SECOND_CONTEXT: BrowsingContext = {
    context: 'ctx-2',
    userContext: 'container-work',
    url: 'https://two.example/',
  };

  interface Harness {
    pages: PageManagement;
    bidi: PageBiDi;
    navigate: ReturnType<typeof vi.fn<PageBiDi['navigate']>>;
    getTree: ReturnType<typeof vi.fn<PageBiDi['getTree']>>;
    getUserContexts: ReturnType<typeof vi.fn<PageBiDi['getUserContexts']>>;
    evaluate: ReturnType<typeof vi.fn<PageBiDi['evaluate']>>;
    create: ReturnType<typeof vi.fn<PageBiDi['create']>>;
    close: ReturnType<typeof vi.fn<PageBiDi['close']>>;
    switchWindow: ReturnType<typeof vi.fn<(contextId: string) => Promise<void>>>;
    navigateBack: ReturnType<typeof vi.fn<() => Promise<void>>>;
    navigateForward: ReturnType<typeof vi.fn<() => Promise<void>>>;
    setRect: ReturnType<typeof vi.fn<(rect: { width: number; height: number }) => Promise<void>>>;
    getCurrentContextId: ReturnType<typeof vi.fn<() => BrowsingContextId | null>>;
    setCurrentContextId: ReturnType<typeof vi.fn<(contextId: BrowsingContextId | null) => void>>;
    getCurrent: () => BrowsingContextId | null;
  }

  function titleResult(title: string): ScriptEvaluateResult {
    return {
      type: 'success',
      result: { type: 'string', value: title },
    };
  }

  function createHarness(
    contexts: BrowsingContext[] = [FIRST_CONTEXT, SECOND_CONTEXT],
    initialContextId: BrowsingContextId | null = FIRST_CONTEXT.context
  ): Harness {
    let currentContextId: BrowsingContextId | null = initialContextId;
    const navigate = vi.fn<PageBiDi['navigate']>().mockResolvedValue(undefined);
    const getTree = vi.fn<PageBiDi['getTree']>(async (params) => {
      if (params.root) {
        const matchingContext: BrowsingContext | undefined = contexts.find(
          (context: BrowsingContext): boolean => context.context === params.root
        );
        return { contexts: matchingContext ? [matchingContext] : [] };
      }
      return { contexts };
    });
    const getUserContexts = vi.fn<PageBiDi['getUserContexts']>().mockResolvedValue({
      userContexts: [{ userContext: 'default' }, { userContext: 'container-work' }],
    });
    const evaluate = vi.fn<PageBiDi['evaluate']>(async (params) =>
      titleResult(params.target.context === FIRST_CONTEXT.context ? 'First' : 'Second')
    );
    const create = vi.fn<PageBiDi['create']>().mockResolvedValue({
      context: SECOND_CONTEXT.context,
      userContext: SECOND_CONTEXT.userContext,
    });
    const close = vi.fn<PageBiDi['close']>().mockResolvedValue(undefined);
    const bidi: PageBiDi = { navigate, getTree, getUserContexts, evaluate, create, close };

    const switchWindow = vi.fn<(contextId: string) => Promise<void>>().mockResolvedValue(undefined);
    const navigateBack = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const navigateForward = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const setRect = vi
      .fn<(rect: { width: number; height: number }) => Promise<void>>()
      .mockResolvedValue(undefined);
    const driver = {
      switchTo: (): { window: typeof switchWindow } => ({ window: switchWindow }),
      navigate: (): {
        back: () => Promise<void>;
        forward: () => Promise<void>;
      } => ({
        back: navigateBack,
        forward: navigateForward,
      }),
      manage: (): {
        window: () => { setRect: (rect: { width: number; height: number }) => Promise<void> };
      } => ({
        window: () => ({ setRect }),
      }),
    } as unknown as WebDriver;
    const getCurrentContextId = vi.fn<() => BrowsingContextId | null>(() => currentContextId);
    const setCurrentContextId = vi.fn<(contextId: BrowsingContextId | null) => void>(
      (contextId: BrowsingContextId | null): void => {
        currentContextId = contextId;
      }
    );

    const pages = new PageManagement(driver, getCurrentContextId, setCurrentContextId, bidi);
    return {
      pages,
      bidi,
      navigate,
      getTree,
      getUserContexts,
      evaluate,
      create,
      close,
      switchWindow,
      navigateBack,
      navigateForward,
      setRect,
      getCurrentContextId,
      setCurrentContextId,
      getCurrent: (): BrowsingContextId | null => currentContextId,
    };
  }

  describe('navigate', () => {
    it('uses BiDi with wait:interactive for common URL schemes', async () => {
      const { pages, navigate } = createHarness();

      await pages.navigate(HTTPS_URL);
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: HTTPS_URL,
        wait: 'interactive',
      });

      await pages.navigate(HTTP_URL);
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: HTTP_URL,
        wait: 'interactive',
      });

      await pages.navigate(DATA_URL);
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: DATA_URL,
        wait: 'interactive',
      });

      await pages.navigate(FILE_URL);
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: FILE_URL,
        wait: 'interactive',
      });

      await pages.navigate(BLOB_URL);
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: BLOB_URL,
        wait: 'interactive',
      });
    });

    it('uses BiDi with wait:none for uncommon URL schemes', async () => {
      const { pages, navigate } = createHarness();

      await pages.navigate(MOZ_EXT_URL);
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: MOZ_EXT_URL,
        wait: 'none',
      });

      await pages.navigate('about:blank');
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: 'about:blank',
        wait: 'none',
      });

      await pages.navigate('not-a-url');
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: 'not-a-url',
        wait: 'none',
      });
    });

    it('honours an explicit wait for common schemes', async () => {
      const { pages, navigate } = createHarness();

      await pages.navigate(HTTPS_URL, 'complete');
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: HTTPS_URL,
        wait: 'complete',
      });
    });

    it('honours an explicit wait for uncommon schemes rather than downgrading it', async () => {
      const { pages, navigate } = createHarness();

      await pages.navigate(MOZ_EXT_URL, 'complete');
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: MOZ_EXT_URL,
        wait: 'complete',
      });

      await pages.navigate('about:blank', 'interactive');
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: 'about:blank',
        wait: 'interactive',
      });
    });

    it('allows an explicit wait to opt out of waiting on a common scheme', async () => {
      const { pages, navigate } = createHarness();

      await pages.navigate(HTTPS_URL, 'none');
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: HTTPS_URL,
        wait: 'none',
      });
    });

    it('keeps the scheme-based default when no wait is given', async () => {
      const { pages, navigate } = createHarness();

      await pages.navigate(HTTPS_URL, undefined);
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-1',
        url: HTTPS_URL,
        wait: 'interactive',
      });
    });

    it('rejects navigation without a current context', async () => {
      const { pages, navigate } = createHarness([], null);

      await expect(pages.navigate(HTTPS_URL)).rejects.toThrow('no browsing context ID');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('adds target context to navigation errors', async () => {
      const { pages, navigate } = createHarness();
      navigate.mockRejectedValueOnce(new Error('no such frame'));

      await expect(pages.navigate(HTTPS_URL)).rejects.toThrow(
        'Failed to navigate browsing context "ctx-1"'
      );
    });
  });

  describe('page discovery', () => {
    it('lists stable page identities without switching tabs', async () => {
      const { pages, getTree, evaluate, switchWindow } = createHarness();

      const result = await pages.listPages();

      expect(getTree).toHaveBeenCalledWith({ maxDepth: 0 });
      expect(evaluate).toHaveBeenCalledTimes(2);
      expect(switchWindow).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          contextId: 'ctx-1',
          userContext: 'default',
          url: 'https://one.example/',
          title: 'First',
          isCurrent: true,
        },
        {
          contextId: 'ctx-2',
          userContext: 'container-work',
          url: 'https://two.example/',
          title: 'Second',
          isCurrent: false,
        },
      ]);
    });

    it('preserves IDs when protocol order changes', async () => {
      const { pages, getTree } = createHarness();
      getTree
        .mockResolvedValueOnce({ contexts: [FIRST_CONTEXT, SECOND_CONTEXT] })
        .mockResolvedValueOnce({ contexts: [SECOND_CONTEXT, FIRST_CONTEXT] });

      const first = await pages.listPages();
      const second = await pages.listPages();

      expect(first.map((page) => page.contextId)).toEqual(['ctx-1', 'ctx-2']);
      expect(second.map((page) => page.contextId)).toEqual(['ctx-2', 'ctx-1']);
      expect(second.find((page) => page.isCurrent)?.contextId).toBe('ctx-1');
    });

    it('returns an honest empty list when no pages exist', async () => {
      const { pages } = createHarness([], null);
      await expect(pages.listPages()).resolves.toEqual([]);
    });

    it('rejects stale current-context state', async () => {
      const { pages, evaluate } = createHarness([SECOND_CONTEXT], FIRST_CONTEXT.context);

      await expect(pages.listPages()).rejects.toThrow(
        'current browsing context "ctx-1" is not live'
      );
      expect(evaluate).not.toHaveBeenCalled();
    });

    it('names the context when title evaluation fails', async () => {
      const { pages, evaluate } = createHarness();
      evaluate.mockRejectedValueOnce(new Error('realm destroyed'));

      await expect(pages.listPages()).rejects.toThrow(
        'Failed to read title for browsing context "ctx-1": realm destroyed'
      );
    });

    it('propagates script exceptions while collecting titles', async () => {
      const { pages, evaluate } = createHarness();
      evaluate.mockResolvedValueOnce({
        type: 'exception',
        exceptionDetails: { text: 'document unavailable' },
      });

      await expect(pages.listPages()).rejects.toThrow('document unavailable');
    });

    it('propagates context discovery failures without synthetic pages', async () => {
      const { pages, getTree } = createHarness();
      getTree.mockRejectedValueOnce(new Error('connection closed'));

      await expect(pages.listPages()).rejects.toThrow(
        'Failed to list top-level browsing contexts: connection closed'
      );
    });
  });

  describe('classic navigation utilities', () => {
    it('delegates history and viewport operations to WebDriver', async () => {
      const { pages, navigateBack, navigateForward, setRect } = createHarness();

      await pages.navigateBack();
      await pages.navigateForward();
      await pages.setViewportSize(1280, 720);

      expect(navigateBack).toHaveBeenCalledTimes(1);
      expect(navigateForward).toHaveBeenCalledTimes(1);
      expect(setRect).toHaveBeenCalledWith({ width: 1280, height: 720 });
    });
  });

  describe('user contexts', () => {
    it('lists the default and non-default user contexts', async () => {
      const { pages } = createHarness();

      await expect(pages.listUserContexts()).resolves.toEqual([
        { userContext: 'default' },
        { userContext: 'container-work' },
      ]);
    });

    it('rejects a protocol result without the required default context', async () => {
      const { pages, getUserContexts } = createHarness();
      getUserContexts.mockResolvedValueOnce({
        userContexts: [{ userContext: 'container-work' }],
      });

      await expect(pages.listUserContexts()).rejects.toThrow(
        'browser did not return the required default user context'
      );
    });

    it('adds operation context to protocol failures', async () => {
      const { pages, getUserContexts } = createHarness();
      getUserContexts.mockRejectedValueOnce(new Error('unsupported operation'));

      await expect(pages.listUserContexts()).rejects.toThrow(
        'Failed to list browser user contexts: unsupported operation'
      );
    });
  });

  describe('selection', () => {
    it('selects the exact stable context ID', async () => {
      const { pages, switchWindow, setCurrentContextId } = createHarness([
        SECOND_CONTEXT,
        FIRST_CONTEXT,
      ]);

      const selected = await pages.selectPage(SECOND_CONTEXT.context);

      expect(switchWindow).toHaveBeenCalledWith('ctx-2');
      expect(setCurrentContextId).toHaveBeenCalledWith('ctx-2');
      expect(selected.contextId).toBe('ctx-2');
      expect(selected.isCurrent).toBe(true);
    });

    it('rejects stale context IDs before switching', async () => {
      const { pages, switchWindow } = createHarness();

      await expect(pages.selectPage('missing-context')).rejects.toThrow(
        'Browsing context "missing-context" is unavailable'
      );
      expect(switchWindow).not.toHaveBeenCalled();
    });

    it('adds target context to WebDriver switch failures', async () => {
      const { pages, switchWindow } = createHarness();
      switchWindow.mockRejectedValueOnce(new Error('tab closed'));

      await expect(pages.selectPage(SECOND_CONTEXT.context)).rejects.toThrow(
        'Failed to select browsing context "ctx-2": tab closed'
      );
    });
  });

  describe('createNewPage', () => {
    it('creates and selects a foreground page in the requested user context', async () => {
      const createdContext: BrowsingContext = {
        context: 'ctx-new',
        userContext: 'container-work',
        url: HTTPS_URL,
      };
      const { pages, create, navigate, getTree, switchWindow, getCurrent } = createHarness();
      create.mockResolvedValueOnce({
        context: createdContext.context,
        userContext: createdContext.userContext,
      });
      getTree.mockImplementation(async (params) => ({
        contexts: params.root === createdContext.context ? [createdContext] : [FIRST_CONTEXT],
      }));

      const page = await pages.createNewPage(
        HTTPS_URL,
        { userContext: 'container-work', background: false },
        'complete'
      );

      expect(create).toHaveBeenCalledWith({
        type: 'tab',
        referenceContext: 'ctx-1',
        background: false,
        userContext: 'container-work',
      });
      expect(navigate).toHaveBeenCalledWith({
        context: 'ctx-new',
        url: HTTPS_URL,
        wait: 'complete',
      });
      expect(switchWindow).toHaveBeenCalledWith('ctx-new');
      expect(getCurrent()).toBe('ctx-new');
      expect(page).toMatchObject({
        contextId: 'ctx-new',
        userContext: 'container-work',
        isCurrent: true,
      });
    });

    it('creates a background page without changing automation context', async () => {
      const createdContext: BrowsingContext = {
        context: 'ctx-background',
        userContext: 'container-work',
        url: HTTPS_URL,
      };
      const { pages, create, getTree, switchWindow, getCurrent } = createHarness();
      create.mockResolvedValueOnce({ context: createdContext.context });
      getTree.mockImplementation(async (params) => ({
        contexts: params.root === createdContext.context ? [createdContext] : [FIRST_CONTEXT],
      }));

      const page = await pages.createNewPage(HTTPS_URL, {
        userContext: 'container-work',
        background: true,
      });

      expect(switchWindow).not.toHaveBeenCalled();
      expect(getCurrent()).toBe('ctx-1');
      expect(page.isCurrent).toBe(false);
    });

    it('rejects creation without a current reference context', async () => {
      const { pages, create } = createHarness([], null);

      await expect(
        pages.createNewPage(HTTPS_URL, { userContext: 'default', background: false })
      ).rejects.toThrow('no current browsing context ID');
      expect(create).not.toHaveBeenCalled();
    });

    it('surfaces invalid user-context failures', async () => {
      const { pages, create } = createHarness();
      create.mockRejectedValueOnce(new Error('no such user context'));

      await expect(
        pages.createNewPage(HTTPS_URL, { userContext: 'missing', background: true })
      ).rejects.toThrow('Failed to create page in user context "missing"');
    });

    it('rejects a user-context mismatch reported by create', async () => {
      const { pages, create, navigate } = createHarness();
      create.mockResolvedValueOnce({ context: 'ctx-new', userContext: 'default' });

      await expect(
        pages.createNewPage(HTTPS_URL, {
          userContext: 'container-work',
          background: true,
        })
      ).rejects.toThrow('unexpected user context "default"');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('rejects a user-context mismatch found in the created page', async () => {
      const wrongContext: BrowsingContext = {
        context: 'ctx-new',
        userContext: 'default',
        url: HTTPS_URL,
      };
      const { pages, create, getTree } = createHarness();
      create.mockResolvedValueOnce({ context: wrongContext.context });
      getTree.mockResolvedValueOnce({ contexts: [wrongContext] });

      await expect(
        pages.createNewPage(HTTPS_URL, {
          userContext: 'container-work',
          background: true,
        })
      ).rejects.toThrow('unexpected user context "default"');
    });

    it('reports failure to select a created foreground page', async () => {
      const createdContext: BrowsingContext = {
        context: 'ctx-new',
        userContext: 'container-work',
        url: HTTPS_URL,
      };
      const { pages, create, switchWindow } = createHarness();
      create.mockResolvedValueOnce({
        context: createdContext.context,
        userContext: createdContext.userContext,
      });
      switchWindow.mockRejectedValueOnce(new Error('window disappeared'));

      await expect(
        pages.createNewPage(HTTPS_URL, {
          userContext: 'container-work',
          background: false,
        })
      ).rejects.toThrow('Created browsing context "ctx-new" but failed to select it');
    });
  });

  describe('closePage', () => {
    it('closes a non-current page without selecting it', async () => {
      const { pages, close, switchWindow, getCurrent } = createHarness();

      const result = await pages.closePage(SECOND_CONTEXT.context);

      expect(close).toHaveBeenCalledWith({ context: 'ctx-2' });
      expect(switchWindow).not.toHaveBeenCalled();
      expect(getCurrent()).toBe('ctx-1');
      expect(result).toEqual({ closedContextId: 'ctx-2', currentContextId: 'ctx-1' });
    });

    it('selects a remaining context after closing the current page', async () => {
      const { pages, getTree, close, switchWindow, getCurrent } = createHarness();
      getTree
        .mockResolvedValueOnce({ contexts: [FIRST_CONTEXT, SECOND_CONTEXT] })
        .mockResolvedValueOnce({ contexts: [SECOND_CONTEXT] });

      const result = await pages.closePage(FIRST_CONTEXT.context);

      expect(close).toHaveBeenCalledWith({ context: 'ctx-1' });
      expect(switchWindow).toHaveBeenCalledWith('ctx-2');
      expect(getCurrent()).toBe('ctx-2');
      expect(result.currentContextId).toBe('ctx-2');
    });

    it('rejects a stale target before closing anything', async () => {
      const { pages, close } = createHarness();

      await expect(pages.closePage('missing')).rejects.toThrow(
        'Browsing context "missing" is unavailable'
      );
      expect(close).not.toHaveBeenCalled();
    });

    it('rejects closing the final context', async () => {
      const { pages, close } = createHarness([FIRST_CONTEXT]);

      await expect(pages.closePage(FIRST_CONTEXT.context)).rejects.toThrow(
        'closing the last page has implementation-defined browser and session behavior'
      );
      expect(close).not.toHaveBeenCalled();
    });

    it('rejects closing the final context when current identity is unavailable', async () => {
      const { pages, close } = createHarness([FIRST_CONTEXT], null);

      await expect(pages.closePage(FIRST_CONTEXT.context)).rejects.toThrow(
        'closing the last page has implementation-defined browser and session behavior'
      );
      expect(close).not.toHaveBeenCalled();
    });

    it('adds target context to close failures', async () => {
      const { pages, close } = createHarness();
      close.mockRejectedValueOnce(new Error('prompt blocked close'));

      await expect(pages.closePage(SECOND_CONTEXT.context)).rejects.toThrow(
        'Failed to close browsing context "ctx-2": prompt blocked close'
      );
    });

    it('clears current identity if no context remains after a close race', async () => {
      const { pages, getTree, getCurrent } = createHarness();
      getTree
        .mockResolvedValueOnce({ contexts: [FIRST_CONTEXT, SECOND_CONTEXT] })
        .mockResolvedValueOnce({ contexts: [] });

      const result = await pages.closePage(FIRST_CONTEXT.context);

      expect(result.currentContextId).toBe(null);
      expect(getCurrent()).toBe(null);
    });

    it('keeps current identity cleared when rediscovery fails after close', async () => {
      const { pages, getTree, getCurrent } = createHarness();
      getTree
        .mockResolvedValueOnce({ contexts: [FIRST_CONTEXT, SECOND_CONTEXT] })
        .mockRejectedValueOnce(new Error('connection interrupted'));

      await expect(pages.closePage(FIRST_CONTEXT.context)).rejects.toThrow(
        'Failed to list top-level browsing contexts: connection interrupted'
      );
      expect(getCurrent()).toBe(null);
    });

    it('clears current identity when selecting a remaining context fails', async () => {
      const { pages, getTree, switchWindow, getCurrent } = createHarness();
      getTree
        .mockResolvedValueOnce({ contexts: [FIRST_CONTEXT, SECOND_CONTEXT] })
        .mockResolvedValueOnce({ contexts: [SECOND_CONTEXT] });
      switchWindow.mockRejectedValueOnce(new Error('remaining tab closed'));

      await expect(pages.closePage(FIRST_CONTEXT.context)).rejects.toThrow(
        'failed to select remaining context "ctx-2"'
      );
      expect(getCurrent()).toBe(null);
    });
  });
});
