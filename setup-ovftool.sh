#!/usr/bin/env bash
set -euo pipefail

# vSphere Nexus ovftool 安装辅助脚本
# 从 VMware Developer Portal 下载 ovftool 并放入对应平台目录
# https://developer.vmware.com/web/tool/4.6.0/ovf-tool

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"

case "$PLATFORM" in
  darwin) BIN_DIR="$SCRIPT_DIR/bin/darwin" ;;
  linux)  BIN_DIR="$SCRIPT_DIR/bin/linux" ;;
  *)
    echo "不支持的平台: $PLATFORM"
    exit 1
    ;;
esac

if [ -f "$1" ]; then
  INSTALLER="$1"
else
  echo "用法: $0 <ovftool 安装包路径>"
  echo ""
  echo "支持的安装包格式:"
  echo "  macOS: .dmg 或 .pkg"
  echo "  Linux: .bundle 或 .tar.gz"
  echo ""
  echo "下载地址: https://developer.vmware.com/web/tool/4.6.0/ovf-tool"
  exit 1
fi

echo "安装 ovftool 到 $BIN_DIR ..."

case "$INSTALLER" in
  *.dmg)
    MOUNT=$(hdiutil attach "$INSTALLER" -nobrowse | tail -1 | awk '{print $NF}')
    OVF=$(find "$MOUNT" -name "ovftool" -type f 2>/dev/null | head -1)
    if [ -z "$OVF" ]; then
      # 有些 dmg 里有 .pkg，需要先安装
      echo "未在 dmg 中找到 ovftool 二进制，尝试安装 pkg ..."
      PKG=$(find "$MOUNT" -name "*.pkg" -maxdepth 1 | head -1)
      if [ -n "$PKG" ]; then
        sudo installer -pkg "$PKG" -target /
        cp "/Applications/VMware OVF Tool/ovftool" "$BIN_DIR/ovftool"
      fi
    else
      cp "$OVF" "$BIN_DIR/ovftool"
    fi
    hdiutil detach "$MOUNT" -quiet
    ;;
  *.bundle)
    sudo bash "$INSTALLER" --eulas-agreed --required
    cp /usr/bin/ovftool "$BIN_DIR/ovftool" 2>/dev/null || true
    ;;
  *.tar.gz|*.tgz)
    TEMP=$(mktemp -d)
    tar xzf "$INSTALLER" -C "$TEMP"
    OVF=$(find "$TEMP" -name "ovftool" -type f | head -1)
    if [ -n "$OVF" ]; then
      cp "$OVF" "$BIN_DIR/ovftool"
    fi
    rm -rf "$TEMP"
    ;;
  *)
    echo "不支持的安装包格式: $INSTALLER"
    exit 1
    ;;
esac

chmod +x "$BIN_DIR/ovftool" 2>/dev/null || true

if [ -f "$BIN_DIR/ovftool" ]; then
  echo "安装成功: $BIN_DIR/ovftool"
  "$BIN_DIR/ovftool" --version || true
else
  echo "安装失败，请手动将 ovftool 复制到 $BIN_DIR/"
  exit 1
fi
