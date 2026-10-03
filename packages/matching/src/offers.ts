import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { z } from 'zod';

export const OFFER_DOMAIN = 'swapcircle:offer' as const;
export const REVOCATION_DOMAIN = 'swapcircle:revoke' as const;
export const MAX_U64 = 18_446_744_073_709_551_615n;
export const MAX_BUNDLE_BYTES = 2_000_000;
export const MAX_BUNDLE_OFFERS = 2_000;

function hasDecodedLength(value: string, length: number): boolean {
  try { return bs58.decode(value).length === length; } catch { return false; }
}

export const publicKeySchema = z.string().min(32).max(44).refine(v => hasDecodedLength(v, 32), 'Expected a 32-byte base58 public key');
export const amountSchema = z.string().regex(/^[1-9][0-9]{0,19}$/, 'Amount must be positive integer base units without leading zeros').refine(v => /^[1-9][0-9]{0,19}$/.test(v) && BigInt(v) <= MAX_U64, 'Amount exceeds u64');
// Use the complete RPC getGenesisHash value, never a shortened wallet/CAIP cluster identifier.
const genesisSchema = publicKeySchema;
const timestampSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonceSchema = z.string().regex(/^[0-9a-f]{32}$/);
const signatureSchema = z.string().min(64).max(88).refine(v => hasDecodedLength(v, 64), 'Expected an Ed25519 signature');

export const offerPayloadSchema = z.object({
  version: z.literal(1), domain: z.literal(OFFER_DOMAIN),
  genesisHash: genesisSchema, programId: publicKeySchema,
  owner: publicKeySchema, nonce: nonceSchema,
  giveMint: publicKeySchema, giveAmount: amountSchema,
  wantMint: publicKeySchema, wantAmount: amountSchema,
  expiresAt: timestampSchema,
}).strict();
export const signedOfferSchema = z.object({ payload: offerPayloadSchema, signature: signatureSchema }).strict();
export type OfferPayload = z.infer<typeof offerPayloadSchema>;
export type SignedOffer = z.infer<typeof signedOfferSchema>;

export const revocationPayloadSchema = z.object({
  version: z.literal(1), domain: z.literal(REVOCATION_DOMAIN),
  genesisHash: genesisSchema, programId: publicKeySchema,
  owner: publicKeySchema, nonce: nonceSchema,
  offerExpiresAt: timestampSchema, revokedAt: timestampSchema,
}).strict();
export const signedRevocationSchema = z.object({ payload: revocationPayloadSchema, signature: signatureSchema }).strict();
export type RevocationPayload = z.infer<typeof revocationPayloadSchema>;
export type SignedRevocation = z.infer<typeof signedRevocationSchema>;
export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;
export interface OfferContext { genesisHash: string; programId: string; now?: number }
export type Verification<T> = { valid: true; value: T } | { valid: false; code: 'schema' | 'network' | 'program' | 'signature' | 'expired' | 'future' | 'revoked'; reason: string };

/** Fixed-order JSON tuple, UTF-8, no optional fields or locale-sensitive numbers. */
export function canonicalOfferBytes(input: OfferPayload): Uint8Array {
  const p = offerPayloadSchema.parse(input);
  return new TextEncoder().encode(JSON.stringify([
    p.domain, p.version, p.genesisHash, p.programId, p.owner, p.nonce,
    p.giveMint, p.giveAmount, p.wantMint, p.wantAmount, p.expiresAt,
  ]));
}
export function canonicalRevocationBytes(input: RevocationPayload): Uint8Array {
  const p = revocationPayloadSchema.parse(input);
  return new TextEncoder().encode(JSON.stringify([
    p.domain, p.version, p.genesisHash, p.programId, p.owner, p.nonce, p.offerExpiresAt, p.revokedAt,
  ]));
}

export function createOffer(input: Omit<OfferPayload, 'version' | 'domain' | 'nonce'> & { nonce?: string }): OfferPayload {
  const nonce = input.nonce ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  return offerPayloadSchema.parse({ ...input, nonce, version: 1, domain: OFFER_DOMAIN });
}
export async function signOffer(payload: OfferPayload, signMessage: SignMessage): Promise<SignedOffer> {
  const parsed = offerPayloadSchema.parse(payload);
  const signature = await signMessage(canonicalOfferBytes(parsed));
  const offer = signedOfferSchema.parse({ payload: parsed, signature: bs58.encode(signature) });
  const verification = verifyOffer(offer, { ...parsed, now: 0 });
  if (!verification.valid) throw new Error(`Wallet did not sign as the offer owner: ${verification.reason}`);
  return offer;
}

/** Identity intentionally does not depend on mutable offer content. Nonce reuse is rejected. */
export function offerId(offer: SignedOffer | OfferPayload | SignedRevocation): string {
  const p = 'payload' in offer ? offer.payload : offer;
  return `${p.genesisHash}:${p.programId}:${p.owner}:${p.nonce}`;
}

