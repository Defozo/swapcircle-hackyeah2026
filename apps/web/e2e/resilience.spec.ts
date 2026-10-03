import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { SwapCircleClient, type BuiltTransaction, type Manifest } from '@swapcircle/sdk';
import { connectTestWallet, confirmOperation, installTestWallet, secretKey } from './wallet';

const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'docs/evidence');
test.use({ trace: 'off' });
test.setTimeout(240_000);
test.skip(process.env.SWAPCIRCLE_CHAIN_E2E !== '1', 'Requires the real local validator and psst-injected participant keys.');
test.afterEach(async ({ browser }) => { await Promise.all(browser.contexts().map(context => context.close())); });

async function setup() {
  const manifest: Manifest = JSON.parse(readFileSync(resolve(root, 'deployments/localnet.json'), 'utf8'));
  if (manifest.cluster !== 'localnet') throw new Error('Resilience tests only use the local validator.');
  const connection = new Connection(manifest.rpcUrl, 'confirmed');
  const client = new SwapCircleClient(connection, manifest); await client.verifyNetwork();
  const alice = secretKey('SWAPCIRCLE_DEVNET_ALICE_KEY'), bob = secretKey('SWAPCIRCLE_DEVNET_BOB_KEY');
  for (const signer of [alice, bob]) if (await connection.getBalance(signer.publicKey) < 200_000_000) {
    const signature = await connection.requestAirdrop(signer.publicKey, 1_000_000_000);
    expect((await connection.confirmTransaction(signature, 'confirmed')).value.err).toBeNull();
  }
  const send = (built: BuiltTransaction, signer: Keypair) => sendAndConfirmTransaction(connection, built.transaction, [signer, ...built.signers], { commitment: 'confirmed' });
  const mint = (symbol: string) => manifest.mints.find(item => item.symbol === symbol)!;
  const create = async (deadline: number) => {
    const built = await client.buildCreate({ creator: alice.publicKey.toBase58(), deadline, legs: [
      { owner: alice.publicKey.toBase58(), mint: mint('dX').mint, amount: '10', decimals: mint('dX').decimals },
      { owner: bob.publicKey.toBase58(), mint: mint('dY').mint, amount: '4', decimals: mint('dY').decimals },
    ] });
    await send(built, alice);
    const prepare = await client.prepareDestinations(built.cycleAddress, alice.publicKey.toBase58());
    if (prepare.transaction.instructions.length) await send(prepare, alice);
    return built.cycleAddress;
  };
  mkdirSync(evidence, { recursive: true });
  return { manifest, connection, client, alice, bob, send, create, mint };
}

async function screenshotReady(page: Page, filename: string, nodes = 2) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForFunction(expected => {
    const rendered = [...document.querySelectorAll('.react-flow__node')];
    return rendered.length === expected && rendered.every(node => getComputedStyle(node).visibility === 'visible' && node.getBoundingClientRect().width > 0) && document.querySelectorAll('.react-flow__edge-text').length === expected;
  }, nodes);
  await page.screenshot({ path: resolve(evidence, filename), fullPage: true, animations: 'disabled', caret: 'hide' });
}

