import { test, expect } from '@playwright/test';
import { PublicKey } from '@solana/web3.js';
import { computeTermsHash, cyclePda, discriminator, encodeLeg, i64, u64 } from '@swapcircle/sdk';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/deployments/localnet.json'), 'utf8'));
const storageKey = 'swapcircle:transactions:v1';
// A synthetic, correctly encoded account keeps this presentation regression
// independent of a validator. No signature, transaction or airdrop is sent.
const creator = manifest.participants[0].owner;
const nonce = '9001';
const address = cyclePda(manifest.programId, creator, nonce).toBase58();
const deadline = 1_700_000_000;
const legs = [100, 25, 40].map((amount, index) => ({
  owner: manifest.participants[index].owner,
  mint: manifest.mints[index].mint,
  amount: String(amount), decimals: 0,
}));
const accountData = Buffer.concat([
  discriminator('account', 'Cycle'), Buffer.from([1]),
  new PublicKey(creator).toBuffer(), new PublicKey(creator).toBuffer(), u64(nonce),
  Buffer.from(computeTermsHash(manifest.programId, address, nonce, deadline, legs), 'hex'),
  i64(deadline), Buffer.from([legs.length]), ...legs.map(encodeLeg), Buffer.alloc(73),
  Buffer.from([1, 7, 0, 0, 0]), // Settled, all three legs funded.
]);
const copy = {
  pl: {
    field: 'Adres cyklu', read: 'Odczytaj cykl', recovery: 'Odzyskiwanie', details: 'Szczegóły cyklu',
    invalid: 'Nieprawidłowy adres cyklu. Skopiuj pełny adres ze szczegółów cyklu lub wczytaj pakiet odzyskiwania.',
    rpc: 'RPC ogranicza liczbę odczytów. Odczekaj lub wybierz inny endpoint tego samego klastra.',
    package: 'Pakiet pochodzi z innej sieci lub programu.', settled: 'Rozliczono',
  },
  en: {
    field: 'Cycle address', read: 'Read cycle', recovery: 'Recovery', details: 'Cycle details',
    invalid: 'Invalid circle address. Copy the full address from the circle details or load a recovery package.',
    rpc: 'RPC is limiting read requests. Wait or choose another endpoint on the same cluster.',
    package: 'The package belongs to another network or program.', settled: 'Settled',
  },
};

for (const language of ['pl', 'en'] as const) test(`recovery validates the address and replaces only its own read error (${language})`, async ({ page }) => {
  const text = copy[language];
  const records = [{
    id: 'recovery-history', label: 'Zwróć depozyt', operationKey: 'refund', status: 'error',
    error: 'HTTP 429 Too Many Requests', createdAt: 1,
    networkKey: `${manifest.genesisHash}:${manifest.programId}`,
  }];
  let failCycleRead = false;
  let cycleReads = 0;
  const financialCalls: string[] = [];
  await page.route('**/deployments/localnet.json', route => route.fulfill({ json: manifest }));
  await page.route('http://127.0.0.1:8899/', async route => {
    const request = route.request().postDataJSON();
    if (['sendTransaction', 'requestAirdrop'].includes(request.method)) financialCalls.push(request.method);
    let result: unknown;
    if (request.method === 'getGenesisHash') result = manifest.genesisHash;
    else if (request.method === 'getAccountInfo') {
      const requested = request.params[0];
      if (requested === address) {
        cycleReads++;
        if (failCycleRead) {
          await route.fulfill({ json: { jsonrpc: '2.0', id: request.id, error: { code: 429, message: 'HTTP 429 Too Many Requests' } } });
          return;
        }
      }
      result = { context: { slot: 1 }, value: requested === address
        ? { data: [accountData.toString('base64'), 'base64'], owner: manifest.programId, executable: false, lamports: 1, rentEpoch: 0 }
        : requested === manifest.programId
          ? { data: ['', 'base64'], owner: 'BPFLoader2111111111111111111111111111111111', executable: true, lamports: 1, rentEpoch: 0 }
          : null };
    } else if (request.method === 'getTokenAccountsByOwner') result = { context: { slot: 1 }, value: [] };
    else {
      await route.fulfill({ json: { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Read-only fixture: unsupported method' } } });
      return;
    }
    await route.fulfill({ json: { jsonrpc: '2.0', id: request.id, result } });
  });
  await page.addInitScript(({ language, key, records }) => {
    localStorage.setItem('swapcircle:language', language);
    localStorage.setItem(key, JSON.stringify(records));
  }, { language, key: storageKey, records });
  await page.goto('/?mode=app#/recovery', { waitUntil: 'domcontentloaded' });
  const field = page.getByRole('textbox', { name: text.field, exact: true });
  const read = page.getByRole('button', { name: text.read, exact: true });
  await expect(read).toBeEnabled();
  await field.fill('test');
  await read.click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', 'cycle-address-help cycle-address-error');
  await expect(field).toHaveAccessibleDescription(new RegExp(text.invalid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await expect(field).toBeFocused();
  await expect(page.getByRole('alert')).toHaveText(text.invalid);
  expect(cycleReads).toBe(0);
  await expect(page.locator('body')).not.toContainText('Invalid public key input');

  const alternate = language === 'pl' ? 'en' : 'pl';
  await page.locator('.language-button').click();
  await expect(page.getByRole('alert')).toHaveText(copy[alternate].invalid);
  await expect(page.getByRole('textbox', { name: copy[alternate].field, exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.locator('.language-button').click();
  await expect(page.getByRole('alert')).toHaveText(text.invalid);

  await field.fill(address);
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', 'cycle-address-help');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await read.click();
  await expect(page.getByRole('heading', { name: text.details, exact: true })).toBeVisible();
  await expect(page.locator('.cycle-heading .badge')).toHaveText(text.settled);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // A syntactically valid address can still fail to load. Keep that failure
  // announced, then clear it after retrying the same address successfully.
  await page.getByRole('button', { name: text.recovery, exact: true }).click();
  failCycleRead = true;
  await read.click();
  await expect(page.getByRole('alert')).toHaveText(text.rpc);
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(read).toBeEnabled();
  failCycleRead = false;
  await read.click();
  await expect(page.getByRole('heading', { name: text.details, exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Successful reading must not dismiss unrelated errors or rewrite history.
  await page.getByRole('button', { name: text.recovery, exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'other-network.json', mimeType: 'application/json', buffer: Buffer.from('{"protocol":"Other"}') });
  await expect(page.getByRole('alert')).toHaveText(text.package);
  await read.click();
  await expect(page.getByRole('heading', { name: text.details, exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(text.package);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey)).toEqual(records);
  expect(financialCalls).toEqual([]);
});
