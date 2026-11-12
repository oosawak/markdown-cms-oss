// microForm Worker のローカル検証。
// worker.js を読み込み、blastengine と Turnstile のエンドポイントを
// モックした fetch で差し替えて、ハンドラの挙動を確認する。
// 実行: node tests/run-tests.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, '..', 'worker.js'), 'utf8');
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64')
);
const worker = mod.default;

// ---- モックする外部 API -------------------------------------------------
const calls = { turnstile: [], blast: [] };
let turnstileOk = true;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('challenges.cloudflare.com')) {
    calls.turnstile.push(opts);
    return Response.json({ success: turnstileOk });
  }
  if (u.includes('app.engn.jp')) {
    calls.blast.push({ url: u, opts });
    return new Response(JSON.stringify({ delivery_id: 'dummy' }), { status: 201 });
  }
  throw new Error('unexpected fetch: ' + u);
};

// ---- テスト用 env -------------------------------------------------------
const LOGIN_ID = 'test-login-id';
const API_KEY = 'test-api-key';
const env = {
  TURNSTILE_SECRET: 'test-turnstile-secret',
  // 既存ケースは blastengine 方式で固定する（MAIL_SENDER 未設定時の既定は email）。
  MAIL_SENDER: 'blastengine',
  BLASTENGINE_LOGIN_ID: LOGIN_ID,
  BLASTENGINE_API_KEY: API_KEY,
  SITES: JSON.stringify({
    demo: {
      to: 'owner@example.com',
      from: 'form@example.com',
      origins: ['https://demo.example.com'],
      fields: {
        company: { type: 'text', required: false, max: 100, label: '会社名' },
      },
    },
  }),
};

