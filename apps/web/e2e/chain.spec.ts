import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { SwapCircleClient, type BuiltTransaction, type Manifest } from '@swapcircle/sdk';
import { connectTestWallet, confirmOperation, installTestWallet, secretKey } from './wallet';

const enabled = process.env.SWAPCIRCLE_CHAIN_E2E === '1';
const root = resolve(import.meta.dirname, '../../..');
const evidenceRoot = resolve(root, 'docs/evidence');
const keyNames = ['SWAPCIRCLE_DEVNET_ALICE_KEY', 'SWAPCIRCLE_DEVNET_BOB_KEY', 'SWAPCIRCLE_DEVNET_CELINE_KEY', 'SWAPCIRCLE_DEVNET_RECOVERY_KEY'];
// Evidence is captured as explicit screenshots and public JSON receipts.
// Tracing custom wallet contexts corrupts ZIP streaming on this Windows host.
test.use({ trace: 'off' });

async function ensureLocalTestFees(connection: Connection, manifest: Manifest, signers: Keypair[]) {
  if (manifest.cluster !== 'localnet' || await connection.getGenesisHash() !== manifest.genesisHash) throw new Error('Chain E2E funding is restricted to the configured local validator.');
  for (const signer of signers) {
    if (await connection.getBalance(signer.publicKey, 'confirmed') >= 200_000_000) continue;
    const signature = await connection.requestAirdrop(signer.publicKey, 1_000_000_000);
    expect((await connection.confirmTransaction(signature, 'confirmed')).value.err).toBeNull();
  }
}

async function actorPage(browser: Browser, signer: Keypair, url: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage(); page.setDefaultTimeout(45_000); page.setDefaultNavigationTimeout(120_000); await installTestWallet(page, signer);
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await connectTestWallet(page);
  await expect(page.locator('.network-ready')).toBeVisible();
  return page;
}

