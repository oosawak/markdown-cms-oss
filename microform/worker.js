// microForm Worker v0.1
//
// 静的サイト（Markdown CMS など）からのお問い合わせを JSON で受け取り、
// サーバー側で決めた宛先へ通知メールを1通だけ送る、小さな受け口です。
//
// 方針（設計メモ microform-design_2026-11-11.md より）:
// - 宛先はサーバー側のサイト登録だけを正とし、クライアントからは一切受けない。
// - 項目は定義と照合し、不明な項目は捨てる。全体サイズ上限は 32KB。
// - bot 対策は Turnstile（必須）＋ハニーポット。CORS は登録 Origin のみ。
// - 本文はログに残さない。成否と件数だけを数える。
// - v0.1 は通知メールのみ。保存なし、自動返信なし。
//
// 送信方法は env の MAIL_SENDER で選ぶ（未設定なら email）:
//   email       Cloudflare Email Routing の send_email バインディング（env.SEND_EMAIL）
//   blastengine blastengine API
// 必要な secret（wrangler secret put で設定する。コードに直書きしない）:
//   TURNSTILE_SECRET      Cloudflare Turnstile のシークレットキー（常時）
//   BLASTENGINE_LOGIN_ID  blastengine のログインID（MAIL_SENDER=blastengine のとき）
//   BLASTENGINE_API_KEY   blastengine のAPIキー（MAIL_SENDER=blastengine のとき）
// サイト登録は env の SITES（JSON 文字列）で渡す。未設定なら下の DEFAULT_SITES を使う。
// 任意の env: BLASTENGINE_API_URL / TURNSTILE_VERIFY_URL（テスト用に上書きできる）。

const BLASTENGINE_API_URL_DEFAULT = 'https://app.engn.jp/api/v1/deliveries/transaction';
const TURNSTILE_VERIFY_URL_DEFAULT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_BODY_BYTES = 32 * 1024;
const RATE_LIMIT_MAX = 5; // 同一 IP・サイトあたり 60 秒に 5 回まで（ベストエフォート）
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// 基本セット。サイト登録の fields で追加・上書きできる。
const BASE_FIELDS = {
  name: { type: 'text', required: true, max: 100, label: 'お名前' },
  email: { type: 'email', required: true, max: 254, label: 'メールアドレス' },
  subject: { type: 'text', required: false, max: 200, label: '件名' },
  message: { type: 'textarea', required: true, max: 5000, label: '本文' },
};

// SITES env が無い場合の予備。実運用では env の SITES を使うこと（README 参照）。
// ここに実在のアドレスは書かない。
const DEFAULT_SITES = {
  example: {
    to: 'owner@example.com',
    from: 'form@example.com',
    origins: ['https://example.com'],
  },
};

function getSites(env) {
  if (env.SITES) {
    try {
      const parsed = JSON.parse(env.SITES);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // 壊れた JSON は予備に落とす（起動は止めない）。
    }
  }
  return DEFAULT_SITES;
}

function fieldSchema(site) {
  const extra = site && typeof site.fields === 'object' && site.fields ? site.fields : {};
  return { ...BASE_FIELDS, ...extra };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 定義に照らして検証する。不明な項目は捨て、残した項目だけを返す。
function validateFields(schema, input) {
  const errors = [];
  const clean = {};
  const src = input && typeof input === 'object' ? input : {};
  for (const [key, def] of Object.entries(schema)) {
    const raw = src[key];
    if (raw === undefined || raw === null) {
      if (def.required) errors.push(key);
      continue;
    }
    if (typeof raw !== 'string') {
      errors.push(key);
      continue;
    }
    const value = raw.trim();
    if (def.required && value === '') {
      errors.push(key);
      continue;
    }
    if (value.length > (def.max || 1000)) {
      errors.push(key);
      continue;
    }
    if (def.type === 'email' && value !== '' && !EMAIL_RE.test(value)) {
      errors.push(key);
      continue;
    }
    clean[key] = value;
  }
  return { errors, clean };
}

async function bearerToken(loginId, apiKey) {
  const data = new TextEncoder().encode(loginId + apiKey);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(''); // hex は小文字
  return btoa(hex); // base64( lowercase( hex( sha256( ID + KEY ) ) ) )
}

// ---- メール送信（方法は env.MAIL_SENDER で切替、未設定なら email） --------
// 戻り値: 成功なら null、失敗なら { status, error, log }。
// どの方式でも宛先・送信元はサーバー側のサイト登録だけを使い、
// 本文はログに残さない。

async function sendMail(env, mail) {
  const sender = String(env.MAIL_SENDER || 'email').toLowerCase();
  if (sender === 'blastengine') return sendViaBlastengine(env, mail);
  if (sender === 'email') return sendViaEmailRouting(env, mail);
  // 知らない値なら黙って既定に落とさず、誤設定として止める。
  return { status: 500, error: 'server_misconfigured', log: 'misconfigured' };
}

async function sendViaBlastengine(env, mail) {
  if (!env.BLASTENGINE_LOGIN_ID || !env.BLASTENGINE_API_KEY) {
    return { status: 500, error: 'server_misconfigured', log: 'misconfigured' };
  }
  const token = await bearerToken(env.BLASTENGINE_LOGIN_ID, env.BLASTENGINE_API_KEY);
  const res = await fetch(env.BLASTENGINE_API_URL || BLASTENGINE_API_URL_DEFAULT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: mail.from },
      to: mail.to,
      subject: mail.subject,
      text_part: mail.text,
    }),
  });
  if (!res.ok) {
    return { status: 502, error: 'send_failed', log: `send_failed status=${res.status}` };
  }
  return null;
}

