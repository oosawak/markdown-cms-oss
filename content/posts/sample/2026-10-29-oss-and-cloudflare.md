---
title: OSS版は自由に。開発を続けるCloudflare版もあります
subtitle: MarkdownCMSの使い方と、ご相談窓口
date: '2026-10-29'
category: このサイトについて
summary: MarkdownCMSのOSS版は、MITライセンスで自由に改変してご利用いただけます。開発を継続しているCloudflare版と、ご利用・導入のご相談先をご案内します。
cover: sample/hero.webp
cover_alt: MarkdownCMSサンプルサイトの風景
type: article
---

このサイトは、**MarkdownCMSのOSS版**のサンプルです。\
Markdownで記事を書き、GitHubへpushすると、GitHub Actionsで公開用のデータを生成し、GitHub Pagesから配信します。

## OSS版は、自由に改変してご利用ください

OSS版は、MITライセンスでソースコードを公開しています。\
自分のサイトに合わせてデザインや機能を変えたり、個人のブログやお仕事のサイトに使ったり、自由に改変してご利用ください。

ご利用・再配布の際は、同梱のLICENSEにある著作権表示とライセンス表示を残してください。依存ライブラリや第三者素材についても、それぞれの利用条件をご確認ください。

- [OSS版のソースコードと使い方](https://github.com/oosawak/markdown-cms-oss)
- [MITライセンス](https://github.com/oosawak/markdown-cms-oss/blob/main/LICENSE)

OSS版は、現在公開しているものを一区切りとし、今後の機能開発はCloudflare版を中心に進めています。\
OSS版をご自身で導入する場合は、設定や運用、必要な修正もご自身で行う形になります。

## 開発を継続しているCloudflare版

Cloudflare版は、商用版として開発を続けています。記事の更新方法に合わせて、次の2つの構成があります。

### GitHubで更新し、Cloudflare Pagesから配信

Markdownの記事や画像をGitHubで管理し、pushするとCloudflare Pagesで生成・公開します。\
OSS版と同じようにGitHubで更新しながら、公開先にCloudflareを使う構成です。

- [Cloudflare版：GitHub更新型のサイトを見る](https://markdown-cms-git.pages.dev/)
- [GitHub更新型の紹介記事を読む](https://markdown-cms-git.pages.dev/#/post/sample/github-cloudflare-guide)

### R2で更新し、Cloudflare Workersから配信

Markdownの記事や画像をCloudflare R2へ保存すると、Cloudflare内で公開用のデータを生成し、サイトへ反映します。\
日々の記事更新のために、GitHubアカウントやリポジトリを用意する必要はありません。

初回のCloudflare設定と認証を済ませたうえで、管理画面や接続を設定したAI・対応ツールから記事を追加・修正する使い方です。

- [Cloudflare版：R2更新型のサイトを見る](https://markdown-cms-r2.oosawak.workers.dev/)
- [R2版の詳しい紹介を読む](https://markdown-cms-r2.oosawak.workers.dev/#/post/sample/cloudflare-r2-development)

## Cloudflare版を使ってみたい方へ

Cloudflare版のご利用や導入、デザインについてご興味のある方は、お気軽にご連絡ください。\
作りたいサイトや記事の更新方法を伺いながら、ご相談できればと思います。

**お問い合わせ：[oosawak@lyre3.com](mailto:oosawak@lyre3.com)**

Cloudflare版は開発中の商用版です。提供内容や料金・条件については、お問い合わせの際にご相談ください。
