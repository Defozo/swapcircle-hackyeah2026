import { mutationGeneric as mutation, queryGeneric as query, paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { offerId, verifyOffer, verifyRevocation } from '../packages/matching/src/offers';

function context() {
  const genesisHash = process.env.SWAPCIRCLE_GENESIS_HASH;
  const programId = process.env.SWAPCIRCLE_PROGRAM_ID;
  if (!genesisHash || !programId) throw new Error('Offer board network configuration is missing');
  return { genesisHash, programId, now: Math.floor(Date.now() / 1000) };
}

export const configuration = query({ args: {}, handler: () => {
  const { genesisHash, programId, now } = context();
  return { genesisHash, programId, serverTime: now, version: 1 };
} });

export const publish = mutation({ args: { offer: v.any() }, handler: async (ctx, { offer }) => {
  const c = context();
  const check = verifyOffer(offer, c);
  if (!check.valid) throw new Error(`Offer rejected: ${check.reason}`);
  const signed = check.value;
  const id = offerId(signed);
  if (signed.payload.expiresAt > c.now + 365 * 24 * 60 * 60) throw new Error('Offer validity may not exceed one year');
  if (await ctx.db.query('revocations').withIndex('by_offer_id', q => q.eq('offerId', id)).first()) throw new Error('This owner nonce has been revoked');
  if (await ctx.db.query('offers').withIndex('by_offer_id', q => q.eq('offerId', id)).first()) throw new Error('Duplicate owner nonce; this publication already exists');
  const active = await ctx.db.query('offers').withIndex('by_owner_expiry', q => q.eq('owner', signed.payload.owner).gt('expiresAt', c.now)).take(101);
  if (active.length >= 100) throw new Error('An owner may have at most 100 unexpired publications');
  await ctx.db.insert('offers', {
    offerId: id, owner: signed.payload.owner, expiresAt: signed.payload.expiresAt, publishedAt: c.now,
    giveMint: signed.payload.giveMint, wantMint: signed.payload.wantMint, signed,
  });
  return { offerId: id, publishedAt: c.now };
} });

export const revoke = mutation({ args: { revocation: v.any() }, handler: async (ctx, { revocation }) => {
  const c = context();
  const check = verifyRevocation(revocation, c);
  if (!check.valid) throw new Error(`Revocation rejected: ${check.reason}`);
  const signed = check.value;
  const id = offerId(signed);
  if (await ctx.db.query('revocations').withIndex('by_offer_id', q => q.eq('offerId', id)).first()) throw new Error('This owner nonce has already been revoked');
  const original = await ctx.db.query('offers').withIndex('by_offer_id', q => q.eq('offerId', id)).first();
  if (original && original.expiresAt !== signed.payload.offerExpiresAt) throw new Error('Revocation must reference the original offer expiry');
  await ctx.db.insert('revocations', { offerId: id, owner: signed.payload.owner, offerExpiresAt: signed.payload.offerExpiresAt, receivedAt: c.now, signed });
  // The signed tombstone is retained indefinitely, so stale imports cannot republish the nonce.
  return { offerId: id, revokedAt: c.now };
} });

export const list = query({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const c = context();
  if (args.paginationOpts.numItems > 200) throw new Error('Maximum page size is 200');
  const page = await ctx.db.query('offers').withIndex('by_expiry', q => q.gt('expiresAt', c.now)).paginate(args.paginationOpts);
  return { ...page, page: page.page.map(row => row.signed), serverTime: c.now };
} });

export const listRevocations = query({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const c = context();
  if (args.paginationOpts.numItems > 200) throw new Error('Maximum page size is 200');
  const page = await ctx.db.query('revocations').withIndex('by_expiry', q => q.gt('offerExpiresAt', c.now)).paginate(args.paginationOpts);
  return { ...page, page: page.page.map(row => row.signed), serverTime: c.now };
} });

/** Look up tombstones for disconnected imported copies, including prepublication revocations. */
export const revocationsFor = query({ args: { offerIds: v.array(v.string()) }, handler: async (ctx, { offerIds }) => {
  context();
  if (offerIds.length > 200 || offerIds.some(id => id.length > 250)) throw new Error('Revocation lookup exceeds limit');
  const rows = await Promise.all(offerIds.map(id => ctx.db.query('revocations').withIndex('by_offer_id', q => q.eq('offerId', id)).first()));
  return rows.filter(row => row !== null).map(row => row!.signed);
} });
