import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { offerId, verifyOffer, verifyRevocation, type OfferContext, type SignedOffer, type SignedRevocation } from './offers';

export interface BoardSnapshot {
  offers: SignedOffer[];
  revocations: SignedRevocation[];
  fetchedAt: number;
  complete: boolean;
  rejectedRecords: number;
  source: 'convex';
}
interface Page { page: unknown[]; isDone: boolean; continueCursor: string; serverTime: number }
const api = {
  configuration: makeFunctionReference<'query'>('offers:configuration'),
  list: makeFunctionReference<'query'>('offers:list'),
  revocations: makeFunctionReference<'query'>('offers:listRevocations'),
  revocationsFor: makeFunctionReference<'query'>('offers:revocationsFor'),
  publish: makeFunctionReference<'mutation'>('offers:publish'),
  revoke: makeFunctionReference<'mutation'>('offers:revoke'),
};

/** Replaceable discovery service. Never reads or writes financial cycle state. */
export class ConvexBoard {
  private readonly client: ConvexHttpClient;
  constructor(public readonly url: string, private readonly context: OfferContext) {
    this.client = new ConvexHttpClient(url);
  }
  async configuration(): Promise<{ genesisHash: string; programId: string; serverTime: number; version: number }> {
    const c = await this.client.query(api.configuration, {});
    if (c.genesisHash !== this.context.genesisHash || c.programId !== this.context.programId) throw new Error('Offer board serves a different network or program');
    return c;
  }
  async list(maxRecords = 2_000): Promise<BoardSnapshot> {
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new Error('maxRecords must be positive');
    await this.configuration();
    const now = Math.floor(Date.now() / 1000);
    const c = { ...this.context, now };
    const offers: SignedOffer[] = [], revocations: SignedRevocation[] = [];
    let complete = true, rejectedRecords = 0;
    for (const kind of ['offers', 'revocations'] as const) {
      let cursor: string | null = null, count = 0;
      while (count < maxRecords) {
        const page: Page = await this.client.query(kind === 'offers' ? api.list : api.revocations, { paginationOpts: { numItems: Math.min(200, maxRecords - count), cursor } });
        for (const input of page.page) {
          if (kind === 'offers') {
            const result = verifyOffer(input, c);
            if (result.valid) offers.push(result.value); else rejectedRecords++;
          } else {
            const result = verifyRevocation(input, c);
            if (result.valid) revocations.push(result.value); else rejectedRecords++;
          }
        }
        count += page.page.length;
        if (page.isDone) break;
        if (page.page.length === 0 || page.continueCursor === cursor) { complete = false; break; }
        cursor = page.continueCursor;
        if (count >= maxRecords) complete = false;
      }
    }
    return { offers, revocations, fetchedAt: now, complete, rejectedRecords, source: 'convex' };
  }
  async publish(offer: SignedOffer): Promise<{ offerId: string; publishedAt: number }> {
    const checked = verifyOffer(offer, { ...this.context, now: Math.floor(Date.now() / 1000) });
    if (!checked.valid) throw new Error(checked.reason);
    await this.configuration();
    return this.client.mutation(api.publish, { offer });
  }
  async revoke(revocation: SignedRevocation): Promise<{ offerId: string; revokedAt: number }> {
    const checked = verifyRevocation(revocation, { ...this.context, now: Math.floor(Date.now() / 1000) });
    if (!checked.valid) throw new Error(checked.reason);
    await this.configuration();
    return this.client.mutation(api.revoke, { revocation });
  }
  async checkRevocations(offers: readonly SignedOffer[]): Promise<SignedRevocation[]> {
    await this.configuration();
    const result: SignedRevocation[] = [];
    const c = { ...this.context, now: Math.floor(Date.now() / 1000) };
    for (let offset = 0; offset < offers.length; offset += 200) {
      const input: unknown[] = await this.client.query(api.revocationsFor, { offerIds: offers.slice(offset, offset + 200).map(offerId) });
      for (const r of input) { const check = verifyRevocation(r, c); if (check.valid) result.push(check.value); }
    }
    return result;
  }
}