test('a disconnected WebSocket cannot prevent HTTP polling from observing a real deposit and settlement', async ({ browser, baseURL }) => {
  const { client, alice, bob, send, create } = await setup();
  const address = await create(await client.readChainTime() + 300);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'pl-PL', reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(45_000); page.setDefaultNavigationTimeout(120_000);
  let disconnected = false, subscriptions = 0, subscriptionAcknowledgements = 0, droppedNotifications = 0, blockedReconnects = 0, closedServerConnections = 0;
  const pendingSubscriptions = new Set<number | string>();
  const servers: WebSocketRoute[] = [], pollReads: number[] = [];
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.routeWebSocket('ws://127.0.0.1:8900/**', socket => {
    if (disconnected) { blockedReconnects++; void socket.close({ code: 4001, reason: 'Injected WebSocket outage' }); return; }
    const server = socket.connectToServer(); servers.push(server);
    server.onClose((code, reason) => { closedServerConnections++; void socket.close({ code, reason }); });
    socket.onMessage(message => {
      const data = JSON.parse(message.toString());
      if (data.method === 'accountSubscribe' && data.params?.[0] === address) { subscriptions++; pendingSubscriptions.add(data.id); }
      if (!disconnected) server.send(message);
    });
    server.onMessage(message => {
      const data = JSON.parse(message.toString());
      if (pendingSubscriptions.has(data.id) && typeof data.result === 'number') subscriptionAcknowledgements++;
      if (disconnected) { if (data.method === 'accountNotification') droppedNotifications++; return; }
      socket.send(message);
    });
  });
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    const data = request.postDataJSON();
    if (disconnected && data?.method === 'getAccountInfo' && data.params?.[0] === address) pollReads.push(Date.now());
  });
  await page.goto(`${baseURL}/#/cycle/${address}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.cycle-heading')).toContainText('Oczekuje');
  await expect.poll(() => subscriptions).toBeGreaterThan(0);
  await expect.poll(() => subscriptionAcknowledgements).toBeGreaterThan(0);
  disconnected = true; const disconnectedAt = Date.now();
  // Browser WebSocket.close permits 1000 or private codes 3000–4999.
  // Wait for the native server close event before mutating the cycle.
  await Promise.all(servers.map(server => server.close({ code: 4001, reason: 'Injected WebSocket outage' })));
  await expect.poll(() => closedServerConnections).toBeGreaterThan(0);
  const depositStartedAt = Date.now();
  const depositSignature = await send(await client.buildFund(address, 0, alice.publicKey.toBase58()), alice);
  expect((await client.readCycle(address)).fundedMask).toBe(1);
  await expect(page.locator('.cycle-progress > div').nth(0)).toContainText('Wpłacono', { timeout: 40_000 });
  await expect.poll(() => pollReads.filter(time => time >= depositStartedAt).length).toBeGreaterThan(0);
  const depositObservedAt = Date.now();
  const settlementStartedAt = Date.now();
  const settlementSignature = await send(await client.buildFund(address, 1, bob.publicKey.toBase58()), bob);
  expect((await client.readCycle(address)).state).toBe('Settled');
  await expect(page.locator('.cycle-heading')).toContainText('Rozliczono', { timeout: 40_000 });
  await expect.poll(() => pollReads.filter(time => time >= settlementStartedAt).length).toBeGreaterThan(0);
  expect(blockedReconnects).toBeGreaterThan(0); expect(pageErrors).toEqual([]);
  const proof = { cluster: 'localnet', realValidator: true, cycle: address, subscriptionEstablished: subscriptionAcknowledgements > 0, disconnectedAt, closedServerConnections, blockedReconnects, droppedNotifications, pollReads, depositObservedAt, settlementObservedAt: Date.now(), depositSignature, settlementSignature, state: 'Settled', httpPollingVerified: true, pageErrors, uiScreenshotVerified: false };
  writeFileSync(resolve(evidence, 'ui-websocket-polling.json'), JSON.stringify(proof, null, 2));
  await screenshotReady(page, 'ui-websocket-polling.png');
  writeFileSync(resolve(evidence, 'ui-websocket-polling.json'), JSON.stringify({ ...proof, uiScreenshotVerified: true }, null, 2));
  await context.close();
});

test('deadline expiring while the wallet awaits a signature rejects the late deposit and preserves independent refund', async ({ browser, baseURL }) => {
  const { client, alice, bob, send, create, mint } = await setup();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'pl-PL', reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(45_000); page.setDefaultNavigationTimeout(120_000);
  await installTestWallet(page, bob); await page.goto(`${baseURL}/?mode=app`, { waitUntil: 'domcontentloaded' }); await connectTestWallet(page);
  await expect(page.locator('.network-ready')).toBeVisible();
  const deadline = await client.readChainTime() + 45;
  const address = await create(deadline);
  const firstDeposit = await send(await client.buildFund(address, 0, alice.publicKey.toBase58()), alice);
  const sum = async (owner: string, mintAddress: string) => (await client.readBalances(owner)).filter(row => row.mint === mintAddress).reduce((total, row) => total + BigInt(row.amount), 0n);
  const aliceBeforeRefund = await sum(alice.publicKey.toBase58(), mint('dX').mint), bobBeforeAttempt = await sum(bob.publicKey.toBase58(), mint('dY').mint);
  let signingStartedAt = 0, signingReturnedAt = 0, signatureRequests = 0;
  await page.exposeFunction('__swapcircleWaitForDeadline', async () => {
    signatureRequests++;
    if (signatureRequests > 1) return;
    signingStartedAt = await client.readChainTime();
    if (signingStartedAt >= deadline) throw new Error('The test must start signing before the deadline.');
    while (await client.readChainTime() <= deadline) await new Promise(resolve => setTimeout(resolve, 500));
    signingReturnedAt = await client.readChainTime();
  });
  await page.evaluate(() => {
    const bridge = window as unknown as { __swapcircleWaitForDeadline(): Promise<void>; phantom: { solana: { signTransaction(transaction: unknown): Promise<unknown> } } };
    const provider = bridge.phantom.solana, sign = provider.signTransaction.bind(provider);
    provider.signTransaction = async transaction => { await bridge.__swapcircleWaitForDeadline(); return sign(transaction); };
  });
  const submissions: { at: number; response: unknown }[] = [];
  await page.route('http://127.0.0.1:8899/', async route => {
    if (route.request().postDataJSON()?.method !== 'sendTransaction') { await route.continue(); return; }
    const response = await route.fetch(); submissions.push({ at: Date.now(), response: await response.json() });
    await route.fulfill({ response });
  });
  await page.evaluate(cycle => { location.hash = `/cycle/${cycle}`; }, address);
  await expect(page.locator('.cycle-heading')).toContainText('Oczekuje');
  await page.getByRole('button', { name: 'Akceptuj i wpłać', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await confirmation.getByRole('checkbox').check();
  await confirmation.getByRole('button', { name: 'Podpisz w portfelu', exact: true }).click();
  await expect.poll(() => submissions.length, { timeout: 60_000 }).toBe(1);
  expect(signingStartedAt).toBeLessThan(deadline); expect(signingReturnedAt).toBeGreaterThanOrEqual(deadline);
  expect(JSON.stringify(submissions[0]!.response)).toMatch(/DeadlinePassed|0x1777|"Custom":6007/);
  await expect(page.locator('.transaction-list')).toContainText('Wynik nieznany');
  const rejected = await client.readCycle(address);
  expect(rejected.state).toBe('Funding'); expect(rejected.fundedMask).toBe(1);
  expect(await sum(bob.publicKey.toBase58(), mint('dY').mint)).toBe(bobBeforeAttempt);
  await expect(page.getByRole('button', { name: 'Akceptuj i wpłać', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zwróć depozyt', exact: true })).toBeVisible();
  expect(submissions).toHaveLength(1); expect(signatureRequests).toBe(1);
  const rejectionProof = { cluster: 'localnet', realValidator: true, cycle: address, deadline, signingStartedAt, signingReturnedAt, firstDeposit, rejectedFundResponse: submissions[0]!.response, fundRequests: 1, lateOwnerBalanceUnchanged: true, fundedMaskAfterRejection: rejected.fundedMask, separateRefundPayer: bob.publicKey.toBase58(), beneficiary: alice.publicKey.toBase58(), noAutomaticResubmission: true };
  writeFileSync(resolve(evidence, 'ui-deadline-signature.json'), JSON.stringify({ ...rejectionProof, refundVerified: false, uiScreenshotsVerified: false }, null, 2));
  const screenshotErrors: string[] = [];
  try { await screenshotReady(page, 'ui-deadline-signature-rejected.png'); } catch (error) { screenshotErrors.push(String(error)); }
  if (await page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).count()) await page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).click();
  await page.getByLabel('Tryb konta zwrotu').selectOption('fresh');
  await page.getByRole('button', { name: 'Zwróć depozyt', exact: true }).click();
  await confirmOperation(page);
  const refunded = await client.readCycle(address);
  expect(refunded.state).toBe('Refunded'); expect(refunded.refundedMask).toBe(1);
  expect(await sum(alice.publicKey.toBase58(), mint('dX').mint) - aliceBeforeRefund).toBe(10n);
  expect(submissions).toHaveLength(2); expect(signatureRequests).toBe(2);
  const proof = { ...rejectionProof, returnedAmount: '10', state: refunded.state, refundVerified: true, checkedAt: new Date().toISOString() };
  writeFileSync(resolve(evidence, 'ui-deadline-signature.json'), JSON.stringify({ ...proof, uiScreenshotsVerified: false, screenshotErrors }, null, 2));
  try { await screenshotReady(page, 'ui-deadline-refunded.png'); } catch (error) {
    screenshotErrors.push(String(error));
    writeFileSync(resolve(evidence, 'ui-deadline-graph-diagnostic.json'), JSON.stringify(await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, style: node.getAttribute('style'), visibility: getComputedStyle(node).visibility, bounds: node.getBoundingClientRect().toJSON() }))), null, 2));
  }
  writeFileSync(resolve(evidence, 'ui-deadline-signature.json'), JSON.stringify({ ...proof, uiScreenshotsVerified: screenshotErrors.length === 0, screenshotErrors }, null, 2));
  expect(screenshotErrors).toEqual([]);
  await context.close();
});
