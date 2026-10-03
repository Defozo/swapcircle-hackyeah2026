import { test, expect } from '@playwright/test';
import type { Connection } from '@solana/web3.js';
import { reconcileTransaction, type PendingTransaction } from '../src/transactions';

const pending: PendingTransaction = { id: 'test', label: 'Wpłata', networkKey: 'test-genesis:test-program', cycle: 'test-cycle', signature: 'test-signature', status: 'unknown', createdAt: 1, lastValidBlockHeight: 100 };
const rpc = (status: unknown, height = 101) => ({ getSignatureStatuses: async () => ({ value: [status] }), getBlockHeight: async () => height }) as unknown as Connection;

test('unknown transactions require signature search, finalized expiry and cycle readback before manual retry', async () => {
  expect((await reconcileTransaction(rpc(null), pending, false)).status).toBe('unknown');
  expect((await reconcileTransaction(rpc(null, 100), pending, true)).status).toBe('unknown');
  expect((await reconcileTransaction(rpc(null, 101), pending, true)).status).toBe('error');
  expect((await reconcileTransaction(rpc({ confirmationStatus: 'finalized', err: null }), pending, true)).status).toBe('finalized');
  expect((await reconcileTransaction(rpc({ confirmationStatus: 'confirmed', err: null }), pending, true)).status).toBe('confirmed');
  expect((await reconcileTransaction(rpc({ err: { InstructionError: [0, 'Custom'] } }), pending, true)).status).toBe('error');
});
