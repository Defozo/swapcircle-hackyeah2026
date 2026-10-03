import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  offers: defineTable({
    offerId: v.string(), owner: v.string(), expiresAt: v.number(), publishedAt: v.number(),
    giveMint: v.string(), wantMint: v.string(),
    signed: v.any(),
  }).index('by_offer_id', ['offerId']).index('by_expiry', ['expiresAt']).index('by_owner_expiry', ['owner', 'expiresAt']),
  revocations: defineTable({
    offerId: v.string(), owner: v.string(), offerExpiresAt: v.number(), receivedAt: v.number(),
    signed: v.any(),
  }).index('by_offer_id', ['offerId']).index('by_expiry', ['offerExpiresAt']),
});
