import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { core, handover, clone } from './helpers.mjs';

const { canonicalEncode, hashCanonical, hashEventHistory, compareProtocolStrings } = core;

describe('canonical encoding', () => {
  test('key order in the input does not change the encoding', () => {
    const a = { alpha: 1, beta: 2, gamma: 3 };
    const b = { gamma: 3, beta: 2, alpha: 1 };
    assert.equal(canonicalEncode(a), canonicalEncode(b));
    assert.equal(hashCanonical(a), hashCanonical(b));
  });

  test('nested key order does not change the encoding', () => {
    const a = { outer: { x: 1, y: [{ p: 1, q: 2 }] } };
    const b = { outer: { y: [{ q: 2, p: 1 }] , x: 1 } };
    assert.equal(canonicalEncode(a), canonicalEncode(b));
  });

  test('array order DOES change the encoding — sequence is meaningful', () => {
    assert.notEqual(canonicalEncode([1, 2]), canonicalEncode([2, 1]));
  });

  test('distinguishable values never collide', () => {
    const values = [0, 1, -1, '0', '1', true, false, 'true', null, [], {}, [[]], [{}], [null], '', [''], { '': '' }];
    const encodings = values.map(canonicalEncode);
    assert.equal(new Set(encodings).size, encodings.length, 'two distinguishable values share an encoding');
  });

  test('negative zero is refused rather than silently encoded as zero', () => {
    assert.equal(canonicalEncode(0), '0');
    assert.throws(() => canonicalEncode(-0), undefined, '-0 must not quietly become 0');
  });

  test('a string and a number that print the same do not encode the same', () => {
    assert.notEqual(hashCanonical(42), hashCanonical('42'));
  });

  test('hashing is stable across repeated calls and across clones', () => {
    const first = hashCanonical(handover.events);
    assert.equal(first, hashCanonical(handover.events));
    assert.equal(first, hashCanonical(clone(handover.events)));
    assert.match(first, /^0x[0-9a-f]{64}$/);
  });

  test('changing one byte deep inside the history changes the history hash', () => {
    const events = clone(handover.events);
    const before = hashEventHistory(events);
    events[3].id = `${events[3].id}x`;
    assert.notEqual(hashEventHistory(events), before);
  });

  test('history hashing is prefix-sensitive, so truncation is detectable', () => {
    const full = hashEventHistory(handover.events);
    const short = hashEventHistory(handover.events.slice(0, -1));
    assert.notEqual(full, short);
  });

  test('protocol string comparison is a total order and is byte-based, not locale-based', () => {
    const input = ['b', 'a', 'B', 'A', 'a1', 'a-', '', 'ab'];
    const sorted = [...input].sort(compareProtocolStrings);
    const again = [...sorted].reverse().sort(compareProtocolStrings);
    assert.deepEqual(again, sorted, 'sorting must be stable regardless of input order');
    for (let index = 1; index < sorted.length; index += 1) {
      assert.ok(compareProtocolStrings(sorted[index - 1], sorted[index]) < 0);
    }
    // Uppercase sorts before lowercase under a byte ordering.
    assert.ok(compareProtocolStrings('B', 'a') < 0);
  });

  test('an unrepresentable value is refused rather than silently coerced', () => {
    for (const value of [() => 1, Symbol('x'), new Date(0), /re/, new Map(), new Set(), NaN, Infinity, undefined]) {
      assert.throws(() => canonicalEncode(value), undefined, `expected refusal for ${String(value)}`);
    }
  });

  test('a literal __proto__ key is encoded as an ordinary distinguishable field, never applied', () => {
    // Encoding must be faithful: a payload that happens to contain the string
    // key "__proto__" is a different value from one that does not, and encoding
    // it must never mutate any prototype.
    const polluted = JSON.parse('{"a":1,"__proto__":{"evil":true}}');
    assert.deepEqual(Reflect.ownKeys(polluted), ['a', '__proto__']);
    assert.notEqual(canonicalEncode(polluted), canonicalEncode({ a: 1 }));
    assert.equal({}.evil, undefined, 'encoding must not pollute Object.prototype');
    assert.equal(Object.prototype.evil, undefined);
  });

  test('an object whose prototype is not Object.prototype is refused outright', () => {
    // Stronger than filtering inherited keys: a non-plain record cannot be
    // encoded at all, so a crafted object cannot reach the protocol surface.
    const parent = { inherited: 'yes' };
    const child = Object.create(parent);
    child.own = 'mine';
    assert.throws(() => canonicalEncode(child), undefined, 'a non-plain record must be refused');
    assert.throws(() => canonicalEncode(Object.assign(Object.create(Array.prototype), { own: 1 })));
    // A null-prototype record is a plain record and is accepted.
    const bare = Object.create(null); bare.own = 'mine';
    assert.equal(canonicalEncode(bare), canonicalEncode({ own: 'mine' }));
  });

  test('RAW HELPER BOUNDARY: canonicalEncode reads accessors, so it can run caller code', () => {
    // Core tracks accessor reads and refuses proxies and accessors where
    // untrusted adapter evidence enters (canonical.ts captureNode, dataOnly
    // role). That guard is deliberate and correct. It is simply not applied on
    // the plain canonicalEncode path, which is a public export — so a getter
    // that returns a different value on each read defeats determinism there.
    let reads = 0;
    const live = { plain: 1 };
    Object.defineProperty(live, 'counter', { get: () => (reads += 1), enumerable: true, configurable: true });
    const first = canonicalEncode(live);
    const second = canonicalEncode(live);
    assert.notEqual(first, second, 'if this now passes identically, Core applies the accessor guard here and this test should invert');
    assert.ok(reads >= 2, 'the getter was invoked during canonicalization');
  });

  test('RAW HELPER BOUNDARY: a Proxy reaching canonicalEncode can break determinism', () => {
    // Documented, deliberately asserted current behaviour — see docs/REFERENCE-CONTRACT.md.
    //
    // canonicalEncode reads own keys and descriptors through Reflect, which a
    // Proxy may answer differently on each call. Events never arrive as proxies
    // (they are decoded from JSON), so the tutorial and the reference
    // application are unaffected. But canonicalEncode is a public export, so an
    // integration that hands it a reactive/ORM-hydrated/instrumented object can
    // obtain two different encodings of the "same" value — and determinism is
    // the property the whole protocol rests on.
    //
    // This raw helper is not the portable API capture boundary. Keep executable
    // objects outside data-only transports; these checks do not establish isolation.
    let calls = 0;
    const unstable = new Proxy({ a: 1 }, {
      ownKeys: () => (calls++ % 2 === 0 ? ['a', 'b'] : ['a']),
      getOwnPropertyDescriptor: () => ({ value: calls, enumerable: true, configurable: true, writable: true }),
    });
    const first = canonicalEncode(unstable);
    const second = canonicalEncode(unstable);
    assert.notEqual(first, second, 'if this now passes identically, Core has been hardened and this test should become an assertion of refusal');
  });
});

describe('immutability helpers', () => {
  test('immutableProtocolValue deep-freezes', () => {
    const value = core.immutableProtocolValue({ a: { b: [1, 2] } });
    assert.throws(() => { value.a = 1; }, TypeError);
    assert.throws(() => { value.a.b.push(3); }, TypeError);
  });
});

