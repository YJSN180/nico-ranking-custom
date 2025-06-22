#!/bin/bash

echo "📊 R2 Monitoring Setup Script"
echo "============================"
echo ""

# 1. 依存関係のインストール
echo "1. Installing dependencies..."
npm install --save-dev @slack/webhook nodemailer @types/nodemailer

# 2. 環境変数の設定
echo ""
echo "2. Setting up environment variables..."
echo ""
echo "Please add the following to your .env.local file:"
echo ""
cat << 'EOF'
# Slack Webhook (optional)
# Get from: https://api.slack.com/messaging/webhooks
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Email Configuration (optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_TO=alert@example.com
EMAIL_FROM=Nico Ranking Monitor <monitor@example.com>

# GitHub Token (for accessing workflow logs)
GH_TOKEN=your-github-token
EOF

# 3. Crontabの設定例
echo ""
echo "3. Crontab setup examples:"
echo ""
echo "To edit crontab, run: crontab -e"
echo ""
echo "Add one of the following lines:"
echo ""
cat << 'EOF'
# 毎日朝9時（JST）に実行
0 9 * * * cd /path/to/nico-ranking-new && tsx scripts/monitor-and-notify.ts >> logs/monitor.log 2>&1

# 4時間ごとに実行
0 */4 * * * cd /path/to/nico-ranking-new && tsx scripts/monitor-and-notify.ts >> logs/monitor.log 2>&1

# ワークフロー実行後30分後に実行（毎時0分と30分の30分後）
30 0,30 * * * cd /path/to/nico-ranking-new && tsx scripts/monitor-and-notify.ts >> logs/monitor.log 2>&1
EOF

# 4. systemdサービスの例（より高度な設定）
echo ""
echo "4. Systemd service example (optional):"
echo ""
cat << 'EOF' > r2-monitor.service
[Unit]
Description=R2 Write Statistics Monitor
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/tsx /path/to/nico-ranking-new/scripts/monitor-and-notify.ts
WorkingDirectory=/path/to/nico-ranking-new
StandardOutput=append:/var/log/r2-monitor.log
StandardError=append:/var/log/r2-monitor-error.log

[Install]
WantedBy=multi-user.target
EOF

echo "To install systemd service:"
echo "  sudo cp r2-monitor.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable r2-monitor.timer"
echo ""

# 5. systemd timerの例
cat << 'EOF' > r2-monitor.timer
[Unit]
Description=Run R2 Monitor every 4 hours
Requires=r2-monitor.service

[Timer]
OnCalendar=*-*-* 00,04,08,12,16,20:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

echo "5. Testing the setup:"
echo ""
echo "Run the following command to test:"
echo "  tsx scripts/monitor-and-notify.ts"
echo ""
echo "Setup complete! 🎉"