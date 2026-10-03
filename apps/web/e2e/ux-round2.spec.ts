import { test, expect, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'docs/evidence');
const localnet = process.env.SWAPCIRCLE_UX_ROUND2_LOCALNET === '1';
const unavailableRpc = process.env.SWAPCIRCLE_UX_RPC_OFFLINE === '1';
const runId = process.env.SWAPCIRCLE_UX_RUN_ID || `playwright-${process.ppid}`;
const outcomes: { test: string; status: string | undefined }[] = [];
const measurements: Record<string, unknown> = {};
const settled = 'AikkwU6i7MZhJyu94op9pBmEhMRTgYGZ9ve6qZGJGQVi';
const refunded = '2XiE3MLZhFVLeo6NQhK72sjUx4GzokY4BYYDn7YPdHgB';

test.use({ trace: 'off' });
test.afterEach(async ({}, info) => { outcomes.push({ test: info.title, status: info.status }); });
test.afterAll(() => {
  if (!localnet) return;
  mkdirSync(evidence, { recursive: true });
  const path = resolve(evidence, 'ui-ux-audit-round2.json');
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const sameRun = previous.runId === runId;
  const combined = [...new Map<string, typeof outcomes[number]>([
    ...(sameRun ? previous.outcomes : []), ...outcomes,
  ].map(result => [result.test, result])).values()];
  writeFileSync(path, JSON.stringify({
    checkedAt: new Date().toISOString(), runId,
    audit: 'docs/evidence/ux-independent-2.json', plan: 'docs/UX-AUDIT-2026-10-03.md',
    execution: 'Standardowy Playwright na źródłach TypeScript, jeden worker, Chrome',
    scope: 'Wyłącznie odczyt i nawigacja klawiaturą. Pięć głównych tras i dwa istniejące konta cykli localnet, PL/EN, 390/1440 px. Bez portfela, podpisów, transakcji i resetu rejestru.',
    outcomes: combined, measurements: { ...(sameRun ? previous.measurements : {}), ...measurements },
    complete: combined.length === 5 && combined.every(result => result.status === 'passed'),
    runtimeSourceSha256: Object.fromEntries(['apps/web/src/App.tsx', 'apps/web/src/styles.css'].map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')])),
    limitations: ['Próbkowy pomiar kontrastu i nawigacji klawiaturą, bez deklaracji pełnej zgodności WCAG, powiększenia przeglądarki lub testu czytnika ekranu.', 'Stan portfela pozostaje rozłączony; test nie dotyczy przebiegu podpisywania transakcji.'],
  }, null, 2) + '\n');
});

async function focusedDescription(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement;
    return { tag: active.tagName, id: active.id, name: active.getAttribute('aria-label') || active.textContent?.trim(), mainContainsFocus: !!document.querySelector('main')?.contains(active) };
  });
}

async function firstTabbable(main: Locator) {
  const controls = main.locator('a[href], area[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable="true"]');
  const index = await controls.evaluateAll(elements => elements
    .map((element, index) => ({ element: element as HTMLElement, index }))
    .filter(({ element }) => element.tabIndex >= 0 && !element.matches(':disabled, [aria-disabled="true"]')
      && !element.closest('[inert]') && element.getClientRects().length > 0
      && getComputedStyle(element).visibility === 'visible')
    .sort((a, b) => (a.element.tabIndex || Number.MAX_SAFE_INTEGER) - (b.element.tabIndex || Number.MAX_SAFE_INTEGER) || a.index - b.index)[0]?.index ?? -1);
  expect(index, 'The current main content must contain an enabled, visible keyboard control').toBeGreaterThanOrEqual(0);
  return controls.nth(index);
}

