import { test, expect, type Page } from '@playwright/test';

async function confirm(page: Page, consent = true) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (consent) await dialog.getByRole('checkbox').check();
  await page.getByTestId('confirm-demo-action').click();
  await expect(dialog).not.toBeVisible();
}
async function create(page: Page) {
  await page.getByTestId('find-cycle').click();
  await page.getByTestId('create-cycle').click();
  await expect(page.getByTestId('confirm-demo-action')).toBeDisabled();
  await confirm(page);
}
async function fund(page: Page, participant: number) {
  await page.getByTestId(`fund-${participant}`).click();
  await confirm(page);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function graphFits(page: Page) {
  await expect.poll(() => page.locator('.cycle-graph').evaluate(graph => {
    const bounds = graph.getBoundingClientRect();
    return [...graph.querySelectorAll('.react-flow__edge-path, .react-flow__node, .react-flow__edge-textbg')].every(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.left >= bounds.left + 2 && box.right <= bounds.right - 2 && box.top >= bounds.top + 2 && box.bottom <= bounds.bottom - 2;
    });
  })).toBe(true);
}

for (const language of ['pl', 'en']) {
  test(`public ${language} demo: matching, independent deposits, settlement, reload, no network writes`, async ({ page }) => {
    const errors: string[] = [], foreign: string[] = [], writes: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith('http://127.0.0.1:5187') && !request.url().startsWith('data:')) foreign.push(request.url());
      if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`);
    });
    await page.goto(`/?mode=demo&lang=${language}`);
    await expect(page.getByTestId('offer-2')).toBeVisible();
    await page.getByTestId('offer-2').getByRole('checkbox').uncheck();
    await page.getByTestId('find-cycle').click();
    await expect(page.getByTestId('create-cycle')).not.toBeVisible();
    await page.getByRole('button', { name: language === 'pl' ? 'Wróć do ofert' : 'Back to offers' }).click();
    await page.getByTestId('offer-2').getByRole('checkbox').check();
    await page.screenshot({ path: `../../docs/evidence/demo-offers-${language}.png`, fullPage: true });
    await page.getByTestId('find-cycle').click();
    await expect(page.locator('.demo-metrics>div').nth(1)).toContainText('0');
    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await graphFits(page);
    await page.screenshot({ path: `../../docs/evidence/demo-match-${language}.png`, fullPage: true });
    await page.getByTestId('create-cycle').click();
    await confirm(page);
    await fund(page, 1);
    await fund(page, 0);
    await expect(page.getByTestId('balance-0')).toContainText('100 dX');
    await expect(page.getByTestId('balance-0').locator('td').nth(3)).toHaveText('0 dY');
    await expect(page.getByTestId('balance-1').locator('td').nth(3)).toHaveText('0 dZ');
    await page.screenshot({ path: `../../docs/evidence/demo-deposits-${language}.png`, fullPage: true });
    await page.reload();
    await expect(page.getByTestId('fund-0')).not.toBeVisible();
    await expect(page.getByTestId('fund-2')).toBeVisible();
    await fund(page, 2);
    await expect(page.getByTestId('cycle-state')).toHaveText(language === 'pl' ? 'Wymiana rozliczona' : 'Exchange settled');
    for (const [i, amount] of ['40 dY', '250 dZ', '100 dX'].entries()) await expect(page.getByTestId(`balance-${i}`).locator('td').nth(3)).toHaveText(amount);
    await expect(page.locator('[data-testid^="fund-"]')).toHaveCount(0);
    await page.screenshot({ path: `../../docs/evidence/demo-settled-${language}.png`, fullPage: true });
    await noOverflow(page);
    expect(errors).toEqual([]); expect(foreign).toEqual([]); expect(writes).toEqual([]);
  });

  test(`mobile ${language} demo: timeout, independent refunds, reset and keyboard`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?mode=demo&lang=${language}`);
    await noOverflow(page);
    await create(page);
    await fund(page, 0); await fund(page, 1);
    await page.getByTestId('expire-cycle').click(); await confirm(page, false);
    await expect(page.locator('[data-testid^="fund-"]')).toHaveCount(0);
    await expect(page.getByTestId('refund-2')).not.toBeVisible();
    await expect(page.getByTestId('deposit-2')).toContainText(language === 'pl' ? 'Bez depozytu' : 'No deposit');
    await page.screenshot({ path: `../../docs/evidence/demo-expired-mobile-${language}.png`, fullPage: true });
    await page.getByTestId('refund-1').click(); await confirm(page, false);
    await expect(page.getByTestId('refund-0')).toBeVisible();
    await expect(page.getByTestId('balance-1').locator('td').nth(1)).toHaveText('40 dY');
    await expect(page.getByTestId('balance-0').locator('td').nth(2)).toHaveText('100 dX');
    await page.reload();
    await page.getByTestId('refund-0').click(); await confirm(page, false);
    await expect(page.getByTestId('cycle-state')).toHaveText(language === 'pl' ? 'Wszystkie depozyty zwrócone' : 'All deposits refunded');
    for (let i = 0; i < 3; i++) await expect(page.getByTestId(`balance-${i}`).locator('td').nth(3)).toHaveText(/^0 /);
    await noOverflow(page);
    await page.screenshot({ path: `../../docs/evidence/demo-refunded-mobile-${language}.png`, fullPage: true });
    await page.getByTestId('try-again').click();
    await expect(page.getByTestId('offer-0')).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
    await page.keyboard.press('Control+Home');
    await page.locator('.skip-link').focus(); await page.keyboard.press('Enter');
    await expect(page.getByTestId('demo-title')).toBeFocused();
    expect(page.url()).not.toContain('#main-content');
  });
}

