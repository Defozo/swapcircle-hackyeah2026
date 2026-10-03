import { test, expect } from '@playwright/test';

test('educational flow, matching table, keyboard modal and mobile layout stay accessible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Dobre wymiany łączą ludzi.' })).toBeVisible();
  await page.getByRole('button', { name: 'Zobacz przykład', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('cell', { name: /^100 dX/ })).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zobacz przykład', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Dopasowania', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nie ma jeszcze zgodnego cyklu' })).toBeVisible();
  await page.getByRole('button', { name: 'Ułóż cykl ręcznie', exact: true }).click();
  await expect(page.getByRole('group')).toHaveCount(2);
  await page.getByRole('button', { name: 'Dodaj uczestnika', exact: true }).click();
  await page.getByRole('button', { name: 'Dodaj uczestnika', exact: true }).click();
  await expect(page.getByRole('group')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Dodaj uczestnika', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Otwórz menu', exact: true }).click();
  await page.getByRole('button', { name: 'Odzyskiwanie', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Twoje środki. Twoje prawo do zwrotu.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../../docs/evidence/ui-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('malformed imports and unavailable manifests never produce financial success', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Importuj', exact: true }).click();
  await page.getByLabel('Treść JSON albo pełny link').fill('{"format":"bad"}');
  await page.getByRole('button', { name: 'Zweryfikuj i importuj', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.route('**/deployments/localnet.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Sieć niezweryfikowana.')).toBeVisible();
  await page.getByRole('button', { name: 'Dodaj ofertę', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Podpisz i opublikuj', exact: true })).toBeDisabled();
  await expect(page.getByText('Transakcja confirmed.', { exact: false })).toHaveCount(0);
});

test('English covers offer consent, manual cycle risks and independent recovery and persists after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.language-button').click();
  await expect(page.getByRole('heading', { name: 'Good exchanges bring people together.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add an offer', exact: true }).click();
  const offer = page.getByRole('dialog');
  await expect(offer).toContainText('It does not transfer or reserve tokens.');
  await expect(offer.getByRole('checkbox')).toHaveAccessibleName('I agree to publish my wallet address and exact offer terms. The offer does not guarantee a match.');
  await expect(offer.getByRole('button', { name: 'Sign and publish', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Matches', exact: true }).click();
  await page.getByRole('button', { name: 'Build a cycle manually', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText("Entering someone else's address does not constitute their consent.");
  await expect(page.getByRole('group')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Verify and create cycle', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Recovery', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your funds. Your right to a refund.' })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Your funds. Your right to a refund.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

