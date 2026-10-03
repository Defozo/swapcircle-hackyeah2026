import type { Page } from '@playwright/test';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

/** Browser automation only. The public application has no signer or test-wallet code.
 * Secrets stay in the Node test process; only public keys and signatures cross the binding.
 */
export async function installTestWallet(page: Page, signer: Keypair) {
  await page.exposeFunction('__swapcircleTestSign', (bytes: number[]) => Array.from(nacl.sign.detached(Uint8Array.from(bytes), signer.secretKey)));
  await page.addInitScript(({ owner, publicBytes }) => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const publicKey = { toBytes: () => new Uint8Array(publicBytes), toBase58: () => owner, toString: () => owner };
    const provider = {
      isPhantom: true, isConnected: false, publicKey,
      on(event: string, handler: (...args: unknown[]) => void) { (listeners[event] ||= []).push(handler); return this; },
      off(event: string, handler: (...args: unknown[]) => void) { listeners[event] = (listeners[event] || []).filter(fn => fn !== handler); return this; },
      async connect() { this.isConnected = true; (listeners.connect || []).forEach(fn => fn(publicKey)); return { publicKey }; },
      async disconnect() { this.isConnected = false; (listeners.disconnect || []).forEach(fn => fn()); },
      async signMessage(bytes: Uint8Array) {
        const sign = (window as unknown as { __swapcircleTestSign: (message: number[]) => Promise<number[]> }).__swapcircleTestSign;
        return { signature: new Uint8Array(await sign(Array.from(bytes))) };
      },
      async signTransaction(transaction: { serializeMessage(): Uint8Array; signatures: { publicKey: { toBase58(): string }; signature: Uint8Array | null }[]; addSignature(key: unknown, signature: Uint8Array): void }) {
        if (sessionStorage.getItem('swapcircle-test-reject') === 'true') throw new Error('User rejected the signature');
        const signature = (await this.signMessage(transaction.serializeMessage())).signature;
        const key = transaction.signatures.find(s => s.publicKey.toBase58() === owner)?.publicKey;
        if (!key) throw new Error('The test wallet is not a required signer');
        transaction.addSignature(key, signature);
        return transaction;
      },
      async signAllTransactions(transactions: Parameters<typeof this.signTransaction>[0][]) { return Promise.all(transactions.map(tx => this.signTransaction(tx))); },
    };
    (window as unknown as { phantom: { solana: unknown }; solana: unknown }).phantom = { solana: provider };
    (window as unknown as { solana: unknown }).solana = provider;
  }, { owner: signer.publicKey.toBase58(), publicBytes: Array.from(signer.publicKey.toBytes()) });
}

export async function connectTestWallet(page: Page) {
  await page.getByRole('button', { name: 'Połącz portfel', exact: true }).click();
  await page.getByRole('button', { name: /Phantom/ }).click();
}

export function secretKey(name: string): Keypair {
  const raw = process.env[name];
  if (!raw) throw new Error(`Inject ${name} through psst to run chain E2E. Secret values must not appear in arguments.`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export async function confirmOperation(page: Page) {
  const confirmation = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Podpisz w portfelu' }) });
  await confirmation.getByRole('checkbox').check();
  await confirmation.getByRole('button', { name: 'Podpisz w portfelu' }).click();
  await page.getByRole('status').filter({ hasText: 'Transakcja confirmed.' }).waitFor({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Zamknij powiadomienie' }).click();
}
