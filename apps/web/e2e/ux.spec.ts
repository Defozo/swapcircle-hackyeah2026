import { test, expect, type Locator, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const evidence = resolve(import.meta.dirname, '../../../docs/evidence');
const localnet = process.env.SWAPCIRCLE_UX_LOCALNET === '1';
const settled = 'AikkwU6i7MZhJyu94op9pBmEhMRTgYGZ9ve6qZGJGQVi';
const refunded = '2XiE3MLZhFVLeo6NQhK72sjUx4GzokY4BYYDn7YPdHgB';
const outcomes: { test: string; status: string | undefined }[] = [];
const measurements: Record<string, unknown> = {};
// Restarted Playwright workers share their runner PID, so a failure cannot
// erase the earlier result when the remaining tests write their evidence.
const runId = process.env.SWAPCIRCLE_UX_RUN_ID || `playwright-${process.ppid}`;
test.use({ trace: 'off' });
test.afterEach(async ({}, info) => { outcomes.push({ test: info.title, status: info.status }); });
test.afterAll(() => {
  if (!localnet) return;
  mkdirSync(evidence, { recursive: true });
  const path = resolve(evidence, 'ui-ux-audit.json');
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const sameRun = previous.runId === runId;
  const combinedOutcomes = [...new Map<string, typeof outcomes[number]>([
    ...(sameRun ? previous.outcomes : []), ...outcomes,
  ].map(result => [result.test, result])).values()];
  writeFileSync(path, JSON.stringify({
    checkedAt: new Date().toISOString(), audit: 'docs/UX-AUDIT-2026-10-03.md',
    runId, execution: process.env.SWAPCIRCLE_UX_EXECUTION || 'Playwright uruchomiony na źródłach testów TypeScript',
    scope: 'Regresja przeglądarkowa wyłącznie do odczytu. Rzeczywiste końcowe stany kont localnet; test Funding jawnie podmienia odpowiedź RPC i zegar przeglądarki. Bez podpisów, transakcji i resetu rejestru.',
    previousAttempts: previous.previousAttempts || [],
    outcomes: combinedOutcomes, measurements: { ...(sameRun ? previous.measurements : {}), ...measurements },
    complete: combinedOutcomes.length === 4 && combinedOutcomes.every(result => result.status === 'passed'),
    limitations: ['Wybrane próbki nawigacji klawiaturą i kontrastu, bez deklaracji pełnej zgodności WCAG lub testowania czytnika ekranu.', 'Fixture Funding sprawdza wyłącznie prezentację, a nie wykonanie w łańcuchu.'],
  }, null, 2));
});

async function language(page: Page, target: 'pl' | 'en') {
  if (await page.locator('html').getAttribute('lang') !== target) await page.locator('.language-button').click();
  await expect(page.locator('html')).toHaveAttribute('lang', target);
}
async function focusSnapshot(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const box = element.getBoundingClientRect(), css = getComputedStyle(element);
    // A composite field may draw the keyboard focus ring around its label.
    // Before/focused/after browser measurements verify this for the search field.
    let focusRing: { tag: string; outline: string; width: number; left: number; right: number } | null = null;
    for (let node: HTMLElement | null = element, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
      const style = getComputedStyle(node), bounds = node.getBoundingClientRect();
      if (node.matches(':focus-within') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) {
        focusRing = { tag: node.tagName, outline: style.outline, width: bounds.width, left: bounds.left, right: bounds.right }; break;
      }
    }
    return { name: element.getAttribute('aria-label') || element.textContent?.trim(), tag: element.tagName, inSidebar: !!element.closest('aside'), left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, visibility: css.visibility, focusRing, viewport: innerWidth };
  });
}
async function assertVisibleFocus(page: Page) {
  // Opening the menu animates its position. Check the final visible geometry,
  // rather than sampling the intermediate transform immediately after Enter.
  await expect.poll(async () => {
    const current = await focusSnapshot(page);
    return current.tag === 'BODY' || (current.visibility === 'visible' && current.width > 0
      && current.left >= -1 && current.right <= current.viewport + 1);
  }, { timeout: 3000 }).toBe(true);
  const current = await focusSnapshot(page);
  if (current.tag !== 'BODY') {
    expect(current.width).toBeGreaterThan(0);
    expect(current.visibility).toBe('visible');
    expect(current.left).toBeGreaterThanOrEqual(-1);
    expect(current.right).toBeLessThanOrEqual(current.viewport + 1);
    expect(current.focusRing, `Widoczny fokus: ${current.name}`).not.toBeNull();
    expect(current.focusRing!.width).toBeGreaterThan(0);
    expect(current.focusRing!.left).toBeGreaterThanOrEqual(-1);
    expect(current.focusRing!.right).toBeLessThanOrEqual(current.viewport + 1);
  }
  return current;
}

