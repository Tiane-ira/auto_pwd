#!/bin/bash
set -e

# 读取版本号
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
NAME="auto-fill-extension-v${VERSION}"
DIST_DIR="dist"
ZIP_FILE="${DIST_DIR}/${NAME}.zip"

mkdir -p "$DIST_DIR"

# 打包扩展文件
zip -r "$ZIP_FILE" \
  manifest.json \
  src/ \
  assets/ \
  -x "*.DS_Store" \
     "*.log" \
     "*.map" \
     "*__MACOSX*"

echo "打包完成: ${ZIP_FILE}"
