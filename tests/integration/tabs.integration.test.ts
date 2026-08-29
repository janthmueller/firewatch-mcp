/**
 * Integration tests for stable page and Firefox user-context identity.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitForElementInSnapshot,
  findNodesInSnapshot,
  waitForPageLoad,
} from '../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import type { PageInfo } from '@/firefox/types.js';
import type { SnapshotNode } from '@/firefox/snapshot/types.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesPath = resolve(__dirname, '../fixtures');

interface CreateUserContextResult {
  userContext: string;
}

describe('Tab Management Integration Tests', () => {
  let firefox: FirefoxClient;
  let isolatedUserContext: string;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    const result: CreateUserContextResult = await firefox.sendBiDiCommand(
      'browser.createUserContext',
      {}
    );
    isolatedUserContext = result.userContext;
  }, 30000);

  afterAll(async () => {
    if (firefox) {
      const pages: PageInfo[] = await firefox.listPages().catch(() => []);
      const defaultPage: PageInfo | undefined = pages.find(
        (page: PageInfo): boolean => page.userContext === 'default'
      );
      if (defaultPage) {
        await firefox.selectPage(defaultPage.contextId).catch(() => undefined);
      }
      for (const page of pages) {
        if (page.userContext === isolatedUserContext) {
          await firefox.closePage(page.contextId).catch(() => undefined);
        }
      }
      await firefox
        .sendBiDiCommand('browser.removeUserContext', { userContext: isolatedUserContext })
        .catch(() => undefined);
    }
    await closeFirefox(firefox);
  });

  it('lists stable top-level page identity', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    await firefox.navigate(fixturePath);

    const pages: PageInfo[] = await firefox.listPages();
    const currentPage: PageInfo | undefined = pages.find(
      (page: PageInfo): boolean => page.isCurrent
    );

    expect(pages.length).toBeGreaterThan(0);
    expect(currentPage).toMatchObject({
      contextId: firefox.getCurrentContextId(),
      userContext: 'default',
      url: fixturePath,
    });
    expect(typeof currentPage?.title).toBe('string');
  }, 15000);

  it('lists default and isolated Firefox user contexts', async () => {
    const userContexts = await firefox.listUserContexts();
    const ids: string[] = userContexts.map((context): string => context.userContext);

    expect(ids).toContain('default');
    expect(ids).toContain(isolatedUserContext);
  }, 15000);

  it('creates a background page in an explicit non-default user context', async () => {
    const originalContextId: string | null = firefox.getCurrentContextId();
    const fixturePath = `file://${fixturesPath}/simple.html`;

    const created: PageInfo = await firefox.createNewPage(fixturePath, {
      userContext: isolatedUserContext,
      background: true,
    });

    expect(created.userContext).toBe(isolatedUserContext);
    expect(created.isCurrent).toBe(false);
    expect(firefox.getCurrentContextId()).toBe(originalContextId);

    const listed: PageInfo | undefined = (await firefox.listPages()).find(
      (page: PageInfo): boolean => page.contextId === created.contextId
    );
    expect(listed?.userContext).toBe(isolatedUserContext);

    await firefox.closePage(created.contextId);
    expect(firefox.getCurrentContextId()).toBe(originalContextId);
  }, 20000);

  it('selects by stable context ID after list order changes', async () => {
    const originalContextId: string | null = firefox.getCurrentContextId();
    if (!originalContextId) {
      throw new Error('Expected an active browsing context');
    }
    const fixturePath = `file://${fixturesPath}/form.html`;
    const created: PageInfo = await firefox.createNewPage(fixturePath, {
      userContext: 'default',
      background: true,
    });

    const selected: PageInfo = await firefox.selectPage(created.contextId);
    expect(selected.contextId).toBe(created.contextId);
    expect(selected.isCurrent).toBe(true);
    expect(firefox.getCurrentContextId()).toBe(created.contextId);

    await firefox.selectPage(originalContextId);
    await firefox.closePage(created.contextId);
  }, 20000);

  it('keeps context IDs stable across repeated discovery', async () => {
    const fixturePath = `file://${fixturesPath}/simple.html`;
    const created: PageInfo = await firefox.createNewPage(fixturePath, {
      userContext: 'default',
      background: true,
    });

    const firstIds: Set<string> = new Set(
      (await firefox.listPages()).map((page: PageInfo): string => page.contextId)
    );
    const secondIds: Set<string> = new Set(
      (await firefox.listPages()).map((page: PageInfo): string => page.contextId)
    );

    expect(secondIds).toEqual(firstIds);
    expect(secondIds.has(created.contextId)).toBe(true);

    await firefox.closePage(created.contextId);
  }, 20000);

  it('closes a non-current page without changing the current context', async () => {
    const originalContextId: string | null = firefox.getCurrentContextId();
    const fixturePath = `file://${fixturesPath}/simple.html`;
    const created: PageInfo = await firefox.createNewPage(fixturePath, {
      userContext: 'default',
      background: true,
    });

    const result = await firefox.closePage(created.contextId);

    expect(result).toEqual({
      closedContextId: created.contextId,
      currentContextId: originalContextId,
    });
    expect(firefox.getCurrentContextId()).toBe(originalContextId);
    await expect(firefox.getPage(created.contextId)).rejects.toThrow(created.contextId);
  }, 20000);

  it('selects a remaining page after closing the current page', async () => {
    const originalContextId: string | null = firefox.getCurrentContextId();
    if (!originalContextId) {
      throw new Error('Expected an active browsing context');
    }
    const fixturePath = `file://${fixturesPath}/form.html`;
    const created: PageInfo = await firefox.createNewPage(fixturePath, {
      userContext: 'default',
      background: false,
    });

    const result = await firefox.closePage(created.contextId);

    expect(result.closedContextId).toBe(created.contextId);
    expect(result.currentContextId).toBe(originalContextId);
    expect(firefox.getCurrentContextId()).toBe(result.currentContextId);
    expect((await firefox.listPages()).some((page: PageInfo): boolean => page.isCurrent)).toBe(
      true
    );
  }, 20000);

  it('maintains snapshot isolation when switching by context ID', async () => {
    const simplePath = `file://${fixturesPath}/simple.html`;
    const formPath = `file://${fixturesPath}/form.html`;

    await firefox.navigate(simplePath);
    await waitForPageLoad();
    const firstContextId: string | null = firefox.getCurrentContextId();
    if (!firstContextId) {
      throw new Error('Expected an active browsing context');
    }

    const secondPage: PageInfo = await firefox.createNewPage(formPath, {
      userContext: 'default',
      background: false,
    });
    await waitForPageLoad();

    const emailElement = await waitForElementInSnapshot(
      firefox,
      (node: SnapshotNode): boolean => node.id === 'email',
      10000
    );
    expect(emailElement).toBeDefined();

    const snapshot2 = await firefox.takeSnapshot();
    const formElements: SnapshotNode[] = findNodesInSnapshot(
      snapshot2.json.root,
      (node: SnapshotNode): boolean => node.id === 'email'
    );
    expect(formElements.length).toBeGreaterThan(0);

    await firefox.selectPage(firstContextId);
    await waitForPageLoad();

    const clickButton = await waitForElementInSnapshot(
      firefox,
      (node: SnapshotNode): boolean => node.id === 'clickBtn',
      10000
    );
    expect(clickButton).toBeDefined();

    const snapshot1 = await firefox.takeSnapshot();
    const simpleElements: SnapshotNode[] = findNodesInSnapshot(
      snapshot1.json.root,
      (node: SnapshotNode): boolean => node.id === 'clickBtn'
    );
    expect(simpleElements.length).toBeGreaterThan(0);

    const uids = (root: SnapshotNode): string[] =>
      findNodesInSnapshot(root, (): boolean => true).map((node: SnapshotNode): string => node.uid);
    const firstUids: Set<string> = new Set(uids(snapshot1.json.root));
    expect(uids(snapshot2.json.root).some((uid: string): boolean => firstUids.has(uid))).toBe(
      false
    );

    await firefox.closePage(secondPage.contextId);
  }, 30000);
});