for (const width of [390, 1440]) for (const lang of ['pl', 'en'] as const) {
  test(`skip link retains each route and keyboard position (${lang}, ${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.addInitScript(language => localStorage.setItem('swapcircle:language', language), lang);
    if (unavailableRpc) await page.route('http://127.0.0.1:8899/**', route => route.abort('connectionrefused'));
    const samples = [];
    const routes = [
      { route: 'board' },
      { route: 'matches' },
      { route: 'deposits' },
      { route: 'recovery' },
      { route: 'rules' },
      ...(localnet ? [
        { route: `cycle/${settled}`, state: lang === 'pl' ? 'Rozliczono' : 'Settled' },
        { route: `cycle/${refunded}`, state: lang === 'pl' ? 'Zwrócono' : 'Refunded' },
      ] : []),
    ];
    for (const [index, route] of routes.entries()) {
      // A distinct query forces a new document, starting keyboard navigation at
      // the page beginning instead of reusing the prior route's focused control.
      await page.goto(`/?ux-skip=${lang}-${width}-${index}#/${route.route}`, { waitUntil: 'domcontentloaded' });
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
      // Wait for the network read to resolve before checking the keyboard order.
      // When RPC is unavailable, the banner's Refresh button is correctly the
      // first control in main, ahead of route-specific actions such as Add offer.
      await expect(page.locator('.network-ready, .connection-banner')).toHaveCount(1);
      if (unavailableRpc) await expect(main.locator('.connection-banner')).toBeVisible();
      if ('state' in route) await expect(page.locator('.cycle-heading')).toContainText(route.state!);
      const before = { url: page.url(), heading: await main.getByRole('heading', { level: 1 }).innerText() };
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: lang === 'pl' ? 'Przejdź do treści' : 'Skip to content', exact: true });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(before.url);
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(before.heading);
      await expect.poll(() => main.evaluate(element => document.activeElement === element || document.activeElement === element.querySelector('h1'))).toBe(true);
      const focusAfterSkip = await focusedDescription(page);
      const firstControl = await firstTabbable(main);
      await expect(firstControl).toBeEnabled();
      await expect(firstControl).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(firstControl).toBeFocused();
      await expect(firstControl).toBeVisible();
      await expect(page).toHaveURL(before.url);
      const focusAfterTab = await focusedDescription(page);
      expect(focusAfterTab.mainContainsFocus).toBe(true);
      samples.push({ route: `#/${route.route}`, heading: before.heading, exactUrlUnchanged: true, unavailableRpc, focusAfterSkip, focusAfterTab });
      if (width === 390 && lang === 'pl' && route.route === 'matches') await page.screenshot({ path: resolve(evidence, unavailableRpc ? 'ui-ux-ci-offline-skip-mobile.png' : 'ui-ux-round2-skip-mobile.png'), fullPage: false });
    }
    measurements[`skip-${lang}-${width}`] = samples;
  });
}

test('statistic descriptions remain readable and complete in both languages and viewport sizes', async ({ page }) => {
  const samples = [];
  await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  for (const lang of ['pl', 'en'] as const) {
    if (await page.locator('html').getAttribute('lang') !== lang) await page.locator('.language-button').click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await expect(page.locator('.stat > small')).toHaveCount(4);
      const descriptions = await page.locator('.stat > small').evaluateAll(elements => elements.map(element => {
        const rgba = (color: string) => { const values = color.match(/[\d.]+/g)?.map(Number) || []; return [values[0] || 0, values[1] || 0, values[2] || 0, values[3] ?? 1]; };
        const over = (top: number[], bottom: number[]) => [0, 1, 2].map(index => top[index]! * top[3]! + bottom[index]! * (1 - top[3]!));
        const ancestors: Element[] = []; for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
        let background = [255, 255, 255];
        const images: string[] = [];
        for (const node of ancestors) { const style = getComputedStyle(node); background = over(rgba(style.backgroundColor), background); if (style.backgroundImage !== 'none') images.push(style.backgroundImage); }
        const style = getComputedStyle(element), foreground = over(rgba(style.color), background);
        const luminance = (rgb: number[]) => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
        const front = luminance(foreground), back = luminance(background);
        const range = document.createRange(); range.selectNodeContents(element);
        const card = element.parentElement!.getBoundingClientRect();
        const siblings = [...element.parentElement!.children].filter(node => node !== element).map(node => node.getBoundingClientRect().toJSON());
        return { text: element.textContent, foreground, background, contrast: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05), fontSize: parseFloat(style.fontSize), images, card: card.toJSON(), lines: [...range.getClientRects()].map(line => line.toJSON()), siblings, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, textOverflow: style.textOverflow, overflow: style.overflow, opacity: style.opacity };
      }));
      for (const sample of descriptions) {
        expect(sample.images).toEqual([]);
        expect(sample.opacity).toBe('1');
        expect(sample.contrast).toBeGreaterThanOrEqual(4.5);
        expect(sample.fontSize).toBeGreaterThanOrEqual(12);
        expect(sample.documentWidth).toBeLessThanOrEqual(width);
        expect(sample.textOverflow).not.toBe('ellipsis');
        expect(sample.lines.length).toBeGreaterThan(0);
        for (const line of sample.lines) {
          expect(line.left).toBeGreaterThanOrEqual(Math.max(0, sample.card.left));
          expect(line.right).toBeLessThanOrEqual(Math.min(width, sample.card.right) + 1);
          expect(line.top).toBeGreaterThanOrEqual(sample.card.top);
          expect(line.bottom).toBeLessThanOrEqual(sample.card.bottom + 1);
          for (const sibling of sample.siblings) {
            const overlapX = Math.max(0, Math.min(line.right, sibling.right) - Math.max(line.left, sibling.left));
            const overlapY = Math.max(0, Math.min(line.bottom, sibling.bottom) - Math.max(line.top, sibling.top));
            expect(overlapX * overlapY).toBe(0);
          }
        }
      }
      samples.push({ language: lang, width, descriptions });
      if (width === 390) await page.locator('.stats').screenshot({ path: resolve(evidence, `ui-ux-round2-stats-${lang}-mobile.png`) });
    }
  }
  measurements.statistics = samples;
});
