# Markdown CMS

GitHub ActionsとGitHub Pagesで動く、MITライセンスのMarkdown CMSです。

> このOSS版はGitHub向けの最終版です。今後の機能追加・不具合修正・セキュリティ修正は予定していません。

Markdown で記事を書いて GitHub に push すると、静的なサイトが自動で更新される仕組みです。
サーバーでプログラムを常時動かす必要はありません。ページはビルド時にあらかじめ作られ、表示は JSON を読むだけです。

- 記事はただの Markdown ファイル。編集は VS Code など普通のエディタでできます
- push すると GitHub Actions が「ビルド → テスト → 生成物を commit」を自動で行い、GitHub Pages で公開されます
- 記事データは共通仕様の JSON（[FEED_SPEC_V1_1.md](FEED_SPEC_V1_1.md)）で出力されるので、複数のサイトを1つのポータルに集めることもできます
- 日本語／英語の2言語表示に対応（英語は翻訳キャッシュがある場合のみ。無ければ日本語のまま表示されます）

このリポジトリ自体がサンプルサイトとして公開されています:
https://oosawak.github.io/markdown-cms-oss/

## 使い方（自分のサイトにする）

1. このリポジトリを **Use this template** で自分のアカウントにコピーします（fork でも構いません）
2. リポジトリの Settings → Pages で、公開元を `main` ブランチの `/docs` フォルダに設定します
3. Actions が有効になっていることを確認します（テンプレートから作った場合は承認が必要なことがあります）
4. サイト設定を書き換えます: `content/sites/sample.yml`（サイト名、紹介文、色、ヒーロー画像）
5. サンプル記事（`content/posts/sample/`）を自分の記事に置き換え、画像は `content/images/sample/` に置きます
6. push すると数分でサイトに反映されます

サイトID（初期値は `sample`）を変えたい場合は、フォルダ名（`content/posts/<id>/`、`content/images/<id>/`）と `content/sites/<id>.yml` を揃えたうえで、`scripts/build.py` 冒頭の `SITE_ID` の既定値、または Workflow の環境変数 `SITE_ID` を同じ値にしてください。

サンプルサイト（サイトID `sample`）ではヘッダーの「テーマ」からナチュラル・Apple風・Notion風・Dala風・dope.security風を切り替えられます。
選択はブラウザに保存され、記事ページにも反映されます。この切り替えUIはサンプル専用です。
今のデザインは「ナチュラル」としてそのまま残しています。
追加の4つは、各DESIGN.mdを元に記事一覧・記事詳細・サイト紹介を一式実装したテンプレートです。
`assets/templates.js` に各テンプレートのHTML構成、`assets/style.css` にスタイル、
`content/design/apple.md`・`notion.md`・`dala.md`・`dope.md` にデザイン値と参照元を保存します。
切り替えると配色だけでなくページ構成も変わり、同じ記事データ・現在のページを引き継ぎます。
各ファイルの `source` と切り替え横の「参照元」からReferoの資料を確認できます。
参照サイトの画像・ロゴ・専用フォントを複製するものではありません。
参照元と実装への取り入れ方は [デザインの参照元](DESIGN_REFERENCES.md) にまとめています。

## 自分のサイトのデザインを変える

