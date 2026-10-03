import { test, expect } from '@playwright/test';

const copy = {
  pl: {
    add: 'Dodaj ofertę', amount: 'Dokładna ilość', publish: 'Podpisz i opublikuj',
    wallet: 'Połącz portfel, aby podpisać ofertę.',
    error: 'Podaj ilość, np. 10 lub 0.5. Użyj cyfr i kropki, bez minusa, liter, przecinka i dodatkowych zer na początku.',
  },
  en: {
    add: 'Add an offer', amount: 'Exact amount', publish: 'Sign and publish',
    wallet: 'Connect a wallet to sign an offer.',
    error: 'Enter an amount, e.g. 10 or 0.5. Use digits and a decimal point, without a minus sign, letters, commas or leading zeros.',
  },
};

for (const language of ['pl', 'en'] as const) test(`offer amount format errors are explained without a wallet (${language})`, async ({ page }) => {
  if (language === 'en') await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(language => localStorage.setItem('swapcircle:language', language), language);
  await page.goto('/?mode=app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: copy[language].add, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const amounts = dialog.getByRole('textbox', { name: copy[language].amount, exact: true });
  const publish = dialog.getByRole('button', { name: copy[language].publish, exact: true });
  await expect(amounts).toHaveCount(2);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(publish).toBeDisabled();

  for (const [index, value] of ['-1', 'abc'].entries()) {
    const field = amounts.nth(index);
    await field.fill(value);
    await page.keyboard.press('Tab');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAttribute('aria-describedby', index === 0 ? 'giveAmount-error' : 'wantAmount-error');
    await expect(field).toHaveAccessibleDescription(copy[language].error);
  }
  await expect(dialog.getByRole('alert')).toHaveText([copy[language].error, copy[language].error]);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog.getByText(copy[language].wallet, { exact: true })).toBeVisible();
  await expect(publish).toBeDisabled();

  // The modal makes the page language control inert. Trigger only its existing
  // handler to verify a context change while the two error states remain active.
  const alternate = language === 'pl' ? 'en' : 'pl';
  await page.locator('.language-button').evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog.getByRole('alert')).toHaveText([copy[alternate].error, copy[alternate].error]);
  await expect(dialog.getByRole('textbox', { name: copy[alternate].amount, exact: true }).first()).toHaveAccessibleDescription(copy[alternate].error);
  await page.locator('.language-button').evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog.getByRole('alert')).toHaveText([copy[language].error, copy[language].error]);

  for (const field of await amounts.all()) {
    // Browser syntax validation matches the SDK's existing decimal syntax.
    // Mint precision, positivity and u64 range are still checked by the SDK.
    for (const value of ['-1', 'abc', '1,5', '01', '1e3', '1 000']) {
      await field.fill(value);
      await page.keyboard.press('Tab');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAccessibleDescription(copy[language].error);
      expect(await field.evaluate((input: HTMLInputElement) => input.validity.patternMismatch)).toBe(true);
    }
    for (const value of ['10', '0.5', '10.50', '18446744073709.551615']) {
      await field.fill(value);
      await expect(field).toHaveAttribute('aria-invalid', 'false');
      await expect(field).not.toHaveAttribute('aria-describedby');
      expect(await field.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
      await expect(field).toHaveValue(value); // No float conversion or rewriting.
    }
    // Invalid-event feedback is available even before the user leaves the field.
    await field.fill('abc');
    expect(await field.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription(copy[language].error);
    await field.fill('10');
    await expect(field).toHaveAttribute('aria-invalid', 'false');
  }
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByText(copy[language].wallet, { exact: true })).toBeVisible();
  await expect(publish).toBeDisabled();
});
