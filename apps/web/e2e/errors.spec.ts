import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'docs/evidence');
const manifest = JSON.parse(readFileSync(resolve(root, 'apps/web/public/deployments/localnet.json'), 'utf8'));
const storageKey = 'swapcircle:transactions:v1';

test('stored SDK errors are readable in PL and EN after reload without modifying journal status', async ({ page }) => {
  // This is a read-only presentation test. The raw deadline log was captured
  // during the actual localnet deadline test; no operation is sent here.
  const rawDeadline = 'Error: Transaction simulation failed: custom program error: 0x1777. Program log: AnchorError thrown in programs/swapcircle/src/lib.rs:115. Error Code: DeadlinePassed. Error Number: 6007. Program consumed 14511 of 200000 compute units';
  const networkKey = `${manifest.genesisHash}:${manifest.programId}`;
  const records = [
    { id: 'presentation-deadline', label: 'Akceptuj i wpłać', operationKey: 'fund', status: 'unknown', error: rawDeadline, signature: '1'.repeat(64), createdAt: 1, networkKey },
    { id: 'presentation-rejected', label: 'Utwórz cykl w sieci', operationKey: 'create', status: 'error', error: 'WalletSignTransactionError: User rejected the signature', createdAt: 2, networkKey },
    { id: 'presentation-rate-limit', label: 'Zwróć depozyt', operationKey: 'refund', status: 'error', error: 'HTTP 429 Too Many Requests', createdAt: 3, networkKey },
  ].sort((a, b) => b.createdAt - a.createdAt);
  const sends: string[] = [];
  await page.route('**/deployments/localnet.json', route => route.fulfill({ json: manifest }));
  await page.route('http://127.0.0.1:8899/', async route => {
    const request = route.request().postDataJSON();
    if (request.method === 'sendTransaction') sends.push(request.method);
    // Keep reconciliation unavailable so presentation cannot rewrite the
    // persisted unknown result. The program-not-deployed banner is intentional.
    const response = request.method === 'getGenesisHash'
      ? { jsonrpc: '2.0', id: request.id, result: manifest.genesisHash }
      : request.method === 'getAccountInfo'
        ? { jsonrpc: '2.0', id: request.id, result: { context: { slot: 1 }, value: null } }
        : { jsonrpc: '2.0', id: request.id, error: { code: 429, message: 'RPC read unavailable in presentation test' } };
    await route.fulfill({ json: response });
  });
  await page.addInitScript(({ key, records }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(records));
  }, { key: storageKey, records });
  await page.goto('/#/deposits', { waitUntil: 'domcontentloaded' });
  const errors = page.locator('.tx-error');
  await expect(errors).toHaveText([
    'RPC ogranicza liczbę odczytów. Odczekaj lub wybierz inny endpoint tego samego klastra.',
    'Podpis został odrzucony. Sprawdź stan operacji przed ponowieniem.',
    'Minął termin wpłaty.',
  ]);
  await expect(page.locator('.connection-banner')).toContainText('Program nie jest wdrożony.');
  await expect(page.locator('.transaction-list')).not.toContainText(/AnchorError|lib\.rs|compute units|0x1777/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(errors.last()).toHaveText('Minął termin wpłaty.');
  await expect(page.locator('.transaction-list')).toContainText('Wynik nieznany');
  mkdirSync(evidence, { recursive: true });
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: resolve(evidence, 'ui-errors-pl.png'), fullPage: true, animations: 'disabled' });
  await page.locator('.language-button').click();
  await expect(errors).toHaveText([
    'RPC is limiting read requests. Wait or choose another endpoint on the same cluster.',
    'The signature was rejected. Check the operation state before trying again.',
    'The funding deadline has passed.',
  ]);
  await expect(page.locator('.connection-banner')).toContainText('Program is not deployed');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(errors.last()).toHaveText('The funding deadline has passed.');
  await expect(page.locator('.transaction-list')).toContainText('Result unknown');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey)).toEqual(records);
  expect(sends).toEqual([]);
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: resolve(evidence, 'ui-errors-en.png'), fullPage: true, animations: 'disabled' });
  writeFileSync(resolve(evidence, 'ui-error-localization.json'), JSON.stringify({ readOnly: true, seededHistoryPresentationTest: true, mockedRPC: true, noFinancialOperations: true, errors: ['DeadlinePassed 6007', 'signature rejected', 'HTTP 429', 'Program is not deployed'], languages: ['pl', 'en'], reloadVerified: true, persistedJournalUnchanged: true, sendTransactionCalls: sends.length, checkedAt: new Date().toISOString() }, null, 2));
});
