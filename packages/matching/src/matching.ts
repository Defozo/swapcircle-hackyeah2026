import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { canonicalOfferBytes, offerId, verifyOffer, verifyRevocation, type OfferContext, type SignedOffer, type SignedRevocation } from './offers';

export interface MatchOptions extends OfferContext {
  revocations?: readonly SignedRevocation[];
  maxOffers?: number;
  maxResults?: number;
  maxSearchSteps?: number;
  minimumRemainingSeconds?: number;
  preferredDurationSeconds?: number;
}
export interface MatchedCycle {
  id: string;
  /** Token flow: offers[i].give goes to offers[(i+1) % length].owner. */
  offers: SignedOffer[];
  deadline: number;
  maxDeadline: number;
}
export interface MatchScope {
  inputOffers: number; validatedOffers: number; searchedOffers: number;
  excludedOffers: number; duplicateOffers: number; invalidRevocations: number;
  offerLimit: number; resultLimit: number; searchStepLimit: number; searchSteps: number;
  searchComplete: boolean; resultsTruncated: boolean; cyclesFound: number;
  pairCycles: number; multiPartyCycles: number; uniqueMatchedOffers: number;
  checkedAt: number; balancesVerified: false; revocationFreshness: 'snapshot-only';
}
export interface MatchResult { cycles: MatchedCycle[]; scope: MatchScope; rejected: { index: number; reason: string }[] }

export function givesWhatIsWantedBy(from: SignedOffer, to: SignedOffer): boolean {
  return from.payload.giveMint === to.payload.wantMint && from.payload.giveAmount === to.payload.wantAmount;
}

export function validateCycleOffers(offers: readonly SignedOffer[], context: OfferContext, deadline?: number, revocations: readonly SignedRevocation[] = []): void {
  if (offers.length < 2 || offers.length > 4) throw new Error('A cycle requires 2 to 4 offers');
  const owners = new Set<string>();
  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i]!;
    const checked = verifyOffer(offer, context, revocations);
    if (!checked.valid) throw new Error(checked.reason);
    if (owners.has(offer.payload.owner)) throw new Error('Every cycle participant must have a different owner');
    owners.add(offer.payload.owner);
    if (!givesWhatIsWantedBy(offer, offers[(i + 1) % offers.length]!)) throw new Error('Cycle order does not satisfy exact mint and amount requirements');
    if (deadline !== undefined && deadline > offer.payload.expiresAt) throw new Error('Cycle deadline exceeds an offer expiry');
  }
  if (deadline !== undefined && (!Number.isSafeInteger(deadline) || deadline <= (context.now ?? Math.floor(Date.now() / 1000)))) throw new Error('Cycle deadline must be a future integer timestamp');
}

function bound(value: number | undefined, fallback: number, name: string, allowZero = false): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < (allowZero ? 0 : 1)) throw new Error(`${name} must be a ${allowZero ? 'nonnegative' : 'positive'} integer`);
  return result;
}

