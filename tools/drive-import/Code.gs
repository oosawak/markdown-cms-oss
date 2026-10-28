/**
 * Drive → GitHub 取り込みスクリプト（Markdown CMS / G1）
 *
 * 役割は「鏡」だけです。CMS本体（build.py等）は変更しません。
 * - Driveの「サイト別フォルダ → カテゴリー別フォルダ」内の .md を読む
 * - GitHubリポジトリの content/posts/<site>/ に、同じファイル名で反映する
 * - 変更があった分だけをまとめて1コミットにする（既存の自動ビルドが公開する）
 *
 * 設定は Script Properties に置きます（コードに秘密情報を書かない）:
 *   GITHUB_TOKEN : GitHubのfine-grained PAT（対象リポのContents: Read and write）
 *   CONFIG_JSON  : 下記の形式のJSON
 *     {
 *       "rootFolderId": "Driveの共有ルートフォルダID",
 *       "deleteRemoved": false,
 *       "sites": {
 *         "みどり野町": {
 *           "repo": "your-github-name/your-repo",
 *           "branch": "main",
 *           "destDir": "content/posts/town",
 *           "defaultCover": "town/library.webp"
 *         }
 *       }
 *     }
 */

function importFromDrive() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const config = JSON.parse(props.getProperty('CONFIG_JSON') || '{}');
  if (!token) throw new Error('Script Property GITHUB_TOKEN が未設定です');
  if (!config.rootFolderId || !config.sites) throw new Error('Script Property CONFIG_JSON が未設定です');

  const root = DriveApp.getFolderById(config.rootFolderId);
  const changes = []; // {repo, branch, path, content|null(削除)}
  const perRepo = {}; // repo -> {branch, tree: {path: sha}}

  Object.keys(config.sites).forEach(function (siteFolderName) {
    const site = config.sites[siteFolderName];
    const siteFolders = root.getFoldersByName(siteFolderName);
    if (!siteFolders.hasNext()) {
      Logger.log('サイトフォルダが見つかりません: ' + siteFolderName);
      return;
    }
    const siteFolder = siteFolders.next();
    if (!perRepo[site.repo]) {
      perRepo[site.repo] = { branch: site.branch || 'main', tree: fetchRepoTree_(token, site.repo, site.branch || 'main') };
    }
    const tree = perRepo[site.repo].tree;
    const seen = {};

    const categories = siteFolder.getFolders();
    while (categories.hasNext()) {
      const categoryFolder = categories.next();
      const categoryName = categoryFolder.getName();
      const files = categoryFolder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        const name = file.getName();
        if (!/\.md$/i.test(name)) continue;
        const destPath = site.destDir + '/' + name;
        seen[destPath] = true;
        let content = file.getBlob().getDataAsString('UTF-8');
        content = ensureFrontmatter_(content, name, categoryName, file, site);
        const sha = gitBlobSha_(content);
        if (tree[destPath] !== sha) {
          changes.push({ repo: site.repo, branch: site.branch || 'main', path: destPath, content: content });
          Logger.log('更新対象: ' + destPath);
        }
      }
    }

    // Driveから消えた記事の検出（deleteRemoved=trueのときだけ実際に削除）
    Object.keys(tree).forEach(function (path) {
      if (path.indexOf(site.destDir + '/') === 0 && /\.md$/i.test(path) && !seen[path]) {
        if (config.deleteRemoved) {
          changes.push({ repo: site.repo, branch: site.branch || 'main', path: path, content: null });
          Logger.log('削除対象: ' + path);
        } else {
          Logger.log('Driveに無い記事（削除は無効のため保留）: ' + path);
        }
      }
    });
  });

  if (changes.length === 0) {
    Logger.log('変更なし。終了します。');
    return;
  }

  // リポジトリごとにまとめて1コミット
  const byRepo = {};
  changes.forEach(function (c) {
    const key = c.repo + '@' + c.branch;
    if (!byRepo[key]) byRepo[key] = { repo: c.repo, branch: c.branch, items: [] };
    byRepo[key].items.push(c);
  });
  Object.keys(byRepo).forEach(function (key) {
    const group = byRepo[key];
    commitChanges_(token, group.repo, group.branch, group.items);
    Logger.log(group.repo + ' に ' + group.items.length + ' 件をコミットしました');
  });
}

