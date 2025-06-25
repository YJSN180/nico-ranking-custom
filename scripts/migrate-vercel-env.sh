#!/bin/bash

# スクリプトがエラーで失敗した場合に即座に終了する
set -e

# --- 設定項目 ---
PROJECT_NAME="nico-ranking-custom"
TEAM_ID="yjsns-projects"

OLD_ENV_KEY="CLOUDFLARE_API_TOKEN"
NEW_ENV_KEY="CLOUDFLARE_API_TOKEN"

# Vercel APIトークンを.env.localから取得（存在する場合）
if [ -f ".env.local" ]; then
  export $(grep VERCEL_API_TOKEN .env.local | xargs)
fi

if [ -z "$VERCEL_API_TOKEN" ]; then
  echo "エラー: VERCEL_API_TOKEN が設定されていません。"
  echo "使い方: VERCEL_API_TOKEN=your_token ./scripts/migrate-vercel-env.sh"
  exit 1
fi

echo "ステップ1: 古い環境変数 (${OLD_ENV_KEY}) の情報を取得します..."

OLD_ENV_OBJECT=$(curl -s -X GET "https://api.vercel.com/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}" \
     -H "Authorization: Bearer ${VERCEL_API_TOKEN}" \
     | jq --arg KEY "$OLD_ENV_KEY" '.envs[] | select(.key == $KEY)')

if [ -z "$OLD_ENV_OBJECT" ]; then
  echo "警告: 環境変数 '${OLD_ENV_KEY}' が見つかりませんでした。"
  echo "新しい環境変数の作成のみ行います。"
  
  # 新しい環境変数が既に存在するか確認
  NEW_ENV_EXISTS=$(curl -s -X GET "https://api.vercel.com/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}" \
       -H "Authorization: Bearer ${VERCEL_API_TOKEN}" \
       | jq --arg KEY "$NEW_ENV_KEY" '.envs[] | select(.key == $KEY)')
  
  if [ ! -z "$NEW_ENV_EXISTS" ]; then
    echo "✅ 環境変数 '${NEW_ENV_KEY}' は既に存在します。"
    exit 0
  fi
  
  # .env.localから値を取得
  if [ -f ".env.local" ]; then
    ENV_VALUE=$(grep "^CLOUDFLARE_API_TOKEN=" .env.local | cut -d '=' -f2-)
    if [ ! -z "$ENV_VALUE" ]; then
      echo "ステップ2: .env.localから値を使用して新しい環境変数を作成します..."
      
      RESPONSE=$(curl -s -X POST "https://api.vercel.com/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}" \
           -H "Authorization: Bearer ${VERCEL_API_TOKEN}" \
           -H "Content-Type: application/json" \
           -d '{
             "key": "'"${NEW_ENV_KEY}"'",
             "value": "'"${ENV_VALUE}"'",
             "type": "encrypted",
             "target": ["production", "preview", "development"]
           }')
      
      echo "  -> 作成完了"
      echo "✅ 環境変数の移行が完了しました。"
      exit 0
    fi
  fi
  
  echo "エラー: 環境変数の値が見つかりません。"
  echo "注意: VERCEL_API_TOKENは環境変数として設定する必要があります。"
  echo "Vercelダッシュボードから取得してください: https://vercel.com/account/tokens"
  exit 1
fi

OLD_ENV_ID=$(echo "$OLD_ENV_OBJECT" | jq -r '.id')
OLD_ENV_VALUE=$(echo "$OLD_ENV_OBJECT" | jq -r '.value')
OLD_ENV_TARGET=$(echo "$OLD_ENV_OBJECT" | jq -r '.target // ["production", "preview", "development"]')

echo "  -> 取得完了 (ID: ${OLD_ENV_ID})"
echo "  -> 値の最初の10文字: $(echo ${OLD_ENV_VALUE} | cut -c 1-10)..."

echo "ステップ2: 新しい環境変数 (${NEW_ENV_KEY}) を作成します..."

# 新しい環境変数が既に存在するか確認
NEW_ENV_EXISTS=$(curl -s -X GET "https://api.vercel.com/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}" \
     -H "Authorization: Bearer ${VERCEL_API_TOKEN}" \
     | jq --arg KEY "$NEW_ENV_KEY" '.envs[] | select(.key == $KEY)')

if [ ! -z "$NEW_ENV_EXISTS" ]; then
  echo "  -> ${NEW_ENV_KEY} は既に存在します。スキップします。"
else
  RESPONSE=$(curl -s -X POST "https://api.vercel.com/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}" \
       -H "Authorization: Bearer ${VERCEL_API_TOKEN}" \
       -H "Content-Type: application/json" \
       -d "$(jq -n --arg key "$NEW_ENV_KEY" --arg value "$OLD_ENV_VALUE" --argjson target "$OLD_ENV_TARGET" \
              '{key: $key, value: $value, type: "encrypted", target: $target}')")
  
  # エラーチェック
  if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "エラー: 環境変数の作成に失敗しました。"
    echo "$RESPONSE" | jq .
    exit 1
  fi
  
  echo "  -> 作成完了"
fi

echo "ステップ3: 古い環境変数 (${OLD_ENV_KEY}) を削除します..."

DELETE_RESPONSE=$(curl -s -X DELETE "https://api.vercel.com/v9/projects/${PROJECT_NAME}/env/${OLD_ENV_ID}?teamId=${TEAM_ID}" \
     -H "Authorization: Bearer ${VERCEL_API_TOKEN}")

# エラーチェック
if echo "$DELETE_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "エラー: 環境変数の削除に失敗しました。"
  echo "$DELETE_RESPONSE" | jq .
  exit 1
fi

echo "  -> 削除完了"

echo "✅ 環境変数の移行が完了しました。"