/** Exact bounded DFS. Rotations are removed; valid opposite directions remain distinct. */
export function findCycles(input: readonly unknown[], options: MatchOptions): MatchResult {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const maxOffers = bound(options.maxOffers, 1_000, 'maxOffers');
  const maxResults = bound(options.maxResults, 100, 'maxResults', true);
  const maxSearchSteps = bound(options.maxSearchSteps, 1_000_000, 'maxSearchSteps');
  const minimumRemaining = bound(options.minimumRemainingSeconds, 30, 'minimumRemainingSeconds', true);
  const preferredDuration = bound(options.preferredDurationSeconds, 900, 'preferredDurationSeconds');
  const context = { ...options, now };
  const rejected: MatchResult['rejected'] = [];
  const revokedIds = new Set<string>();
  let invalidRevocations = 0;
  for (const revocation of options.revocations ?? []) {
    if (verifyRevocation(revocation, context).valid) revokedIds.add(offerId(revocation));
    else invalidRevocations++;
  }
  const unique = new Map<string, { offer: SignedOffer; index: number; canonical: string }>();
  const collisions = new Set<string>();
  let duplicateOffers = 0;
  input.forEach((candidate, index) => {
    const checked = verifyOffer(candidate, context);
    if (!checked.valid) { rejected.push({ index, reason: checked.reason }); return; }
    const offer = checked.value, id = offerId(offer);
    if (revokedIds.has(id)) { rejected.push({ index, reason: 'Owner revoked this publication' }); return; }
    if (offer.payload.expiresAt <= now + minimumRemaining) { rejected.push({ index, reason: 'Insufficient time remaining for signatures' }); return; }
    const canonical = new TextDecoder().decode(canonicalOfferBytes(offer.payload));
    const previous = unique.get(id);
    if (previous) {
      duplicateOffers++;
      if (canonical !== previous.canonical) collisions.add(id);
      return;
    }
    unique.set(id, { offer, index, canonical });
  });
  for (const id of collisions) {
    rejected.push({ index: unique.get(id)!.index, reason: 'Conflicting publications reuse an owner nonce' });
    unique.delete(id);
  }
  const validatedOffers = unique.size;
  const offers = [...unique.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, maxOffers).map(([, v]) => v.offer);
  const wanted = new Map<string, number[]>();
  const assetKey = (mint: string, amount: string) => `${mint}:${amount}`;
  offers.forEach((offer, index) => {
    const key = assetKey(offer.payload.wantMint, offer.payload.wantAmount);
    const bucket = wanted.get(key) ?? [];
    bucket.push(index); wanted.set(key, bucket);
  });
  const edges = offers.map(offer => (wanted.get(assetKey(offer.payload.giveMint, offer.payload.giveAmount)) ?? []).filter(i => offers[i]!.payload.owner !== offer.payload.owner));
  const cycles: MatchedCycle[] = [];
  const matchedIds = new Set<string>();
  let searchSteps = 0, cyclesFound = 0, pairCycles = 0, multiPartyCycles = 0, halted = false;
  const record = (path: number[]) => {
    const members = path.map(i => offers[i]!);
    cyclesFound++;
    if (path.length === 2) pairCycles++; else multiPartyCycles++;
    for (const offer of members) matchedIds.add(offerId(offer));
    if (cycles.length >= maxResults) return;
    const maxDeadline = Math.min(...members.map(o => o.payload.expiresAt));
    const id = bs58.encode(nacl.hash(new TextEncoder().encode(members.map(offerId).join('|'))).slice(0, 32));
    cycles.push({ id, offers: members, maxDeadline, deadline: Math.min(maxDeadline - minimumRemaining, now + preferredDuration) });
  };
  const walk = (start: number, path: number[], owners: Set<string>) => {
    if (halted) return;
    for (const next of edges[path[path.length - 1]!]!) {
      if (searchSteps >= maxSearchSteps) { halted = true; return; }
      searchSteps++;
      if (next === start) { if (path.length >= 2) record(path); continue; }
      // The start must be the smallest offer ID in the cycle. This removes only rotations.
      if (next < start || path.length === 4 || path.includes(next) || owners.has(offers[next]!.payload.owner)) continue;
      owners.add(offers[next]!.payload.owner);
      walk(start, [...path, next], owners);
      owners.delete(offers[next]!.payload.owner);
      if (halted) return;
    }
  };
  for (let start = 0; start < offers.length && !halted; start++) walk(start, [start], new Set([offers[start]!.payload.owner]));
  return { cycles, rejected, scope: {
    inputOffers: input.length, validatedOffers, searchedOffers: offers.length,
    excludedOffers: input.length - offers.length - duplicateOffers,
    duplicateOffers, invalidRevocations, offerLimit: maxOffers, resultLimit: maxResults,
    searchStepLimit: maxSearchSteps, searchSteps,
    searchComplete: !halted && validatedOffers <= maxOffers, resultsTruncated: cyclesFound > cycles.length,
    cyclesFound, pairCycles, multiPartyCycles, uniqueMatchedOffers: matchedIds.size,
    checkedAt: now, balancesVerified: false, revocationFreshness: 'snapshot-only',
  } };
}
