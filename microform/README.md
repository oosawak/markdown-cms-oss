# microForm Worker v0.1

静的サイト向けの、お問い合わせフォームの受け口です。サイト側のフォームから
JSON を受け取り、検証して、運営者へ通知メールを1通だけ送ります。
管理画面はなく、届いた内容はメールで受け取ります。

設計の正本: `~/workspace/markdown-cms/microform-design_2026-11-11.md`

## 仕組み

```
サイト（静的HTML＋小さなJS）
  │  JSONでPOST（fetch）
  ▼
microForm Worker（全サイト共有・このフォルダ）
  1. Origin がサイト登録にあるか確認
  2. ハニーポット確認（入っていたら成功を装って終了）
  3. Turnstile のトークンを検証
  4. 項目を定義と照合（不明な項目は捨てる、全体上限 32KB）
  5. 宛先はサーバー側のサイト登録から決める（クライアントからは受けない）
  ▼
選択した送信方法で通知メールを送信（Email Routing / blastengine）
```

- v0.1 の範囲: 通知メールのみ。保存なし、自動返信なし。
- 項目の基本セット: 名前／メールアドレス／件名／本文。サイト登録の `fields` で追加・上書きできます。
- 本文はログに残しません（成否とサイト名だけを記録します）。
- 簡易レートリミット（同一 IP・サイトあたり 60 秒に 5 回）が入っていますが、
  これは Worker の isolate 内だけのベストエフォートです。本番では Cloudflare 側の
  Rate Limiting ルール併用を前提にしてください。

## メール送信方法の切替（MAIL_SENDER）

送信方法は Worker の環境変数 `MAIL_SENDER` で選びます。未設定なら `email` です。
受け口の処理（Origin 確認、Turnstile、項目検証、宛先の固定）はどちらの方式でも
共通で、変わるのは最後の送信だけです。

| 値 | 送信方法 | 向く場合・制約 |
| --- | --- | --- |
| `email`（既定） | Cloudflare Email Routing の `send_email` バインディング | 外部サービスなしで通知だけ送りたい場合。送れるのは Email Routing で検証済みの宛先だけ |
| `blastengine` | blastengine API | 配信実績のある送信基盤を使いたい場合。自動返信などの拡張もこちら |

### Email Routing 方式（email）の前提

- 送信元（サイト登録の `from`）のドメインで、Cloudflare の Email Routing を
  有効化しておくこと。`from` はそのドメインのアドレスにします。
- 宛先（サイト登録の `to`）は、Email Routing で宛先アドレスとして
  検証（確認メールへの応答）が済んでいること。検証済み以外の宛先には送れません。
- wrangler.toml に `send_email` バインディング（`SEND_EMAIL`）を書くこと
  （wrangler.toml.example 参照）。

自分のサイトの通知を受け取るだけなら、この方式で足ります。
お客さんの宛先が増える、自動返信が要る、といった場合は blastengine 方式に
切り替えます（サイト登録とフォーム側はそのまま使えます）。

## デプロイ手順

前提: Cloudflare アカウント。blastengine 方式を使う場合は blastengine の
アカウント（トライアル可）も。email 方式の場合は、上記の Email Routing の
前提（ドメインでの有効化と宛先アドレスの検証）を済ませておきます。

### 1. Turnstile のキーを用意する

Cloudflare ダッシュボード → Turnstile → ウィジェットを追加し、
フォームを置くサイトのドメインを登録します。

- サイトキー: サイト側の設定（後述）に書く公開値
- シークレットキー: 次の手順で Worker の secret に入れる秘密値

### 2. Worker を置く

```bash
cd worker/
cp wrangler.toml.example wrangler.toml
npx wrangler deploy
```

### 3. secret を設定する

実値はコードや wrangler.toml に書かず、対話入力で設定します。

```bash
npx wrangler secret put TURNSTILE_SECRET       # Turnstile のシークレットキー（常時）
npx wrangler secret put BLASTENGINE_LOGIN_ID   # blastengine のログインID（blastengine 方式のとき）
npx wrangler secret put BLASTENGINE_API_KEY    # blastengine のAPIキー（blastengine 方式のとき）
```

email 方式では secret は TURNSTILE_SECRET だけで、代わりに wrangler.toml の
`send_email` バインディング（`SEND_EMAIL`）が必要です。

