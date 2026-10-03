import { describe, expect, it } from 'vitest';
import { demoMatches, demoReducer, newDemo, restoreDemo, type DemoSize, type DemoState } from '../../apps/web/src/demo-state';

const create = (size: DemoSize = 3) => demoReducer(demoReducer(newDemo(size), { type: 'search' }), { type: 'create' });
describe('isolated product demo', () => {
  it('uses verified matching for 2, 3 and 4 offers and finds no false result after removing a member', () => {
    for (const size of [2, 3, 4] as const) {
      const state = newDemo(size), result = demoMatches(state);
      expect(result.rejected).toEqual([]);
      expect(result.cycles).toHaveLength(1);
      expect(result.cycles[0].offers).toHaveLength(size);
      expect(result.scope.pairCycles).toBe(size === 2 ? 1 : 0);
      expect(demoMatches(demoReducer(state, { type: 'toggle', participant: 0 })).cycles).toHaveLength(0);
    }
  });
  it('settles exactly at the last deposit in every participant order without duplicate operations', () => {
    const permutations = (input: number[]): number[][] => input.length ? input.flatMap((value, index) => permutations(input.filter((_, i) => i !== index)).map(rest => [value, ...rest])) : [[]];
    for (const size of [2, 3, 4] as const) for (const order of permutations(Array.from({ length: size }, (_, i) => i))) {
      let state = create(size);
      order.forEach((participant, position) => {
        state = demoReducer(state, { type: 'fund', participant });
        expect(state.stage).toBe(position === size - 1 ? 'settled' : 'funding');
        expect(demoReducer(state, { type: 'fund', participant })).toBe(state);
      });
      expect(demoReducer(state, { type: 'expire' })).toBe(state);
      expect(demoReducer(state, { type: 'refund', participant: 0 })).toBe(state);
      expect(restoreDemo(JSON.stringify(state))).toEqual(state);
    }
  });
  it('closes deposits at the deadline and refunds only actual deposits independently', () => {
    let state = create();
    state = demoReducer(state, { type: 'fund', participant: 0 });
    state = demoReducer(state, { type: 'fund', participant: 1 });
    expect(demoReducer(state, { type: 'refund', participant: 0 })).toBe(state);
    state = demoReducer(state, { type: 'expire' });
    expect(demoReducer(state, { type: 'fund', participant: 2 })).toBe(state);
    expect(demoReducer(state, { type: 'refund', participant: 2 })).toBe(state);
    state = demoReducer(state, { type: 'refund', participant: 1 });
    expect(state.stage).toBe('expired');
    expect(state.refunded).toEqual([1]);
    expect(restoreDemo(JSON.stringify(state))).toEqual(state);
    state = demoReducer(state, { type: 'refund', participant: 0 });
    expect(state.stage).toBe('refunded');
    expect(restoreDemo(JSON.stringify(state))).toEqual(state);
    expect(demoReducer(state, { type: 'refund', participant: 0 })).toBe(state);
  });
  it('rejects corrupt state and replays saved events instead of trusting forged terminal flags', () => {
    expect(restoreDemo('invalid')).toEqual(newDemo());
    expect(restoreDemo(JSON.stringify({ ...newDemo(), size: 9 }))).toEqual(newDemo());
    const fake: DemoState = { ...create(), stage: 'settled', funded: [0, 1, 2] };
    expect(restoreDemo(JSON.stringify(fake)).stage).toBe('funding');
    expect(demoReducer(create(), { type: 'fund', participant: -1 }).funded).toEqual([]);
  });
});
