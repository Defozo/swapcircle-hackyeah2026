import { chromium, expect as playwrightExpect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection } from '@solana/web3.js';
import { SwapCircleClient } from '@swapcircle/sdk';
import { installTestWallet, connectTestWallet, secretKey } from '../../apps/web/e2e/wallet';
import { loadManifest, writeJson } from '../common';

// Recording only: private keys remain in the Node process, never in the app bundle.
const work = resolve('submission/_video_work');
const recordDir = `${work}/source/${new Date().toISOString().replace(/[:.]/g, '-')}`;
const expect = playwrightExpect.configure({ timeout: 30_000 });
mkdirSync(recordDir, { recursive: true });
mkdirSync(`${work}/frames`, { recursive: true });
const manifest = loadManifest('deployments/localnet.json');
if (manifest.cluster !== 'localnet') throw new Error('This film must show localnet');
const connection = new Connection(manifest.rpcUrl, 'confirmed');
const client = new SwapCircleClient(connection, manifest);
await client.verifyNetwork();
const refund = JSON.parse(readFileSync(`${work}/manifests/prepared-refund.json`, 'utf8'));
await client.readCycle(refund.cycle); // Reject stale recording fixtures after validator reset.
const browser = await chromium.launch({ headless: true });
const scenes: { name: string; video: string; seconds: number; chapters: { at: number; text: string }[] }[] = [];
const errors: string[] = [];
const actors = ['ALICE', 'BOB', 'CELINE', 'RECOVERY'] as const;
const keys = Object.fromEntries(actors.map(name => [name, secretKey(`SWAPCIRCLE_DEVNET_${name}_KEY`)]));
type BalanceSnapshot = Record<string, Awaited<ReturnType<SwapCircleClient['readBalances']>>>;
const balances = async (): Promise<BalanceSnapshot> => Object.fromEntries(await Promise.all(actors.map(async name => [name, await client.readBalances(keys[name]!.publicKey.toBase58())] as const)));
const before = await balances();
const base = process.env.SWAPCIRCLE_VIDEO_URL || 'http://127.0.0.1:5184';
let cycleAddress = '';
async function scene(name: string, actor: typeof actors[number], route: string, action: (page: Page, chapter: (text: string) => Promise<void>) => Promise<void>) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 900 }, recordVideo: { dir: recordDir, size: { width: 1920, height: 900 } }, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  const page = await context.newPage();
  const started = Date.now();
  const chapters: { at: number; text: string }[] = [];
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  const chapter = async (text: string) => { chapters.push({ at: (Date.now() - started) / 1000, text }); console.log(JSON.stringify({ scene: name, text })); };
  await installTestWallet(page as Parameters<typeof installTestWallet>[0], keys[actor]!);
  try {
    await page.goto(`${base}/${route}`, { timeout: 180_000 });
    await expect(page.locator('.network-ready')).toBeVisible({ timeout: 90_000 });
    await connectTestWallet(page as Parameters<typeof connectTestWallet>[0]);
    await action(page, chapter);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${work}/frames/${name}-end.png` });
  } catch (error) {
    await page.screenshot({ path: `${work}/frames/${name}-failure.png`, fullPage: true });
    writeFileSync(`${work}/frames/${name}-failure.txt`, await page.locator('body').innerText());
    throw error;
  } finally {
    const seconds = (Date.now() - started) / 1000;
    const video = page.video()!;
    await context.close();
    const path = `${recordDir}/${name}.webm`;
    await video.saveAs(path);
    scenes.push({ name, video: path, seconds, chapters });
    writeJson(`${work}/manifests/capture.json`, { cluster: 'localnet', genesisHash: manifest.genesisHash, programId: manifest.programId, testWallet: true, scenes, errors, cycleAddress, refundCycle: refund.cycle });
  }
}
async function confirm(page: Page, hold = 1500) {
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Podpisz w portfelu' }) });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(hold);
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Podpisz w portfelu' }).click();
  await page.getByRole('status').filter({ hasText: 'Transakcja confirmed.' }).waitFor({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Zamknij powiadomienie' }).click();
}
async function showCycle(page: Page) {
  await page.locator('.cycle-panel').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
}
try {
  await scene('01-matching-alice', 'ALICE', '', async (page, chapter) => {
    await chapter('Trzy podpisane oferty. Alicja daje 100 dX, Bartek 40 dY, Celina 250 dZ.');
    await page.getByRole('button', { name: 'Importuj', exact: true }).click();
    await page.getByRole('button', { name: 'Importuj oferty demonstracyjne (localnet)', exact: true }).click();
    await expect(page.locator('.offer-card')).toHaveCount(3);
    await page.locator('.offer-grid').scrollIntoViewIfNeeded();
    await page.waitForTimeout(3500);
    await page.getByRole('button', { name: /^Dopasowania/ }).click();
    await expect(page.locator('.match-card')).toHaveCount(1);
    await chapter('Brak zgodnej pary. Jeden dokładny cykl trzech osób spełnia wszystkie warunki.');
    await page.waitForTimeout(3500);
    await page.getByRole('button', { name: 'Zobacz warunki', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Utwórz cykl w sieci', exact: true }).click();
    await chapter('Warunki, odbiorcy, deadline i koszty przed podpisem. Utworzenie cyklu nie wpłaca cudzych tokenów.');
    await confirm(page);
    await expect(page.locator('.cycle-panel')).toBeVisible();
    cycleAddress = decodeURIComponent(page.url().split('/cycle/')[1]!);
    if (!cycleAddress) throw new Error('The UI did not navigate to the created cycle');
    await page.getByRole('button', { name: 'Akceptuj i wpłać', exact: true }).click();
    await chapter('Alicja podpisuje własną wpłatę. Depozyt czeka w skarbcu programu.');
    await confirm(page);
    await showCycle(page);
    const state = await client.readCycle(cycleAddress);
    if (state.state !== 'Funding' || state.fundedMask === 0) throw new Error('First deposit did not remain Funding');
  });
  await scene('02-bob-deposit', 'BOB', `#/cycle/${cycleAddress}`, async (page, chapter) => {
    await chapter('Drugi portfel odczytuje te same warunki z sieci. Bartek akceptuje i wpłaca 40 dY.');
    await showCycle(page);
    await page.getByRole('button', { name: 'Akceptuj i wpłać', exact: true }).click();
    await confirm(page);
    await showCycle(page);
    if ((await client.readCycle(cycleAddress)).state !== 'Funding') throw new Error('Two deposits must wait for the final participant');
  });
  await scene('03-celine-settlement', 'CELINE', `#/cycle/${cycleAddress}`, async (page, chapter) => {
    await chapter('Ostatnia wpłata Celiny uruchamia wszystkie trzy przelewy w tej samej transakcji.');
    await showCycle(page);
    await page.getByRole('button', { name: 'Akceptuj i wpłać', exact: true }).click();
    await confirm(page);
    await showCycle(page);
    await expect(page.locator('.cycle-heading .badge')).toHaveText('Rozliczono');
    if ((await client.readCycle(cycleAddress)).state !== 'Settled') throw new Error('Atomic settlement absent on chain');
    await chapter('Rozliczono w programie. Bez osobnego settle, pośrednika ani kursu narzuconego przez platformę.');
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Moje depozyty', exact: true }).click();
    await expect(page.locator('.balances-grid')).toBeVisible();
    await page.locator('.balances-grid').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
  });
  const chainTime = await client.readChainTime();
  if (chainTime < refund.deadline) throw new Error(`Prepared refund has not expired: ${refund.deadline - chainTime}s remaining. Wait and record again using a fresh settlement cycle.`);
  await scene('04-independent-refunds', 'RECOVERY', `#/cycle/${refund.cycle}`, async (page, chapter) => {
    await chapter('Osobny, wcześniej przygotowany cykl: dwie wpłaty, brak trzeciej, termin już minął.');
    await expect(page.locator('.cycle-heading .badge')).toHaveText('Wygasły');
    await showCycle(page);
    await page.getByLabel('Tryb konta zwrotu').selectOption('fresh');
    await chapter('Pomocnik opłaca zwrot do nowych kont właścicieli. Nie może przekierować ich tokenów do siebie.');
    const alice = page.locator('.leg-actions > div').filter({ has: page.getByText('Alicja', { exact: true }) });
    await alice.getByRole('button', { name: 'Zwróć depozyt', exact: true }).click();
    await confirm(page);
    const partial = await client.readCycle(refund.cycle);
    if (partial.refundedMask !== 1 || partial.state === 'Refunded') throw new Error('Refund must be independent for each funded leg');
    const bob = page.locator('.leg-actions > div').filter({ has: page.getByText('Bartek', { exact: true }) });
    await bob.getByRole('button', { name: 'Zwróć depozyt', exact: true }).click();
    await confirm(page);
    await showCycle(page);
    await expect(page.locator('.cycle-heading .badge')).toHaveText('Zwrócono');
    await chapter('Każdy depozyt wraca niezależnie. Pobrany pakiet pozwala użyć osobnego klienta odzyskiwania.');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Pobierz JSON', exact: true }).click();
    await (await download).saveAs(`${work}/manifests/recovery-package.json`);
    await page.locator('.recovery-export').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
  });
  const after = await balances();
  const settled = await client.readCycle(cycleAddress), returned = await client.readCycle(refund.cycle);
  const totals = (snap: typeof before) => new Map(Object.entries(snap).flatMap(([actor, rows]) => {
    const byMint = new Map<string, bigint>();
    for (const row of rows) byMint.set(row.mint, (byMint.get(row.mint) || 0n) + BigInt(row.amount));
    return [...byMint].map(([mint, amount]) => [`${keys[actor]!.publicKey.toBase58()}:${mint}`, amount] as const);
  }));
  const expected = totals(before), observed = totals(after);
  const add = (owner: string, mint: string, amount: bigint) => expected.set(`${owner}:${mint}`, (expected.get(`${owner}:${mint}`) || 0n) + amount);
  for (const [index, leg] of settled.legs.entries()) {
    add(leg.owner, leg.mint, -BigInt(leg.amount));
    add(settled.legs[(index + 1) % settled.legs.length]!.owner, leg.mint, BigInt(leg.amount));
  }
  for (const [index, leg] of returned.legs.entries()) if (returned.refundedMask & 1 << index) add(leg.owner, leg.mint, BigInt(leg.amount));
  for (const id of new Set([...expected.keys(), ...observed.keys()])) if ((expected.get(id) || 0n) !== (observed.get(id) || 0n)) throw new Error(`Unexpected token balance delta for ${id}`);
  const signatures = (await connection.getSignaturesForAddress(new (await import('@solana/web3.js')).PublicKey(cycleAddress))).map(row => row.signature);
  const refundSignatures = (await connection.getSignaturesForAddress(new (await import('@solana/web3.js')).PublicKey(refund.cycle))).map(row => row.signature);
  for (const signature of [...signatures, ...refundSignatures]) {
    const result = await connection.confirmTransaction(signature, 'finalized');
    if (result.value.err) throw new Error(`A recorded transaction finalized with an error: ${signature}`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  writeJson(`${work}/manifests/chain-evidence.json`, { capturedAt: new Date().toISOString(), cluster: 'localnet', genesisHash: manifest.genesisHash, programId: manifest.programId, testWallet: true, before, after, settled, returned, signatures, refundSignatures, exactBalanceDeltasVerified: true, allFinalized: true });
  console.log(JSON.stringify({ complete: true, cycleAddress, refundCycle: refund.cycle, scenes: scenes.length }));
} finally { await browser.close(); }
