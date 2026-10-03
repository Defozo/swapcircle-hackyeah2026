import { describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { createOffer, findCycles, offerId, signOffer, signRevocation, validateCycleOffers, type SignedOffer } from '../../packages/matching/src';

const pairs = Array.from({ length: 32 }, (_, i) => nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(i + 1)));
const key = (index: number) => bs58.encode(pairs[index]!.publicKey);
const now = 1_800_000_000;
const context = { genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', programId: key(31), now };
let nonce = 0;
async function offer(owner: number, give: number, giveAmount: string, want: number, wantAmount: string, expiresAt = now + 3600): Promise<SignedOffer> {
  return signOffer(createOffer({ genesisHash: context.genesisHash, programId: context.programId, owner: key(owner), nonce: (++nonce).toString(16).padStart(32, '0'), giveMint: key(20 + give), giveAmount, wantMint: key(20 + want), wantAmount, expiresAt }), async bytes => nacl.sign.detached(bytes, pairs[owner]!.secretKey));
}
function rotationsOnlyKey(path: SignedOffer[]): string {
  const ids = path.map(offerId);
  return ids.map((_, start) => [...ids.slice(start), ...ids.slice(0, start)].join('|')).sort()[0]!;
}
/** Deliberately independent brute-force permutations, no shared adjacency/index/DFS code. */
function enumerate(offers: SignedOffer[]): string[] {
  const found = new Set<string>();
  function permutations(prefix: SignedOffer[], rest: SignedOffer[], size: number) {
    if (prefix.length === size) {
      if (new Set(prefix.map(o => o.payload.owner)).size !== size) return;
      for (let i = 0; i < size; i++) {
        const a = prefix[i]!.payload, b = prefix[(i + 1) % size]!.payload;
        if (a.giveMint !== b.wantMint || a.giveAmount !== b.wantAmount) return;
      }
      found.add(rotationsOnlyKey(prefix));
      return;
    }
    rest.forEach((next, i) => permutations([...prefix, next], rest.filter((_, j) => i !== j), size));
  }
  for (let size = 2; size <= 4; size++) permutations([], offers, size);
  return [...found].sort();
}

describe('exact directed offer cycles', () => {
  it('finds the named 3-person example with no bilateral match and correct token flow', async () => {
    const alice = await offer(0, 0, '100', 1, '40');
    const bob = await offer(1, 1, '40', 2, '250');
    const celine = await offer(2, 2, '250', 0, '100');
    const result = findCycles([alice, bob, celine], context);
    expect(result.scope.pairCycles).toBe(0);
    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]!.offers.map(o => o.payload.owner)).toEqual(expect.arrayContaining([key(0), key(1), key(2)]));
    const path = result.cycles[0]!.offers;
    const i = path.findIndex(o => o.payload.owner === key(0));
    expect(path[(i + 1) % 3]!.payload.owner).toBe(key(2));
    validateCycleOffers(path, context, result.cycles[0]!.deadline);
    expect(result.scope).toMatchObject({ searchComplete: true, balancesVerified: false, uniqueMatchedOffers: 3 });
  });

  it('finds 2 and 4 owners, rejects mismatched amount and excludes the same owner twice', async () => {
    const a = await offer(0, 0, '1', 1, '2');
    const b = await offer(1, 1, '2', 0, '1');
    expect(findCycles([a, b], context).cycles).toHaveLength(1);
    expect(findCycles([a, await offer(1, 1, '3', 0, '1')], context).cycles).toHaveLength(0);
    expect(findCycles([a, await offer(0, 1, '2', 0, '1')], context).cycles).toHaveLength(0);
    const four = [await offer(0, 0, '10', 1, '20'), await offer(1, 1, '20', 2, '30'), await offer(2, 2, '30', 3, '40'), await offer(3, 3, '40', 0, '10')];
    expect(findCycles(four, context).cycles.map(c => c.offers.length)).toEqual([4]);
  });

  it('deduplicates rotations without discarding valid reversed cycles', async () => {
    const offers = await Promise.all([0, 1, 2].map(i => offer(i, 0, '1', 0, '1')));
    const result = findCycles(offers, context);
    expect(result.scope.pairCycles).toBe(3);
    expect(result.scope.multiPartyCycles).toBe(2);
    expect(new Set(result.cycles.map(c => c.id)).size).toBe(5);
    expect(result.cycles.map(c => rotationsOnlyKey(c.offers)).sort()).toEqual(enumerate(offers));
    expect(findCycles([...offers].reverse(), context).cycles.map(c => c.id)).toEqual(result.cycles.map(c => c.id));
  });

  it('filters signatures, network, expiry, short signing windows and signed revocations', async () => {
    const a = await offer(0, 0, '1', 1, '2');
    const b = await offer(1, 1, '2', 0, '1');
    const r = await signRevocation(a, async bytes => nacl.sign.detached(bytes, pairs[0]!.secretKey), now);
    expect(findCycles([a, b], { ...context, revocations: [r] }).cycles).toHaveLength(0);
    expect(findCycles([a, await offer(1, 1, '2', 0, '1', now)], context).cycles).toHaveLength(0);
    expect(findCycles([a, await offer(1, 1, '2', 0, '1', now + 30)], context).cycles).toHaveLength(0);
    expect(findCycles([a, b], { ...context, programId: key(30) }).scope.searchedOffers).toBe(0);
    const bad = { ...b, payload: { ...b.payload, giveAmount: '123' } };
    expect(findCycles([a, bad], context).rejected[0]!.reason).toContain('signature');
  });

  it('rejects nonce conflicts and deduplicates exact imported copies', async () => {
    const a = await offer(0, 0, '1', 1, '2');
    const b = await offer(1, 1, '2', 0, '1');
    expect(findCycles([a, a, b], context).cycles).toHaveLength(1);
    const conflict = await signOffer({ ...a.payload, giveAmount: '4' }, async bytes => nacl.sign.detached(bytes, pairs[0]!.secretKey));
    const result = findCycles([a, conflict, b], context);
    expect(result.cycles).toHaveLength(0);
    expect(result.rejected[0]!.reason).toContain('nonce');
  });

  it('reports data, presentation and traversal limits independently', async () => {
    const offers = await Promise.all([0, 1, 2, 3].map(i => offer(i, 0, '1', 0, '1')));
    const capped = findCycles(offers, { ...context, maxResults: 1 });
    expect(capped.cycles).toHaveLength(1);
    expect(capped.scope).toMatchObject({ searchComplete: true, resultsTruncated: true, cyclesFound: 20 });
    expect(findCycles(offers, { ...context, maxOffers: 2 }).scope).toMatchObject({ searchedOffers: 2, searchComplete: false });
    expect(findCycles(offers, { ...context, maxSearchSteps: 1 }).scope).toMatchObject({ searchSteps: 1, searchComplete: false });
    expect(findCycles(offers, { ...context, maxResults: 0 }).scope.cyclesFound).toBe(20);
  });

  it('matches independent enumeration for randomized small graphs and repeated owners', async () => {
    let state = 0xdecafbad;
    const random = (n: number) => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state % n; };
    for (let trial = 0; trial < 60; trial++) {
      const offers: SignedOffer[] = [];
      for (let i = 0; i < 4 + random(4); i++) offers.push(await offer(random(5), random(3), String(1 + random(2)), random(3), String(1 + random(2))));
      const result = findCycles(offers, { ...context, maxResults: 1_000 });
      expect(result.scope.searchComplete).toBe(true);
      expect(result.cycles.map(c => rotationsOnlyKey(c.offers)).sort(), `trial ${trial}`).toEqual(enumerate(offers));
      for (const cycle of result.cycles) validateCycleOffers(cycle.offers, context, cycle.deadline);
    }
  }, 30_000);
});
