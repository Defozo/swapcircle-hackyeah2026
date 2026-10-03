import { findCycles, type SignedOffer } from '@swapcircle/matching';
import type { Leg, Manifest } from '@swapcircle/sdk';
import fixture from './demo-fixtures.json';

export type DemoSize = 2 | 3 | 4;
export type DemoStage = 'offers' | 'matches' | 'funding' | 'settled' | 'expired' | 'refunded';
export type DemoEvent = { kind: 'created' | 'funded' | 'settled' | 'expired' | 'refunded'; participant?: number };
export type DemoState = { version: 1; size: DemoSize; stage: DemoStage; excluded: number[]; funded: number[]; refunded: number[]; events: DemoEvent[] };
export type DemoAction = { type: 'reset'; size?: DemoSize } | { type: 'toggle'; participant: number } | { type: 'search' } | { type: 'back' } | { type: 'create' } | { type: 'fund'; participant: number } | { type: 'expire' } | { type: 'refund'; participant: number };

export const demoManifest = { version: 1, cluster: 'localnet', rpcUrl: '', ...fixture.context, idlVersion: '0.1.0', mints: fixture.mints, participants: fixture.participants, deployed: false } satisfies Manifest;
export const demoPeople = fixture.participants;
export const demoMints = fixture.mints;
export const demoOffers = (size: DemoSize) => fixture.scenarios[String(size) as '2' | '3' | '4'] as SignedOffer[];
export const demoMatches = (state: DemoState) => findCycles(demoOffers(state.size).filter((_, i) => !state.excluded.includes(i)), fixture.context);
export function demoLegs(state: DemoState): Leg[] {
  const match = demoMatches(state).cycles[0];
  if (!match) return [];
  // Rotate the returned cycle for a stable explanation starting with Alicja.
  const start = match.offers.findIndex(o => o.payload.owner === demoPeople[0].owner);
  const ordered = [...match.offers.slice(start), ...match.offers.slice(0, start)];
  return ordered.map(o => ({ owner: o.payload.owner, mint: o.payload.giveMint, amount: o.payload.giveAmount, decimals: 0 }));
}
export function newDemo(size: DemoSize = 3): DemoState {
  return { version: 1, size, stage: 'offers', excluded: [], funded: [], refunded: [], events: [] };
}
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  const validPerson = (person: number) => Number.isInteger(person) && person >= 0 && person < state.size;
  switch (action.type) {
    case 'reset': return newDemo(action.size ?? state.size);
    case 'toggle': return state.stage === 'offers' && validPerson(action.participant) ? { ...state, excluded: state.excluded.includes(action.participant) ? state.excluded.filter(i => i !== action.participant) : [...state.excluded, action.participant] } : state;
    case 'search': return state.stage === 'offers' ? { ...state, stage: 'matches' } : state;
    case 'back': return state.stage === 'matches' ? { ...state, stage: 'offers' } : state;
    case 'create': return state.stage === 'matches' && demoMatches(state).cycles.length > 0 ? { ...state, stage: 'funding', events: [{ kind: 'created' }] } : state;
    case 'fund': {
      if (state.stage !== 'funding' || !validPerson(action.participant) || state.funded.includes(action.participant)) return state;
      const funded = [...state.funded, action.participant];
      const settled = funded.length === state.size;
      const events: DemoEvent[] = [...state.events, { kind: 'funded', participant: action.participant }, ...(settled ? [{ kind: 'settled' } as const] : [])];
      return { ...state, funded, stage: settled ? 'settled' : 'funding', events };
    }
    case 'expire': return state.stage === 'funding' ? { ...state, stage: state.funded.length ? 'expired' : 'refunded', events: [...state.events, { kind: 'expired' }] } : state;
    case 'refund': {
      if (state.stage !== 'expired' || !state.funded.includes(action.participant) || state.refunded.includes(action.participant)) return state;
      const refunded = [...state.refunded, action.participant];
      return { ...state, refunded, stage: refunded.length === state.funded.length ? 'refunded' : 'expired', events: [...state.events, { kind: 'refunded', participant: action.participant }] };
    }
  }
}

export const DEMO_STORAGE = 'swapcircle:interactive-demo:v1';
export function restoreDemo(raw: string | null): DemoState {
  // Persist public interactions only. Replaying known actions validates order,
  // duplicate deposits/refunds, participant indices and terminal states.
  try {
    const saved = JSON.parse(raw || 'null');
    if (!saved || saved.version !== 1 || ![2, 3, 4].includes(saved.size) || !Array.isArray(saved.events) || saved.events.length > 12) return newDemo();
    let state = newDemo(saved.size);
    if (Array.isArray(saved.excluded)) for (const participant of saved.excluded) state = demoReducer(state, { type: 'toggle', participant });
    if (saved.stage === 'offers') return state;
    state = demoReducer(state, { type: 'search' });
    for (const event of saved.events) {
      if (event.kind === 'created') state = demoReducer(state, { type: 'create' });
      if (event.kind === 'funded') state = demoReducer(state, { type: 'fund', participant: event.participant });
      if (event.kind === 'expired') state = demoReducer(state, { type: 'expire' });
      if (event.kind === 'refunded') state = demoReducer(state, { type: 'refund', participant: event.participant });
    }
    return state;
  } catch { return newDemo(); }
}