/** frontmatter が無い .md に最小限の frontmatter を補う（既存があればそのまま） */
function ensureFrontmatter_(content, fileName, categoryName, file, site) {
  if (/^\s*---\s*\n/.test(content)) return content;
  const base = fileName.replace(/\.md$/i, '');
  const dateMatch = base.match(/^(\d{4}-\d{2}-\d{2})-/);
  const date = dateMatch ? dateMatch[1] : Utilities.formatDate(file.getDateCreated(), 'Asia/Tokyo', 'yyyy-MM-dd');
  let title = base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) title = h1[1].trim();
  const firstPara = content.replace(/^#.*$/m, '').trim().split(/\n\s*\n/)[0].replace(/\n/g, ' ').slice(0, 120);
  const fm = [
    '---',
    'title: ' + title,
    "date: '" + date + "'",
    'category: ' + categoryName,
    'summary: ' + (firstPara || title),
    'cover: ' + (site.defaultCover || ''),
    'type: article',
    '---',
    ''
  ].join('\n');
  Logger.log('frontmatterを補完しました: ' + fileName);
  return fm + content;
}

/** Git の blob SHA-1（"blob <bytes>\0" + 本文 のSHA-1）を計算する */
function gitBlobSha_(content) {
  const body = Utilities.newBlob(content, 'text/plain', '').getBytes();
  const header = Utilities.newBlob('blob ' + body.length + '\0', 'text/plain', '').getBytes();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, header.concat(body));
  return digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** リポジトリの全ファイル {path: blobSha} を取得する */
function fetchRepoTree_(token, repo, branch) {
  const res = githubApi_(token, 'GET', '/repos/' + repo + '/git/trees/' + branch + '?recursive=1');
  const map = {};
  (res.tree || []).forEach(function (entry) {
    if (entry.type === 'blob') map[entry.path] = entry.sha;
  });
  return map;
}

/** 変更をまとめて1コミットにする（Git Data API） */
function commitChanges_(token, repo, branch, items) {
  const ref = githubApi_(token, 'GET', '/repos/' + repo + '/git/ref/heads/' + branch);
  const headSha = ref.object.sha;
  const headCommit = githubApi_(token, 'GET', '/repos/' + repo + '/git/commits/' + headSha);
  const baseTree = headCommit.tree.sha;

  const treeEntries = items.map(function (item) {
    if (item.content === null) {
      return { path: item.path, mode: '100644', type: 'blob', sha: null };
    }
    const blob = githubApi_(token, 'POST', '/repos/' + repo + '/git/blobs', {
      content: Utilities.base64Encode(item.content, Utilities.Charset.UTF_8),
      encoding: 'base64'
    });
    return { path: item.path, mode: '100644', type: 'blob', sha: blob.sha };
  });

  const newTree = githubApi_(token, 'POST', '/repos/' + repo + '/git/trees', {
    base_tree: baseTree,
    tree: treeEntries
  });
  const paths = items.map(function (i) { return i.path; }).join(', ');
  const newCommit = githubApi_(token, 'POST', '/repos/' + repo + '/git/commits', {
    message: 'Import from Google Drive: ' + paths,
    tree: newTree.sha,
    parents: [headSha]
  });
  githubApi_(token, 'PATCH', '/repos/' + repo + '/git/refs/heads/' + branch, { sha: newCommit.sha });
}

function githubApi_(token, method, path, payload) {
  const options = {
    method: method.toLowerCase(),
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch('https://api.github.com' + path, options);
  const code = res.getResponseCode();
  const body = res.getContentText() ? JSON.parse(res.getContentText()) : {};
  if (code < 200 || code >= 300) {
    throw new Error('GitHub API ' + method + ' ' + path + ' -> ' + code + ': ' + (body.message || ''));
  }
  return body;
}

/** 設定の確認用（エディタから手動実行してログを見る） */
function checkConfig() {
  const props = PropertiesService.getScriptProperties();
  Logger.log('GITHUB_TOKEN: ' + (props.getProperty('GITHUB_TOKEN') ? '設定済み' : '未設定'));
  const raw = props.getProperty('CONFIG_JSON');
  Logger.log('CONFIG_JSON: ' + (raw ? '設定済み' : '未設定'));
  if (raw) {
    const config = JSON.parse(raw);
    const root = DriveApp.getFolderById(config.rootFolderId);
    Logger.log('ルートフォルダ: ' + root.getName());
    Object.keys(config.sites || {}).forEach(function (name) {
      Logger.log('サイト: ' + name + ' -> ' + config.sites[name].repo + ' ' + config.sites[name].destDir);
    });
  }
}
