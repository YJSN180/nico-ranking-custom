#!/bin/bash

# 開発サーバーを起動
echo "開発サーバーを起動しています..."
npm run dev &
SERVER_PID=$!

# サーバーが起動するまで待つ
echo "サーバーの起動を待っています..."
sleep 10

# サーバーが起動したか確認
if curl -s http://localhost:3000 > /dev/null; then
    echo "サーバーが起動しました"
    
    # テストを実行
    echo "テストを実行しています..."
    npx playwright test $@
    TEST_EXIT_CODE=$?
    
    # サーバーを停止
    echo "サーバーを停止しています..."
    kill $SERVER_PID
    
    exit $TEST_EXIT_CODE
else
    echo "サーバーの起動に失敗しました"
    kill $SERVER_PID
    exit 1
fi