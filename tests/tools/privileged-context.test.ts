/**
 * Tests for privileged context state consistency
 *
 * Verifies that select_privileged_context updates currentContextId,
 * and that helper tools (set_firefox_prefs, list_extensions) don't
 * silently break a user's privileged context selection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Privileged context state consistency', () => {
  const mockSetContext = vi.fn();
  const mockSwitchToWindow = vi.fn();
  const mockExecuteScript = vi.fn();
  const mockExecuteAsyncScript = vi.fn();

  // Track currentContextId state as the real code would
  let mockCurrentContextId: string | null;
  const mockSetCurrentContextId = vi.fn((id: string) => {
    mockCurrentContextId = id;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Start with a content context (user has a normal tab open)
    mockCurrentContextId = 'original-content-context';

    vi.doMock('../../src/index.js', () => ({
      getFirefox: vi.fn().mockResolvedValue({
        getDriver: () => ({
          switchTo: () => ({
            window: mockSwitchToWindow,
          }),
          setContext: mockSetContext,
          executeScript: mockExecuteScript,
          executeAsyncScript: mockExecuteAsyncScript,
        }),
        getCurrentContextId: () => mockCurrentContextId,
        setCurrentContextId: mockSetCurrentContextId,
        sendBiDiCommand: vi.fn().mockResolvedValue({
          contexts: [{ context: 'chrome-context-id', url: 'chrome://browser/content/browser.xhtml' }],
        }),
      }),
    }));
  });

  it('select_privileged_context should update currentContextId (BUG: it does not)', async () => {
    const { handleSelectPrivilegedContext } = await import(
      '../../src/tools/privileged-context.js'
    );

    await handleSelectPrivilegedContext({ contextId: 'chrome-context-id' });

    expect(mockSwitchToWindow).toHaveBeenCalledWith('chrome-context-id');
    expect(mockSetContext).toHaveBeenCalledWith('chrome');

    // BUG: select_privileged_context does NOT call setCurrentContextId
    // so currentContextId stays as 'original-content-context'
    expect(mockSetCurrentContextId).toHaveBeenCalledWith('chrome-context-id');
  });

  it('set_firefox_prefs after select_privileged_context should not revert to old context (BUG: it does)', async () => {
    const { handleSelectPrivilegedContext } = await import(
      '../../src/tools/privileged-context.js'
    );
    const { handleSetFirefoxPrefs } = await import(
      '../../src/tools/firefox-prefs.js'
    );

    // User selects privileged context
    await handleSelectPrivilegedContext({ contextId: 'chrome-context-id' });

    // BUG: currentContextId is still 'original-content-context' because
    // select_privileged_context never called setCurrentContextId.
    // So when set_firefox_prefs saves originalContextId, it gets the wrong value.
    mockExecuteScript.mockResolvedValue(undefined);
    mockSwitchToWindow.mockClear();
    mockSetContext.mockClear();

    await handleSetFirefoxPrefs({ prefs: { 'browser.ml.enable': true } });

    // The finally block in set_firefox_prefs restores to originalContextId.
    // Because currentContextId was never updated, it restores to
    // 'original-content-context' — silently undoing the privileged context selection.
    const setContextCalls = mockSetContext.mock.calls;
    const lastSetContext = setContextCalls[setContextCalls.length - 1];

    // BUG: last setContext call is 'content' — it reverted the privileged context
    // After fix: the tool should detect we're already in a privileged context
    // and restore back to it (or at minimum, currentContextId should be correct)
    expect(lastSetContext[0]).not.toBe('content');
  });
});
