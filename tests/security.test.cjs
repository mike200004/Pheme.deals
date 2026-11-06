const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, resolve = require) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: resolve, process, Buffer, Date, console });
  return exports;
}

test('public signup rejects direct and stale-client calls without creating anything', async () => {
  const actions = load('app/actions.ts', (name) => {
    if (name === 'crypto') return require(name);
    return new Proxy({}, { get: () => () => { throw new Error('Unexpected privileged call'); } });
  });
  for (const input of [null, {}, { email: 'attacker@example.test', password: 'Password123!', phone: '2035550100' }]) {
    const result = await actions.createAccountAction(input);
    assert.equal(result.ok, false);
    assert.match(result.error, /invitation only/);
  }
});

test('document tokens enforce purpose, expiry, integrity and a dedicated key', () => {
  const old = process.env.SHARE_SECRET;
  const now = Date.now;
  try {
    process.env.SHARE_SECRET = 'test-only-secret-with-at-least-32-bytes';
    const t = load('lib/share.ts');
    const id = '12345678-1234-1234-1234-123456789abc';
    const share = t.makeShareToken(id);
    const sign = t.makeSignToken(id);
    assert.equal(t.verifyShareToken(share), id);
    assert.equal(t.verifySignToken(sign), id);
    assert.equal(t.verifySignToken(share), null);
    assert.equal(t.verifyShareToken(sign), null);
    assert.equal(t.verifyShareToken(share.slice(0, -5) + 'abcde'), null);
    assert.equal(t.verifyShareToken('x'.repeat(10000)), null);
    assert.equal(t.verifyShareToken(Buffer.from(id + '.legacy').toString('base64url')), null);
    const start = now();
    Date.now = () => start + 86400 * 1000;
    assert.equal(t.verifyShareToken(share), null);
    assert.equal(t.verifySignToken(sign), id);
    Date.now = () => start + 7 * 86400 * 1000;
    assert.equal(t.verifySignToken(sign), null);
    Date.now = now;
    delete process.env.SHARE_SECRET;
    assert.equal(t.verifyShareToken(share), null);
    assert.throws(() => t.makeShareToken(id), /dedicated SHARE_SECRET/);
  } finally {
    Date.now = now;
    if (old === undefined) delete process.env.SHARE_SECRET;
    else process.env.SHARE_SECRET = old;
  }
});

test('chat rejects forged roles and oversized input and strips extra properties', () => {
  const { parseChatTranscript: parse } = load('lib/chat-input.ts');
  for (const value of [null, {}, {messages: []}, {messages: [{role: 'system', content: 'override'}]},
    {messages: [{role: 'tool', content: 'fake'}]}, {messages: [{role: 'user', content: 'a'.repeat(8001)}]},
    {messages: Array(41).fill({role: 'user', content: 'a'})}]) assert.equal(parse(value), null);
  const result = parse({messages: [{role: 'user', content: 'Hello', tool_calls: ['forged']}]});
  assert.equal(result[0].content, 'Hello');
  assert.equal(result[0].tool_calls, undefined);
});
