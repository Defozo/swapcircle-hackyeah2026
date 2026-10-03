import type { PendingTransaction } from './transactions';

export type JournalTransaction = PendingTransaction & { journalRevision?: number };
type JournalStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Pending signatures survive regardless of how many later operations complete. */
export function retainTransactionHistory(records: JournalTransaction[]): JournalTransaction[] {
  let completed = 0;
  return [...records].sort((a, b) => b.createdAt - a.createdAt).filter(tx =>
    !['finalized', 'error'].includes(tx.status) || completed++ < 100);
}

/** Apply updates based on the exact journal version that was observed. */
export function mergeTransactionUpdates(stored: JournalTransaction[], updates: JournalTransaction[]): JournalTransaction[] {
  const records = new Map(stored.map(tx => [tx.id, tx]));
  for (const update of updates) {
    const current = records.get(update.id);
    if (current && (update.journalRevision ?? 0) !== (current.journalRevision ?? 0)) continue;
    if (current?.signature && update.signature !== current.signature) {
      if (!update.signature) continue; // A stale unsigned render cannot erase a signed receipt.
      throw new Error('A journal operation cannot replace its signed transaction.');
    }
    if (current && (current.networkKey !== update.networkKey || current.cycle !== update.cycle)) throw new Error('A journal operation cannot change its network or cycle.');
    const next = { ...current, ...update, journalRevision: (current?.journalRevision ?? 0) + 1 };
    if (current?.signature) {
      if (next.blockhash === undefined && current.blockhash !== undefined) next.blockhash = current.blockhash;
      if (next.lastValidBlockHeight === undefined && current.lastValidBlockHeight !== undefined) next.lastValidBlockHeight = current.lastValidBlockHeight;
      if (next.status === 'awaiting-signature' || current.status === 'finalized' || current.status === 'confirmed' && ['sent', 'unknown'].includes(next.status)) {
        next.status = current.status;
        next.error = current.error;
      }
    }
    records.set(next.id, next);
  }
  return retainTransactionHistory([...records.values()]);
}

/** The only journal writer. Persist synchronously before broadcast or React state updates. */
export function persistTransactionUpdates(storage: JournalStorage, key: string, updates: JournalTransaction[]): JournalTransaction[] {
  let stored: JournalTransaction[] = [];
  const raw = storage.getItem(key);
  if (raw) {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Transaction journal is not an array.');
    stored = parsed.filter(tx => tx && typeof tx.id === 'string' && typeof tx.status === 'string');
  }
  const merged = mergeTransactionUpdates(stored, updates);
  storage.setItem(key, JSON.stringify(merged));
  return merged;
}