test('closed mobile navigation is skipped by keyboard and opened navigation restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=app', { waitUntil: 'domcontentloaded' });
  const toggle = page.getByRole('button', { name: 'Otwórz menu', exact: true });
  await expect(toggle).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  const focusSamples = [];
  for (const key of ['Tab', 'Shift+Tab']) for (let index = 0; index < 20; index++) {
    await page.keyboard.press(key);
    const current = await assertVisibleFocus(page);
    expect(current.inSidebar).toBe(false);
    focusSamples.push(current);
  }
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect.poll(async () => (await focusSnapshot(page)).inSidebar).toBe(true);
  expect((await assertVisibleFocus(page)).inSidebar).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  const recovery = page.getByRole('button', { name: 'Odzyskiwanie', exact: true });
  for (let index = 0; index < 15 && !await recovery.evaluate(element => element === document.activeElement); index++) {
    await page.keyboard.press('Tab'); await assertVisibleFocus(page);
  }
  await expect(recovery).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Twoje środki. Twoje prawo do zwrotu.' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('navigation')).toBeVisible();
  const matches = page.getByRole('button', { name: 'Dopasowania', exact: true });
  await matches.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Więcej możliwości w kręgu' })).toBeVisible();
  measurements.keyboard = { closedPanelFocusSamples: focusSamples, openEscapeFocusReturn: true, keyboardNavigationFocusReturn: true, desktopNavigation: true };
});

