#!/usr/bin/env node

/**
 * Slack通知スクリプト
 * Bot Tokenを使用してSlackに通知を送信
 */

const https = require('https');

async function sendSlackMessage(message, channel = 'C092SFGUSKC') {
  const token = process.env.SLACK_BOT_TOKEN;
  
  if (!token) {
    console.error('Error: SLACK_BOT_TOKEN environment variable is not set');
    process.exit(1);
  }

  const data = JSON.stringify({
    channel: channel,
    text: message.text || 'E2Eテスト通知',
    blocks: message.blocks,
    attachments: message.attachments
  });

  const options = {
    hostname: 'slack.com',
    port: 443,
    path: '/api/chat.postMessage',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
        const response = JSON.parse(responseData);
        if (response.ok) {
          console.log('Successfully sent Slack notification');
          resolve(response);
        } else {
          console.error('Slack API error:', response.error);
          reject(new Error(response.error));
        }
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// GitHub Actions環境変数から情報を取得
const workflow = process.env.GITHUB_WORKFLOW || 'Unknown Workflow';
const repository = process.env.GITHUB_REPOSITORY || 'Unknown Repository';
const branch = process.env.GITHUB_REF_NAME || 'Unknown Branch';
const runId = process.env.GITHUB_RUN_ID || 'Unknown';
const status = process.argv[2] || 'unknown';
const details = process.argv[3] || '';

// メッセージを構築
const message = {
  text: `E2Eテスト ${status === 'success' ? '成功' : '失敗'}: ${workflow}`,
  blocks: [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: status === 'success' ? '✅ E2Eテスト成功' : '❌ E2Eテスト失敗'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*リポジトリ:*\n${repository}`
        },
        {
          type: 'mrkdwn',
          text: `*ブランチ:*\n${branch}`
        },
        {
          type: 'mrkdwn',
          text: `*ワークフロー:*\n${workflow}`
        },
        {
          type: 'mrkdwn',
          text: `*実行ID:*\n<https://github.com/${repository}/actions/runs/${runId}|#${runId}>`
        }
      ]
    }
  ]
};

// 詳細情報がある場合は追加
if (details) {
  message.blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*詳細:*\n\`\`\`\n${details}\n\`\`\``
    }
  });
}

// メッセージを送信
sendSlackMessage(message)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));