import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {
  amountSchema, canonicalOfferBytes, canonicalRevocationBytes, createOffer, createOfferLink,
  exportOffers, importOfferLink, importOffers, offerId, signOffer, signRevocation,
  verifyOffer, verifyRevocation, type OfferPayload,
} from '../../packages/matching/src';

const pair = (value: number) => nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(value));
const owner = pair(1);
const key = (value: number) => bs58.encode(pair(value).publicKey);
const now = 1_800_000_000;
const context = { genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', programId: key(9), now };
const payload = (): OfferPayload => createOffer({ genesisHash: context.genesisHash, programId: context.programId, owner: key(1), nonce: '0123456789abcdef0123456789abcdef', giveMint: key(2), giveAmount: '18446744073709551615', wantMint: key(3), wantAmount: '9007199254740993', expiresAt: now + 3600 });
const signer = async (bytes: Uint8Array) => nacl.sign.detached(bytes, owner.secretKey);

describe('canonical signed publications', () => {
  it('has fixed UTF-8 order independent of source property insertion order', async () => {
    const p = payload();
    const shuffled = Object.fromEntries(Object.entries(p).reverse()) as OfferPayload;
    expect(canonicalOfferBytes(p)).toEqual(canonicalOfferBytes(shuffled));
    expect(new TextDecoder().decode(canonicalOfferBytes(p))).toBe(JSON.stringify([
      'swapcircle:offer', 1, context.genesisHash, context.programId, key(1), p.nonce,
      key(2), '18446744073709551615', key(3), '9007199254740993', now + 3600,
    ]));
    expect(verifyOffer(await signOffer(shuffled, signer), context).valid).toBe(true);
  });

  it('agrees with independent Node/OpenSSL Ed25519 signing and verification', async () => {
    const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, 1)]), format: 'der', type: 'pkcs8' });
    const offer = await signOffer(payload(), signer);
    const nodeSignature = sign(null, canonicalOfferBytes(offer.payload), privateKey);
    expect(bs58.decode(offer.signature)).toEqual(new Uint8Array(nodeSignature));
    expect(verify(null, canonicalOfferBytes(offer.payload), createPublicKey(privateKey), nodeSignature)).toBe(true);
    const revocation = await signRevocation(offer, signer, now);
    expect(verify(null, canonicalRevocationBytes(revocation.payload), createPublicKey(privateKey), bs58.decode(revocation.signature))).toBe(true);
  });

  it.each(['', 'abc', '0', '-1', '1.5', '01', ' 1', '1e9', '18446744073709551616'])('rejects malformed or overflowing amount %s without throwing inside safeParse', value => {
    expect(amountSchema.safeParse(value).success).toBe(false);
  });

  it('rejects altered terms, signer, domain, chain, program and extra fields', async () => {
    const offer = await signOffer(payload(), signer);
    expect(verifyOffer({ ...offer, payload: { ...offer.payload, wantAmount: '1' } }, context)).toMatchObject({ valid: false, code: 'signature' });
    expect(verifyOffer({ ...offer, payload: { ...offer.payload, owner: key(4) } }, context)).toMatchObject({ valid: false, code: 'signature' });
    expect(verifyOffer({ ...offer, payload: { ...offer.payload, domain: 'other:offer' } }, context)).toMatchObject({ valid: false, code: 'schema' });
    expect(verifyOffer(offer, { ...context, genesisHash: key(5) })).toMatchObject({ valid: false, code: 'network' });
    expect(verifyOffer(offer, { ...context, programId: key(5) })).toMatchObject({ valid: false, code: 'program' });
    expect(verifyOffer({ ...offer, fake: true }, context)).toMatchObject({ valid: false, code: 'schema' });
    expect(verifyOffer(offer, { ...context, now: offer.payload.expiresAt })).toMatchObject({ valid: false, code: 'expired' });
    await expect(signOffer(payload(), async bytes => nacl.sign.detached(bytes, pair(4).secretKey))).rejects.toThrow('owner');
  });

  it('accepts only owner-signed revocations and applies them to stale copies', async () => {
    const offer = await signOffer(payload(), signer);
    const revoked = await signRevocation(offer, signer, now);
    expect(verifyRevocation(revoked, context).valid).toBe(true);
    expect(offerId(revoked)).toBe(offerId(offer));
    expect(verifyOffer(offer, context, [revoked])).toMatchObject({ valid: false, code: 'revoked' });
    expect(verifyRevocation({ ...revoked, payload: { ...revoked.payload, nonce: 'a'.repeat(32) } }, context)).toMatchObject({ valid: false, code: 'signature' });
    expect(verifyRevocation(revoked, { ...context, now: now - 1 })).toMatchObject({ valid: false, code: 'future' });
    await expect(signRevocation(offer, async bytes => nacl.sign.detached(bytes, pair(4).secretKey), now)).rejects.toThrow('owner');
    // Expiry cannot resurrect a revoked nonce.
    expect(verifyRevocation(revoked, { ...context, now: now + 7200 }).valid).toBe(true);
  });

  it('imports signed JSON and fragment links without a server, preserving revocations', async () => {
    const offer = await signOffer(payload(), signer);
    const revocation = await signRevocation(offer, signer, now);
    const json = exportOffers([offer], [revocation], now);
    expect(importOffers(json, context).offers).toEqual([offer]);
    expect(importOffers(json, context).revocations).toEqual([revocation]);
    const link = createOfferLink('https://example.org/app', [offer], [revocation]);
    expect(new URL(link).search).toBe('');
    expect(importOfferLink(link, context).offers).toEqual([offer]);
    expect(() => importOffers(exportOffers([offer, offer], [], now), context)).toThrow('Duplicate');
    expect(() => importOffers(json.replace('9007199254740993', '9007199254740992'), context)).toThrow('signature');
    expect(() => importOffers(json, { ...context, programId: key(8) })).toThrow('program');
    expect(() => importOffers(' '.repeat(2_000_001), context)).toThrow('size limit');
    expect(() => importOfferLink('https://example.org/#hello', context)).toThrow('does not contain');
  });
});