test('manual token precision is described plainly in Polish and English', async ({ page }) => {
  await page.goto('/#/matches', { waitUntil: 'domcontentloaded' });
  for (const lang of ['pl', 'en'] as const) {
    await language(page, lang);
    await page.getByRole('button', { name: lang === 'pl' ? 'Ułóż cykl ręcznie' : 'Build a cycle manually', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const precision = dialog.getByRole('spinbutton', { name: lang === 'pl' ? /miejsc.*dziesiętn/i : /decimal places/i });
    await expect(precision).toHaveCount(2);
    await expect(dialog).not.toContainText(/Decimals mintu|sprawdzimy decimals/);
    await expect(dialog.getByRole('button', { name: lang === 'pl' ? 'Sprawdź i utwórz cykl' : 'Verify and create cycle', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
  }
  measurements.manualPrecision = { languages: ['pl', 'en'], ordinaryDecimalPlacesLabel: true, disconnectedSubmissionDisabled: true };
});

async function deadlineReadability(locator: Locator) {
  return locator.evaluate(element => {
    const rgba = (text: string): number[] => { const values = text.match(/[\d.]+/g)?.map(Number) || []; return [values[0] || 0, values[1] || 0, values[2] || 0, values[3] ?? 1]; };
    const over = (top: number[], bottom: number[]) => [0, 1, 2].map(index => top[index]! * top[3]! + bottom[index]! * (1 - top[3]!));
    const ancestors: Element[] = []; for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    let background = [255, 255, 255];
    const images: string[] = [];
    for (const node of ancestors) { const style = getComputedStyle(node); background = over(rgba(style.backgroundColor), background); if (style.backgroundImage !== 'none') images.push(style.backgroundImage); }
    const css = getComputedStyle(element), foreground = over(rgba(css.color), background);
    const luminance = (rgb: number[]) => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    const front = luminance(foreground), back = luminance(background), rect = element.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(element);
    const lines = [...range.getClientRects()].map(line => ({ left: line.left, right: line.right, top: line.top, bottom: line.bottom }));
    return { foreground, background, contrast: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05), fontSize: parseFloat(css.fontSize), images, rect: rect.toJSON(), lines, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, text: element.textContent };
  });
}

async function readableGraphAndAddresses(page: Page, count: number) {
  const read = () => page.evaluate(() => {
    const graph = document.querySelector('.cycle-graph')!.getBoundingClientRect();
    const parts = [...document.querySelectorAll('.react-flow__node, .react-flow__edge-text')].map(element => {
      const box = element.getBoundingClientRect();
      return { text: element.textContent, visibility: getComputedStyle(element).visibility, bounds: box.toJSON(), contained: box.width > 0 && box.height > 0 && box.left >= graph.left - 1 && box.right <= graph.right + 1 && box.top >= graph.top - 1 && box.bottom <= graph.bottom + 1 };
    });
    const addresses = [...document.querySelectorAll('table code')].filter(element => (element.textContent?.length || 0) <= 20).map(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return { text: element.textContent, lineCount: range.getClientRects().length, bounds: element.getBoundingClientRect().toJSON() };
    });
    return { viewport: innerWidth, graph: graph.toJSON(), transform: document.querySelector('.react-flow__viewport')?.getAttribute('style'), parts, addresses };
  });
  await expect.poll(async () => {
    const sample = await read();
    return sample.parts.length === count * 2 && sample.parts.every(part => part.contained && part.visibility === 'visible');
  }, { message: 'Węzły i etykiety transferów muszą mieścić się w grafie po zmianie szerokości', timeout: 10_000 }).toBe(true);
  const sample = await read();
  for (const address of sample.addresses) expect(address.lineCount, `Krótki adres ${address.text} nie powinien zawijać się pionowo`).toBe(1);
  return sample;
}

test('real terminal cycles use historical outcomes and readable mobile deadline text in both languages', async ({ page }) => {
  test.skip(!localnet, 'Read-only acceptance needs the existing localnet cycle accounts; no fixture is presented as chain evidence.');
  const samples = [];
  for (const cycle of [{ address: refunded, state: 'Refunded' }, { address: settled, state: 'Settled' }]) {
    await page.goto(`/#/cycle/${cycle.address}`, { waitUntil: 'domcontentloaded' });
    for (const lang of ['pl', 'en'] as const) {
      await page.setViewportSize({ width: 1440, height: 1000 }); await language(page, lang);
      await expect(page.locator('.cycle-heading')).toContainText(cycle.state === 'Settled' ? lang === 'pl' ? 'Rozliczono' : 'Settled' : lang === 'pl' ? 'Zwrócono' : 'Refunded');
      await expect(page.locator('.cycle-progress')).not.toContainText(/Oczekuje|Waiting/);
      if (cycle.state === 'Refunded') await expect(page.locator('.cycle-progress')).toContainText(lang === 'pl' ? 'Bez depozytu' : 'No deposit');
      const outcome = page.locator('.cycle-panel + .notice');
      await expect(outcome).not.toContainText(/Wpłata blokuje tokeny|A deposit locks tokens/);
      await expect(outcome).toContainText(cycle.state === 'Refunded' ? lang === 'pl' ? /Wymiana nie doszła do skutku.*Wszystkie wpłacone/ : /exchange did not complete.*All token deposits/ : lang === 'pl' ? /Wszystkie uzgodnione przekazania wykonano/ : /All agreed transfers/);
      const explanation = page.locator('.operation-explanation');
      if (lang === 'pl') await expect(explanation).not.toContainText(/\bdeadline\b|\bsettle\b|\bnogi\b|\bnoga\b/);
      else await expect(explanation).not.toContainText(/\bleg\b/);
      await expect(explanation).toContainText(lang === 'pl' ? /nadwyż|dodatkow/i : /surplus|additional|extra/i);
      await expect(explanation).toContainText(lang === 'pl' ? /właściciel/ : /owner/);
      await expect(explanation).toContainText(lang === 'pl' ? /Zamknięcie pustego skarbca.*SOL.*pierwotnego płatnika/ : /Closing an empty vault.*SOL.*original payer/);
      await expect(explanation).toContainText(lang === 'pl' ? /Rekord cyklu pozostaje.*nie są zwracane/ : /cycle record remains.*not returned/);
      await expect(explanation.locator('code')).toHaveAttribute('title', 'HypnRDosgPjCxwFmcncHNq1swZoT9JFpjbQ5Rm5nkEDD');
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        const graphAndAddresses = await readableGraphAndAddresses(page, cycle.state === 'Refunded' ? 2 : 3);
        const sample = await deadlineReadability(page.locator('.deadline-card > div > span'));
        expect(sample.images).toEqual([]);
        expect(sample.contrast).toBeGreaterThanOrEqual(4.5);
        expect(sample.fontSize).toBeGreaterThanOrEqual(11);
        expect(sample.documentWidth).toBeLessThanOrEqual(width);
        for (const line of sample.lines) { expect(line.left).toBeGreaterThanOrEqual(0); expect(line.right).toBeLessThanOrEqual(width + 1); }
        samples.push({ cycle: cycle.address, state: cycle.state, language: lang, width, graphAndAddresses, ...sample });
      }
      if (cycle.state === 'Refunded' && lang === 'pl') await page.screenshot({ path: resolve(evidence, 'ui-ux-refunded-mobile.png'), fullPage: true });
    }
  }
  measurements.terminalCycles = samples;
});

test('explicit Funding display fixture distinguishes browser deadline before and after without changing chain state', async ({ page, request }) => {
  test.skip(!localnet, 'This presentation-only fixture derives immutable terms from an existing localnet account.');
  const response = await request.post('http://127.0.0.1:8899', { data: { jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [refunded, { encoding: 'base64', commitment: 'confirmed' }] } });
  const rpc = await response.json(); expect(rpc.error).toBeUndefined();
  const original = Buffer.from(rpc.result.value.data[0], 'base64');
  expect(original.length).toBe(419);
  const deadline = Number(original.readBigInt64LE(113));
  const fixture = Buffer.from(original);
  fixture[414] = 0; fixture[415] = 1; fixture[416] = 0; fixture[417] = 0;
  let interceptedReads = 0, writeRequests = 0;
  await page.route('http://127.0.0.1:8899/**', async route => {
    const data = route.request().postDataJSON();
    if (['sendTransaction', 'requestAirdrop'].includes(data.method)) { writeRequests++; await route.abort(); return; }
    if (data.method === 'getAccountInfo' && data.params[0] === refunded) {
      interceptedReads++;
      await route.fulfill({ json: { jsonrpc: '2.0', id: data.id, result: { ...rpc.result, value: { ...rpc.result.value, data: [fixture.toString('base64'), 'base64'] } } } });
    } else await route.continue();
  });
  await page.clock.setFixedTime(new Date((deadline - 120) * 1000));
  await page.goto(`/#/cycle/${refunded}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.cycle-progress')).toContainText('Oczekuje');
  await expect(page.locator('.deadline-card')).toContainText(/Pozostało|przeglądark/);
  await page.clock.setFixedTime(new Date((deadline + 120) * 1000));
  await expect(page.locator('.cycle-progress')).not.toContainText('Oczekuje');
  await expect(page.locator('.cycle-progress')).toContainText('Bez depozytu');
  await expect(page.locator('.deadline-card')).toContainText(/Termin minął.*przeglądark/);
  await expect(page.locator('.cycle-panel + .notice')).toContainText(/zegar sieci|czas.*sieci/);
  await expect(page.getByRole('button', { name: 'Akceptuj i wpłać', exact: true })).toHaveCount(0);
  expect(interceptedReads).toBeGreaterThan(0); expect(writeRequests).toBe(0);
  measurements.fundingFixture = { sourceAccount: refunded, immutableDeadline: deadline, alteredPresentationOnly: true, modifiedMutableByteOffsets: [414, 415, 416, 417], browserClockBeforeAndAfter: true, noAutomaticDepositRequest: true, interceptedReads, writeRequests };
});
