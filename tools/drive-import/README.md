# Drive → GitHub 取り込み（Apps Script）

Google Driveのフォルダに置いたMarkdownを、GitHubリポジトリの `content/posts/<site>/` にそのまま反映する橋渡しスクリプトです。**Markdown CMS本体の作りは変えません。** スクリプトの役割は「Driveフォルダの鏡をGitHubのコンテンツフォルダに作る」ことだけです。

```
Drive（サイト別フォルダ → カテゴリー別フォルダ → .md）
   │  Apps Script が定期チェック（設置アカウントの権限で実行）
   ▼
GitHub content/posts/<site>/ に同じファイル名で commit
   │  既存の GitHub Actions 自動ビルド
   ▼
公開サイトに反映
```

- 編集者はGoogleグループ経由でフォルダにアクセスし、.mdを編集するだけ。スクリプトの存在は意識しません
- frontmatter が無い .md には、ファイル名・フォルダ名・本文から最小限の frontmatter を補います
- 変更の検知はGitのblobハッシュ比較。変わっていないファイルはcommitしません
- Driveから消えた記事は、設定 `deleteRemoved` が true のときだけ GitHub 側も削除します（既定は false＝保留してログに残す）

## セットアップ（運営アカウントで1回だけ）

1. https://script.google.com で新規プロジェクトを作成
2. このフォルダの `Code.gs` の内容をエディタに貼り付け、`appsscript.json` は「プロジェクトの設定 → マニフェストをエディタで表示」を有効にしてから貼り付け
   - 将来は clasp でこのリポジトリから push する運用に移行できます（コードの正本はこのリポジトリ）
3. GitHubで fine-grained personal access token を発行
   - 対象リポジトリ: このリポのみ / Permissions: Contents = Read and write
4. エディタの「プロジェクトの設定 → スクリプト プロパティ」に追加
   - `GITHUB_TOKEN`: 手順3のトークン（**コードやリポジトリには絶対に入れない**）
   - `CONFIG_JSON`: 下記のJSON（rootFolderId は対象の共有ルートフォルダID）

```json
{
  "rootFolderId": "（DriveフォルダID）",
  "deleteRemoved": false,
  "sites": {
    "みどり野町": {
      "repo": "your-github-name/your-repo",
      "branch": "main",
      "destDir": "content/posts/town",
      "defaultCover": "town/library.webp"
    }
  }
}
```

5. 関数 `checkConfig` を手動実行し、初回承認（Drive読み取り等）を通してログを確認
6. 関数 `importFromDrive` を手動実行して1回通し、GitHubにcommitが入ることを確認
7. 「トリガー」から `importFromDrive` を時間主導型で追加（例：1時間ごと）

## 運用メモ

- 実行ログは Apps Script の「実行数」画面で確認できます（更新対象・補完・削除保留の一覧が出ます）
- 設置アカウントがグループ／組織から外れるとトリガーが止まります。設置は運営用アカウントで行ってください
- サイトを増やすときは `CONFIG_JSON` の `sites` にフォルダ名と対応リポを追加します