async function loadEmailMessageCtor(env) {
  // テストでは env.EMAIL_MESSAGE_CTOR で差し替えられる。
  if (env.EMAIL_MESSAGE_CTOR) return env.EMAIL_MESSAGE_CTOR;
  const mod = await import('cloudflare:email');
  return mod.EmailMessage;
}

async function sendViaEmailRouting(env, mail) {
  const binding = env.SEND_EMAIL;
  if (!binding || typeof binding.send !== 'function') {
    return { status: 500, error: 'server_misconfigured', log: 'misconfigured' };
  }
  try {
    const EmailMessage = await loadEmailMessageCtor(env);
    const message = new EmailMessage(mail.from, mail.to, buildMime(mail));
    await binding.send(message);
  } catch {
    // 失敗の理由に本文が混ざることがあるため、例外の中身は記録しない。
    return { status: 502, error: 'send_failed', log: 'send_failed' };
  }
  return null;
}

function base64OfBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// 件名の MIME エンコード。ASCII だけならそのまま、
// それ以外は RFC 2047 の encoded-word（UTF-8 / Base64）にする。
// 1つの encoded-word が 75 文字を超えないよう、文字の途中で切らずに分ける。
function encodeMimeSubject(subject) {
  const safe = String(subject).replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(safe)) return safe;
  const enc = new TextEncoder();
  const chunks = [];
  let chunk = '';
  let chunkBytes = 0;
  for (const ch of safe) {
    const len = enc.encode(ch).length;
    if (chunk && chunkBytes + len > 45) {
      chunks.push(chunk);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += len;
  }
  if (chunk) chunks.push(chunk);
  return chunks
    .map((c) => `=?UTF-8?B?${base64OfBytes(enc.encode(c))}?=`)
    .join('\r\n ');
}