test('two and four participants settle correctly, and modal keyboard wrap stays visible at short height', async ({ page }) => {
  await page.goto('/?mode=demo&lang=pl');
  for (const size of [2, 4]) {
    await page.getByRole('group', { name: 'Liczba osób' }).getByRole('button', { name: String(size), exact: true }).click();
    await create(page);
    for (let i = size - 1; i >= 0; i--) await fund(page, i);
    await expect(page.getByTestId('cycle-state')).toHaveText('Wymiana rozliczona');
    await expect(page.locator('[data-testid^="balance-"]')).toHaveCount(size);
    await page.screenshot({ path: `../../docs/evidence/demo-${size}-settled.png`, fullPage: true });
    await page.getByRole('button', { name: 'Od początku', exact: true }).click();
  }
  await page.setViewportSize({ width: 720, height: 450 });
  await page.getByTestId('find-cycle').click(); await page.getByTestId('create-cycle').click();
  const close = page.getByRole('dialog').getByRole('button', { name: 'Zamknij', exact: true });
  await close.focus(); await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Anuluj', exact: true })).toBeFocused();
  await expect.poll(async () => page.evaluate(() => { const r = document.activeElement!.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('create-cycle')).toBeFocused();
  await noOverflow(page);
});

test('all graph edges and labels fit on desktop and mobile for 2, 3 and 4 participants', async ({ page }) => {
  await page.goto('/?mode=demo&lang=pl');
  for (const size of [2, 3, 4]) {
    await page.getByRole('group', { name: 'Liczba osób' }).getByRole('button', { name: String(size), exact: true }).click();
    await page.getByTestId('find-cycle').click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await graphFits(page);
      await noOverflow(page);
    }
    await page.getByRole('button', { name: 'Od początku', exact: true }).click();
  }
});

test('empty circle closes without claiming refunds, and client navigation and recovery stay clear', async ({ page }) => {
  await page.goto('/?mode=demo&lang=pl');
  await create(page);
  await page.getByTestId('expire-cycle').click(); await confirm(page, false);
  await expect(page.getByTestId('cycle-state')).toHaveText('Brak depozytów do zwrotu');
  await expect(page.getByTestId('demo-title')).toHaveText('Cykl zamknięty bez wpłat.');
  await page.goto('/?mode=app#/recovery');
  await expect(page.locator('[aria-current="page"]')).toHaveText('Odzyskiwanie');
  await expect(page.locator('#cycle-address-help')).toContainText('Skopiuj adres ze szczegółów cyklu');
  await expect(page.getByText('Domyślne konto tokenowe (ATA)', { exact: false })).toBeVisible();
  await page.locator('.language-button').click();
  await expect(page.locator('#cycle-address-help')).toContainText('Copy the address from the circle details');
  await expect(page.getByText('The default associated token account (ATA)', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Offer board', exact: true }).click();
  await expect(page.locator('[aria-current="page"]')).toHaveText('Offer board');
});
