#!/bin/bash

# API 安全測試腳本
# 測試各種情況下的 API 訪問限制

API_URL="https://ff14-tw-treasure.z54981220.workers.dev"
ROOM_CODE="TEST01"

echo "===== API 安全測試 ====="
echo ""

echo "1. 測試無 Origin header (curl/Postman) - 應該被拒絕"
echo "----------------------------------------"
curl -s -X POST "$API_URL/api/rooms" \
  -H "Content-Type: application/json" \
  -d '{"memberNickname": "Test User"}' \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "2. 測試惡意網站 Origin - 應該被拒絕"
echo "----------------------------------------"
curl -s -X POST "$API_URL/api/rooms" \
  -H "Origin: https://evil-site.com" \
  -H "Content-Type: application/json" \
  -d '{"memberNickname": "Evil User"}' \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "3. 測試 localhost Origin - 應該被拒絕（生產環境）"
echo "----------------------------------------"
curl -s -X POST "$API_URL/api/rooms" \
  -H "Origin: http://localhost:8000" \
  -H "Content-Type: application/json" \
  -d '{"memberNickname": "Local User"}' \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "4. 測試 ff14.tw Origin - 應該成功"
echo "----------------------------------------"
curl -s -X POST "$API_URL/api/rooms" \
  -H "Origin: https://ff14.tw" \
  -H "Content-Type: application/json" \
  -d '{"memberNickname": "Valid User"}' \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "5. 測試 www.ff14.tw Origin - 應該成功"
echo "----------------------------------------"
curl -s -X POST "$API_URL/api/rooms" \
  -H "Origin: https://www.ff14.tw" \
  -H "Content-Type: application/json" \
  -d '{"memberNickname": "Valid WWW User"}' \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "測試完成！"