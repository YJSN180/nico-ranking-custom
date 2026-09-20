# ランキング収集の信頼性と復旧

## 構成と不変条件

- GitHub Actionsの8グループ収集は維持する。外部schedulerはCloudflare Cronで5分ごとに確認し、毎時20分の最新slotだけをworkflow_dispatchする。過去slotは積み上げない。
- GitHub Appは対象repositoryのみ、Actions write / Contents read。個人PATは使わない。
- 8グループ、23ジャンル×2期間、人気タグ別データ、run/attempt/slot、収集日時を検証する。NGの取得・構造検証が失敗したら公開しない。
- タグの1ページ目がHTTP 202かつserver-responseもHTTP_202と「このランキングは準備中です。」を明示した場合のみ、その期間の人気タグ候補から外し、group artifactのunavailableTagsに記録する。空データや新しい取得日時を捏造しない。必須ジャンルの202、タグの2ページ目以降の202、通信・解析エラーは公開を止める。ページ終端は上流paginationを優先し、NG除外後の件数不足を理由に存在しない次ページを取得しない。
- r2-aggregateのタグキャッシュはジョブ内スナップショットとして再利用する。エントリ自体の7日TTLは維持し、同ジョブで補完済みの値を再読込で失わない。KVバックエンドの5分再読込は変更しない。タグ取得は本文受信もタイムアウト対象とする。
- 集約はローカル処理。validated-publication artifactを先に保存してからR2へ書く。
- 新形式はrankings/generations/{runId}-{attempt}/配下にgzip JSONを保存する。全件read-back→metadata→世代manifest→current.jsonの条件付き更新の順。
- current.jsonが存在しないときだけ旧canonical keyを読む。破損したmanifestでは旧形式へ黙って戻らない。公開APIのJSON shapeは変更しない。
- 24時間ランキングの各ジャンル、総合の毎時ランキング、毎時ランキングの全ジャンル合計が前回の50%未満なら公開しない。小規模ジャンルの毎時件数は自然変動が大きいため、単独の半減はhourly-count-driftとして記録し、全体の公開停止にはしない。NG方針変更や上流仕様変更時は人が原因を確認する。
- APIはリクエストごと、statsは更新処理ごとに世代を固定する。公開ランキングは既存のno-storeを維持。X-Ranking-Generationヘッダーで世代を確認できる。
- 世代移行前のstats discoveryもR2一覧のtruncated/cursorを最後まで辿る。過去のタグファイルで1,000件を超えても後方ジャンルを落とさない。一覧の途中失敗・不正cursorでは更新を中止して前回統計を維持する。世代移行後のmanifest経由の読み込みは一覧取得を行わない。
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
npx vitest run __tests__/unit/pipeline-reliability.test.ts __tests__/unit/pipeline-readers.test.ts __tests__/unit/pipeline-tags.test.ts __tests__/unit/pipeline-collection.test.ts __tests__/unit/collect-ranking-items.test.ts __tests__/unit/lib/tag-fetcher-simple.test.ts __tests__/unit/lib/tag-cache-store.test.ts
npm run test:worker:video-stats
npx tsc --noEmit -p tsconfig.pipeline.json
npm run typecheck
npm run typecheck:workers
```

ローカルテストとdry-runは本番受け入れの代替ではない。main反映、GitHub App設定、readerデプロイ、世代publish有効化、scheduler切り替え、7日間監視は別々に完了を記録する。

## 2026-09-20 収集停止の調査

- main b64d52bdbのrun 35425246060 / 35439040597 / 35448762027 / 35459933320では、上流が準備中として返すタグランキングを欠損として判定し、集約・公開を停止していた。最後のrunではgroup 3の65分タイムアウトも併発した。GitHub App認証で起動に失敗した事象ではない。
- 長時間化につながるコード上の問題として、本文受信を制限しないタグ取得タイムアウトと、R2に未反映の同ジョブ内キャッシュを5分後の再読込で失う挙動を修正した。これらだけで65分超過の全原因を説明できたわけではない。
- 読取専用の実データ検証では、本番NGを適用した23ジャンル×2期間の本体取得が完了した。毎時合計は前回15,554件に対し14,294件。play/hourは174件から80件への正当な減少で、旧50%判定はここでも停止したが、新判定は全46組で通過した。
- nature / society / dance / radioは両期間のタグ別取得も検証した。この4ジャンル検証ではNG・タグ補完を省き、準備中タグの除外とページ終端を確認した。本番R2キャッシュを使った別の20動画タグ補完は、初回13.4秒、再実行時は20件すべてキャッシュヒット・外部タグ取得0回だった。
- 通信失敗・不正JSON・必須ランキング欠損・2ページ目以降の準備中は引き続き失敗させる。準備中タグの除外後、旧canonical公開と世代公開の双方で一覧に未取得タグが残らず、既存タグデータを空で上書きしないことをインメモリ公開テストで検証した。
- この調査では本番書込・commit・push・deployは実施していない。GitHub Actionsの8並列・全タグ補完・R2公開・公開後検証の通し実行と、65分以内の完走はmain反映後の受け入れ事項として残る。schedulerのdispatch有効化とは分けて確認する。
- 追加の全量検証で、本番rankings/に2,395キー（本体46組）があるのに、旧stats discoveryが最初の1,000キーで停止する不備も確認した。後続ページの本体を含める処理と、一覧取得失敗時のfail-closedを追加した。この修正にはvideo-stats-updaterの明示デプロイが必要で、収集スクリプトのmain反映だけでは有効にならない。

### 同日の全量・非公開リハーサル

- Node 20.20.0で本番の収集CLIを8プロセス起動し、実際のランキング、本番NG、本番R2タグキャッシュを読み取り、タグ詳細補完も有効にした。全8グループ成功、最長42分46秒。23ジャンル×2期間の本体40,085件、344タグランキング64,091件（いずれも重複込み）を取得した。この回は準備中タグの発生・除外は0件であり、202分岐は別の再現テストで確認している。
- 設定はworkflowの既定値を使用した。GitHub secretsの非公開の上書き値やGitHub runnerの実行環境を再現したものではなく、GitHub Actionsでも65分以内と保証する結果ではない。
- 実際の集約CLIとpublishRankingを使い、旧canonical形式と世代形式の両方でgzip保存・read-back・公開順を検証した。API Gatewayの実ハンドラに各形式390通りのランキングとmetadataを読み込ませ、動画ID列・件数・タグ一覧・更新日時・世代ヘッダーを照合した。R2はローカルのテスト用bindingであり、本番に公開してはいない。
- 動画統計Workerの実ハンドラと実Snapshot APIで、両形式とも27,994動画の統計を取得し、読取時の本番値10,701件に対する50%閾値と更新日時の前進を確認した。旧形式は本番キー一覧2,395件を再現した3ページを辿り、本体46組をすべて読んだ。世代形式は一覧取得0回で同じ46組を読んだ。KV更新はローカルbindingのみ。
- accumulate-tags / write-to-r2 / sync-ranking-auxiliary / merge-tag-cache-deltas-to-r2 / record-pipeline-statusの5本の実CLIも成功。SDK・fetchの書込先だけをローカルに退避して497書込を記録し、390ランキング、KV補助コピー3組、派生NG6,496件、タグキャッシュ8 artifact・100 shard・差分24,759件を照合した。ランキング本体の後にmetadataが保存されること、補助同期のfailed=falseも確認した。
- HTTPのGET/HEAD以外を拒否する検証用ガードを併用し、本番R2/KVへの書込、Workerの本番trigger、commit・push・deployは実施していない。検証用スクリプトと結果はgitignore対象のtmp/pipeline-acceptance/1789907307933に保存した。これはローカルの実行IDであり、GitHubのrun IDではない。
- Worker回帰テスト29件、Workerビルド・構文チェック、Wrangler deploy --dry-runは成功。R2一覧の後続ページ失敗・不正cursorで前回統計を維持するテストを含む。Cloudflare runtime上の実動作、本番初回公開、次回定期実行、公開UI/APIの更新確認は未完了で、main反映と明示Workerデプロイの後に確認する。
