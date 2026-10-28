# 必要なツールと動作確認

デザイン変更の指示例は [デザインを変えるためのガイド](DESIGN_CUSTOMIZATION.md) を参照してください。

## 何を用意するか

| ツール | 使う場面 | 必要性 |
|---|---|---|
| Webブラウザ | サイト・プレビューを開く。開発者ツールで画面幅を変える | 必須 |
| テキストエディタ | Markdown、YAML、HTMLを作るJavaScript、CSSを編集 | 必須。普段のエディタで可 |
| Python | MarkdownからJSONと公開サイトを生成 | ローカルでビルドする場合に必要。Actionsは3.12を使用 |
| Node.js | `scripts/test_frontend.cjs` を実行して表示処理を確認 | このテストを実行する場合に必要 |
| Git | ソース取得、変更履歴の保存、GitHubへのpush | Gitで管理・公開する場合に必要 |
| GitHubアカウント | リポジトリを置き、ActionsとPagesで公開 | この公開方法を使う場合に必要 |
| AIコーディングツール | DESIGN.mdを読み、テンプレートやCSSを編集 | AIへ制作を依頼する場合に必要。手作業でも変更可能 |

エディタの例は [Visual Studio Code](https://code.visualstudio.com/docs/getstarted/overview) です。
AIツールは、プロジェクトのファイルを読んで編集し、コマンドを実行できるものを使うと、制作から確認まで依頼できます。
URLを渡す場合はWebを読めることも確認し、読めなければDESIGN.mdをファイルやテキストで渡します。
チャットで回答するだけのツールを使う場合は、提案された変更を自分でファイルに反映します。

Pythonのパッケージはこのプロジェクトの仮想環境へインストールします。
仮想環境の役割と作成方法は [Python公式のvenv資料](https://docs.python.org/3/library/venv.html) を参照してください。
Node.jsとGitの入手先は [Node.js公式](https://nodejs.org/en/download) と [Git公式](https://git-scm.com/downloads/) です。

このCMSのビルドに `npm install` は不要です。Node.jsはフロントエンドの動作確認用に使います。
AIサービスの契約・認証が必要かどうかは利用するツールによります。
サイト自体の実行にはAI APIキー、データベース、常時起動するアプリケーションサーバーは不要です。

## 最初の準備

ソースを取得し、`README.md` があるフォルダでターミナルを開きます。
GitHubのZIPを展開したフォルダでもローカルのビルドはできます。

macOS / Linux:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
```

Windows PowerShell（仮想環境を有効化せず、そのPythonを直接使う例）:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

以下のコマンドは、macOS/Linuxでは仮想環境を有効にして実行します。
Windowsでは `python` を `.\.venv\Scripts\python.exe` に置き換えて実行できます。

## ビルドして確認する

```bash
python scripts/build.py
python -m unittest discover -s scripts -p 'test_*.py'
node scripts/test_frontend.cjs
python scripts/export_preview.py
```

| コマンド | 何をするか |
|---|---|
| `build.py` | 記事・設定・デザインから `dist/` を生成 |
| `unittest` | 生成データとデザイン取り込みなどを確認 |
| `test_frontend.cjs` | ページ遷移、テンプレート切り替え、固定表示を確認 |
| `export_preview.py` | データ・画像・コードを含む `dist/preview.html` を作成 |

生成した `dist/preview.html` をブラウザで開くと、サーバーなしで確認できます。
リポジトリ直下の `preview.html` は公開用に保存された生成物です。
編集中は、再ビルドした **`dist/preview.html`** を開いてください。

Node.jsのテストはブラウザを起動するテストではなく、表示処理を模擬環境で検証します。
文字のはみ出しや写真の切れ方は、ブラウザでも確認してください。
また、現状のテストには `sample` のサイト名や記事データを前提とするものがあります。
自分のサイト名・サイトID・テンプレートを変更した場合は、テストも変更後の内容に合わせます。
英語のサイト名とヒーロー画像を前提とするPythonテストもあるため、翻訳・画像の有無を変えた場合は同様に調整します。

## 通常の公開形式でも確認する

```bash
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

起動後に `http://127.0.0.1:8000/` をブラウザで開きます。終了はターミナルでCtrl-Cです。
`dist/index.html` をファイルとして直接開くと、JSONの取得がブラウザに制限される場合があるため、
通常形式はこのローカルサーバーで確認します。

デモの切り替えも手元で試す場合は、YAMLを `theme_switcher: true` にして再ビルドします。
公開用設定を固定表示のまま維持したい場合は、一時的に環境変数で上書きできます。

macOS / Linux:

```bash
THEME_SWITCHER=true python scripts/build.py
python scripts/export_preview.py
```

Windows PowerShell:

```powershell
$env:THEME_SWITCHER = 'true'
.\.venv\Scripts\python.exe scripts/build.py
Remove-Item Env:THEME_SWITCHER
.\.venv\Scripts\python.exe scripts/export_preview.py
```

## ブラウザで見る項目

- 一覧・記事詳細・サイト紹介を開けるか
- 検索とカテゴリ絞り込み、言語切り替えが動くか
- 本文・表・コード・画像が画面からはみ出さないか
- PC幅とスマートフォン幅の両方で読めるか
- 切り替えONなら、記事表示中でもテーマを変更できるか
- 切り替えOFFなら、保存済みのテーマ選択より設定の `template` が優先されるか
- タブ名・アイコン・ヘッダー・フッターが自分のサイトになっているか

## 公開時の仕組み

自分のリポジトリへソースをpushすると、`.github/workflows/build.yml` がビルドとテストを実行し、
成功すると `data/`・`docs/`・`preview.html` を更新します。
GitHub Pagesの公開元は `main` ブランチの `/docs` にします。
ZIPから始めた場合は、まず自分のGitHubリポジトリにソースを登録してください。

Actionsが生成物をcommitするため、リポジトリ側でActionsの書き込みが許可されていることも確認します。
公開されない場合は、Actionsの実行結果とPages設定を確認してください。
