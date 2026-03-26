# Threads 投稿自動生成ツール

YouTube台本をインプットに、Threads投稿案をAI（Gemini）で自動生成するツール。

## 機能

- YouTube台本からThreads投稿案を自動生成（3案/回）
- 文体・トーンをYAMLでカスタマイズ可能
- 過去テーマとの重複チェック
- Google Spreadsheetへの下書き保存
- GitHub Actionsでの自動実行
- Threads APIへの直接投稿

## セットアップ

### 1. 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成:

```bash
cp .env.example .env
```

最低限必要な設定:
- `GEMINI_API_KEY`: [Google AI Studio](https://aistudio.google.com/) で取得
- `THREADS_ACCESS_TOKEN`: Meta Developer App から取得（下記参照）
- `THREADS_USER_ID`: Threads プロフィールのID

### 3. Threads API のセットアップ

1. [Meta for Developers](https://developers.facebook.com/) でアプリを作成
2. 「Threads API」を追加
3. テストユーザーとして自分のアカウントを登録
4. OAuth認証でアクセストークンを取得
5. 短期トークンを長期トークン（60日）に交換
6. `.env` の `THREADS_ACCESS_TOKEN` に設定

### 4. 文体のカスタマイズ（任意）

`config/style_default.yaml` をコピーして `config/style_user.yaml` を作成:

```bash
cp config/style_default.yaml config/style_user.yaml
```

`style_user.yaml` を編集して、自分のスタイルに合わせてカスタマイズ。

## 使い方

### 基本: ファイルから台本を読み込み

```bash
# data/scripts/ フォルダに台本テキストを配置して実行
python main.py

# または、ファイルパスを直接指定
python main.py --script path/to/script.txt
```

### 標準入力から台本を入力

```bash
python main.py --stdin
```

### GitHub Actions で実行

```bash
gh workflow run generate-posts.yml
```

### Threads に投稿（手動）

```python
from publishers.threads_publisher import post_to_threads
result = post_to_threads("投稿テキスト")
```

## トークンのリフレッシュ

Threads APIのアクセストークンは **60日で失効** します。
GitHub Actions で毎週月曜に自動リフレッシュジョブが走りますが、
新しいトークンは手動で GitHub Secrets に更新する必要があります。

```bash
# 手動でリフレッシュ
gh workflow run refresh-token.yml
```

## ディレクトリ構成

```
threads-post-generator/
├── main.py                    # エントリーポイント
├── config/
│   ├── settings.py            # 設定値管理
│   ├── style_default.yaml     # デフォルト文体設定
│   └── style_user.yaml        # ユーザー文体設定（.gitignore）
├── auth/
│   └── threads_auth.py        # OAuth + トークン管理
├── collectors/
│   └── script_loader.py       # YouTube台本読み込み
├── generators/
│   └── post_generator.py      # Gemini投稿生成
├── publishers/
│   └── threads_publisher.py   # Threads 2ステップ投稿
├── analyzers/
│   ├── duplicate_detector.py  # 重複チェック
│   └── cta_scheduler.py       # CTA頻度管理
├── outputs/
│   ├── csv_writer.py          # CSV保存
│   └── sheets_writer.py       # Spreadsheet保存
├── data/
│   └── scripts/               # 台本ファイル置き場
└── .github/workflows/
    ├── generate-posts.yml     # 投稿生成ワークフロー
    └── refresh-token.yml      # トークンリフレッシュ
```
