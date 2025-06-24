const https = require('https');

// Slack通知を送信
async function sendSlackMessage(message, channel = 'C092SFGUSKC') {
  const token = process.env.SLACK_BOT_TOKEN;
  
  if (!token) {
    console.error('SLACK_BOT_TOKEN is not set');
    return;
  }

  const data = JSON.stringify(message);

  const options = {
    hostname: 'slack.com',
    port: 443,
    path: '/api/chat.postMessage',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        const result = JSON.parse(responseData);
        if (result.ok) {
          console.log('Slack notification sent successfully');
          resolve(result);
        } else {
          console.error('Slack API error:', result.error);
          reject(new Error(result.error));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 使用率に基づいて色を決定
function getStatusColor(usage) {
  if (usage >= 90) return '#dc2626'; // 赤
  if (usage >= 70) return '#f59e0b'; // オレンジ
  if (usage >= 50) return '#eab308'; // 黄色
  return '#22c55e'; // 緑
}

// 使用率に基づいて絵文字を決定
function getStatusEmoji(usage) {
  if (usage >= 90) return '🚨';
  if (usage >= 70) return '⚠️';
  if (usage >= 50) return '📊';
  return '✅';
}

// メトリクスをフォーマット
function formatNumber(num) {
  return num.toLocaleString();
}

// バイトを人間が読みやすい形式に変換
function formatBytes(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

// Slackメッセージを構築
function buildSlackMessage(data) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📊 Cloudflare リソース使用状況レポート"
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*レポート生成時刻:* ${new Date(data.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`
        }
      ]
    }
  ];

  // 警告がある場合
  if (data.warnings && data.warnings.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⚠️ *警告:*\n${data.warnings.join('\n')}`
      }
    });
  }

  // R2セクション
  blocks.push(
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*🗄️ Cloudflare R2*"
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*ストレージ使用量*\n${data.r2_storage_gb} GB (${data.r2_storage_usage}%)`
        },
        {
          type: "mrkdwn",
          text: `*オブジェクト数*\n${formatNumber(data.r2_object_count || 0)}`
        }
      ]
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Class A操作 (月間予測)*\n${formatNumber(data.r2_classA_monthly)} / 1M (${data.r2_classA_usage}%)`
        },
        {
          type: "mrkdwn",
          text: `*Class B操作 (月間予測)*\n${formatNumber(data.r2_classB_monthly)} / 10M (${data.r2_classB_usage}%)`
        }
      ]
    }
  );

  // KVセクション
  blocks.push(
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📦 Cloudflare KV*"
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*ストレージ使用量*\n${data.kv_storage_gb} GB (${data.kv_storage_usage}%)`
        },
        {
          type: "mrkdwn",
          text: `*キー数*\n${formatNumber(data.kv_key_count || 0)}`
        }
      ]
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*読み取り (日次予測)*\n${formatNumber(data.kv_reads_daily)} / 100K (${data.kv_reads_usage}%)`
        },
        {
          type: "mrkdwn",
          text: `*書き込み (日次予測)*\n${formatNumber(data.kv_writes_daily)} / 1K (${data.kv_writes_usage}%)`
        }
      ]
    }
  );

  // サマリーセクション
  const maxUsage = Math.max(
    data.r2_storage_usage,
    data.r2_classA_usage,
    data.r2_classB_usage,
    data.kv_storage_usage,
    data.kv_reads_usage,
    data.kv_writes_usage
  );

  const statusEmoji = getStatusEmoji(maxUsage);
  const statusText = maxUsage >= 90 ? '無料枠の上限に近づいています！' :
                     maxUsage >= 70 ? '使用量が増加しています' :
                     '正常な範囲内です';

  blocks.push(
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${statusEmoji} *ステータス:* ${statusText}`
      }
    }
  );

  // Vercelに関する注記
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "📝 *注記:* Vercel Functionsの使用量はAPIで取得できないため、Vercelダッシュボードでご確認ください。"
      }
    ]
  });

  return {
    channel: 'C092SFGUSKC',
    blocks,
    attachments: [{
      color: getStatusColor(maxUsage),
      fields: []
    }]
  };
}

// メイン処理
async function main() {
  try {
    // 環境変数から値を取得
    const data = {
      timestamp: process.env.timestamp || new Date().toISOString(),
      warnings: process.env.warning_messages ? process.env.warning_messages.split('; ') : [],
      r2_storage_gb: parseFloat(process.env.r2_storage_gb || '0'),
      r2_storage_usage: parseInt(process.env.r2_storage_usage || '0'),
      r2_object_count: parseInt(process.env.r2_object_count || '0'),
      r2_classA_monthly: parseInt(process.env.r2_classA_monthly || '0'),
      r2_classA_usage: parseInt(process.env.r2_classA_usage || '0'),
      r2_classB_monthly: parseInt(process.env.r2_classB_monthly || '0'),
      r2_classB_usage: parseInt(process.env.r2_classB_usage || '0'),
      kv_storage_gb: parseFloat(process.env.kv_storage_gb || '0'),
      kv_storage_usage: parseInt(process.env.kv_storage_usage || '0'),
      kv_key_count: parseInt(process.env.kv_key_count || '0'),
      kv_reads_daily: parseInt(process.env.kv_reads_daily || '0'),
      kv_reads_usage: parseInt(process.env.kv_reads_usage || '0'),
      kv_writes_daily: parseInt(process.env.kv_writes_daily || '0'),
      kv_writes_usage: parseInt(process.env.kv_writes_usage || '0')
    };

    // Slackメッセージを構築して送信
    const message = buildSlackMessage(data);
    await sendSlackMessage(message);
    
    console.log('Resource usage notification sent successfully');
  } catch (error) {
    console.error('Error sending notification:', error);
    process.exit(1);
  }
}

// 実行
if (require.main === module) {
  main();
}