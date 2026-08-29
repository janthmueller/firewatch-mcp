/**
 * Page/Tab/Window management
 */

import { WebDriver } from 'selenium-webdriver';
import { log, logDebug } from '../utils/logger.js';
import type {
  BrowsingContext,
  BrowsingContextId,
  ClosePageResult,
  CreatePageOptions,
  PageInfo,
  UserContextId,
  UserContextInfo,
} from './types.js';

const COMMON_URL_SCHEMES: readonly string[] = ['http:', 'https:', 'data:', 'blob:', 'file:'];

/**
 * Check if a URL uses a common scheme that supports load events.
 * Non-common schemes = moz-extension:, about:, ...
 */
export function isCommonScheme(url: string): boolean {
  try {
    return COMMON_URL_SCHEMES.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export interface BrowsingContextGetTreeResult {
  contexts: BrowsingContext[];
}

export interface BrowserGetUserContextsResult {
  userContexts: UserContextInfo[];
}

export interface BrowsingContextCreateResult {
  context: BrowsingContextId;
  userContext?: UserContextId;
}

interface ScriptEvaluateSuccess {
  type: 'success';
  result: {
    type: 'string';
    value: string;
  };
}

interface ScriptEvaluateException {
  type: 'exception';
  exceptionDetails: {
    text: string;
  };
}

export type ScriptEvaluateResult = ScriptEvaluateSuccess | ScriptEvaluateException;

export interface PageBiDi {
  navigate(params: {
    context: BrowsingContextId;
    url: string;
    wait: ReadinessState;
  }): Promise<void>;
  getTree(params: {
    maxDepth: number;
    root?: BrowsingContextId;
  }): Promise<BrowsingContextGetTreeResult>;
  getUserContexts(): Promise<BrowserGetUserContextsResult>;
  evaluate(params: {
    expression: string;
    awaitPromise: boolean;
    target: { context: BrowsingContextId };
  }): Promise<ScriptEvaluateResult>;
  create(params: {
    type: 'tab';
    referenceContext: BrowsingContextId;
    background: boolean;
    userContext: UserContextId;
  }): Promise<BrowsingContextCreateResult>;
  close(params: { context: BrowsingContextId }): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * WebDriver BiDi browsingContext.ReadinessState.
 * - "none": return as soon as navigation starts
 * - "interactive": wait for DOMContentLoaded
 * - "complete": wait for the load event, including subresources
 */
export const READINESS_STATES = ['none', 'interactive', 'complete'] as const;

export type ReadinessState = (typeof READINESS_STATES)[number];

export function isReadinessState(value: unknown): value is ReadinessState {
  return READINESS_STATES.includes(value as ReadinessState);
}

export class PageManagement {
  constructor(
    private readonly driver: WebDriver,
    private readonly getCurrentContextId: () => BrowsingContextId | null,
    private readonly setCurrentContextId: (id: BrowsingContextId | null) => void,
    private readonly bidi: PageBiDi
  ) {}

  /**
   * Navigate to URL using BiDi
   *
   * @param url - Target URL
   * @param waitOverride - Explicit readiness state to wait for. When omitted,
   *   common schemes wait for "interactive" and uncommon schemes do not wait.
   */
  async navigate(url: string, waitOverride?: ReadinessState): Promise<void> {
    const contextId: BrowsingContextId | null = this.getCurrentContextId();
    if (!contextId) {
      throw new Error(`Cannot navigate: no browsing context ID`);
    }

    await this.navigateContext(contextId, url, waitOverride);
  }

  private async navigateContext(
    contextId: BrowsingContextId,
    url: string,
    waitOverride?: ReadinessState
  ): Promise<void> {
    // Default wait time is "interactive" (DOMContentLoaded).
    // All uncommon schemes use wait time "none".
    // An explicit override is honoured for every scheme: silently downgrading it
    // would discard what the caller asked for with no way to tell.
    const wait: ReadinessState = waitOverride ?? (isCommonScheme(url) ? 'interactive' : 'none');

    // Navigate using direct BiDi
    try {
      await this.bidi.navigate({
        context: contextId,
        url,
        wait,
      });
    } catch (error) {
      throw new Error(
        `Failed to navigate browsing context "${contextId}" to ${url}: ${errorMessage(error)}`
      );
    }

    logDebug(`BiDi navigate (wait:${wait}) to: ${url}`);
    log(`Navigated to: ${url}`);
  }

  /**
   * Navigate back in history
   */
  async navigateBack(): Promise<void> {
    await this.driver.navigate().back();
  }

  /**
   * Navigate forward in history
   */
  async navigateForward(): Promise<void> {
    await this.driver.navigate().forward();
  }

  /**
   * Set viewport size
   */
  async setViewportSize(width: number, height: number): Promise<void> {
    await this.driver.manage().window().setRect({ width, height });
  }

  /**
   * Accept dialog (alert/confirm/prompt)
   * @param promptText - Optional text to enter in prompt dialog
   */
  async acceptDialog(promptText?: string): Promise<void> {
    try {
      const alert = await this.driver.switchTo().alert();
      if (promptText !== undefined) {
        await alert.sendKeys(promptText);
      }
      await alert.accept();
    } catch (error) {
      throw new Error(
        `Failed to accept dialog: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Dismiss dialog (alert/confirm/prompt)
   */
  async dismissDialog(): Promise<void> {
    try {
      const alert = await this.driver.switchTo().alert();
      await alert.dismiss();
    } catch (error) {
      throw new Error(
        `Failed to dismiss dialog: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getTopLevelContexts(): Promise<BrowsingContext[]> {
    try {
      const result: BrowsingContextGetTreeResult = await this.bidi.getTree({ maxDepth: 0 });
      return result.contexts;
    } catch (error) {
      throw new Error(`Failed to list top-level browsing contexts: ${errorMessage(error)}`);
    }
  }

  private async getBrowsingContext(contextId: BrowsingContextId): Promise<BrowsingContext> {
    try {
      const result: BrowsingContextGetTreeResult = await this.bidi.getTree({
        root: contextId,
        maxDepth: 0,
      });
      const context: BrowsingContext | undefined = result.contexts[0];
      if (!context || result.contexts.length !== 1) {
        throw new Error(`expected exactly one context, received ${result.contexts.length}`);
      }
      return context;
    } catch (error) {
      throw new Error(`Browsing context "${contextId}" is unavailable: ${errorMessage(error)}`);
    }
  }

  private async getTitle(contextId: BrowsingContextId): Promise<string> {
    let result: ScriptEvaluateResult;
    try {
      result = await this.bidi.evaluate({
        expression: 'document.title',
        awaitPromise: false,
        target: { context: contextId },
      });
    } catch (error) {
      throw new Error(
        `Failed to read title for browsing context "${contextId}": ${errorMessage(error)}`
      );
    }

    if (result.type === 'exception') {
      throw new Error(
        `Failed to read title for browsing context "${contextId}": ${result.exceptionDetails.text}`
      );
    }
    return result.result.value;
  }

  private async toPageInfo(context: BrowsingContext): Promise<PageInfo> {
    const title: string = await this.getTitle(context.context);
    return {
      contextId: context.context,
      userContext: context.userContext,
      url: context.url,
      title,
      isCurrent: context.context === this.getCurrentContextId(),
    };
  }

  async listPages(): Promise<PageInfo[]> {
    const contexts: BrowsingContext[] = await this.getTopLevelContexts();
    if (contexts.length === 0) {
      return [];
    }

    const currentContextId: BrowsingContextId | null = this.getCurrentContextId();
    if (!currentContextId) {
      throw new Error('Cannot list pages: no current browsing context ID');
    }
    if (!contexts.some((context: BrowsingContext) => context.context === currentContextId)) {
      throw new Error(
        `Cannot list pages: current browsing context "${currentContextId}" is not live`
      );
    }

    return await Promise.all(
      contexts.map((context: BrowsingContext): Promise<PageInfo> => this.toPageInfo(context))
    );
  }

  async listUserContexts(): Promise<UserContextInfo[]> {
    try {
      const result: BrowserGetUserContextsResult = await this.bidi.getUserContexts();
      const hasDefaultContext: boolean = result.userContexts.some(
        (context: UserContextInfo): boolean => context.userContext === 'default'
      );
      if (!hasDefaultContext) {
        throw new Error('browser did not return the required default user context');
      }
      return result.userContexts;
    } catch (error) {
      throw new Error(`Failed to list browser user contexts: ${errorMessage(error)}`);
    }
  }

  async getPage(contextId: BrowsingContextId): Promise<PageInfo> {
    const context: BrowsingContext = await this.getBrowsingContext(contextId);
    return await this.toPageInfo(context);
  }

  async selectPage(contextId: BrowsingContextId): Promise<PageInfo> {
    const page: PageInfo = await this.getPage(contextId);
    try {
      await this.driver.switchTo().window(contextId);
    } catch (error) {
      throw new Error(`Failed to select browsing context "${contextId}": ${errorMessage(error)}`);
    }
    this.setCurrentContextId(contextId);
    return { ...page, isCurrent: true };
  }

  async createNewPage(
    url: string,
    options: CreatePageOptions,
    waitOverride?: ReadinessState
  ): Promise<PageInfo> {
    const referenceContext: BrowsingContextId | null = this.getCurrentContextId();
    if (!referenceContext) {
      throw new Error('Cannot create page: no current browsing context ID');
    }

    let created: BrowsingContextCreateResult;
    try {
      created = await this.bidi.create({
        type: 'tab',
        referenceContext,
        background: options.background,
        userContext: options.userContext,
      });
    } catch (error) {
      throw new Error(
        `Failed to create page in user context "${options.userContext}": ${errorMessage(error)}`
      );
    }

    if (created.userContext !== undefined && created.userContext !== options.userContext) {
      throw new Error(
        `Created browsing context "${created.context}" in unexpected user context ` +
          `"${created.userContext}" instead of "${options.userContext}"`
      );
    }

    await this.navigateContext(created.context, url, waitOverride);

    if (!options.background) {
      try {
        await this.driver.switchTo().window(created.context);
      } catch (error) {
        throw new Error(
          `Created browsing context "${created.context}" but failed to select it: ${errorMessage(error)}`
        );
      }
      this.setCurrentContextId(created.context);
    }

    const page: PageInfo = await this.getPage(created.context);
    if (page.userContext !== options.userContext) {
      throw new Error(
        `Created browsing context "${created.context}" in unexpected user context ` +
          `"${page.userContext}" instead of "${options.userContext}"`
      );
    }
    return page;
  }

  async closePage(contextId: BrowsingContextId): Promise<ClosePageResult> {
    const contextsBeforeClose: BrowsingContext[] = await this.getTopLevelContexts();
    const targetExists: boolean = contextsBeforeClose.some(
      (context: BrowsingContext): boolean => context.context === contextId
    );
    if (!targetExists) {
      throw new Error(`Browsing context "${contextId}" is unavailable`);
    }

    if (contextsBeforeClose.length === 1) {
      throw new Error(
        `Cannot close browsing context "${contextId}": closing the last page has ` +
          'implementation-defined browser and session behavior'
      );
    }

    const currentContextId: BrowsingContextId | null = this.getCurrentContextId();
    const closesCurrentContext: boolean = currentContextId === contextId;

    try {
      await this.bidi.close({
        context: contextId,
      });
    } catch (error) {
      throw new Error(`Failed to close browsing context "${contextId}": ${errorMessage(error)}`);
    }

    if (!closesCurrentContext) {
      return {
        closedContextId: contextId,
        currentContextId,
      };
    }

    // The cached identity is invalid as soon as its context has been closed.
    // Keep it null until a remaining WebDriver context is selected successfully.
    this.setCurrentContextId(null);
    const remainingContexts: BrowsingContext[] = await this.getTopLevelContexts();
    const nextContext: BrowsingContext | undefined = remainingContexts[0];
    if (!nextContext) {
      return {
        closedContextId: contextId,
        currentContextId: null,
      };
    }

    try {
      await this.driver.switchTo().window(nextContext.context);
    } catch (error) {
      throw new Error(
        `Closed browsing context "${contextId}" but failed to select remaining context ` +
          `"${nextContext.context}": ${errorMessage(error)}`
      );
    }
    this.setCurrentContextId(nextContext.context);
    return {
      closedContextId: contextId,
      currentContextId: nextContext.context,
    };
  }
}