test.describe('actual localnet program via browser wallet adapter', () => {
  test.skip(!enabled, 'Set SWAPCIRCLE_CHAIN_E2E=1 and inject participant keys with psst. This test never simulates chain success.');
  test.setTimeout(300_000);
  test.afterEach(async ({ browser }) => {
    // Also close independently created actor contexts when an assertion fails.
    await Promise.all(browser.contexts().map(context => context.close()));
  });

  test('wallet-signed publication, portable export and signed withdrawal', async ({ browser, baseURL }) => {
    const signer = secretKey(keyNames[0]!);
    const page = await actorPage(browser, signer, baseURL!);
    await page.getByRole('button', { name: 'Dodaj ofertę', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name=giveAmount]').fill('3');
    await dialog.locator('input[name=wantAmount]').fill('6');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Podpisz i opublikuj', exact: true }).click();
    await expect(page.locator('.offer-card')).toHaveCount(1);
    await expect(page.locator('.offer-card')).toContainText('3');
    const exported = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj', exact: true }).click();
    const file = await exported; mkdirSync(evidenceRoot, { recursive: true });
    await file.saveAs(resolve(evidenceRoot, 'ui-signed-offer.json'));
    const bundle = JSON.parse(readFileSync(resolve(evidenceRoot, 'ui-signed-offer.json'), 'utf8'));
    expect(bundle.offers[0].payload.owner).toBe(signer.publicKey.toBase58());
    expect(bundle.offers[0].signature.length).toBeGreaterThan(64);
    await page.getByRole('button', { name: 'Wycofaj publikację', exact: true }).click();
    await expect(page.locator('.offer-card')).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('.network-ready')).toBeVisible(); await expect(page.locator('.offer-card')).toHaveCount(0);
    await page.context().close();
  });

  test('signed import, three-party discovery, user creation, independent deposits and final atomic settlement', async ({ browser, baseURL }) => {
    const manifest: Manifest = JSON.parse(readFileSync(resolve(root, 'deployments/localnet.json'), 'utf8'));
    const connection = new Connection(manifest.rpcUrl, 'confirmed');
    const client = new SwapCircleClient(connection, manifest);
    await client.verifyNetwork();
    const signers = keyNames.slice(0, 3).map(secretKey);
    await ensureLocalTestFees(connection, manifest, signers);
    const page = await actorPage(browser, signers[0]!, baseURL!);
    const runtimeErrors: string[] = []; page.on('pageerror', e => runtimeErrors.push(e.message));
    await page.getByRole('button', { name: 'Importuj', exact: true }).click();
    await page.getByRole('button', { name: 'Importuj oferty demonstracyjne (localnet)', exact: true }).click();
    await expect(page.locator('.offer-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).click();
    mkdirSync(evidenceRoot, { recursive: true });
    await page.screenshot({ path: resolve(evidenceRoot, 'ui-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Znajdź cykle', exact: true }).click();
    await expect(page.locator('.match-card')).toHaveCount(1);
    await expect(page.locator('.match-summary > div').first()).toContainText('0');
    await page.getByRole('button', { name: 'Zobacz warunki', exact: true }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('button', { name: 'Utwórz cykl w sieci', exact: true }).click();
    await confirmOperation(page);
    const address = decodeURIComponent(new URL(page.url()).hash.slice(8));
    new PublicKey(address);
    const beforeCycle = await client.readCycle(address);
    expect(beforeCycle.state).toBe('Funding'); expect(beforeCycle.legs).toHaveLength(3);
    const beforeBalances = await Promise.all(beforeCycle.legs.map(leg => client.readBalances(leg.owner)));
    await page.getByRole('button', { name: 'Przygotuj brakujące konta odbiorców', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await Promise.race([dialog.waitFor(), page.getByText('Wszystkie konta są już przygotowane.', { exact: true }).waitFor()]);
    if (await dialog.count()) await confirmOperation(page);
    else await page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).click();

    // Signing rejection must not deposit or alter program state.
    await page.evaluate(() => sessionStorage.setItem('swapcircle-test-reject', 'true'));
    await page.getByRole('button', { name: 'Akceptuj i wpłać', exact: true }).click();
    let confirmation = page.getByRole('dialog');
    await confirmation.getByRole('checkbox').check();
    await confirmation.getByRole('button', { name: 'Podpisz w portfelu', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/User rejected|odrzucon/i);
    expect((await client.readCycle(address)).fundedMask).toBe(0);
    await page.evaluate(() => sessionStorage.removeItem('swapcircle-test-reject'));
    await page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).click();

    for (let i = 0; i < signers.length; i++) {
      const actor = i === 0 ? page : await actorPage(browser, signers[i]!, `${baseURL}#/cycle/${address}`);
      await actor.getByRole('button', { name: 'Akceptuj i wpłać', exact: true }).click();
      if (i === 0) {
        const confirmation = actor.getByRole('dialog');
        await confirmation.getByRole('checkbox').check();
        // The validator accepts the signed deposit, but its HTTP response and
        // readbacks are lost. Stale visible state must not enable a second send,
        // including after changing the language of the operation label.
        let sentRequests = 0;
        await actor.route('http://127.0.0.1:8899/', async route => {
          const method = route.request().postDataJSON()?.method;
          if (method === 'sendTransaction') { sentRequests++; await route.fetch(); await route.abort('failed'); }
          else if (method === 'getSignatureStatuses' || method === 'getAccountInfo') await route.abort('failed');
          else await route.continue();
        });
        await confirmation.getByRole('button', { name: 'Podpisz w portfelu', exact: true }).click();
        await expect(actor.locator('.transaction-list')).toContainText('Wynik nieznany');
        const uncertain = await actor.evaluate(() => JSON.parse(localStorage.getItem('swapcircle:transactions:v1') || '[]').find((tx: { status: string }) => tx.status === 'unknown'));
        expect(uncertain.signature).toBeTruthy(); expect(uncertain.lastValidBlockHeight).toBeGreaterThan(0);
        const ownerIndex = beforeCycle.legs.findIndex(leg => leg.owner === signers[0]!.publicKey.toBase58());
        await expect.poll(async () => (await client.readCycle(address)).fundedMask).toBe(1 << ownerIndex);
        await actor.screenshot({ path: resolve(evidenceRoot, 'ui-unknown-transaction.png'), fullPage: true });
        await actor.locator('.language-button').click();
        await actor.getByRole('button', { name: 'Accept and deposit', exact: true }).click();
        await expect(actor.getByRole('dialog')).toHaveCount(0);
        await expect(actor.getByRole('alert')).toHaveText('The result of this operation is unknown. Check the existing signature and cycle state before signing again.');
        expect(sentRequests).toBe(1);
        const stillPending = await actor.evaluate(() => JSON.parse(localStorage.getItem('swapcircle:transactions:v1') || '[]').filter((tx: { status: string }) => tx.status === 'unknown'));
        expect(stillPending).toHaveLength(1); expect(stillPending[0].signature).toBe(uncertain.signature);
        await actor.locator('.language-button').click();
        await actor.unroute('http://127.0.0.1:8899/');
      } else await confirmOperation(actor);
      const state = await client.readCycle(address);
      expect(state.state).toBe(i === 2 ? 'Settled' : 'Funding');
      if (i === 0) {
        await actor.reload({ waitUntil: 'domcontentloaded' });
        await expect(actor.getByText('Odczytaj cykl z sieci', { exact: true })).toHaveCount(0);
        await expect(actor.getByRole('button', { name: 'Akceptuj i wpłać', exact: true })).toHaveCount(0);
        await expect(actor.locator('.transaction-list')).toContainText('Akceptuj i wpłać');
        await expect(actor.locator('.transaction-list')).not.toContainText('Wynik nieznany');
      }
      if (i > 0) await actor.context().close();
    }
    const settled = await client.readCycle(address); expect(settled.fundedMask).toBe(7); expect(settled.state).toBe('Settled');
    const afterBalances = await Promise.all(settled.legs.map(leg => client.readBalances(leg.owner)));
    const sum = (rows: Awaited<ReturnType<SwapCircleClient['readBalances']>>, mint: string) => rows.filter(r => r.mint === mint).reduce((total, r) => total + BigInt(r.amount), 0n);
    for (let i = 0; i < settled.legs.length; i++) {
      const own = settled.legs[i]!, incoming = settled.legs[(i + 2) % 3]!;
      expect(sum(afterBalances[i]!, own.mint) - sum(beforeBalances[i]!, own.mint)).toBe(-BigInt(own.amount));
      expect(sum(afterBalances[i]!, incoming.mint) - sum(beforeBalances[i]!, incoming.mint)).toBe(BigInt(incoming.amount));
    }
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('.cycle-heading')).toContainText('Rozliczono');
    await page.screenshot({ path: resolve(evidenceRoot, 'ui-settled.png'), fullPage: true });
    writeFileSync(resolve(evidenceRoot, 'ui-chain-success.json'), JSON.stringify({ cluster: 'localnet', realValidator: true, cycle: address, state: settled.state, fundedMask: settled.fundedMask, exactBalancesVerified: true, signedByThreeWallets: true, signatureRejectionVerified: true, unknownTransportRecovered: true, languageChangeDoesNotResubmit: true, refreshedHistoryVerified: true, verifiedAt: new Date().toISOString() }, null, 2));
    expect(runtimeErrors).toEqual([]); await page.context().close();
  });

  test('independent expired refund through a different payer to a fresh safe account and public recovery export', async ({ browser, baseURL }) => {
    const manifest: Manifest = JSON.parse(readFileSync(resolve(root, 'deployments/localnet.json'), 'utf8'));
    const connection = new Connection(manifest.rpcUrl, 'confirmed'); const client = new SwapCircleClient(connection, manifest);
    const [alice, bob, recovery] = [keyNames[0]!, keyNames[1]!, keyNames[3]!].map(secretKey);
    await ensureLocalTestFees(connection, manifest, [alice!, bob!, recovery!]);
    const send = async (built: BuiltTransaction, payer: Keypair) => sendAndConfirmTransaction(connection, built.transaction, [payer, ...built.signers], { commitment: 'confirmed' });
    const minted = (symbol: string) => manifest.mints.find(m => m.symbol === symbol)!;
    const deadline = await client.readChainTime() + 45;
    const built = await client.buildCreate({ creator: alice!.publicKey.toBase58(), deadline, legs: [
      { owner: alice!.publicKey.toBase58(), mint: minted('dX').mint, amount: '10', decimals: minted('dX').decimals },
      { owner: bob!.publicKey.toBase58(), mint: minted('dY').mint, amount: '4', decimals: minted('dY').decimals },
    ] });
    await send(built, alice!); const address = built.cycleAddress;
    const prepare = await client.prepareDestinations(address, alice!.publicKey.toBase58()); if (prepare.transaction.instructions.length) await send(prepare, alice!);
    await send(await client.buildFund(address, 0, alice!.publicKey.toBase58()), alice!);
    const before = await client.readBalances(alice!.publicKey.toBase58());
    await expect.poll(() => client.readChainTime(), { timeout: 60_000 }).toBeGreaterThan(deadline);
    const page = await actorPage(browser, recovery!, `${baseURL}#/cycle/${address}`);
    await expect(page.locator('.cycle-heading')).toContainText('Wygasły');
    await page.getByLabel('Tryb konta zwrotu').selectOption('fresh');
    await page.getByRole('button', { name: 'Zwróć depozyt', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Konto docelowe zwrotu');
    await confirmOperation(page);
    expect((await client.readCycle(address)).state).toBe('Refunded');
    const after = await client.readBalances(alice!.publicKey.toBase58());
    const balance = (rows: typeof after) => rows.filter(row => row.mint === minted('dX').mint).reduce((total, row) => total + BigInt(row.amount), 0n);
    expect(balance(after) - balance(before)).toBe(10n);
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Pobierz JSON', exact: true }).click();
    const packageFile = await downloadPromise;
    const packagePath = resolve(evidenceRoot, 'ui-recovery-package.json'); await packageFile.saveAs(packagePath);
    const recoveryPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
    expect(recoveryPackage.owner).toBe(alice!.publicKey.toBase58()); expect(recoveryPackage.cycle).toBe(address);
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('.cycle-heading')).toContainText('Zwrócono');
    await page.screenshot({ path: resolve(evidenceRoot, 'ui-refunded.png'), fullPage: true });
    writeFileSync(resolve(evidenceRoot, 'ui-chain-refund.json'), JSON.stringify({ cluster: 'localnet', realValidator: true, cycle: address, state: 'Refunded', separatePayer: recovery!.publicKey.toBase58(), beneficiary: alice!.publicKey.toBase58(), amountReturned: '10', freshSafeAccount: true, recoveryExportVerified: true, verifiedAt: new Date().toISOString() }, null, 2));
    await page.context().close();
  });
});