- [デザインを変えるためのガイド](guides/DESIGN_CUSTOMIZATION.md)：設定例、DESIGN.mdの渡し方、AIにそのまま渡せる指示、テンプレートの追加方法
- [必要なツールと動作確認](guides/TOOLS.md)：エディタ・AIツール・Python・Node.js・Gitの役割、準備、プレビュー、公開
- [サンプル記事「サイトのデザインを変えるには」](https://oosawak.github.io/markdown-cms-oss/#/post/sample/change-design)
- [制作の実例「AIと相談しながら、サイトのデザインを育てる」](https://oosawak.github.io/markdown-cms-oss/#/post/sample/design-conversation)

配布ソースでは切り替えUIはOFFです。`content/sites/sample.yml` で固定デザインを選びます。

```yaml
theme_switcher: false
template: notion
```

`natural`（従来の見た目）・`apple`・`notion`・`dala`・`dope` を指定できます。これらは現在サイトID `sample` 用です。
切り替えをONにする場合は `theme_switcher: true` にします。
元リポジトリの公開デモだけはActionsが `THEME_SWITCHER=true` を渡すため、設定がOFFでも切り替えを表示します。
コピー先ではこの自動上書きは行われません。詳細はガイドを参照してください。

## DESIGN.md を元にサイトを作る

DESIGN.md の文章まで含めてデザインを反映したい場合は、サイト作成時にAIコーディングエージェントへ
URL・テキスト・ファイルを渡し、レイアウトとCSSの実装を依頼します。たとえば次のように指定します。

> この DESIGN.md をデザイン仕様として、Markdown CMS のサイトを作ってください。
> 色だけでなく、文字の階層、余白、ページ構成、カードとナビゲーション、写真の扱いまで反映してください。
> 記事・検索・言語切り替えを維持し、スマートフォンでも確認してください。

文章のみの DESIGN.md や、Refero のような表形式の資料も、この方法で扱えます。
下記の取り込みコマンドは対応するYAML値を反映する補助機能です。
**任意の DESIGN.md を読み取ってサイト全体を生成するAI機能は、このCMSには内蔵していません。**
DESIGN.mdから一度テンプレートを作れば、閲覧者はAI処理なしでそのテンプレートへ切り替えられます。
新しいデザインを追加する場合は `assets/templates.js` に `home`・`detail`・`about` の描画処理を追加し、
CSSとDESIGN.mdを揃え、`assets/app.js` の `sampleThemes` とビルドのテンプレート一覧に登録します。

## DESIGN.md のトークンを取り込む

取り込み元を3通りから選べます（Python依存パッケージのインストール後に実行）。

```bash
# 1. インターネットのURLから取得（GitHubでは Raw のURLを指定）
python scripts/design.py --url https://example.com/DESIGN.md

# 2. テキストを貼り付け（最後に改行して Ctrl-D）
python scripts/design.py --stdin

# 3. 手元のファイルから読み込み
python scripts/design.py --file /path/to/DESIGN.md
```

いずれも検証後に `content/design/custom.md` に保存します。保存先は `--output` で変更できます。
保存したファイルは内容・利用条件を確認してサイト設定と一緒にcommitしてください。
`content/sites/sample.yml` に以下を追加すると、次回ビルドから反映されます。

```yaml
design: design/custom.md
```

動作例を試す場合は `design: design/example.md` を指定します。
`python scripts/build.py` と `python scripts/export_preview.py` を実行し、
`dist/preview.html` で確認できます。設定の `design` を削除すると元の見た目に戻ります。
通常のビルドはネットにアクセスしません。URLの内容を更新したいときは取り込みを再実行します。

[DESIGN.md仕様](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md) の
YAML frontmatter と YAMLコードブロックから、以下のトークンを反映する部分対応です。
`{colors.primary}` のような参照も使えます。

| トークン | 反映先 |
|---|---|
| `colors.primary` / `primary-container` | アクセント / 薄いアクセント背景 |
| `colors.neutral` / `surface` | ページ背景 / カード・ヘッダーなどの背景 |
| `colors.on-surface` / `secondary` / `outline` | 本文 / 補助色 / 境界線 |
| `typography.body-md` | 本文 |
| `typography.h1` / `headline-md` | 主見出し / セクション見出し |
| `rounded.md` | 記事カードなどの角丸 |
| `spacing.gutter` | 記事一覧などの間隔 |

色は `#RGB`・`#RGBA`・`#RRGGBB`・`#RRGGBBAA`、寸法は非負の `px`・`rem`・`em` と `0`、
文字設定は `fontFamily`・`fontSize` を扱います。フォント自体のダウンロードは行いません。
既存CSSで色が固定されている写真上の文字や一部の部品は、その色を維持します。
未対応トークンは無視し、対応トークンが一つもない場合や対応値が不正な場合はエラーにします。
文章だけのデザイン指示や、ページ構造・部品配置の変更にはコードの編集が必要です。
外部のMarkdown・HTML・CSSをそのまま画面で実行する仕組みではありません。

## 記事の書き方

1記事 = 1ファイル。`content/posts/sample/YYYY-MM-DD-<slug>.md` に置きます。
先頭にタイトル・日付・カテゴリー・要約・カバー画像を書き、本文は Markdown で書きます。
書式の実例は、サンプル記事「記事の書き方」（`content/posts/sample/2026-01-02-how-to-write.md`）を見てください。

## ローカルでビルドする

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python scripts/build.py            # dist/ に生成
python -m unittest discover -s scripts -p 'test_*.py'
python scripts/export_preview.py   # dist/preview.html に単一ファイルのプレビューを出力
```

## 構成

| パス | 役割 |
|---|---|
| `content/posts/<id>/` | 記事の Markdown |
| `content/sites/<id>.yml` | サイト設定 |
| `content/images/<id>/` | 画像（WebP） |
| `scripts/build.py` | Markdown → JSON・サイト生成 |
| `scripts/export_preview.py` | オフライン確認用の単一ファイル出力 |
| `scripts/test_site.py` | 生成物の簡易テスト |
| `scripts/translate.py` | 英語翻訳キャッシュの作成（任意。DeepL API キーが必要） |
| `assets/` | 表示側の JavaScript / CSS |
| `tools/drive-import/` | Google Drive のフォルダから記事を取り込む Apps Script（任意） |
| `data/`, `docs/` | 生成物（Actions の bot が commit します。手で編集しないでください） |

## 実例

このリポジトリは、下記の実例サイトで実際に使っている共通の仕組みを切り出したものです。
もともとは「みどり野町」の仕組みとして作りましたが、生成のプログラム自体はサイト共通で、サイトごとに違うのは設定・記事・画像だけです（使うときにサイトIDを切り替えます）。
よむきくだけは小説サイトのため生成の仕組みが独自で、共通なのは JSON の仕様と統合ポータルの方です。Lyre3 Games の Tech／Gameブログも、同じプログラムを移植して使っています。

この仕組みで実際に公開されているサイトです。

- みどり野町 https://oosawak.github.io/midorino-town/
- haru no tane bakery https://oosawak.github.io/haru-no-tane-bakery/
- 果実日和 https://oosawak.github.io/kajitsu-biyori/
- 山形グルメ案内 https://oosawak.github.io/yamagata-gourmet/
- よむきく https://oosawak.github.io/MdYomuKiku/
- 統合ポータル「まちのつながり」 https://oosawak.github.io/community-portal/
- Lyre3 Games Techブログ https://oosawak.github.io/tech/

考え方の背景は、Techブログの記事「ホームページに、WordPressは重すぎるのではないか」に書きました。
https://oosawak.github.io/tech/#/post/tech/homepage-wordpress-heavy

## ライセンス

MIT License（[LICENSE](LICENSE)）。自由に使ってください。
詰まるところがあれば、Issue などで相談してもらっても構いません。
