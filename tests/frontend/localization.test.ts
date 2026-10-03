import { describe, expect, it } from 'vitest';
import { createTranslator, dictionaries, localizeText, operationIdentity } from '../../apps/web/src/i18n';
import { message } from '../../apps/web/src/transactions';

describe('language changes during financial operations', () => {
  it('keeps current and persisted Polish or English operation labels on one stable key', () => {
    for (const key of ['create', 'fund', 'refund', 'surplus'] as const) {
      expect(operationIdentity(dictionaries.pl[key])).toBe(key);
      expect(operationIdentity(dictionaries.en[key])).toBe(key);
    }
    expect(operationIdentity(dictionaries.pl.cleanup)).toBe('close');
    expect(operationIdentity(dictionaries.en.cleanup)).toBe('close');
    expect(operationIdentity('Przygotuj konta odbiorców')).toBe('prepare');
    expect(operationIdentity('Prepare recipient accounts')).toBe('prepare');
    expect(operationIdentity('fund')).toBe('fund');
  });

  it('translates a persisted unknown-result warning without changing its financial meaning', () => {
    const warning = 'Sygnatura nie ma jeszcze potwierdzenia. Brak odpowiedzi nie dowodzi niepowodzenia. Najpierw sprawdź stan cyklu.';
    const english = localizeText('en', warning);
    expect(english).toBe('The signature is not yet confirmed. A missing response does not prove failure. Check the cycle state first.');
    expect(localizeText('pl', english)).toBe(warning);
  });

  it('preserves inserted public values when translating a stored message in either direction', () => {
    const address = 'A.(B)+[123]';
    expect(createTranslator('en').f('Kopiuj {0}', address)).toBe(`Copy ${address}`);
    expect(localizeText('en', `Kopiuj ${address}`)).toBe(`Copy ${address}`);
    expect(localizeText('pl', `Copy ${address}`)).toBe(`Kopiuj ${address}`);
    expect(localizeText('en', 'Unknown RPC error: 429')).toBe('Unknown RPC error: 429');
  });
});

describe('SDK errors shown in transaction history', () => {
  it('decodes every existing program error and provides both languages', () => {
    for (let code = 6000; code <= 6025; code++) {
      const raw = `Simulation failed. custom program error: 0x${code.toString(16)}. Program log: AnchorError at lib.rs:115. 14511 compute units.`;
      const polish = message(new Error(raw));
      const english = localizeText('en', polish);
      expect(polish).not.toContain('custom program error');
      expect(english).not.toBe(polish);
      expect(localizeText('pl', english)).toBe(polish);
    }
  });

  it('decodes stored raw deadline logs, rejected signatures and rate limits without changing statuses', () => {
    const record = { status: 'unknown', error: 'Error: Transaction simulation failed: custom program error: 0x1777. Program log: AnchorError. Error Number: 6007. lib.rs:115, 14511 compute units.' };
    expect(localizeText('pl', message(record.error))).toBe('Minął termin wpłaty.');
    expect(localizeText('en', message(record.error))).toBe('The funding deadline has passed.');
    expect(record.status).toBe('unknown');
    expect(record.error).toContain('lib.rs');
    expect(localizeText('en', message(new Error('User rejected the signature')))).toBe('The signature was rejected. Check the operation state before trying again.');
    expect(localizeText('en', message('HTTP 429 Too Many Requests'))).toBe('RPC is limiting read requests. Wait or choose another endpoint on the same cluster.');
    expect(localizeText('pl', message('Program is not deployed'))).toBe('Program nie jest wdrożony.');
    expect(localizeText('en', message('Program is not deployed'))).toBe('Program is not deployed');
  });
});