// text メール1通分の MIME を最小限で組む。
function buildMime(mail) {
  const noCrlf = (v) => String(v).replace(/[\r\n]+/g, '');
  const headers = [
    `From: ${noCrlf(mail.from)}`,
    `To: ${noCrlf(mail.to)}`,
    `Subject: ${encodeMimeSubject(mail.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  const body = String(mail.text).replace(/\r\n|\r|\n/g, '\r\n');
  return headers.join('\r\n') + '\r\n\r\n' + body + '\r\n';
}

// 同一 isolate 内だけの簡易レートリミット。本番では Cloudflare 側の
// レートリミット併用が前提（README 参照）。
const rateBuckets = new Map();
function rateLimited(key) {
  const now = Date.now();
  const bucket = (rateBuckets.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return bucket.length > RATE_LIMIT_MAX;
}

function jsonResponse(status, obj, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(obj), { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response('microForm Worker v0.1\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (url.pathname !== '/submit') {
      return jsonResponse(404, { ok: false, error: 'not_found' });
    }

    const sites = getSites(env);
    const allOrigins = new Set();
    for (const s of Object.values(sites)) {
      for (const o of s.origins || []) allOrigins.add(o);
    }
    const origin = request.headers.get('Origin') || '';

    // CORS プリフライト: この時点では site_id が分からないため、
    // いずれかの登録サイトで許可された Origin かだけを見る。
    // 実際の POST ではサイト単位で再確認する。
    if (request.method === 'OPTIONS') {
      if (!allOrigins.has(origin)) return jsonResponse(403, { ok: false, error: 'origin_not_allowed' });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }
    if (request.method !== 'POST') {
      return jsonResponse(405, { ok: false, error: 'method_not_allowed' }, allOrigins.has(origin) ? origin : null);
    }

    // サイズ上限はボディを読む前にヘッダーでも見る。
    const declared = Number(request.headers.get('Content-Length') || '0');
    if (declared > MAX_BODY_BYTES) {
      return jsonResponse(413, { ok: false, error: 'too_large' }, allOrigins.has(origin) ? origin : null);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return jsonResponse(413, { ok: false, error: 'too_large' }, allOrigins.has(origin) ? origin : null);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonResponse(400, { ok: false, error: 'invalid_json' }, allOrigins.has(origin) ? origin : null);
    }

    const siteId = typeof body.site_id === 'string' ? body.site_id : '';
    const site = sites[siteId];
    if (!site) {
      return jsonResponse(400, { ok: false, error: 'unknown_site' }, allOrigins.has(origin) ? origin : null);
    }
    const corsOrigin = (site.origins || []).includes(origin) ? origin : null;
    if (!corsOrigin) {
      console.log(`microform result=origin_denied site=${siteId}`);
      return jsonResponse(403, { ok: false, error: 'origin_not_allowed' });
    }

    // ハニーポット: 入っていたら bot とみなし、成功を装って何もしない。
    const fieldsIn = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const honeypot = body.hp ?? fieldsIn.hp ?? '';
    if (typeof honeypot === 'string' && honeypot !== '') {
      console.log(`microform result=honeypot site=${siteId}`);
      return jsonResponse(200, { ok: true }, corsOrigin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(`${siteId}:${ip}`)) {
      console.log(`microform result=rate_limited site=${siteId}`);
      return jsonResponse(429, { ok: false, error: 'rate_limited' }, corsOrigin);
    }

    // Turnstile は必須。secret 未設定は誤設定として止める（fail closed）。
    if (!env.TURNSTILE_SECRET) {
      console.log(`microform result=misconfigured site=${siteId}`);
      return jsonResponse(500, { ok: false, error: 'server_misconfigured' }, corsOrigin);
    }
    const token = typeof body.turnstile_token === 'string' ? body.turnstile_token : '';
    if (!token) {
      return jsonResponse(403, { ok: false, error: 'turnstile_failed' }, corsOrigin);
    }
    const verifyRes = await fetch(env.TURNSTILE_VERIFY_URL || TURNSTILE_VERIFY_URL_DEFAULT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const verify = await verifyRes.json().catch(() => ({}));
    if (!verify.success) {
      console.log(`microform result=turnstile_failed site=${siteId}`);
      return jsonResponse(403, { ok: false, error: 'turnstile_failed' }, corsOrigin);
    }

    // 項目検証（宛先など定義外の項目はここで落ちる）。
    const schema = fieldSchema(site);
    const { errors, clean } = validateFields(schema, fieldsIn);
    if (errors.length) {
      console.log(`microform result=validation_failed site=${siteId} fields=${errors.join(',')}`);
      return jsonResponse(400, { ok: false, error: 'validation_failed', fields: errors }, corsOrigin);
    }

    // 通知メールの組み立ては送信方法に依らず共通。
    // 宛先・送信元はサイト登録からだけ取る。
    const subjectLine = clean.subject ? clean.subject : '（件名なし）';
    const lines = [`サイト: ${siteId}`, ''];
    for (const [key, def] of Object.entries(schema)) {
      if (clean[key]) lines.push(`${def.label || key}: ${clean[key]}`);
    }
    lines.push('', '— microForm から自動送信されました。');
    const mail = {
      from: site.from,
      to: site.to,
      subject: `[${siteId}] お問い合わせ: ${subjectLine}`,
      text: lines.join('\n'),
    };

    const failure = await sendMail(env, mail);
    if (failure) {
      console.log(`microform result=${failure.log} site=${siteId}`);
      return jsonResponse(failure.status, { ok: false, error: failure.error }, corsOrigin);
    }

    console.log(`microform result=sent site=${siteId}`);
    return jsonResponse(200, { ok: true }, corsOrigin);
  },
};