function post(payload, origin = 'https://demo.example.com', ip = '203.0.113.10') {
  return new Request('https://worker.example/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'CF-Connecting-IP': ip,
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

const validPayload = () => ({
  site_id: 'demo',
  turnstile_token: 'token-abc',
  hp: '',
  fields: {
    name: '山田 太郎',
    email: 'taro@example.net',
    subject: 'テストの件名',
    message: 'これはテスト本文です。',
    company: '株式会社サンプル',
  },
});

// ---- 小さなアサーション --------------------------------------------------
let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok - ${name}`);
  } else {
    failed++;
    console.log(`  NG - ${name} ${extra}`);
  }
}
function reset() {
  calls.turnstile.length = 0;
  calls.blast.length = 0;
  turnstileOk = true;
}

// 1. 正常系: 送信リクエストの形と BearerToken
{
  console.log('[1] 正常系');
  reset();
  const res = await worker.fetch(post(validPayload()), env);
  const body = await res.json();
  check('HTTP 200 で ok:true', res.status === 200 && body.ok === true, `status=${res.status}`);
  check('blastengine へ 1 回だけ送信', calls.blast.length === 1);
  const sent = calls.blast[0];
  check(
    '送信先 URL は transaction エンドポイント',
    sent.url === 'https://app.engn.jp/api/v1/deliveries/transaction',
    sent.url
  );
  const expectedToken = Buffer.from(
    createHash('sha256').update(LOGIN_ID + API_KEY).digest('hex'),
    'utf8'
  ).toString('base64');
  check(
    'Authorization が base64(lowercase(hex(sha256(ID+KEY))))',
    sent.opts.headers.Authorization === `Bearer ${expectedToken}`,
    sent.opts.headers.Authorization
  );
  const mail = JSON.parse(sent.opts.body);
  check('from は登録どおり', mail.from && mail.from.email === 'form@example.com');
  check('to は登録どおり（サーバー側固定）', mail.to === 'owner@example.com');
  check('subject に件名が入る', typeof mail.subject === 'string' && mail.subject.includes('テストの件名'));
  check(
    'text_part に項目が並ぶ',
    mail.text_part.includes('山田 太郎') &&
      mail.text_part.includes('これはテスト本文です。') &&
      mail.text_part.includes('株式会社サンプル')
  );
  check('Turnstile 検証が 1 回呼ばれる', calls.turnstile.length === 1);
}

// 2. クライアントが宛先を指定しても無視される
{
  console.log('[2] 宛先の詐称は効かない');
  reset();
  const p = validPayload();
  p.fields.to = 'evil@example.net';
  p.fields.from = 'evil@example.net';
  const res = await worker.fetch(post(p), env);
  check('HTTP 200', res.status === 200);
  const mail = JSON.parse(calls.blast[0].opts.body);
  check('to は登録宛先のまま', mail.to === 'owner@example.com');
  check('text_part に詐称アドレスが混ざらない', !mail.text_part.includes('evil@example.net'));
}

// 3. 必須欠け → 400、送信しない
{
  console.log('[3] 必須欠け');
  reset();
  const p = validPayload();
  delete p.fields.message;
  const res = await worker.fetch(post(p), env);
  const body = await res.json();
  check('HTTP 400', res.status === 400, `status=${res.status}`);
  check('不足項目が返る', Array.isArray(body.fields) && body.fields.includes('message'));
  check('blastengine は呼ばれない', calls.blast.length === 0);
}

// 4. 不正なメールアドレス → 400
{
  console.log('[4] メール形式不正');
  reset();
  const p = validPayload();
  p.fields.email = 'not-an-email';
  const res = await worker.fetch(post(p), env);
  check('HTTP 400', res.status === 400);
  check('blastengine は呼ばれない', calls.blast.length === 0);
}

// 5. サイズ超過 → 413
{
  console.log('[5] サイズ超過');
  reset();
  const p = validPayload();
  p.fields.message = 'あ'.repeat(20000); // 約 60KB
  const res = await worker.fetch(post(p), env);
  check('HTTP 413', res.status === 413, `status=${res.status}`);
  check('blastengine は呼ばれない', calls.blast.length === 0);
}

// 6. 許可されていない Origin → 403
{
  console.log('[6] Origin 不許可');
  reset();
  const res = await worker.fetch(post(validPayload(), 'https://evil.example.com'), env);
  check('HTTP 403', res.status === 403, `status=${res.status}`);
  check('Turnstile も blastengine も呼ばれない', calls.turnstile.length === 0 && calls.blast.length === 0);
  check('CORS ヘッダーを付けない', res.headers.get('Access-Control-Allow-Origin') === null);
}

// 7. ハニーポット → 成功を装い、何も送らない
{
  console.log('[7] ハニーポット');
  reset();
  const p = validPayload();
  p.hp = 'http://spam.example/';
  const res = await worker.fetch(post(p), env);
  const body = await res.json();
  check('HTTP 200 で ok:true（成功を装う）', res.status === 200 && body.ok === true);
  check('blastengine は呼ばれない', calls.blast.length === 0);
  check('Turnstile も呼ばれない', calls.turnstile.length === 0);
}

// 8. Turnstile 失敗 → 403
{
  console.log('[8] Turnstile 失敗');
  reset();
  turnstileOk = false;
  const res = await worker.fetch(post(validPayload()), env);
  check('HTTP 403', res.status === 403);
  check('blastengine は呼ばれない', calls.blast.length === 0);
}

// 9. 未知の site_id → 400
{
  console.log('[9] 未知のサイト');
  reset();
  const p = validPayload();
  p.site_id = 'no-such-site';
  const res = await worker.fetch(post(p), env);
  check('HTTP 400', res.status === 400);
  check('blastengine は呼ばれない', calls.blast.length === 0);
}

// 10. 最大長超過の項目 → 400
{
  console.log('[10] 最大長超過');
  reset();
  const p = validPayload();
  p.fields.name = 'x'.repeat(101);
  // レートリミット（60秒に5回）は別ケースで効くため、このケースは別 IP から送る
  const res = await worker.fetch(post(p, 'https://demo.example.com', '203.0.113.99'), env);
  check('HTTP 400', res.status === 400);
  check('blastengine は呼ばれない', calls.blast.length === 0);
}

// 11. パスとメソッド
{
  console.log('[11] パス/メソッド');
  reset();
  const res404 = await worker.fetch(new Request('https://worker.example/nope'), env);
  check('未知パスは 404', res404.status === 404);
  const res405 = await worker.fetch(
    new Request('https://worker.example/submit', { method: 'GET' }),
    env
  );
  check('GET /submit は 405', res405.status === 405);
}

// 12. Email Routing 方式（MAIL_SENDER=email / 未設定）
{
  console.log('[12] Email Routing 方式');
  class MockEmailMessage {
    constructor(from, to, raw) {
      this.from = from;
      this.to = to;
      this.raw = raw;
    }
  }
  const sentMail = [];
  const emailEnv = (overrides = {}) => ({
    TURNSTILE_SECRET: 'test-turnstile-secret',
    SITES: env.SITES,
    SEND_EMAIL: {
      send: async (msg) => {
        sentMail.push(msg);
      },
    },
    EMAIL_MESSAGE_CTOR: MockEmailMessage,
    ...overrides,
  });

  // 12a. 正常系: 宛先・件名・本文が正しく組み立つ
  {
    reset();
    sentMail.length = 0;
    // レートリミット回避のため、このセクションはケースごとに別 IP を使う
    const res = await worker.fetch(
      post(validPayload(), 'https://demo.example.com', '203.0.113.201'),
      emailEnv({ MAIL_SENDER: 'email' })
    );
    const body = await res.json();
    check('email: HTTP 200 で ok:true', res.status === 200 && body.ok === true, `status=${res.status}`);
    check('email: バインディングへ 1 通だけ送信', sentMail.length === 1);
    check('email: blastengine は呼ばれない', calls.blast.length === 0);
    const msg = sentMail[0] || {};
    check('email: from は登録どおり', msg.from === 'form@example.com');
    check('email: to は登録宛先（サーバー側固定）', msg.to === 'owner@example.com');
    const subjectMatch = (msg.raw || '').match(/Subject: ([\s\S]*?)\r\nMIME-Version:/);
    check('email: MIME に Subject がある', !!subjectMatch);
    let decoded = '';
    if (subjectMatch) {
      const parts = [...subjectMatch[1].matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)];
      decoded = Buffer.concat(parts.map((m) => Buffer.from(m[1], 'base64'))).toString('utf8');
    }
    check(
      'email: 件名が UTF-8 で正しく入る',
      decoded === '[demo] お問い合わせ: テストの件名',
      decoded
    );
    check(
      'email: 本文に項目が並ぶ',
      (msg.raw || '').includes('山田 太郎') && (msg.raw || '').includes('これはテスト本文です。')
    );
    check(
      'email: Content-Type は text/plain; charset=UTF-8',
      (msg.raw || '').includes('Content-Type: text/plain; charset=UTF-8')
    );
  }

  // 12b. 宛先の詐称は email 方式でも効かない
  {
    sentMail.length = 0;
    const p = validPayload();
    p.fields.to = 'evil@example.net';
    const res = await worker.fetch(
      post(p, 'https://demo.example.com', '203.0.113.202'),
      emailEnv({ MAIL_SENDER: 'email' })
    );
    check('email: 詐称しても HTTP 200', res.status === 200);
    check(
      'email: to は登録宛先のまま',
      sentMail.length === 1 && sentMail[0].to === 'owner@example.com'
    );
    check(
      'email: 本文に詐称アドレスが混ざらない',
      sentMail.length === 1 && !sentMail[0].raw.includes('evil@example.net')
    );
  }

  // 12c. MAIL_SENDER 未設定なら email が既定
  {
    sentMail.length = 0;
    const res = await worker.fetch(
      post(validPayload(), 'https://demo.example.com', '203.0.113.203'),
      emailEnv()
    );
    check(
      'email: 未設定時は email 方式で 200',
      res.status === 200 && sentMail.length === 1,
      `status=${res.status}`
    );
  }

  // 12d. バインディング未設定 → 500 server_misconfigured
  {
    const noBinding = emailEnv({ MAIL_SENDER: 'email' });
    delete noBinding.SEND_EMAIL;
    const res = await worker.fetch(
      post(validPayload(), 'https://demo.example.com', '203.0.113.204'),
      noBinding
    );
    const body = await res.json();
    check(
      'email: バインディング未設定は 500',
      res.status === 500 && body.error === 'server_misconfigured',
      `status=${res.status}`
    );
  }

  // 12e. バインディングの送信が例外 → 502 send_failed
  {
    const failEnv = emailEnv({
      MAIL_SENDER: 'email',
      SEND_EMAIL: {
        send: async () => {
          throw new Error('routing rejected');
        },
      },
    });
    const res = await worker.fetch(
      post(validPayload(), 'https://demo.example.com', '203.0.113.205'),
      failEnv
    );
    const body = await res.json();
    check(
      'email: 送信失敗は 502',
      res.status === 502 && body.error === 'send_failed',
      `status=${res.status}`
    );
  }

  // 12f. 未知の MAIL_SENDER → 500（fail closed、何も送らない）
  {
    reset();
    sentMail.length = 0;
    const res = await worker.fetch(
      post(validPayload(), 'https://demo.example.com', '203.0.113.206'),
      emailEnv({ MAIL_SENDER: 'smoke-signal' })
    );
    const body = await res.json();
    check(
      '未知の送信方法は 500',
      res.status === 500 && body.error === 'server_misconfigured',
      `status=${res.status}`
    );
    check('未知の送信方法では何も送らない', sentMail.length === 0 && calls.blast.length === 0);
  }
}

globalThis.fetch = realFetch;
console.log(`\n結果: ${passed} 件 OK / ${failed} 件 NG`);
process.exit(failed ? 1 : 0);