export function verifyOffer(input: unknown, context: OfferContext, revocations: readonly SignedRevocation[] = []): Verification<SignedOffer> {
  const parsed = signedOfferSchema.safeParse(input);
  if (!parsed.success) return { valid: false, code: 'schema', reason: parsed.error.issues[0]?.message ?? 'Invalid offer' };
  const offer = parsed.data, p = offer.payload;
  if (p.genesisHash !== context.genesisHash) return { valid: false, code: 'network', reason: 'Offer belongs to a different genesis hash' };
  if (p.programId !== context.programId) return { valid: false, code: 'program', reason: 'Offer belongs to a different program' };
  if (!nacl.sign.detached.verify(canonicalOfferBytes(p), bs58.decode(offer.signature), bs58.decode(p.owner))) return { valid: false, code: 'signature', reason: 'Invalid owner signature' };
  if (p.expiresAt <= (context.now ?? Math.floor(Date.now() / 1000))) return { valid: false, code: 'expired', reason: 'Offer has expired' };
  for (const revocation of revocations) {
    const checked = verifyRevocation(revocation, context);
    if (checked.valid && offerId(revocation) === offerId(offer)) return { valid: false, code: 'revoked', reason: 'Owner revoked this publication' };
  }
  return { valid: true, value: offer };
}

export async function signRevocation(offer: SignedOffer, signMessage: SignMessage, now = Math.floor(Date.now() / 1000)): Promise<SignedRevocation> {
  const { genesisHash, programId, owner, nonce, expiresAt } = offerPayloadSchema.parse(offer.payload);
  const payload: RevocationPayload = { version: 1, domain: REVOCATION_DOMAIN, genesisHash, programId, owner, nonce, offerExpiresAt: expiresAt, revokedAt: now };
  const signature = await signMessage(canonicalRevocationBytes(payload));
  const revocation = signedRevocationSchema.parse({ payload, signature: bs58.encode(signature) });
  const verification = verifyRevocation(revocation, { genesisHash, programId, now });
  if (!verification.valid) throw new Error(`Wallet did not sign revocation as the offer owner: ${verification.reason}`);
  return revocation;
}

export function verifyRevocation(input: unknown, context: OfferContext): Verification<SignedRevocation> {
  const parsed = signedRevocationSchema.safeParse(input);
  if (!parsed.success) return { valid: false, code: 'schema', reason: parsed.error.issues[0]?.message ?? 'Invalid revocation' };
  const r = parsed.data, p = r.payload;
  if (p.genesisHash !== context.genesisHash) return { valid: false, code: 'network', reason: 'Revocation belongs to a different genesis hash' };
  if (p.programId !== context.programId) return { valid: false, code: 'program', reason: 'Revocation belongs to a different program' };
  if (!nacl.sign.detached.verify(canonicalRevocationBytes(p), bs58.decode(r.signature), bs58.decode(p.owner))) return { valid: false, code: 'signature', reason: 'Invalid revocation owner signature' };
  if (p.revokedAt > (context.now ?? Math.floor(Date.now() / 1000))) return { valid: false, code: 'future', reason: 'Revocation timestamp is in the future' };
  // Revocations never become active offers again, even after their advertised expiry.
  return { valid: true, value: r };
}

const bundleSchema = z.object({
  format: z.literal('swapcircle:offers'), version: z.literal(1), exportedAt: timestampSchema,
  offers: z.array(signedOfferSchema).max(MAX_BUNDLE_OFFERS),
  revocations: z.array(signedRevocationSchema).max(MAX_BUNDLE_OFFERS),
}).strict();
export type OfferBundle = z.infer<typeof bundleSchema>;

export function exportOffers(offers: readonly SignedOffer[], revocations: readonly SignedRevocation[] = [], now = Math.floor(Date.now() / 1000)): string {
  const bundle = bundleSchema.parse({ format: 'swapcircle:offers', version: 1, exportedAt: now, offers, revocations });
  const result = JSON.stringify(bundle, null, 2);
  if (new TextEncoder().encode(result).length > MAX_BUNDLE_BYTES) throw new Error('Offer export exceeds size limit');
  return result;
}

/** Fail closed: a bundle with a bad signature/network/schema is never partially trusted. */
export function importOffers(json: string, context: OfferContext): OfferBundle {
  if (new TextEncoder().encode(json).length > MAX_BUNDLE_BYTES) throw new Error('Offer import exceeds size limit');
  const bundle = bundleSchema.parse(JSON.parse(json));
  const nonces = new Set<string>();
  for (const revocation of bundle.revocations) {
    const result = verifyRevocation(revocation, context);
    if (!result.valid) throw new Error(`Invalid imported revocation: ${result.reason}`);
  }
  for (const offer of bundle.offers) {
    // Expired/revoked signed records are retained for audit; matching filters them.
    const result = verifyOffer(offer, { ...context, now: 0 });
    if (!result.valid) throw new Error(`Invalid imported offer: ${result.reason}`);
    const id = offerId(offer);
    if (nonces.has(id)) throw new Error('Duplicate owner nonce in imported bundle');
    nonces.add(id);
  }
  return bundle;
}

/** URL fragment stays in the browser and does not send signed publications to an unrelated host. */
export function createOfferLink(baseUrl: string, offers: readonly SignedOffer[], revocations: readonly SignedRevocation[] = []): string {
  const bundle = exportOffers(offers, revocations);
  const url = new URL(baseUrl);
  const compact = JSON.stringify(JSON.parse(bundle));
  url.hash = `import=${encodeURIComponent(compact)}`;
  if (url.href.length > 64_000) throw new Error('This bundle is too large for a link; export a JSON file');
  return url.href;
}
export function importOfferLink(link: string, context: OfferContext): OfferBundle {
  if (link.length > 64_000) throw new Error('Offer link exceeds size limit');
  const url = new URL(link);
  const hash = url.hash.slice(1);
  if (!hash.startsWith('import=')) throw new Error('Link does not contain a SwapCircle offer bundle');
  return importOffers(decodeURIComponent(hash.slice(7)), context);
}
