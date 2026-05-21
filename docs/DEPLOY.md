# 部署文档

## 目录结构

```
MassOVA/
├── bin/                    # ovftool 二进制文件（按平台）
│   ├── darwin/             # macOS
│   ├── linux/              # Linux
│   └── win32/              # Windows
├── server/                 # Express 后端
│   ├── index.js            # 主服务、路由、认证
│   ├── jobs.js             # 任务管理、持久化、并发调度
│   ├── ovftool.js          # ovftool 调用封装、路径检测
│   └── vsphere.js          # vSphere SOAP API 交互
├── src/                    # React 前端
│   ├── main.jsx
│   └── styles.css
├── data/                   # 运行时数据（自动生成，不提交 git）
│   ├── jobs.json           # 任务持久化
│   ├── payloads.json       # 部署参数持久化（用于重试）
│   └── templates.json      # 配置模板
├── dist/                   # 构建产物（自动生成）
├── index.html
├── vite.config.js
├── package.json
├── setup-ovftool.sh        # ovftool 安装辅助脚本
└── README.md
```

---

## 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |
| VMware OVF Tool | >= 4.4.0（推荐 4.6.0） |
| 网络 | 运行 MassOVA 的机器需要能访问 ESXi/vCenter 的 443 端口 |

---

## 安装 ovftool

ovftool 是 VMware 的专有工具，需要从 VMware Developer Portal 下载。

下载地址：https://developer.vmware.com/web/tool/4.6.0/ovf-tool

### 方式一：辅助脚本安装（推荐）

```bash
# macOS
./setup-ovftool.sh ~/Downloads/VMware-ovftool-4.6.0-21452615-mac.x64.dmg

# Linux
./setup-ovftool.sh VMware-ovftool-4.6.0-21452615-lin.x86_64.bundle
```

脚本会自动将二进制放入 `bin/<平台>/` 目录。

### 方式二：手动放置

将对应平台的 ovftool 二进制放入对应目录：

```bash
# macOS
cp "/Applications/VMware OVF Tool/ovftool" bin/darwin/ovftool

# Linux
cp /usr/bin/ovftool bin/linux/ovftool

# Windows
copy "C:\Program Files\VMware\VMware OVF Tool\ovftool.exe" bin\win32\ovftool.exe
```

### 方式三：环境变量指定

如果 ovftool 已安装在系统路径中，或不想使用内置方式：

```bash
export OVFTOOL_PATH="/path/to/ovftool"
```

### ovftool 查找优先级

启动时按以下顺序查找，使用第一个找到的：

1. 环境变量 `OVFTOOL_PATH`
2. 内置目录 `bin/<当前平台>/ovftool`
3. 系统常见安装路径（macOS: `/Applications/VMware OVF Tool/ovftool`，Linux: `/usr/local/bin/ovftool`，Windows: `C:\Program Files\VMware\VMware OVF Tool\ovftool.exe`）
4. 系统 PATH 中的 `ovftool`

启动日志会显示实际使用的路径。

---

## 开发模式

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

开发模式下前端和后端分别运行：

- 前端：http://localhost:5174（Vite 开发服务器，自动代理 `/api` 到后端）
- 后端：http://localhost:4173（Express，支持 `--watch` 自动重启）

---

## 生产部署

### 构建

```bash
npm install
npm run build
```

构建后前端静态文件输出到 `dist/`，Express 在生产模式下自动托管。

### 启动

```bash
npm start
```

或手动指定环境变量：

```bash
NODE_ENV=production PORT=8080 node server/index.js
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `4173` | 服务监听端口 |
| `NODE_ENV` | - | 设为 `production` 启用静态文件托管 |
| `OVFTOOL_PATH` | 自动检测 | ovftool 二进制路径 |
| `MASSOVA_USER` | - | Web 界面认证用户名（与 `MASSOVA_PASS` 同时设置生效） |
| `MASSOVA_PASS` | - | Web 界面认证密码 |

### 认证配置

设置 `MASSOVA_USER` 和 `MASSOVA_PASS` 后，所有 API 请求需要先通过登录获取 token：

```bash
export MASSOVA_USER=admin
export MASSOVA_PASS=your-secure-password
npm start
```

不设置这两个变量则不启用认证（适合内网可信环境）。

---

## 使用 systemd 部署（Linux）

创建 `/etc/systemd/system/massova.service`：

```ini
[Unit]
Description=MassOVA Batch VM Deployment Tool
After=network.target

[Service]
Type=simple
User=massova
WorkingDirectory=/opt/massova
ExecStart=/usr/bin/node server/index.js
Environment=NODE_ENV=production
Environment=PORT=4173
Environment=MASSOVA_USER=admin
Environment=MASSOVA_PASS=your-secure-password
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable massova
sudo systemctl start massova
sudo systemctl status massova
```

---

## 使用 Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# 将 Linux ovftool 放入 bin/linux/
RUN if [ -f bin/linux/ovftool ]; then chmod +x bin/linux/ovftool; fi

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173

CMD ["node", "server/index.js"]
```

```bash
# 构建
docker build -t massova .

# 运行
docker run -d \
  --name massova \
  -p 4173:4173 \
  -e MASSOVA_USER=admin \
  -e MASSOVA_PASS=your-secure-password \
  -v massova-data:/app/data \
  massova
```

---

## 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name massova.example.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE 端点需要关闭缓冲
    location ~ /api/jobs/.*/events$ {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
}
```

---

## 数据备份

运行时数据存放在 `data/` 目录：

| 文件 | 内容 |
|------|------|
| `data/jobs.json` | 任务列表和日志 |
| `data/payloads.json` | 部署参数（含 vSphere 密码，注意安全） |
| `data/templates.json` | 保存的配置模板 |

备份命令：

```bash
cp -r data/ data-backup-$(date +%Y%m%d)/
```

注意：`payloads.json` 中包含 vSphere 登录密码，备份文件需妥善保管。

---

## 常见问题

### 启动时提示 "未找到内置或系统 ovftool"

ovftool 未安装或不在检测路径中。解决方案：

1. 运行 `./setup-ovftool.sh` 安装
2. 或设置环境变量 `export OVFTOOL_PATH=/path/to/ovftool`

### 连接 vSphere 超时

确认运行 MassOVA 的机器能访问 ESXi/vCenter 的 443 端口：

```bash
curl -k https://<vSphere地址>/sdk
```

### 任务数据丢失

任务数据保存在 `data/jobs.json`，正常关闭服务时会自动写入。如果异常断电可能导致最后一次写入丢失（最多 500ms 的数据）。
