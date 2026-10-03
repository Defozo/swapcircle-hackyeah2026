import { describe, expect, it } from 'vitest';
import { createTranslator, dictionaries, localizeText, operationIdentity } from '../../apps/web/src/i18n';

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
