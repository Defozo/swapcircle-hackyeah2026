import type { Connection, Transaction, Keypair } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

export type PendingTransaction = { id: string; label: string; networkKey?: string; cycle?: string; signature?: string; status: 'awaiting-signature' | 'sent' | 'confirmed' | 'finalized' | 'error' | 'unknown'; error?: string; createdAt: number; blockhash?: string; lastValidBlockHeight?: number };
export const STORAGE = 'swapcircle:transactions:v1';
export function loadTransactions(): PendingTransaction[] {
  try { const list: unknown = JSON.parse(localStorage.getItem(STORAGE) || '[]'); return Array.isArray(list) ? list.filter(x => x && typeof x.id === 'string' && typeof x.status === 'string').slice(0, 100) : []; } catch { return []; }
}
export function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export async function prepareTransaction(connection: Connection, transaction: Transaction, payer: string, signers: Keypair[]) {
  const latest = await connection.getLatestBlockhash('confirmed');
  transaction.feePayer = new PublicKey(payer); transaction.recentBlockhash = latest.blockhash;
  if (signers.length) transaction.partialSign(...signers);
  const [fee, balance] = await Promise.all([connection.getFeeForMessage(transaction.compileMessage(), 'confirmed'), connection.getBalance(transaction.feePayer, 'confirmed')]);
  if (fee.value === null) throw new Error('Nie można ustalić opłaty. Odśwież stan sieci i spróbuj ponownie.');
  if (balance < fee.value) throw new Error('Brak SOL na opłatę transakcyjną.');
  return { latest, fee: fee.value, balance };
}

export async function reconcileTransaction(connection: Connection, tx: PendingTransaction, liveCycleChecked = false): Promise<PendingTransaction> {
  if (!tx.signature) return tx.status === 'awaiting-signature' ? { ...tx, status: 'unknown', error: 'Przerwano oczekiwanie na podpis. Sprawdź portfel i stan cyklu przed ponowieniem.' } : tx;
  const result = (await connection.getSignatureStatuses([tx.signature], { searchTransactionHistory: true })).value[0];
  if (!result) {
    if (liveCycleChecked && tx.lastValidBlockHeight !== undefined && await connection.getBlockHeight('finalized') > tx.lastValidBlockHeight) {
      // Expiry is definitive only after the finalized chain passed the validity
      // bound, the old signature was searched, and the cycle was read anew.
      return { ...tx, status: 'error', error: 'RPC nie odnalazł sygnatury, blockhash wygasł, a stan cyklu sprawdzono ponownie. Możesz świadomie przygotować nową operację, jeśli bieżący stan nadal na nią pozwala.' };
    }
    return { ...tx, status: 'unknown', error: 'Sygnatura nie ma jeszcze potwierdzenia. Brak odpowiedzi nie dowodzi niepowodzenia. Najpierw sprawdź stan cyklu.' };
  }
  if (result.err) return { ...tx, status: 'error', error: JSON.stringify(result.err) };
  return { ...tx, status: result.confirmationStatus === 'finalized' ? 'finalized' : result.confirmationStatus === 'confirmed' ? 'confirmed' : 'sent', error: undefined };
}
