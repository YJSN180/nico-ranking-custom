# ランキング収集の信頼性と復旧

## 構成と不変条件

- GitHub Actionsの8グループ収集は維持する。外部schedulerはCloudflare Cronで5分ごとに確認し、毎時20分の最新slotだけをworkflow_dispatchする。過去slotは積み上げない。
- GitHub Appは対象repositoryのみ、Actions write / Contents read。個人PATは使わない。
- 8グループ、23ジャンル×2期間、人気タグ別データ、run/attempt/slot、収集日時を検証する。NGの取得・構造検証が失敗したら公開しない。
- 集約はローカル処理。validated-publication artifactを先に保存してからR2へ書く。
- 新形式はrankings/generations/{runId}-{attempt}/配下にgzip JSONを保存する。全件read-back→metadata→世代manifest→current.jsonの条件付き更新の順。
- current.jsonが存在しないときだけ旧canonical keyを読む。破損したmanifestでは旧形式へ黙って戻らない。公開APIのJSON shapeは変更しない。
- 個々のジャンル/期間が前回の50%未満なら公開しない。正当な大幅減少も停止するため、NG方針変更や上流仕様変更時は人が原因を確認する。
- APIはリクエストごと、statsは更新処理ごとに世代を固定する。公開ランキングは既存のno-storeを維持。X-Ranking-Generationヘッダーで世代を確認できる。
- stats更新はR2 leaseで重複を抑止し、書き込み直前に世代とleaseを再確認する。KVの公開schemaは維持し、対応世代はpipeline/video-stats-source.jsonに記録する。
- KVとR2の間に原子的トランザクションはない。KV書き込み直後の世代切り替えやsidecar失敗はあり得る。世代とupdatedAtの照合で検知し、次回更新で回復する。
- KV補助コピー、派生NG、タグキャッシュの失敗は公開済みランキングを巻き戻さない。ただしworkflowは失敗とし、pipeline/auxiliary.jsonにも状態を残す。
- タグ累積も共通R2 clientで既存値を読む。読取失敗時の空リスト初期化は禁止し、manual backfillと定期公開は同じGitHub concurrency groupで直列化する。

## 安全な導入順序

1. PRでCIを通してmainへ反映する。現時点で新schedulerはDISPATCH_ENABLED=false、世代publishはRANKING_GENERATIONS_ENABLED=false。GitHubの毎時20分cronを維持する。
2. 実際のroutingとbindingをCloudflareで確認する。2026-09-19のlive設定はworkers/wrangler-green.tomlと一致する（compatibility_date=2024-12-01、rate limit=20/分）。rootのwrangler-green.tomlは異なるため、そのまま本番に使わない。古いbackup workerを配信先にしない。
3. green APIとvideo-stats-updaterを先に明示デプロイする。legacy状態で/API・gzip・stats更新を確認する。statsはtop-level環境を明示する。
4. GitHub repository variable RANKING_GENERATIONS_ENABLED=trueを設定し、手動1サイクルを成功させる。current.json、公開APIのヘッダー、stats sidecar、post-publish artifactが同じ世代であることを確認する。
5. 専用GitHub Appを作成・対象repositoryにinstallし、schedulerのGITHUB_APP_ID / GITHUB_INSTALLATION_ID / GITHUB_APP_PRIVATE_KEYをWrangler secretで設定する。秘密鍵はログ・リポジトリ・タスク本文に載せない。
6. SENTRY_WORKER_DSNをschedulerに設定する。Sentryのranking-pipeline-watchdog monitorにmissed/failed check-in通知と宛先を設定する。停止検知を試す。任意の独立heartbeat URLをDEADMAN_URLにも設定可能。監視Workerだけでは自身の停止を検知できない。
7. schedulerをDISPATCH_ENABLED=falseでデプロイし、health・Sentry check-in・通知回復を確認する。続いてDISPATCH_ENABLED=trueへ切り替える。
8. 外部dispatchからの1サイクル成功を確認してから、repository variable RANKING_EXTERNAL_SCHEDULER_ENABLED=trueでGitHub schedule起点の実処理を停止する。cron宣言は復旧用に残るがprepare以降はskipする。
9. 7日間の受け入れ確認後、古い世代のcleanupを定期運用する。切り替え前にcronを先に止めない。

読取互換デプロイのdry-run:

```sh
npx wrangler deploy --dry-run -c workers/wrangler-green.toml
npx wrangler deploy --dry-run -c workers/video-stats-updater/wrangler.toml --env=""
npx wrangler deploy --dry-run -c workers/ranking-scheduler/wrangler.toml
```

実デプロイでは既存のscripts/wrangler-with-token.shを使用し、dry-runを外す。既存secretを取得・表示する必要はない。新Workerはsecret設定・通知設定まで終わって初めて運用可能。

