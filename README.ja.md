# effect-starter

[English](README.md) | [日本語](README.ja.md)

Effect を基盤とした TypeScript アプリケーションのスターターです。
フロントエンドは任意で、React、TanStack Start、Vue から選べます。
Effect v4、Drizzle、Effect SQL、PostgreSQL、Vite+ を採用しています。ホスティング先はあらかじめ設定していません。

## 作った理由

エージェントがコードを書く機会は、ますます増えています。コードを書かない人も含め、誰もがプロジェクトを始めて開発を続けられるように、
規模が大きくなってもエージェントが一貫した方針で実装できるコードベースを作りたいと考えました。

Effect は、コードをどう拡張していくかの指針になります。ワークフローを型付きの値として表し、失敗を明示し、依存関係を Layer 経由で提供することで、
新しいコードも既存のコードと同じパターンに沿って書けます。Effect のコンパイラープロファイルと VoidZero のツールチェーン
（Vite+、Oxlint、Oxfmt）が、その構造をチェックします。エントリーポイント以外での Effect の実行は lint で検出されます。
さらに `test` では、`AGENTS.md` がなくても、ルールに違反したコードを検出できることを確認します。

こうした仕組みに定型的なレビューや開発基盤の保守を任せることで、プロダクトそのものに時間を使えるようにしています。

## はじめに

```sh
npx --yes https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz
```

[Vite+ をグローバルにインストール](https://viteplus.dev/guide/)している場合は、`vp dlx <同じ URL>` でも実行できます。
`pnx` と `bunx` の使い方は、[CLI ガイド（英語）](packages/create-effect-starter/README.md#launch-with-pnpm-or-bun)を参照してください。

ウィザードでは、次の項目を選びます。

- **スターター:** React（TanStack Router と Query）、TanStack Start（サーバーレンダリング）、
  Vue（Vue Router と TanStack Query）、またはフロントエンドなし。
  フロントエンドなしは、エージェント、CLI、ほかのサービスから呼び出す API サーバーやバックエンド向けです。
  どの構成でも、同じ Effect API とコントラクトを使用します。
- **パッケージマネージャー:** pnpm または Bun。
- **API ランタイム:** Node.js または Bun。Vite+ と各種チェックは、常に Node.js 上で実行します。

CLI、MCP サーバー、エージェント、独自のハーネスを作る場合は、フロントエンドなしで始め、
専用の `main.ts` エントリーポイントを持つアプリを `apps/` 配下に追加してください。
その後、`vite.config.ts` の `starter/runtime-boundary` のオーバーライド対象にそのアプリを追加すると、
そのアプリでも Effect の実行場所をエントリーポイントに限定する lint ルールが適用されます。

## アプリの実行と検証

`apps/api/.env` に `DATABASE_URL` を設定します。

API は Effect の設定プロバイダーで `.env` を読み込み、環境変数の値を優先します。
ファイルは省略できますが、必須の設定値がない場合、値が不正な場合、
ファイルの読み込みに失敗した場合は起動に失敗します。
`.env` を編集した後は API を再起動してください。

続いて、次のコマンドを実行します。

| 操作                   | pnpm                | Bun                |
| ---------------------- | ------------------- | ------------------ |
| マイグレーションを生成 | `pnpm db:generate`  | `bun db:generate`  |
| マイグレーションを適用 | `pnpm db:migrate`   | `bun db:migrate`   |
| Web と API を起動      | `pnpm dev`          | `bun dev`          |
| Lint                   | `pnpm lint`         | `bun lint`         |
| フォーマットを確認     | `pnpm format:check` | `bun format:check` |
| 型チェック             | `pnpm typecheck`    | `bun typecheck`    |
| テスト                 | `pnpm test`         | `bun run test`     |
| 本番用ビルド           | `pnpm build`        | `bun run build`    |

Bun の `test` と `build` は組み込みコマンドと名前が重なるため、スクリプトを実行するには `run` が必要です。
Vite+ をグローバルにインストールしている場合は、`vp run <スクリプト名>` でも同じスクリプトを実行できます。
`vp lint` や `vp check` を直接実行すると、Effect のルールを事前に準備しないため、違反を見逃す可能性があります。
デプロイ方法やフレームワーク固有の注意点は、生成されたアプリの README を参照してください。

## スターター自体の開発

```sh
git clone https://github.com/yuyays/effect-starter.git
cd effect-starter
pnpm install
pnpm create:app
```

出力先に `../my-app` と入力すると、チェックアウトしたディレクトリの隣にアプリを生成できます。
フラグ、テスト、依存関係の更新、リリースについては、[CLI・メンテナンスガイド（英語）](packages/create-effect-starter/README.md)を参照してください。
Effect の実装規約は [AGENTS.md](AGENTS.md) に記載しています。

[MIT ライセンス](LICENSE)
