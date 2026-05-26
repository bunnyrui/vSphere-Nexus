# vSphere Nexus

[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1--beta.1-blue.svg)](package.json)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](package.json)

**vSphere Nexus** 是一款专为企业级虚拟化环境设计的全栈 Web 管理平台。它通过现代化的浏览器界面，让运维人员能够直接管理 VMware vCenter Server 和独立 ESXi 主机，实现虚拟机的全生命周期管理、批量自动化部署以及实时的 Web 控制台访问。

本项目采用 React 19 构建响应式前端，Node.js + Express 5 处理后端逻辑，通过原生 SOAP API 与 vSphere 基础设施通信，无需任何中间件或代理服务器。

---

## 目录

- [项目简介](#项目简介)
- [核心能力](#核心能力)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [项目目录](#项目目录)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [OVF Tool 配置](#ovf-tool-配置)
- [开发模式](#开发模式)
- [生产部署](#生产部署)
- [认证与会话](#认证与会话)
- [数据持久化](#数据持久化)
- [批量部署流程](#批量部署流程)
- [Web 控制台](#web-控制台)
- [API 概览](#api-概览)
- [开发规范](#开发规范)
- [已知限制](#已知限制)
- [安全说明](#安全说明)
- [故障排查](#故障排查)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 项目简介

vSphere Nexus 的诞生是为了解决传统 vSphere Client 在批量操作和现代化 Web 体验上的不足。它直接面向 vSphere SOAP API，不依赖任何第三方管理套件，部署轻量，使用简单。

**关键设计决策：**

- **无数据库依赖**：所有状态通过内存会话 + JSON 文件持久化，部署时无需配置数据库
- **原生 vSphere 认证**：直接使用 vCenter/ESXi 凭据登录，不维护独立的用户体系
- **AES-256-GCM 加密**：部署任务中的敏感信息（如密码）在磁盘上加密存储
- **中文优先界面**：所有用户界面和错误提示均为中文，降低运维团队使用门槛

---

## 核心能力

### 资源管理
- **清单发现**：自动发现数据中心、集群、主机、数据存储、网络端口组及虚拟机/模板
- **实时状态同步**：显示虚拟机电源状态、CPU/内存配置、存储占用等关键指标
- **资源概览仪表盘**：聚合展示环境整体健康度，包括运行中 VM 比例、存储利用率等

### 虚拟机操作
- **电源管理**：批量开机、关机、重启虚拟机
- **快照管理**：创建、恢复、删除快照，支持内存快照选项
- **配置调整**：在线修改 CPU 核心数和内存大小（需客户机支持）
- **重命名**：快速修改虚拟机显示名称
- **销毁**：安全删除虚拟机及关联磁盘

### 批量部署
- **模板部署**：基于现有模板或 OVF/OVA 文件批量创建虚拟机
- **智能命名**：支持前缀 + 序号规则的自动命名（如 `Web-01` 到 `Web-20`）
- **网络映射**：自动映射源模板网络到目标环境网络
- **并发控制**：可配置并行部署数量，避免资源争抢
- **空间预检**：部署前自动检查目标数据存储剩余空间

### Web 控制台
- **浏览器直接访问**：通过 WebMKS 技术，在浏览器中打开 VM 控制台，无需安装插件
- **全平台兼容**：支持 ESXi 6.0/6.5/7.0/8.0 及 vCenter 7.0+
- **自动票据获取**：后端自动申请 WebMKS Ticket，前端一键连接
- **全屏支持**：支持浏览器全屏模式下的控制台操作

### 任务监控
- **实时日志流**：通过 Server-Sent Events (SSE) 实时推送任务日志
- **进度跟踪**：可视化展示部署/操作进度，支持多任务并行监控
- **任务管理**：支持取消运行中任务、重试失败任务、清理已完成任务

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  React SPA  │  │  WebMKS     │  │  SSE 任务日志        │ │
│  │  (Vite)     │  │  控制台      │  │  实时推送            │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼────────────────────┼────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express 5 后端 (Node.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ REST API     │  │ WebSocket    │  │ 任务队列引擎      │   │
│  │ 路由处理      │  │ 控制台代理    │  │ (JSON 持久化)    │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
└─────────┼─────────────────┼───────────────────┼─────────────┘
          │                 │                   │
          ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              vSphere SOAP API / vCenter / ESXi              │
│         ┌──────────────┐          ┌──────────────┐          │
│         │ 清单查询      │          │ VM 生命周期   │          │
│         │ 票据申请      │          │ 快照/电源     │          │
│         └──────────────┘          └──────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

**架构特点：**

- **单体后端**：所有 API 路由、认证中间件、WebSocket 代理、静态文件托管集中在 `server/index.js`
- **ESM 全链路**：前后端均使用 ES Module，无 CommonJS 混用
- **开发代理**：Vite 开发服务器将 `/api` 请求代理到后端端口，避免跨域问题
- **原始 TLS 隧道**：WebMKS 控制台通过 `server.on('upgrade')` 建立原始 TLS 连接，非标准 WebSocket 协议

---

## 技术栈

### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.0 | UI 框架 |
| Vite | 7.2 | 构建工具与开发服务器 |
| React Router | 7.15 | 客户端路由 |
| Zustand | 5.0 | 状态管理 |
| Tailwind CSS | 3.4 | 原子化 CSS 框架 |
| Lucide React | 0.468 | 图标库 |
| clsx + tailwind-merge | latest | 类名工具 |

### 后端
| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 20.0 | 运行时 |
| Express | 5.1 | Web 框架 |
| ws | 8.20 | WebSocket 库（控制台代理） |
| nanoid | 5.0 | ID 生成 |
| CORS | 2.8 | 跨域处理 |

### 运行时依赖
| 组件 | 用途 |
|------|------|
| VMware OVF Tool | 批量部署虚拟机（OVF/OVA 导入） |
| WebMKS (wmks.min.js) | 浏览器 VM 控制台 |
| jQuery 3.7.1 + jQuery UI 1.13.2 | WebMKS 底层依赖 |

---

## 项目目录

```
vSphere Nexus/
├── src/                      # 前端源码
│   ├── features/             # 页面级功能模块
│   │   ├── auth/             # 登录页
│   │   ├── dashboard/        # 仪表盘首页
│   │   ├── deployment/       # 批量部署向导
│   │   ├── inventory/        # 虚拟机清单管理
│   │   ├── jobs/             # 任务监控中心
│   │   └── settings/         # 系统设置
│   ├── components/           # 共享组件
│   │   ├── console/          # WebMKS 控制台组件
│   │   └── Layout.jsx        # 应用布局外壳
│   ├── store/                # Zustand 状态管理
│   │   ├── useAuthStore.js   # 认证状态
│   │   └── useAppStore.js    # 应用状态（清单、目标等）
│   ├── lib/
│   │   └── utils.js          # 工具函数（cn、fetchJson）
│   ├── index.css             # Tailwind 主题变量
│   ├── main.jsx              # 应用入口
│   └── App.jsx               # 路由配置
├── server/                   # 后端源码
│   ├── index.js              # 服务入口（路由、WS代理、静态托管）
│   ├── jobs.js               # 任务队列与持久化
│   ├── ovftool.js            # OVF Tool 解析与调用
│   └── services/
│       ├── vmService.js      # vSphere SOAP 服务层
│       └── vimClient.js      # 底层 SOAP/HTTPS 客户端
├── public/                   # 静态资源
│   └── wmks.min.js           # VMware WebMKS 库（vendor）
├── bin/                      # OVF Tool 二进制（运行时填充）
│   ├── darwin/
│   ├── linux/
│   └── win32/
├── data/                     # 运行时数据（自动创建）
│   ├── jobs.json             # 任务列表
│   ├── payloads.json         # 加密后的任务载荷
│   └── .payload-key          # AES-256-GCM 密钥
├── dist/                     # 生产构建输出（Vite 生成）
├── .env.example              # 环境变量模板
├── setup-ovftool.sh          # OVF Tool 安装脚本
├── vite.config.js            # Vite 配置
├── tailwind.config.js        # Tailwind 配置
├── postcss.config.js         # PostCSS 配置
├── package.json              # 项目配置
└── AGENTS.md                 # 项目知识库（AI 辅助开发指南）
```

---

## 环境要求

- **Node.js**: >= 20.0.0
- **npm**: >= 10.0.0
- **网络**: 能够直接访问目标 vCenter Server 或 ESXi 主机的 443 端口
- **OVF Tool**: 如需使用批量部署功能，需安装 VMware OVF Tool
- **浏览器**: 支持现代浏览器（Chrome、Firefox、Edge、Safari），WebMKS 控制台需要 WebSocket 支持

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/bunnyrui/vSphere-Nexus.git
cd vSphere-Nexus
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，根据实际环境调整配置
```

### 4. 启动开发服务器

```bash
npm run dev
```

启动后访问：
- **前端界面**: http://localhost:5174
- **后端 API**: http://localhost:4173

### 5. 登录

使用您的 vSphere 凭据直接登录：
- **平台类型**: vCenter 或 ESXi
- **地址**: vCenter Server 或 ESXi 主机的 IP/域名
- **用户名**: vSphere 用户名（如 `administrator@vsphere.local`）
- **密码**: 对应密码

---

## 环境变量

复制 `.env.example` 为 `.env` 后进行配置：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | `4173` | 后端服务监听端口 |
| `NODE_ENV` | `development` | 运行环境 (`development` 或 `production`) |
| `CORS_ORIGIN` | - | 允许的跨域来源，开发时如需直接访问后端 API 可设为 `http://localhost:5174` |
| `OVFTOOL_PATH` | - | OVF Tool 可执行文件绝对路径，留空则自动检测 |

---

## OVF Tool 配置

OVF Tool 是批量部署功能的必要依赖。系统按以下优先级查找：

1. `OVFTOOL_PATH` 环境变量指定的路径
2. `bin/<platform>/` 目录下的内嵌版本
3. 系统常见安装路径（如 `/usr/bin/ovftool`、`C:\Program Files\VMware\VMware OVF Tool\ovftool.exe`）

### 自动安装

```bash
./setup-ovftool.sh /path/to/VMware-ovftool-installer.bundle
```

脚本会自动检测平台并将 OVF Tool 安装到 `bin/<platform>/` 目录。

---

## 开发模式

### 同时启动前后端

```bash
npm run dev
```

使用 `concurrently` 同时运行：
- `npm run dev:client`: Vite 开发服务器（端口 5174）
- `npm run dev:server`: Express 后端（端口 4173，带 `--watch-path` 热重载）

### 单独启动

```bash
# 仅前端
npm run dev:client

# 仅后端
npm run dev:server
```

### 开发代理

Vite 配置中已将 `/api` 路径代理到 `http://localhost:4173`，前端代码中直接使用 `/api/xxx` 即可，无需处理跨域。

---

## 生产部署

### 构建

```bash
npm run build
```

生成生产静态文件到 `dist/` 目录。

### 启动

```bash
npm start
```

生产模式下：
- `NODE_ENV=production`
- Express 自动托管 `dist/` 目录的静态文件
- 所有未匹配路由返回 `dist/index.html`（支持前端路由）
- 建议配合 Nginx 等反向代理使用，并配置 HTTPS

---

## 认证与会话

### 认证流程

1. 用户提交 vCenter/ESXi 凭据到 `/api/auth/login`
2. 后端使用凭据直接登录 vSphere SOAP API 验证
3. 验证成功后，生成随机 Token 存入内存会话 Map
4. 返回 Token 给前端，前端存入 `localStorage`
5. 后续请求通过 `Authorization: Bearer <token>` 头携带 Token

### 会话管理

- **后端**: 内存 `Map` 存储会话，包含目标主机信息、清单缓存、创建时间
- **会话有效期**: 24 小时
- **登录限流**: 基于 IP 地址，15 分钟内最多 10 次尝试
- **前端**: Zustand 管理状态，`localStorage` 持久化 Token 和目标信息

### 安全提示

- 密码仅在前端登录表单中明文传输一次，验证后不再传输
- 后端会话中存储完整凭据用于后续 vSphere API 调用
- 部署任务的密码字段在磁盘上 AES-256-GCM 加密

---

## 数据持久化

### 运行时文件

应用启动时自动创建 `data/` 目录：

| 文件 | 用途 | 格式 |
|------|------|------|
| `jobs.json` | 任务元数据列表 | JSON |
| `payloads.json` | 加密后的任务载荷 | JSON |
| `.payload-key` | AES-256-GCM 密钥（二进制，权限 0600） | 二进制 |

### 加密机制

- 算法: AES-256-GCM
- 密钥: 首次启动时随机生成 32 字节，保存到 `.payload-key`
- 加密字段: 部署任务中的 `password` 等敏感字段
- 格式: `enc:v1:<iv_base64>:<tag_base64>:<ciphertext_base64>`

### 清理策略

- 已完成/失败的任务在 24 小时后自动清理
- 会话每小时清理一次过期项

---

## 批量部署流程

1. **选择模板**: 从清单中选择一个虚拟机模板
2. **配置目标**: 
   - 选择部署到的计算资源（集群/主机）
   - 选择数据存储
   - 选择磁盘模式（精简/厚置备延迟归零/厚置备即刻归零）
3. **网络映射**: 将模板中的网络映射到目标环境的端口组
4. **命名规则**: 
   - 设置前缀（如 `Web`）
   - 设置起始编号（如 `1`）
   - 预览生成的名称（`Web-01`, `Web-02`...）
   - 单次最多部署 100 台
5. **并发设置**: 设置并行部署数量（1-20）
6. **提交任务**: 创建部署任务，进入任务监控页
7. **实时监控**: 通过 SSE 实时查看每台 VM 的部署日志和进度

---

## Web 控制台

### 技术实现

Web 控制台基于 VMware WebMKS 技术实现：

1. 用户点击"打开控制台"按钮
2. 前端调用 `/api/vms/:id/ticket` 申请 WebMKS Ticket
3. 后端使用 "优先通用、精准回退" 策略：
   - 先尝试 `AcquireTicket` (webmks) —— 兼容 ESXi 和 vCenter
   - 失败时回退到 `AcquireWebMksTicket` —— 新版 vCenter 专属
4. 前端使用 Ticket 连接 `/api/console-proxy` WebSocket 端点
5. 后端建立到 ESXi/vCenter 的原始 TLS 隧道，转发 WebSocket 数据

### 兼容性

- ESXi 6.0 / 6.5 / 7.0 / 8.0
- vCenter Server 7.0+
- 支持独立 ESXi 主机和 vCenter 管理环境

### 依赖加载

`index.html` 中按顺序加载：
```html
<script src="jquery-3.7.1.min.js"></script>
<script src="jquery-ui-1.13.2.min.js"></script>
<script src="wmks.min.js"></script>
```

所有脚本均带有 SRI（子资源完整性）校验。

---

## API 概览

### 认证
- `GET /api/auth/session` — 获取当前会话信息
- `POST /api/auth/login` — 使用 vSphere 凭据登录

### 清单与目标
- `POST /api/targets/discover` — 发现 vSphere 清单
- `POST /api/deployments/check` — 预检部署配置（冲突检测、空间检查）

### 部署
- `POST /api/deployments` — 创建批量部署任务

### 虚拟机操作
- `POST /api/vms/power` — 电源操作（on/off/reset）
- `POST /api/vms/snapshot` — 批量创建快照
- `POST /api/vms/destroy` — 批量销毁虚拟机
- `GET /api/vms/:id/snapshots` — 获取虚拟机快照列表
- `POST /api/vms/:id/snapshots` — 为指定 VM 创建快照
- `POST /api/vms/:id/rename` — 重命名虚拟机
- `POST /api/vms/:id/reconfigure` — 调整 CPU/内存配置
- `POST /api/vms/:id/ticket` — 申请 WebMKS 控制台票据

### 快照管理
- `POST /api/snapshots/:sid/revert` — 恢复到指定快照
- `DELETE /api/snapshots/:sid` — 删除指定快照

### 任务监控
- `GET /api/jobs` — 列出所有任务
- `GET /api/jobs/:id` — 获取任务详情
- `GET /api/jobs/:id/events` — SSE 实时事件流（日志、进度、状态）
- `POST /api/jobs/:id/cancel` — 取消任务
- `POST /api/jobs/:id/retry` — 重试失败任务
- `DELETE /api/jobs/:id` — 删除已完成任务

### 系统
- `GET /api/health` — 健康检查（包含 OVF Tool 可用性）

### WebSocket
- `/api/console-proxy?host=<ip>&port=443&ticket=<ticket>&token=<token>` — WebMKS 控制台隧道

---

## 开发规范

### 代码风格
- **ESM  only**: 所有文件使用 `import`/`export`，无 `require`
- **缩进**: 2 空格
- **换行**: LF
- **尾随空格**: 不允许
- **配置**: 遵循 `.editorconfig`

### 前端规范
- **组件组织**: 页面级组件放在 `src/features/`，共享组件放在 `src/components/`
- **状态管理**: 使用 Zustand，认证状态在 `useAuthStore`，应用状态在 `useAppStore`
- **样式**: Tailwind CSS + HSL CSS 变量，暗色模式通过 `class` 策略切换
- **工具函数**: `src/lib/utils.js` 中的 `cn()` 用于合并类名，`fetchJson()` 用于 API 调用

### 后端规范
- **路由位置**: 目前所有路由内联在 `server/index.js` 中
- **服务层**: vSphere 相关逻辑封装在 `server/services/vmService.js`
- **任务处理**: 异步任务在 `server/jobs.js` 中管理，支持持久化和加密

### 添加新功能
- **新页面**: 在 `src/features/` 创建组件，在 `src/App.jsx` 添加路由
- **新 API**: 在 `server/index.js` 添加 Express 路由处理函数
- **新 vSphere 操作**: 在 `server/services/vmService.js` 添加方法

---

## 已知限制

- **无数据库**: 所有状态保存在内存和 JSON 文件中，不适合多实例部署
- **无测试框架**: 项目目前没有单元测试或集成测试
- **无代码检查**: 无 ESLint、Prettier 或 TypeScript 配置
- **无 CI/CD**: 无自动化构建或部署流程
- **会话无上限**: 内存中的会话 Map 没有硬上限，高负载下可能占用大量内存
- **API 响应格式不一致**: 不同端点使用 `{ ok }`、`{ error }`、`{ errors }` 等不同格式
- **TLS 证书验证禁用**: 为兼容自签名证书，vSphere 连接和 WebSocket 代理均关闭证书验证
- **Windows 兼容**: `npm start` 脚本中的 `NODE_ENV=production` 在 Windows PowerShell 中可能需要调整

---

## 安全说明

### 凭据处理
- 用户 vSphere 密码在登录时验证后，保存在后端内存会话中用于后续 API 调用
- 部署任务中的密码在磁盘上 AES-256-GCM 加密
- 前端 `localStorage` 中保存 Token 和目标信息（密码字段已清空）

### 网络安全
- WebMKS 控制台代理使用原始 TLS 连接，设置 `rejectUnauthorized: false` 以兼容自签名证书
- 建议在受信任的网络环境中部署，或在前端使用 Nginx 反向代理并配置 TLS
- 登录接口有基于 IP 的速率限制

### 推荐部署方式
```
Internet → Nginx (HTTPS/TLS) → vSphere Nexus (localhost:4173)
                ↑
         静态文件 (dist/)
         API 代理 (/api)
```

---

## 故障排查

### OVF Tool 不可用
- 检查 `npm start` 启动日志中的 ovftool 路径
- 运行 `/api/health` 查看 `ovftoolAvailable` 字段
- 手动设置 `OVFTOOL_PATH` 环境变量
- 运行 `./setup-ovftool.sh` 安装内嵌版本

### 登录失败
- 确认 vCenter/ESXi 地址可达（`ping <host>`）
- 检查用户名格式（vCenter 通常需要 `administrator@vsphere.local`）
- 查看后端日志中的具体错误信息
- 确认账户有 sufficient privileges

### 控制台无法连接
- 确认浏览器支持 WebSocket
- 检查防火墙是否放行到 ESXi/vCenter 的 443 端口
- 查看浏览器开发者工具中的 WebSocket 连接错误
- 对于独立 ESXi，确保 `AcquireTicket` 接口可用

### 部署失败
- 检查目标数据存储剩余空间
- 确认网络映射配置正确（源网络 → 目标端口组）
- 检查计算资源是否有足够资源（CPU/内存）
- 查看任务日志中的具体错误

### 任务状态异常
- 如果服务端重启，运行中任务会变为中断状态，可尝试"重试"
- 如果任务长时间无响应，可尝试"取消"后重新创建

---

## 贡献指南

欢迎提交 Issue 和 Pull Request。

### 提交 Issue
- 描述问题时请包含：环境信息（Node 版本、操作系统）、复现步骤、预期行为、实际行为
- 如有可能，附上后端日志和浏览器控制台输出

### 提交 PR
1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/你的特性名`
3. 提交更改：`git commit -m "feat: 描述你的更改"`
4. 推送到分支：`git push origin feature/你的特性名`
5. 创建 Pull Request

### 代码提交规范
- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `perf:` 性能优化
- `chore:` 构建/工具

---

## 许可证

[Apache-2.0](LICENSE)

© 2026 vSphere Nexus Team. 由 bunnyruihan 开发。