## 再試行と障害の分類

- 408/429/500/502/503/504、一時的な通信切断・タイムアウト: 最大5回、待機予算180秒、jitterとRetry-After。各通信20秒。認証・権限・データ破損は即失敗。
- R2公開は最大8並列。成功済みのimmutable objectは再アップロードしない。current.jsonのETag競合時は別runの公開を上書きしない。
- 収集グループは65分で明示失敗、jobは70分。正常終了してartifactがない場合もActions側で失敗。9月1日の欠損原因自体が再現できたという意味ではない。
- schedulerは稼働中runをcancelせず待機する。100分超ならstalledを通知。送信記録を先にR2へ保存し、応答が失われても15分間は再送しない。slotごと最大2回。
- 同slotの失敗runはrerun-failed-jobs。成功グループのartifactを再利用する。補助同期が失敗した場合も後段jobだけ再試行する。
- GitHub自体が停止・runner不足の場合、dispatch成功だけでは収集成功にならない。鮮度監視で別途検知する。

集約済みartifactからの再公開:

```sh
gh workflow run update-ranking-parallel.yml --ref main -f resume_run_id=RUN_ID
```

対象は同workflow・mainの信頼できるrun、収集開始から120分以内。再開先で元runIdも照合する。より新しい世代が公開済みなら古いartifactで戻さず、新規収集する。同一世代は冪等なので、公開後の検証・補助同期をやり直せる。

## 切り戻しと保持

障害時はまずDISPATCH_ENABLED=false、RANKING_EXTERNAL_SCHEDULER_ENABLED=trueにして新規収集を止める。稼働中runが終了したことを確認する。

```sh
npx tsx scripts/manage-ranking-generations.ts rollback GENERATION
npx tsx scripts/manage-ranking-generations.ts rollback GENERATION --apply
npx tsx scripts/manage-ranking-generations.ts cleanup
npx tsx scripts/manage-ranking-generations.ts cleanup --apply
```

- 既存の承認済みenv経路でR2認証を渡す。通常はdry-run。--applyだけが公開先更新/削除を行う。
- rollbackは保存済みmanifestと全ranking/tagの存在を確認し、current.jsonをCAS更新する。日時を「今」に偽装しないため、古い世代への復旧はstale警告を残す。
- cleanupは7日より古い世代だけ。現在と直前の世代、最近更新された未完了世代、未知のキーは削除しない。rollbackとcleanupはmaintenance leaseで排他。
- 新形式開始後にRANKING_GENERATIONS_ENABLED=falseへ戻すとwriterは意図的に失敗する。current.jsonを削除したり旧readerを再デプロイして戻さない。新readerを保持し、公開先だけ切り戻す。
- 起動経路だけ戻す場合はschedulerを停止し、GitHub側RANKING_EXTERNAL_SCHEDULER_ENABLED=falseへ戻す。

## 監視と受け入れ

- Cloudflare側: 公開から90分でstale、120分でcritical、収集開始から150分でsource-stale。statsは15分以内かつ非ゼロ、前回健全値の50%以上。
- 新公開の10分後にはstats世代/updatedAt、補助同期世代、公開APIの収集日時が一致すること。KVの伝播遅延は猶予内で扱う。
- 通知は異常分類の変化と回復時。health状態は世代・件数・分類が変わるときのみR2へ書く。毎pollのKVログ書き込みは追加しない。
- GitHubの3時間監視も補助として残すが、GitHub cron遅延時の主監視にはしない。
- 7日間: 各slotのdispatch時刻、実開始、収集完了、publish、stats反映を比較する。重複公開ゼロ、未公開世代の露出ゼロ、120分超の未通知停止ゼロを確認する。
- 500/504、欠損artifact、NG失敗、R2途中失敗、CAS競合、stats急減、監視停止を試験する。GitHub/Cloudflare本番障害注入は通常のunit testとは区別し、無断で行わない。
- コストはR2の世代保存・read-back分が増える。KVランキング補助コピーは1回3キーを維持。schedulerは5分ごとの少量R2/KV読取で、実測の操作数・保存量・Worker CPUを導入後に確認する。

## ローカル検証

```sh
npx vitest run __tests__/unit/pipeline-reliability.test.ts __tests__/unit/pipeline-readers.test.ts __tests__/unit/pipeline-tags.test.ts
npm run test:worker:video-stats
npx tsc --noEmit -p tsconfig.pipeline.json
npm run typecheck
npm run typecheck:workers
```

ローカルテストとdry-runは本番受け入れの代替ではない。main反映、GitHub App設定、readerデプロイ、世代publish有効化、scheduler切り替え、7日間監視は別々に完了を記録する。
