import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrictJson } from '../src/strict-json.mjs';

test('valid JSON preserves own keys, values and deeply nested grammar', () => {
  const input = '{"__proto__":{"x":1},"a":[null,true,false,-0,1.2e+3,"escaped\\u0061"],"nested":{"a":2}}';
  assert.deepEqual(parseStrictJson(Buffer.from(input)), JSON.parse(input));
  const deep = '['.repeat(3000) + '1' + ']'.repeat(3000);
  assert.doesNotThrow(() => parseStrictJson(Buffer.from(deep)));
});

test('decoded duplicates are rejected at each object depth', () => {
  for (const input of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"x":[{"a":1,"a":2}]}', '{"__proto__":1,"__proto__":2}', '{"😺":1,"\\ud83d\\ude3a":2}']) {
    assert.throws(() => parseStrictJson(Buffer.from(input)), { message: 'DUPLICATE_KEY' });
  }
});

test('malformed grammar and UTF-8 fail without reflected input', () => {
  for (const input of ['', ' ', '{}{}', '{"x":01}', '{"x":+1}', '{"x":NaN}', '{"x":1.}', '[1,]', '{"x":1,}', '{"x" 1}', '{x:1}', '"\\x"', '"\\u001"', '"unterminated', '"\u0000"', '\ufeff{}']) {
    assert.throws(() => parseStrictJson(Buffer.from(input)), { message: 'INVALID_JSON' }, input);
  }
  assert.throws(() => parseStrictJson(Buffer.from([0x22, 0xc0, 0x80, 0x22])), { message: 'INVALID_UTF8' });
});
