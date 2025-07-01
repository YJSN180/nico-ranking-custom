const https = require('https');

// Cloudflare GraphQL APIエンドポイント
const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

// GraphQLクエリを実行する関数
async function queryGraphQL(query, variables, apiToken) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: 'api.cloudflare.com',
      port: 443,
      path: '/client/v4/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`GraphQL request failed: ${res.statusCode} - ${responseData}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// R2のメトリクスを取得
async function getR2Metrics(accountTag, apiToken, timeRange = '30d') {
  const now = new Date();
  const endDate = now.toISOString();
  
  // 時間範囲を設定（正確なデータ取得のため）
  let hoursBack;
  switch (timeRange) {
    case '1h': hoursBack = 1; break;
    case '3h': hoursBack = 3; break;
    case '24h': hoursBack = 24; break;
    case '7d': hoursBack = 24 * 7; break;
    case '30d': hoursBack = 24 * 30; break;
    default: hoursBack = 24 * 30; // デフォルト30日
  }
  
  const startDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000).toISOString();

  // R2ストレージクエリ
  const storageQuery = `
    query R2StorageMetrics($accountTag: string!, $startDate: Time, $endDate: Time) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2StorageAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $startDate
              datetime_leq: $endDate
            }
            orderBy: [datetime_DESC]
          ) {
            max {
              objectCount
              payloadSize
              metadataSize
            }
          }
        }
      }
    }
  `;

  // R2オペレーションクエリ
  const operationsQuery = `
    query R2OperationsMetrics($accountTag: string!, $startDate: Time, $endDate: Time) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2OperationsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $startDate
              datetime_leq: $endDate
            }
          ) {
            sum {
              requests
            }
            dimensions {
              actionType
            }
          }
        }
      }
    }
  `;

  const variables = { accountTag, startDate, endDate };

  try {
    const [storageResult, operationsResult] = await Promise.all([
      queryGraphQL(storageQuery, variables, apiToken),
      queryGraphQL(operationsQuery, variables, apiToken)
    ]);

    const storage = storageResult.data?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups?.[0]?.max || {};
    const operations = operationsResult.data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups || [];

    // オペレーションをタイプ別に集計
    const operationsByType = {};
    let totalOperations = 0;
    
    operations.forEach(op => {
      const type = op.dimensions.actionType;
      const count = op.sum.requests;
      operationsByType[type] = (operationsByType[type] || 0) + count;
      totalOperations += count;
    });

    return {
      storage: {
        objectCount: storage.objectCount || 0,
        totalSize: (storage.payloadSize || 0) + (storage.metadataSize || 0),
        payloadSize: storage.payloadSize || 0,
        metadataSize: storage.metadataSize || 0
      },
      operations: {
        total: totalOperations,
        byType: operationsByType
      }
    };
  } catch (error) {
    console.error('Failed to fetch R2 metrics:', error);
    return null;
  }
}

// KVのメトリクスを取得
async function getKVMetrics(accountTag, apiToken, timeRange = '30d') {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0]; // YYYY-MM-DD形式
  
  // 時間範囲を設定（正確なデータ取得のため）
  let daysBack;
  switch (timeRange) {
    case '1h': 
    case '3h': 
    case '24h': daysBack = 1; break; // KVは日単位のため最低1日
    case '7d': daysBack = 7; break;
    case '30d': daysBack = 30; break;
    default: daysBack = 30; // デフォルト30日
  }
  
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // KVストレージクエリ
  const storageQuery = `
    query KVStorageMetrics($accountTag: string!, $start: Date, $end: Date) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          kvStorageAdaptiveGroups(
            filter: { date_geq: $start, date_leq: $end }
            limit: 10000
            orderBy: [date_DESC]
          ) {
            max {
              keyCount
              byteCount
            }
          }
        }
      }
    }
  `;

  // KVオペレーションクエリ
  const operationsQuery = `
    query KVOperationsMetrics($accountTag: string!, $start: Date, $end: Date) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          kvOperationsAdaptiveGroups(
            filter: { date_geq: $start, date_leq: $end }
            limit: 10000
          ) {
            sum {
              requests
            }
            dimensions {
              actionType
            }
          }
        }
      }
    }
  `;

  const variables = { accountTag, start: startDate, end: endDate };

  try {
    const [storageResult, operationsResult] = await Promise.all([
      queryGraphQL(storageQuery, variables, apiToken),
      queryGraphQL(operationsQuery, variables, apiToken)
    ]);

    const storage = storageResult.data?.viewer?.accounts?.[0]?.kvStorageAdaptiveGroups?.[0]?.max || {};
    const operations = operationsResult.data?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups || [];

    // オペレーションをタイプ別に集計
    const operationsByType = {};
    let totalOperations = 0;
    
    operations.forEach(op => {
      const type = op.dimensions.actionType;
      const count = op.sum.requests;
      operationsByType[type] = (operationsByType[type] || 0) + count;
      totalOperations += count;
    });

    return {
      storage: {
        keyCount: storage.keyCount || 0,
        totalSize: storage.byteCount || 0
      },
      operations: {
        total: totalOperations,
        byType: operationsByType
      }
    };
  } catch (error) {
    console.error('Failed to fetch KV metrics:', error);
    return null;
  }
}

