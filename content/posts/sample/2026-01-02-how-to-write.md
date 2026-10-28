---
title: 記事の書き方
date: '2026-01-02'
category: 使い方
summary: Markdownファイルの先頭に付ける情報（タイトル・日付・カテゴリーなど）と、本文の書き方を説明します。
cover: sample/festival.webp
cover_alt: お祭りの屋台が並ぶイラスト
type: article
---

記事は、1記事につき1つの Markdown ファイルです。置き場所は `content/posts/sample/` で、ファイル名は `YYYY-MM-DD-<slug>.md` の形にします。

## 先頭の情報（frontmatter）

ファイルの先頭に、その記事の情報を書きます。

```
---
title: 記事のタイトル
date: '2026-01-02'
category: 使い方
summary: 一覧に表示される短い要約
cover: sample/festival.webp
cover_alt: カバー画像の説明文
type: article
---
```

- `cover` の画像は `content/images/sample/` に置き、`sample/<ファイル名>` の形で指定します
- `slug` は記事のURLの一部になります。半角英数字とハイフンで付けます

## 本文

本文は Markdown で書きます。見出しは `##`、箇条書きは `-`、リンクは `[文字](URL)` です。

書き終わったら GitHub に push してください。数分でサイトに反映されます。反映の途中でエラーがあれば、GitHub Actions のログに理由が出ます。