blastengine 方式のメール送信の認証は、blastengine の仕様どおり
`Authorization: Bearer base64( lowercase( hex( sha256( ログインID + APIキー ) ) ) )`
を Worker が毎回組み立てます。

### 4. サイト登録を書く

wrangler.toml の `[vars] SITES` に、サイトごとの登録を JSON で書きます
（`wrangler secret put SITES` で secret として渡すこともできます）。

```json
{
  "sample": {
    "to": "owner@example.com",
    "from": "form@example.com",
    "origins": ["https://example.github.io"],
    "fields": {
      "company": { "type": "text", "required": false, "max": 100, "label": "会社名" }
    }
  }
}
```

| キー | 意味 |
| --- | --- |
| `to` | 通知先メールアドレス。サーバー側でだけ決める（フォームから変更できない） |
| `from` | 送信元メールアドレス（email 方式: Email Routing を有効化したドメインのアドレス／blastengine 方式: 登録済みの送信元） |
| `origins` | フォームを置くサイトの Origin（`https://ホスト名` の形。末尾スラッシュなし） |
| `fields` | 基本セットへの追加・上書き。`type` は text / email / textarea、`required`、`max`（最大文字数）、`label`（メール本文での見出し） |

宛先まわりの制約は方式ごとにあります。

- email 方式: `to` は Email Routing で検証済みの宛先アドレスだけです。
- blastengine 方式: トライアルでは、スパム防止のため「配信可能な宛先」の登録が
  必要です（5件まで）。`to` に使うアドレスは、先に blastengine の管理画面で
  配信可能アドレスとして登録してください。

### 5. サイト側の設定

Markdown CMS（OSS版）では、サイト設定（`content/sites/<id>.yml`）に書きます。

```yaml
contact_form:
  enabled: true
  endpoint: https://microform.example.workers.dev/submit
  site_id: sample
  sitekey: <Turnstile のサイトキー>
  privacy_url: ''
```

有効にすると、ビルドで `contact.html` が生成され、フッターにリンクが出て、
ページの CSP の `connect-src` に Worker の Origin が（フォーム有効時のみ）足されます。

## 動作確認

デプロイ直後は、Worker のトップで生存確認ができます。

```bash
curl https://microform.example.workers.dev/
# -> microForm Worker v0.1
```

送信の確認は、登録した Origin からのブラウザ送信が確実です。
curl で試す場合は Origin ヘッダーと Turnstile トークンが必要です
（トークンはブラウザのフォームで取得したものを使います）。

```bash
curl -X POST https://microform.example.workers.dev/submit \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://example.github.io' \
  -d '{"site_id":"sample","turnstile_token":"<token>","hp":"","fields":{"name":"テスト","email":"taro@example.net","subject":"確認","message":"届くかのテストです"}}'
# -> {"ok":true}
```

主なエラー応答:

| HTTP | error | 意味 |
| --- | --- | --- |
| 400 | `unknown_site` | site_id が未登録 |
| 400 | `validation_failed` | 必須欠け・形式不正（`fields` に項目名が返る） |
| 403 | `origin_not_allowed` | Origin が登録外 |
| 403 | `turnstile_failed` | Turnstile 検証に失敗、またはトークンなし |
| 413 | `too_large` | ボディが 32KB 超 |
| 429 | `rate_limited` | 短時間に送りすぎ |
| 500 | `server_misconfigured` | サーバー側の設定不備（Turnstile の secret、送信方法の secret やバインディングの不足・不正） |
| 502 | `send_failed` | 送信に失敗（Email Routing / blastengine） |

## ローカル検証

外部 API をモックしたテストが付いています（Node だけ、依存なし）。

```bash
node tests/run-tests.mjs
```

正常系（送信リクエストの形と BearerToken の生成）／必須欠け／不明項目の除去／
サイズ超過／Origin 不許可／ハニーポット／Turnstile 失敗などを確認します。
Email Routing 方式のケース（宛先・件名・本文の組み立て、バインディング未設定時の
エラー、`MAIL_SENDER` の切替）も含みます（`SEND_EMAIL` バインディングと
EmailMessage はテスト内でモックします）。

## 未決・今後

- v0.2: R2 への保存（任意）と保存期間の自動削除
- v0.3: 自動返信（送信 API 方式のサイトのみ）
- レートリミットの本番化（Cloudflare Rate Limiting / Durable Objects）
- 料金への含め方（商用版の標準込みか、オプションか）は設計メモの未決事項のまま