// メトリクスを収集
async function collectAllMetrics(timeRange = '30d') {
  const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  
  if (!accountTag || !apiToken) {
    throw new Error('Missing required environment variables: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN');
  }

  const [r2Metrics, kvMetrics] = await Promise.all([
    getR2Metrics(accountTag, apiToken, timeRange),
    getKVMetrics(accountTag, apiToken, timeRange)
  ]);

  return {
    timestamp: new Date().toISOString(),
    timeRange,
    r2: r2Metrics,
    kv: kvMetrics
  };
}

// 使用率を計算
function calculateUsagePercentage(current, limit) {
  return Math.round((current / limit) * 100);
}

// 無料枠の制限
const FREE_TIER_LIMITS = {
  r2: {
    storage: 10 * 1024 * 1024 * 1024, // 10GB in bytes
    classA: 1000000, // 100万回/月
    classB: 10000000 // 1000万回/月
  },
  kv: {
    storage: 1 * 1024 * 1024 * 1024, // 1GB in bytes
    reads: 100000, // 10万回/日
    writes: 1000, // 1000回/日
    deletes: 1000, // 1000回/日
    lists: 1000 // 1000回/日
  }
};

// メイン処理
async function main() {
  try {
    // コマンドライン引数から時間範囲を取得（デフォルト：30日）
    const timeRange = process.argv[2] || '30d';
    console.error(`Collecting metrics for time range: ${timeRange}`);
    
    const metrics = await collectAllMetrics(timeRange);
    
    // メトリクス取得が失敗した場合はエラーとして扱う
    if (!metrics.r2 || !metrics.kv) {
      console.error('Failed to collect metrics: r2=', !!metrics.r2, 'kv=', !!metrics.kv);
      process.exit(1);
    }
    
    // 実際のデータを使用（推定なし）
    let r2MonthlyClassA = 0;
    let r2MonthlyClassB = 0;
    
    if (metrics.r2) {
      const classAOps = ['PutObject', 'PostObject', 'CopyObject', 'CompleteMultipartUpload', 'CreateMultipartUpload', 'ListObjects', 'ListObjectsV2', 'ListBuckets', 'ListMultipartUploads', 'ListParts'];
      const classBOps = ['GetObject', 'HeadObject'];
      
      for (const [op, count] of Object.entries(metrics.r2.operations.byType)) {
        if (classAOps.includes(op)) {
          r2MonthlyClassA += count;
        } else if (classBOps.includes(op)) {
          r2MonthlyClassB += count;
        }
      }
    }
    
    // KVの実際のデータを使用
    let kvDailyReads = 0;
    let kvDailyWrites = 0;
    let kvDailyDeletes = 0;
    let kvDailyLists = 0;
    
    if (metrics.kv) {
      // KVは期間内の合計値を日平均に変換
      const daysInPeriod = timeRange === '30d' ? 30 : timeRange === '7d' ? 7 : 1;
      kvDailyReads = Math.round((metrics.kv.operations.byType.read || 0) / daysInPeriod);
      kvDailyWrites = Math.round((metrics.kv.operations.byType.write || 0) / daysInPeriod);
      kvDailyDeletes = Math.round((metrics.kv.operations.byType.delete || 0) / daysInPeriod);
      kvDailyLists = Math.round((metrics.kv.operations.byType.list || 0) / daysInPeriod);
    }
    
    // 使用率を計算
    const usage = {
      r2: {
        storage: metrics.r2 ? calculateUsagePercentage(metrics.r2.storage.totalSize, FREE_TIER_LIMITS.r2.storage) : 0,
        classA: calculateUsagePercentage(r2MonthlyClassA, FREE_TIER_LIMITS.r2.classA),
        classB: calculateUsagePercentage(r2MonthlyClassB, FREE_TIER_LIMITS.r2.classB)
      },
      kv: {
        storage: metrics.kv ? calculateUsagePercentage(metrics.kv.storage.totalSize, FREE_TIER_LIMITS.kv.storage) : 0,
        reads: calculateUsagePercentage(kvDailyReads, FREE_TIER_LIMITS.kv.reads),
        writes: calculateUsagePercentage(kvDailyWrites, FREE_TIER_LIMITS.kv.writes),
        deletes: calculateUsagePercentage(kvDailyDeletes, FREE_TIER_LIMITS.kv.deletes),
        lists: calculateUsagePercentage(kvDailyLists, FREE_TIER_LIMITS.kv.lists)
      }
    };
    
    // 結果を出力
    const result = {
      metrics,
      timeRange,
      actualUsage: {
        r2: {
          actualClassA: Math.round(r2MonthlyClassA),
          actualClassB: Math.round(r2MonthlyClassB),
          storageGB: metrics.r2 ? (metrics.r2.storage.totalSize / (1024 * 1024 * 1024)).toFixed(2) : '0',
          objectCount: metrics.r2 ? metrics.r2.storage.objectCount : 0
        },
        kv: {
          dailyAvgReads: Math.round(kvDailyReads),
          dailyAvgWrites: Math.round(kvDailyWrites),
          dailyAvgDeletes: Math.round(kvDailyDeletes),
          dailyAvgLists: Math.round(kvDailyLists),
          storageGB: metrics.kv ? (metrics.kv.storage.totalSize / (1024 * 1024 * 1024)).toFixed(3) : '0',
          keyCount: metrics.kv ? metrics.kv.storage.keyCount : 0
        }
      },
      usage,
      warnings: []
    };
    
    // 警告をチェック
    if (usage.r2.storage > 80) result.warnings.push(`R2 Storage at ${usage.r2.storage}% of free tier`);
    if (usage.r2.classA > 80) result.warnings.push(`R2 Class A operations at ${usage.r2.classA}% of free tier`);
    if (usage.r2.classB > 80) result.warnings.push(`R2 Class B operations at ${usage.r2.classB}% of free tier`);
    if (usage.kv.storage > 80) result.warnings.push(`KV Storage at ${usage.kv.storage}% of free tier`);
    if (usage.kv.reads > 80) result.warnings.push(`KV Daily reads at ${usage.kv.reads}% of free tier`);
    if (usage.kv.writes > 80) result.warnings.push(`KV Daily writes at ${usage.kv.writes}% of free tier`);
    
    console.log(JSON.stringify(result, null, 2));
    
    // GitHub Actionsの出力変数として設定
    if (process.env.GITHUB_OUTPUT) {
      const fs = require('fs');
      const output = [
        `time_range=${timeRange}`,
        `r2_storage_gb=${result.actualUsage.r2.storageGB}`,
        `r2_storage_usage=${usage.r2.storage}`,
        `r2_object_count=${result.actualUsage.r2.objectCount}`,
        `r2_classA_actual=${result.actualUsage.r2.actualClassA}`,
        `r2_classA_usage=${usage.r2.classA}`,
        `r2_classB_actual=${result.actualUsage.r2.actualClassB}`,
        `r2_classB_usage=${usage.r2.classB}`,
        `kv_storage_gb=${result.actualUsage.kv.storageGB}`,
        `kv_storage_usage=${usage.kv.storage}`,
        `kv_key_count=${result.actualUsage.kv.keyCount}`,
        `kv_reads_daily_avg=${result.actualUsage.kv.dailyAvgReads}`,
        `kv_reads_usage=${usage.kv.reads}`,
        `kv_writes_daily_avg=${result.actualUsage.kv.dailyAvgWrites}`,
        `kv_writes_usage=${usage.kv.writes}`,
        `warnings=${result.warnings.length}`,
        `warning_messages=${result.warnings.join('; ')}`,
        `timestamp=${result.metrics.timestamp}`
      ].join('\n');
      
      fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
    }
    
  } catch (error) {
    console.error('Error collecting metrics:', error);
    process.exit(1);
  }
}

// 実行
if (require.main === module) {
  main();
}