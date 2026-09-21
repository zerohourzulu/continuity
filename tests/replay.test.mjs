import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { core, handover, replay, clone } from './helpers.mjs';

describe('replay', () => {
  test('accepts the recorded handover history', () => {
    const result = replay(handover.events);
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(result.eventCount, handover.events.length);
    assert.equal(result.head.position, handover.events.length - 1);
    assert.match(result.head.hash, /^0x[0-9a-f]{64}$/);
  });

  test('is deterministic — the same events always fold to the same head', () => {
    const first = replay(handover.events).head;
    const second = replay(clone(handover.events)).head;
    assert.deepEqual(first, second);
  });

  test('rejects a history with an event removed from the middle', () => {
    const events = clone(handover.events);
    events.splice(5, 1);
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('rejects a history with two events transposed', () => {
    const events = clone(handover.events);
    [events[8], events[9]] = [events[9], events[8]];
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('rejects a duplicated event', () => {
    const events = clone(handover.events);
    events.splice(7, 0, clone(events[7]));
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('rejects an event whose declared type does not match its data', () => {
    const events = clone(handover.events);
    events[3].type = 'AGENT_TERMINATED';
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('rejects a non-monotonic timestamp', () => {
    const events = clone(handover.events);
    events[10].timestamp = 0;
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('rejects an empty history', () => {
    assert.notEqual(replay([]).status, 'ACCEPTED');
  });

  test('rejects a history that does not begin with a deployment genesis', () => {
    const events = clone(handover.events).slice(1);
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('rejects an unsupported operation version', () => {
    const result = core.replayPortable({ operationVersion: 'continuity-replay/9.9', events: handover.events });
    assert.notEqual(result.status, 'ACCEPTED');
  });

  test('truncating the history yields a different, still-accepted head', () => {
    const events = clone(handover.events).slice(0, 12);
    const truncated = replay(events);
    assert.equal(truncated.status, 'ACCEPTED');
    assert.notEqual(truncated.head.hash, replay(handover.events).head.hash);
  });

  test('every prefix of a valid history is itself a valid history', () => {
    for (let length = 1; length <= handover.events.length; length += 1) {
      const prefix = handover.events.slice(0, length);
      assert.equal(replay(prefix).status, 'ACCEPTED', `prefix of length ${length} should replay`);
    }
  });

  test('head hash advances strictly with each appended event', () => {
    const seen = new Set();
    for (let length = 1; length <= handover.events.length; length += 1) {
      const { head } = replay(handover.events.slice(0, length));
      assert.equal(seen.has(head.hash), false, 'head hash must not repeat as the history grows');
      seen.add(head.hash);
      assert.equal(head.position, length - 1);
    }
  });
});
