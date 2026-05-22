# MassOVA 部署文档

## 目录

- [项目简介](#项目简介)
- [目录结构](#目录结构)
- [环境要求](#环境要求)
- [安装 ovftool](#安装-ovftool)
- [快速部署（开发模式）](#快速部署开发模式)
- [生产部署](#生产部署)
  - [直接部署](#直接部署)
  - [systemd 服务](#systemd-服务)
  - [Docker 部署](#docker-部署)
  - [Nginx 反向代理](#nginx-反向代理)
- [环境变量参考](#环境变量参考)
- [认证配置](#认证配置)
- [数据与安全](#数据与安全)
- [监控与运维](#监控与运维)
- [更新升级](#更新升级)
- [常见问题排查](#常见问题排查)

---

## 项目简介

MassOVA 是一个基于 Web 的 vSphere 虚拟机批量部署与清理工具。它通过 `ovftool` 命令行工具与 ESXi/vCenter 交互，提供以下功能：

- 从 vSphere 模板批量部署虚拟机，支持并发执行
- 虚拟机批量关机并删除（清理）
- 实时日志流（SSE）
- 部署失败自动重试
- 配置模板保存与加载
- vSphere 资源自动发现（Datastore、网络、资源池等）
- VM 名称冲突检测、Datastore 容量预警
- Web 认证（可选）
- 任务数据持久化（服务重启后恢复）

**技术栈**：Node.js + Express 5（后端）、React 19 + Vite 7（前端）

---

## 目录结构

```
MassOVA/
├── bin/                        # ovftool 二进制文件（按平台，已 gitignore）
│   ├── darwin/ovftool          # macOS
│   ├── linux/ovftool           # Linux
│   └── win32/ovftool.exe       # Windows
├── server/                     # Express 后端
│   ├── index.js                # 主服务：路由、认证、SSE、中间件
│   ├── jobs.js                 # 任务生命周期：创建、执行、重试、持久化
│   ├── ovftool.js              # ovftool 调用封装、参数构建、路径检测
│   └── vsphere.js              # vSphere SOAP API：登录、清单、关机、销毁
├── src/                        # React 前端
│   ├── main.jsx                # 单文件 SPA（所有组件）
│   └── styles.css              # 全局样式
├── data/                       # 运行时数据（自动生成，已 gitignore）
│   ├── jobs.json               # 任务列表与日志
│   ├── payloads.json           # 部署参数（密码已加密，用于重试）
│   ├── templates.json          # 用户保存的配置模板
│   └── .payload-key            # AES-256-GCM 加密密钥（自动生成）
├── dist/                       # 构建产物（npm run build 生成，已 gitignore）
├── docs/
│   ├── DEPLOY.md               # 本文件
│   └── USAGE.md                # 使用手册
├── index.html                  # 前端入口
├── vite.config.js              # Vite 构建配置
├── package.json                # 项目依赖
├── setup-ovftool.sh            # ovftool 安装辅助脚本
└── .gitignore
```

---

## 环境要求

| 项目 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| **Node.js** | >= 18.0.0 | >= 20.0.0 | 需要 ES Module 和 `fetch` 支持 |
| **npm** | >= 9.0.0 | >= 10.0.0 | |
| **VMware OVF Tool** | >= 4.4.0 | >= 4.6.0 | VMware 专有工具，需单独下载 |
| **网络** | - | - | 服务端需能访问 ESXi/vCenter 的 **443 端口** |
| **操作系统** | - | - | 支持 macOS、Linux、Windows |

验证 Node.js 版本：

```bash
node --version   # 应输出 v20.x.x 或更高
```

---

## 安装 ovftool

ovftool 是 VMware 的专有工具，**无法通过 npm 或包管理器安装**。

下载地址：https://developer.broadcom.com/tools/vmware-powercli/latest

> 需要 Broadcom/VMware 账号登录后下载。

### 方式一：辅助脚本（推荐）

```bash
# macOS — 传入 .dmg 或 .pkg 文件
./setup-ovftool.sh ~/Downloads/VMware-ovftool-4.6.0-21452615-mac.x64.dmg

# Linux — 传入 .bundle 或 .tar.gz 文件
./setup-ovftool.sh VMware-ovftool-4.6.0-21452615-lin.x86_64.bundle
```

脚本会自动将二进制放入 `bin/<平台>/` 目录，并设置可执行权限。

### 方式二：手动放置

```bash
# macOS
mkdir -p bin/darwin
cp "/Applications/VMware OVF Tool/ovftool" bin/darwin/ovftool

# Linux
mkdir -p bin/linux
cp /usr/bin/ovftool bin/linux/ovftool

# Windows
mkdir bin\win32
copy "C:\Program Files\VMware\VMware OVF Tool\ovftool.exe" bin\win32\ovftool.exe
```

### 方式三：环境变量指定

如果 ovftool 已安装在系统路径中：

```bash
export OVFTOOL_PATH="/usr/local/bin/ovftool"
```

### ovftool 查找优先级

启动时按以下顺序查找，使用第一个找到的：

1. 环境变量 `OVFTOOL_PATH`
2. 内置目录 `bin/<当前平台>/ovftool`
3. 系统常见安装路径（`/usr/local/bin/ovftool`、`/usr/bin/ovftool` 等）
4. 系统 `PATH` 中的 `ovftool`

启动日志会显示实际使用的路径：

```
MassOVA server listening on http://localhost:4173
ovftool: /opt/MassOVA/bin/linux/ovftool
```

---

## 快速部署（开发模式）

适合本地开发和测试。

```bash
# 1. 克隆项目
git clone <repo-url> /opt/MassOVA
cd /opt/MassOVA

# 2. 安装依赖
npm install

# 3. 安装 ovftool（选择一种方式见上文）

# 4. 启动开发服务器
npm run dev
```

开发模式下前端和后端分别运行：

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端 (Vite) | http://localhost:5174 | 自动代理 `/api` 到后端 |
| 后端 (Express) | http://localhost:4173 | 支持 `--watch` 自动重启 |

---

## 生产部署

### 直接部署

最简单的生产部署方式。

```bash
# 1. 安装依赖
npm install

# 2. 构建前端
npm run build

# 3. 启动服务
npm start
```

或手动指定参数：

```bash
NODE_ENV=production PORT=8080 node server/index.js
```

构建后前端静态文件输出到 `dist/`，Express 在 `NODE_ENV=production` 时自动托管静态文件并回退到 `index.html`（SPA 路由支持）。

### systemd 服务

适合 Linux 服务器的生产环境部署。

#### 1. 创建专用用户

```bash
sudo useradd -r -s /bin/false -d /opt/MassOVA massova
sudo chown -R massova:massova /opt/MassOVA
```

#### 2. 创建 systemd 服务文件

创建 `/etc/systemd/system/massova.service`：

```ini
[Unit]
Description=MassOVA - vSphere Batch VM Deployment Tool
Documentation=https://github.com/your-org/MassOVA
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=massova
Group=massova
WorkingDirectory=/opt/MassOVA

# Node.js 路径（根据实际安装位置调整）
ExecStart=/usr/local/bin/node server/index.js

# 环境变量
Environment=NODE_ENV=production
Environment=PORT=4173
Environment=MASSOVA_USER=admin
Environment=MASSOVA_PASS=your-secure-password-here

# 重启策略
Restart=on-failure
RestartSec=5
StartLimitBurst=3
StartLimitIntervalSec=60

# 安全加固
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/MassOVA/data

# 日志
StandardOutput=journal
StandardError=journal
SyslogIdentifier=massova

[Install]
WantedBy=multi-user.target
```

#### 3. 启用并启动服务

```bash
# 重载 systemd 配置
sudo systemctl daemon-reload

# 设置开机自启
sudo systemctl enable massova

# 启动服务
sudo systemctl start massova

# 查看状态
sudo systemctl status massova

# 查看日志
sudo journalctl -u massova -f
```

#### 4. 常用管理命令

```bash
# 停止服务
sudo systemctl stop massova

# 重启服务
sudo systemctl restart massova

# 查看最近 100 行日志
sudo journalctl -u massova -n 100 --no-pager
```

### Docker 部署

#### 1. 创建 Dockerfile

在项目根目录创建 `Dockerfile`：

```dockerfile
# ---- 构建阶段 ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:20-slim
WORKDIR /app

# 安装运行时依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 复制构建产物和服务端代码
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY bin ./bin

# 确保 ovftool 可执行
RUN if [ -f bin/linux/ovftool ]; then chmod +x bin/linux/ovftool; fi

# 数据目录
RUN mkdir -p data && chmod 777 data

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173

# 非 root 用户运行
USER node

CMD ["node", "server/index.js"]
```

#### 2. 构建镜像

```bash
docker build -t massova:latest .
```

#### 3. 运行容器

```bash
docker run -d \
  --name massova \
  --restart unless-stopped \
  -p 4173:4173 \
  -e MASSOVA_USER=admin \
  -e MASSOVA_PASS=your-secure-password \
  -v massova-data:/app/data \
  massova:latest
```

#### 4. 使用 Docker Compose

创建 `docker-compose.yml`：

```yaml
version: "3.8"

services:
  massova:
    build: .
    container_name: massova
    restart: unless-stopped
    ports:
      - "4173:4173"
    environment:
      - NODE_ENV=production
      - PORT=4173
      - MASSOVA_USER=admin
      - MASSOVA_PASS=your-secure-password
    volumes:
      - massova-data:/app/data

volumes:
  massova-data:
```

```bash
docker compose up -d
docker compose logs -f massova
```

### Nginx 反向代理

建议生产环境通过 Nginx 反向代理提供 HTTPS 和访问控制。

#### 基础配置

创建 `/etc/nginx/sites-available/massova`：

```nginx
server {
    listen 80;
    server_name massova.example.com;

    # 重定向到 HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name massova.example.com;

    # SSL 证书
    ssl_certificate     /etc/ssl/certs/massova.crt;
    ssl_certificate_key /etc/ssl/private/massova.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # 常规请求代理
    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE 端点 — 必须关闭缓冲
    location ~ /api/jobs/.*/events$ {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/massova /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 环境变量参考

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `NODE_ENV` | - | 生产环境必填 | 设为 `production` 启用静态文件托管 |
| `PORT` | `4173` | 否 | HTTP 服务监听端口 |
| `OVFTOOL_PATH` | 自动检测 | 否 | ovftool 二进制的绝对路径 |
| `MASSOVA_USER` | - | 否 | Web 界面认证用户名（需与 `MASSOVA_PASS` 同时设置） |
| `MASSOVA_PASS` | - | 否 | Web 界面认证密码 |
| `CORS_ORIGIN` | `false` | 否 | CORS 允许的来源（默认不允许跨域） |

---

## 认证配置

### 启用认证

设置 `MASSOVA_USER` 和 `MASSOVA_PASS` 环境变量即可启用 Web 认证：

```bash
export MASSOVA_USER=admin
export MASSOVA_PASS='Str0ng!P@ssw0rd'
npm start
```

认证机制说明：

| 特性 | 说明 |
|------|------|
| 登录方式 | 用户名 + 密码，返回 Bearer token |
| Token 存储 | 浏览器 `localStorage`（关闭浏览器不丢失） |
| Token 有效期 | 24 小时 |
| 限速保护 | 同一 IP 15 分钟内最多 10 次登录尝试 |
| SSE 认证 | 通过短期 ticket（30秒有效）代替 URL 传 token，避免日志泄漏 |
| 不设置变量 | 不启用认证（适合完全可信的内网环境） |

### 不启用认证的风险

不设置认证时，任何能访问该端口的人都可以：
- 查看 vSphere 清单信息
- 部署或销毁虚拟机
- 查看 vSphere 凭证（在日志中）

**建议**：即使是内网环境，也推荐启用认证或通过网络策略限制访问。

---

## 数据与安全

### 运行时数据文件

`data/` 目录在首次运行时自动创建，包含以下文件：

| 文件 | 内容 | 安全等级 |
|------|------|----------|
| `jobs.json` | 任务列表、状态、日志 | 中 — 包含操作历史 |
| `payloads.json` | 部署参数（含加密后的 vSphere 密码） | **高** — 包含凭证 |
| `templates.json` | 用户保存的配置模板 | 低 — 不含密码 |
| `.payload-key` | AES-256-GCM 加密密钥 | **高** — 用于解密密码 |

### 密码加密

从 v0.1.0 起，`payloads.json` 中的 vSphere 密码使用 **AES-256-GCM** 加密存储：

- 加密密钥自动生成并保存在 `data/.payload-key`
- 首次启动时生成，后续启动自动加载
- 重试功能会自动解密并使用原始密码

**重要**：如果 `.payload-key` 文件丢失，已存储的部署参数中的密码将无法解密，需要手动重新输入。

### 文件权限建议

```bash
# 设置 data 目录仅 owner 可访问
chmod 700 data/
chmod 600 data/.payload-key
chmod 600 data/payloads.json
chmod 644 data/jobs.json
chmod 644 data/templates.json
```

### 数据备份

```bash
# 备份所有数据（包括加密密钥）
cp -r data/ data-backup-$(date +%Y%m%d)/

# 仅备份任务历史（不含密码）
cp data/jobs.json data/jobs-backup-$(date +%Y%m%d).json
```

备份恢复时确保 `.payload-key` 文件一并恢复，否则 `payloads.json` 中的密码无法解密。

### 通信安全

| 场景 | 建议 |
|------|------|
| 本机访问 | `http://localhost:4173` 即可 |
| 内网访问 | 配置 Nginx 反向代理 + HTTPS |
| 公网访问 | **必须** 使用 HTTPS，建议额外加 VPN 或 IP 白名单 |

vSphere 连接说明：
- 服务端与 vSphere/ESXi 之间的通信默认 **不验证 TLS 证书**（因为多数 ESXi 使用自签名证书）
- 这是通过 `ovftool --noSSLVerify` 和服务端 SOAP 请求的 TLS 豁免实现的

---

## 监控与运维

### 健康检查

```bash
# 检查服务状态和 ovftool 可用性
curl http://localhost:4173/api/health
```

响应示例：

```json
{
  "ok": true,
  "authEnabled": true,
  "ovftoolPath": "/opt/MassOVA/bin/linux/ovftool",
  "ovftoolAvailable": true
}
```

`ovftoolAvailable` 会实际检查文件是否存在且可执行。

### 查看日志

```bash
# systemd 日志
sudo journalctl -u massova -f

# Docker 日志
docker logs -f massova
```

### 磁盘空间监控

`data/` 目录会随任务增长变大。任务日志每个任务最多保留 1000 条，但仍建议定期清理：

```bash
# 查看 data 目录大小
du -sh data/

# 手动清理（停止服务后操作）
systemctl stop massova
# 编辑 data/jobs.json 删除旧任务，然后重启
systemctl start massova
```

### 优雅关闭

MassOVA 支持 SIGTERM/SIGINT 信号优雅关闭：

1. 停止接受新请求
2. 等待进行中的 HTTP 请求完成（最多 5 秒）
3. 正在运行的部署任务会被中止（标记为 `interrupted`），可通过重试恢复

```bash
# 优雅关闭
sudo systemctl stop massova   # systemd 会发送 SIGTERM

# 或直接发送信号
kill -TERM $(pgrep -f "node server/index.js")
```

### 端口冲突处理

如果端口被占用，启动时会输出错误信息并退出：

```
端口 4173 已被占用，请修改 PORT 环境变量
```

解决方式：

```bash
# 查找占用端口的进程
lsof -i :4173
# 或使用其他端口
PORT=8080 npm start
```

---

## 更新升级

### 更新步骤

```bash
cd /opt/MassOVA

# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖（如有变更）
npm install

# 3. 重新构建前端
npm run build

# 4. 重启服务
sudo systemctl restart massova

# 5. 验证
sudo systemctl status massova
curl http://localhost:4173/api/health
```

### 版本回退

```bash
# 查看提交历史
git log --oneline -10

# 回退到指定版本
git checkout <commit-hash>
npm install
npm run build
sudo systemctl restart massova
```

### 数据兼容性

- `data/jobs.json` 和 `data/templates.json` 向后兼容
- `data/payloads.json` 中的密码加密格式为 `enc:v1:<iv>:<tag>:<data>`，未加密的旧数据仍可读取
- 如果升级后首次启动报错，检查 Node.js 版本是否符合要求

---

## 常见问题排查

### 1. 启动失败：ovftool 未找到

**症状**：服务启动但部署时报错，或 health 检查显示 `ovftoolAvailable: false`。

**排查**：

```bash
# 检查 ovftool 是否存在且可执行
ls -la bin/linux/ovftool
bin/linux/ovftool --version

# 或检查系统路径
which ovftool
ovftool --version
```

**解决**：

```bash
# 方式一：运行安装脚本
./setup-ovftool.sh VMware-ovftool-*.bundle

# 方式二：设置环境变量
export OVFTOOL_PATH=/path/to/ovftool

# 方式三：确保文件可执行
chmod +x bin/linux/ovftool
```

### 2. 连接 vSphere 超时 / 失败

**排查步骤**：

```bash
# 1. 检查网络连通性
ping <vSphere地址>

# 2. 检查 443 端口是否开放
curl -k -v https://<vSphere地址>/sdk

# 3. 检查 DNS 解析
nslookup <vSphere域名>

# 4. 检查防火墙
sudo iptables -L -n | grep 443   # Linux
```

**常见原因**：
- 防火墙阻止 443 端口
- ESXi/vCenter 服务未运行
- IP 地址或域名错误
- 运行 MassOVA 的机器不在同一网络/VPN

### 3. 登录失败提示"过于频繁"

**症状**：多次输入错误密码后返回 429 状态码。

**原因**：登录限速保护（同一 IP 15 分钟内最多 10 次尝试）。

**解决**：等待 15 分钟后重试，或重启服务清除限速计数器。

### 4. Datastore 显示"无可用选项"

**原因**：
- vCenter 模式下，Datastore 需要通过计算资源关联才能看到
- ESXi 直连模式下，Datastore 名称必须与 ESXi 上显示的一致

**解决**：确认选择的部署目标（计算资源/集群）下有可用的 Datastore。

### 5. 部署失败：Already exists

**原因**：目标环境中已存在同名虚拟机。

**解决**：
1. 在 vSphere Client 中删除或重命名冲突的 VM
2. 在 MassOVA 中修改 VM 名称
3. 如果确认要覆盖，点击"仍然部署"（ovftool 可能报错）

### 6. 部署失败：Datastore not accessible

**原因**：vCenter 环境中 Datastore 名称在不同层级可能不同（如 ESXi 本地名称 vs vCenter 名称）。

**解决**：使用 vCenter 中显示的 Datastore 名称，而非 ESXi 本地名称。

### 7. 任务变成 interrupted

**原因**：服务在任务执行期间重启。

**解决**：
1. 查看任务日志确认哪些 VM 已成功
2. 点击重试按钮重新部署失败的 VM

### 8. 页面空白或无法加载

**排查**：

```bash
# 检查构建产物是否存在
ls -la dist/

# 重新构建
npm run build

# 检查 NODE_ENV 是否设置
echo $NODE_ENV   # 应该为 production
```

### 9. Docker 中 ovftool 不可用

**原因**：构建镜像时未正确复制或设置可执行权限。

**解决**：确保 Dockerfile 中包含：

```dockerfile
COPY bin/linux/ovftool bin/linux/ovftool
RUN chmod +x bin/linux/ovftool
```

### 10. SSE 日志不实时更新

**排查**：

```bash
# 检查 Nginx 是否关闭了 SSE 缓冲
# nginx.conf 中 SSE location 块必须有：
proxy_buffering off;
proxy_cache off;
```

**原因**：反向代理（Nginx/Cloudflare）对 SSE 响应启用了缓冲。

**解决**：在反向代理配置中对 `/api/jobs/.*/events` 路径关闭缓冲（见上方 Nginx 配置）。

---

## 架构说明

### 请求流程

```
浏览器 → Nginx (可选, HTTPS) → Express (:4173)
                                    ├── /api/auth/*     → 认证中间件
                                    ├── /api/targets/*  → vSphere SOAP API
                                    ├── /api/deployments → ovftool 部署
                                    ├── /api/vms/destroy → vSphere 关机+销毁
                                    ├── /api/jobs/*     → 任务管理
                                    ├── /api/jobs/:id/events → SSE 实时日志
                                    ├── /api/templates  → 模板 CRUD
                                    └── /* → 静态文件 (dist/)
```

### 并发模型

- ovftool 通过 `child_process.spawn` 调用，支持 AbortController 取消
- 并发部署使用 Worker Pool 模式（可配置 1-10 个 worker）
- vSphere SOAP 请求使用 `fetch`，通过引用计数器安全管理 TLS 豁免

### 数据持久化

- 所有任务数据存储在内存中（Map），通过防抖写入（500ms）持久化到 JSON 文件
- 服务重启时从 JSON 文件恢复任务，正在运行的任务标记为 `interrupted`
- 密码字段使用 AES-256-GCM 加密后存储
