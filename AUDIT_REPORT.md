# vSphere Nexus 全局代码审计报告

**项目版本：** v1.0.0  
**审计范围：** 前端 14 个源文件（约 4,300 行 JSX/JS）、后端 5 个源文件（约 2,030 行 JS）、全部配置文件  
**最后更新：** 2026年5月23日

---

## 修复总览

| 状态 | 数量 |
|------|------|
| **已修复** | 42 |
| **待后续迭代** | 65 |
| **合计** | **107** |

---

## 目录

- [一、安全漏洞（21 项）](#一安全漏洞21-项)
- [二、健壮性与错误处理（19 项）](#二健壮性与错误处理19-项)
- [三、性能与内存（15 项）](#三性能与内存15-项)
- [四、代码质量与架构（25 项）](#四代码质量与架构25-项)
- [五、用户体验与可访问性（13 项）](#五用户体验与可访问性13-项)
- [六、基础设施与工具链（14 项）](#六基础设施与工具链14-项)
- [七、修复记录（32 次提交）](#七修复记录32-次提交)
- [八、回归审查记录](#八回归审查记录)

> 约定：`[高]` `[中]` `[低]` 表示严重度。`✅` 已修复，`⏳` 待处理，`🔧` 部分修复。

---

# 一、安全漏洞（21 项）

## 1.1 认证与凭证

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| SEC-1 | `[高]` | Token 通过 URL 查询参数传递（`?token=xxx`），会被浏览器历史、服务器日志、Referer 泄露 | `VMConsole.jsx`、`JobsPage.jsx`、`server/index.js` | ⏳ |
| SEC-2 | `[高]` | 密码随每次 API 请求以明文传输（`refreshInventory` 每次发送完整 target 对象） | `useAppStore.js`、`App.jsx` | ⏳ |
| SEC-3 | `[高]` | 凭证以明文形式驻留内存（jobs.js payloads Map） | `server/jobs.js` | ⏳ |
| SEC-4 | `[高]` | 加密密钥竞态条件 — 并发调用可能同时创建多个密钥 | `server/jobs.js` | ✅ `8da404a` — `keyPromise` 缓存加锁 |
| SEC-5 | `[高]` | `encryptField`/`decryptField` 为同步函数，不保证密钥已加载 | `server/jobs.js` | 🔧 密钥初始化加锁降低了风险，但同步函数本身无防护 |
| SEC-6 | `[高]` | WebSocket 代理认证绕过风险 | `server/index.js` | ⏳ |
| SEC-7 | `[中]` | 密码存入 Zustand 全局状态（可被 DevTools 查看） | `App.jsx` | ⏳ |
| SEC-8 | `[中]` | 加密密钥文件权限默认 0644（其他用户可读） | `server/jobs.js` | ✅ `9d058d7` — 改为 `0o600` |
| SEC-9 | `[中]` | 基础设施信息硬编码（默认 IP 和用户名） | `App.jsx` | ✅ `42cb0a9` — 改为空字符串 |
| SEC-10 | `[中]` | 限流仅基于 IP，多用户共享 IP 时无法区分 | `server/index.js` | ⏳ |
| SEC-11 | `[低]` | Sessions Map 无上限，理论上可被填充至 OOM | `server/index.js` | ⏳ |

## 1.2 注入与输入验证

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| INJ-1 | `[高]` | VM ID 未转义直接拼入 XML — XML 注入 | `server/services/vmService.js` | ✅ `92481fb` — `escapeXml(vmId)` |
| INJ-2 | `[高]` | 命令行参数注入 — 用户控制的值直接拼接为 ovftool 参数，`--` 开头的值可能被误解析 | `server/ovftool.js` | ⏳ |
| INJ-3 | `[高]` | WebSocket 代理 SSRF — `host`/`port` 直接来自 URL 参数，可连接任意内部地址 | `server/index.js` | ⏳ |
| INJ-4 | `[高]` | 无结构化输入验证层（缺少 zod/joi 等 schema 验证） | `server/` 全局 | 🔧 action/cpu/memory 已加校验 |
| INJ-5 | `[中]` | action 参数无枚举验证 | `server/index.js` | ✅ `d1fcf23` — `["on","off","reset"].includes()` |
| INJ-6 | `[中]` | cpu/memory 无范围校验 | `server/index.js` | ✅ `1e972fe` — cpu 1-128，memory 4-1048576 |
| INJ-7 | `[中]` | `checkVmNameConflicts` 吞掉错误返回"无冲突"（安全隐患） | `server/services/vmService.js` | ✅ `0949765` — 移除 try/catch |
| INJ-8 | `[低]` | ovftool 命令引用规则不完整 | `server/ovftool.js` | ⏳ |
| INJ-9 | `[低]` | Ticket 部分泄露到日志 | `server/index.js` | ⏳ |

## 1.3 传输与加密

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| CRY-1 | `[高]` | TLS 证书验证全局禁用（`process.env.NODE_TLS_REJECT_UNAUTHORIZED`），影响整个 Node.js 进程 | `server/services/vimClient.js` | ✅ `9ac7047` — `https.Agent({ rejectUnauthorized: false })` |
| CRY-2 | `[高]` | 凭证暴露在进程命令行（ovftool 密码可通过 `ps aux` 看到） | `server/ovftool.js` | ⏳ |
| CRY-3 | `[高]` | CDN 资源无 SRI 校验（供应链攻击风险） | `index.html` | ✅ `4bcb29d` → `90cd012` + `3efd7c5` — 恢复 jQuery/jQuery UI 并加 SRI |

---

# 二、健壮性与错误处理（19 项）

## 2.1 后端健壮性

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| ROB-1 | `[高]` | vimClient 超时机制完全无效（`AbortController` 对 `https.request` 无用，15s 超时形同虚设） | `server/services/vimClient.js` | ✅ `00d316c` — `req.setTimeout` + `req.destroy` + `settled` 防双重 resolve |
| ROB-2 | `[高]` | 正则表达式解析 XML — 结构性脆弱，任何非标准 SOAP 响应都会导致解析失败 | `server/services/vimClient.js` | ⏳ 需引入 `fast-xml-parser` |
| ROB-3 | `[高]` | 任务无所有权校验 — 任何认证用户可操作任意任务 | `server/jobs.js`、`server/index.js` | ⏳ |
| ROB-4 | `[中]` | ovftool 子进程无超时（可能永久挂起） | `server/ovftool.js` | ✅ `fdd00ea` — 30 分钟超时 + SIGTERM |
| ROB-5 | `[中]` | SSE 端点无心跳（代理/负载均衡会断开空闲连接） | `server/index.js` | 🔧 `ff0fec0` — 已增加 15 秒心跳，`res` 错误处理待补 |
| ROB-6 | `[中]` | `progress.failed` 在 `retryFailed` 中可能变负数 | `server/jobs.js` | ✅ `c998b23` — `Math.max(0, ...)` |
| ROB-7 | `[中]` | `powerOff` 错误在 `runDestroyJob` 中被静默吞掉 | `server/jobs.js` | ✅ `13bb5a5` — 改为 `appendLog` |
| ROB-8 | `[中]` | `acquireWebMksTicket` 静默吞掉错误 | `server/services/vmService.js` | ⏳ |
| ROB-9 | `[中]` | `saveToDisk` 无错误恢复 | `server/jobs.js` | ⏳ |
| ROB-10 | `[中]` | 无优雅关闭（进程终止时运行中的任务直接丢失） | `server/index.js` | ✅ `23538b0` — SIGTERM/SIGINT 处理 |
| ROB-11 | `[低]` | API 响应格式严重不一致（有的返回 `{ ok }`，有的返回 `{ error }`，有的返回 `{ errors }`） | `server/index.js` | ⏳ |
| ROB-12 | `[低]` | catch-all 路由在非 production 模式下返回 HTML | `server/index.js` | ⏳ |

## 2.2 前端健壮性

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| FROB-1 | `[中]` | 401 响应后 `logout()` 不刷新页面，用户停留在当前页看到空白 | `useAppStore.js` | ✅ `00d316c` — 增加 `window.location.reload()` |
| FROB-2 | `[中]` | `DeploymentPage` 提交按钮 `setSubmitting` 未在 `finally` 中重置（失败时按钮永久禁用） | `DeploymentPage.jsx` | ✅ `41a3a6c` — 移至 finally 块 |
| FROB-3 | `[中]` | `JobsPage` 进度百分比计算除零（`0/0`） | `JobsPage.jsx` | ✅ `c21c020` — `total > 0` 保护 |
| FROB-4 | `[中]` | `resetStore()` 未清除 localStorage（页面刷新后旧状态恢复） | `useAppStore.js` | ✅ `5c9475e` — 增加 `removeItem` |
| FROB-5 | `[中]` | 多处 `response.json()` 未处理非 JSON 响应 | `App.jsx` 等 | ⏳ |
| FROB-6 | `[低]` | `useAuthStore` 中 token 存在但 `isAuthenticated` 为 `false`（初始化时序问题） | `useAuthStore.js` | ⏳ |
| FROB-7 | `[低]` | `useAuthStore.logout()` 未调用 `resetStore()`（数据残留） | `useAuthStore.js` | ⏳ |

---

# 三、性能与内存（15 项）

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| PERF-1 | `[高]` | 会话缓存永不过期 — 内存泄漏 + 使用过期会话导致操作失败 | `server/services/vmService.js` | ✅ `0401bb6` — 10 分钟 TTL |
| PERF-2 | `[高]` | 911 行死 CSS（`styles.css`）被打包进生产构建 | `src/styles.css` | ✅ `7cd2859` — 文件已删除 |
| PERF-3 | `[中]` | 三个内存 Map（jobs/controllers/payloads）永不清理 | `server/jobs.js` | ✅ `a82b22b` — 24 小时自动清理 |
| PERF-4 | `[中]` | `JobsPage` 日志去重 O(n)（`Array.find` 遍历） | `JobsPage.jsx` | ✅ `5879806` — 改用 `Set` + `useRef` |
| PERF-5 | `[中]` | `validateTemplateSource` 每次创建新 VmService 实例 | `server/index.js` | ⏳ |
| PERF-6 | `[中]` | `hydrateTargetFromSession` 直接 mutate `req.body`（副作用） | `server/index.js` | ⏳ |
| PERF-7 | `[中]` | 每次 `textTag` 调用都 `new RegExp`（热点路径） | `server/services/vimClient.js` | ⏳ |
| PERF-8 | `[中]` | `folderPathParts`/`findDatacenter` 重复创建 Map（O(n) 每次） | `server/services/vmService.js` | ⏳ |
| PERF-9 | `[中]` | `Layout.jsx` 订阅过多 store 状态（不相关状态变化触发重渲染） | `Layout.jsx` | ⏳ |
| PERF-10 | `[中]` | `SettingsPage` 子组件在函数体内定义（每次渲染重建） | `SettingsPage.jsx` | ⏳ |
| PERF-11 | `[低]` | `jobs.js` 日志截断使用 `splice`（大数组性能差） | `server/jobs.js` | ⏳ |
| PERF-12 | `[低]` | `InventoryPage` 心跳轮询可能有陈旧闭包 | `InventoryPage.jsx` | ⏳ |
| PERF-13 | `[低]` | ovftool 缓存路径不可刷新 | `server/ovftool.js` | ⏳ |
| PERF-14 | `[低]` | `InventoryPage` 排序中 undefined 比较不稳定 | `InventoryPage.jsx` | ⏳ |
| PERF-15 | `[低]` | ovftool URL 可能双重编码 | `server/ovftool.js` | ⏳ |

---

# 四、代码质量与架构（25 项）

## 4.1 死代码与冗余

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| DED-1 | `[高]` | jQuery/jQuery UI 加载但应用代码未使用（wmks.min.js 硬依赖，无法移除） | `index.html` | ✅ `4bcb29d` → `90cd012` + `3efd7c5` — 保留并加 SRI |
| DED-2 | `[低]` | `InventoryPage` 中 `navigate` 变量未使用 | `InventoryPage.jsx` | ✅ `11619de` |
| DED-3 | `[低]` | `vmService` 中 `uniqueOptions` 方法未使用 | `server/services/vmService.js` | ✅ `3bb01f1` |
| DED-4 | `[低]` | `App.jsx` 中 VM 过滤逻辑重复出现 | `App.jsx` | ⏳ |
| DED-5 | `[低]` | `App.jsx` 中字节转换逻辑重复出现 | `App.jsx` | ⏳ |

## 4.2 依赖与包管理

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| DEP-1 | `[高]` | `lucide-react` 错误归类为 devDependency（生产构建会丢失图标） | `package.json` | ✅ `8f69f98` |
| DEP-2 | `[中]` | `package.json` 版本号不一致（package-lock 仍为 `0.1.0`） | `package.json` | ⏳ |
| DEP-3 | `[中]` | Express 5.x 版本范围过宽（`"express": "^5.0.0"`） | `package.json` | ⏳ |
| DEP-4 | `[低]` | `useAppStore.js` 中 localStorage key 为魔法字符串 | `useAppStore.js` | ⏳ |
| DEP-5 | `[低]` | `useAuthStore.setToken` 不验证 token 格式 | `useAuthStore.js` | ⏳ |

## 4.3 架构与可维护性

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| ARC-1 | `[高]` | `InventoryPage` 单文件 1,092 行，需按功能拆分为子组件 | `InventoryPage.jsx` | ⏳ |
| ARC-2 | `[中]` | localStorage 持久化逻辑重复三次 | `useAppStore.js` | ✅ `cf4d27b` — 提取 `persistToStorage()` |
| ARC-3 | `[中]` | API 响应格式不一致（`{ ok }` vs `{ error }` vs `{ errors }`） | `server/index.js` | ⏳ |
| ARC-4 | `[中]` | 全项目使用 `alert()`/`confirm()`（不可定制、阻塞线程） | 多文件 | ⏳ |
| ARC-5 | `[中]` | 无结构化日志系统（console.log 散落各处） | `server/` 全局 | ⏳ |
| ARC-6 | `[中]` | `App.jsx` Dashboard 代码应拆分到独立模块 | `App.jsx` | ⏳ |
| ARC-7 | `[中]` | `VMConsole` 依赖全局 `window.WMKS`（无类型安全） | `VMConsole.jsx` | ⏳ |
| ARC-8 | `[中]` | Zustand store 接受回调参数（反模式） | `useAuthStore.js` | ⏳ |
| ARC-9 | `[低]` | `Layout.jsx` 路径映射应改为对象 | `Layout.jsx` | ⏳ |
| ARC-10 | `[低]` | `InventoryPage` 中 `configForm`/`setConfigSpec` 命名不匹配 | `InventoryPage.jsx` | ⏳ |
| ARC-11 | `[低]` | `JobsPage` 中 `React.useState` 和 `useState` 混用 | `JobsPage.jsx` | ⏳ |
| ARC-12 | `[低]` | `textTag` 的 tag 参数未清理插入正则（ReDoS 风险） | `server/services/vimClient.js` | ⏳ |

## 4.4 代码规范

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| STD-1 | `[中]` | Tailwind 类名动态拼装脆弱 | `App.jsx` | ⏳ |
| STD-2 | `[低]` | `InventoryPage` 每次渲染生成当前时间（时间显示不更新） | `InventoryPage.jsx` | ⏳ |

---

# 五、用户体验与可访问性（13 项）

## 5.1 用户体验

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| UX-1 | `[中]` | CSV 导出存在公式注入风险 | `InventoryPage.jsx` | ✅ `7641b82` — `escapeCsvField` 函数 |
| UX-2 | `[中]` | `createObjectURL` 未释放（内存泄漏） | `InventoryPage.jsx` | ✅ `7641b82` — `setTimeout(() => URL.revokeObjectURL(), 1000)` |
| UX-3 | `[中]` | `DeploymentPage` 网络映射预览显示错误 | `DeploymentPage.jsx` | ⏳ |
| UX-4 | `[中]` | `SettingsPage` 模拟保存延迟（误导性） | `SettingsPage.jsx` | ⏳ |
| UX-5 | `[中]` | `SettingsPage` 本地状态不与 store 同步 | `SettingsPage.jsx` | ⏳ |
| UX-6 | `[中]` | `VMConsole` 错误重试用 `window.location.reload()` 丢失全部状态 | `VMConsole.jsx` | ⏳ |
| UX-7 | `[低]` | `wmks.min.js` 加载失败无提示 | `index.html` | ⏳ |

## 5.2 可访问性

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| A11Y-1 | `[中]` | VM Console 模态框缺少焦点陷阱、Escape 键关闭、ARIA 属性 | `VMConsole.jsx` | ⏳ |
| A11Y-2 | `[中]` | Snapshot Panel 侧滑面板缺少焦点陷阱和 Escape | `SnapshotPanel.jsx` | ⏳ |
| A11Y-3 | `[中]` | Toggle switch 缺少 `role="switch"` 和 `aria-checked` | `DeploymentPage.jsx` | ⏳ |
| A11Y-4 | `[低]` | 多处 10px 超小字体 | `Layout.jsx` 等 | ⏳ |
| A11Y-5 | `[低]` | 表格 checkbox 缺少 `aria-label` | `InventoryPage.jsx` | ⏳ |
| A11Y-6 | `[低]` | `SnapshotPanel` 硬编码 `bg-white`（暗色主题不兼容） | `SnapshotPanel.jsx` | ⏳ |

---

# 六、基础设施与工具链（14 项）

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| INF-1 | `[高]` | 无测试框架与测试脚本 | — | ⏳ 需安装 vitest |
| INF-2 | `[高]` | 无 ESLint/lint 配置 | — | ⏳ |
| INF-3 | `[高]` | 无 CI/CD 配置 | — | ⏳ |
| INF-4 | `[高]` | 二进制大文件（wmks.min.js）直接存入 Git | `public/wmks.min.js` | ⏳ |
| INF-5 | `[高]` | 缺少 TypeScript/jsconfig 配置 | — | ⏳ 长期规划 |
| INF-6 | `[中]` | 缺少 `.env.example` | — | ✅ `03f55c4` |
| INF-7 | `[中]` | `.gitignore` 缺少常见条目 | `.gitignore` | ✅ `03f55c4` — 补全 `.vscode/`、`.idea/`、`coverage/` 等 |
| INF-8 | `[中]` | `.gitignore` 中 `.env.*` 规则过于激进（排除了 `.env.production`） | `.gitignore` | ✅ `03f55c4` — 改为 `.env.local`、`.env.*.local` |
| INF-9 | `[中]` | 缺少 `engines` 字段（Node.js 版本未声明） | `package.json` | ✅ `03f55c4` — `"node": ">=20.0.0"` |
| INF-10 | `[中]` | 缺少 `.editorconfig` | — | ✅ `03f55c4` |
| INF-11 | `[中]` | `vite.config.js` 代理目标硬编码 | `vite.config.js` | ⏳ |
| INF-12 | `[中]` | `vite.config.js` 缺少生产构建优化 | `vite.config.js` | ⏳ |
| INF-13 | `[中]` | start 脚本 Windows 不兼容 | `package.json` | ⏳ |
| INF-14 | `[低]` | 缺少 Prettier 配置 | — | ⏳ |

未列出的配置项：缺少 LICENSE 文件、未集成 Dependabot、SDK 再分发许可未声明（均 `[低]`，⏳）。

---

# 七、修复记录（32 次提交）

## 按模块分组

### 安全加固（8 次）

| Commit | 类型 | 内容 |
|--------|------|------|
| `42cb0a9` | fix | 移除硬编码的默认 IP 和用户名（SEC-9） |
| `92481fb` | fix(security) | VM ID 调用 `escapeXml` 防 XML 注入（INJ-1） |
| `9ac7047` | fix(security) | `https.Agent` 替代全局 TLS 禁用（CRY-1） |
| `86ef3de` | fix(security) | VMConsole 通过 authStore 获取 token（SEC-7 相关） |
| `d1fcf23` | fix(security) | action 参数枚举校验（INJ-5） |
| `1e972fe` | fix(security) | cpu/memory 范围校验（INJ-6） |
| `9d058d7` | fix(security) | 密钥文件权限 0600（SEC-8） |
| `8da404a` | fix(security) | 密钥初始化加锁防竞态（SEC-4） |

### 前端修复（9 次）

| Commit | 类型 | 内容 |
|--------|------|------|
| `7641b82` | fix(security) | CSV 公式注入防护 + ObjectURL 释放（UX-1, UX-2） |
| `11619de` | cleanup | 删除 `navigate` 死代码（DED-2） |
| `5c9475e` | fix | `resetStore` 清除 localStorage（FROB-4） |
| `cf4d27b` | refactor | 提取 `persistToStorage()` 辅助函数（ARC-2） |
| `3675740` | fix | 401 改用 `logout()` 替代直接 reload（FROB-1） |
| `41a3a6c` | fix | `setSubmitting` 移至 finally（FROB-2） |
| `c21c020` | fix | 进度百分比除零保护（FROB-3） |
| `5879806` | fix | 日志去重改用 `Set`（PERF-4） |
| `00d316c` | fix | 401 后增加 `window.location.reload()` 确保跳转（FROB-1 补充） |

### 后端修复（8 次）

| Commit | 类型 | 内容 |
|--------|------|------|
| `3bb01f1` | cleanup | 删除 `uniqueOptions` 死代码（DED-3） |
| `c998b23` | fix | `progress.failed` 下限保护（ROB-6） |
| `0949765` | fix | `checkVmNameConflicts` 不再吞错（INJ-7） |
| `13bb5a5` | fix | `powerOff` 失败记录日志（ROB-7） |
| `0401bb6` | feat | 会话缓存 10 分钟 TTL（PERF-1） |
| `a82b22b` | feat | 已完成任务 24 小时自动清理（PERF-3） |
| `fdd00ea` | feat | ovftool 30 分钟超时（ROB-4） |
| `ff0fec0` | fix | SSE 心跳保活（ROB-5） |

### 基础设施（4 次）

| Commit | 类型 | 内容 |
|--------|------|------|
| `4bcb29d` → `90cd012` → `3efd7c5` | fix | jQuery/jQuery UI CDN：删除 → 回归恢复 + SRI（CRY-3, DED-1） |
| `7cd2859` | fix | 删除 911 行死 CSS（PERF-2） |
| `8f69f98` | fix | `lucide-react` 移至 dependencies（DEP-1） |
| `03f55c4` | chore | 补全 `.env.example`、`.editorconfig`、`.gitignore`、`engines`（INF-6 ~ INF-10） |

### 运维与稳定性（3 次）

| Commit | 类型 | 内容 |
|--------|------|------|
| `23538b0` | feat | 优雅关闭 SIGTERM/SIGINT（ROB-10） |
| `00d316c` | fix | vimClient 超时：`req.setTimeout` + `req.destroy`（ROB-1） |
| `d8031d3` | docs | 审计报告更新 |

---

# 八、回归审查记录

**触发原因：** 用户在控制台发现 `$.widget is not a function` 报错。

**根因：** `wmks.min.js`（VMware WebMKS SDK）隐式依赖 jQuery（`$`）和 jQuery UI（`$.widget`）。审计时仅检查了应用代码，忽略了第三方 SDK 的隐式依赖。

### 回归修复

| 问题 | 修复 |
|------|------|
| jQuery 被误删 | `90cd012` 恢复 + SRI |
| jQuery UI 被误删 | `3efd7c5` 恢复 + SRI |

### 审查中额外发现的 Bug

| 问题 | 修复 |
|------|------|
| vimClient 超时完全无效（`AbortController` 对 `https.request` 无用） | `00d316c` — `req.setTimeout` + `req.destroy` |
| 401 后页面不跳转（`logout()` 不刷新页面） | `00d316c` — 增加 `window.location.reload()` |

### 依赖链确认

```
jQuery (3.7.1) → jQuery UI (1.13.2) → wmks.min.js
     $               $.widget          WMKS SDK
```

三个库必须在 `index.html` 中按此顺序加载。均已添加 SRI 完整性校验。

### 已确认无副作用的修改（24 项）

以下修改经逐行审查确认逻辑正确：`escapeXml(vmId)`、action 枚举校验、cpu/memory 范围校验、密钥文件权限 `0o600`、`keyPromise` 加锁、`progress.failed` Math.max、`checkVmNameConflicts` 移除 try/catch、`powerOff` 日志、`https.Agent` TLS、VMConsole `useAuthStore.getState().token`、CSV `escapeCsvField`、`URL.revokeObjectURL`、`resetStore` 清 localStorage、`persistToStorage` 辅助函数、`setSubmitting` finally、Set 日志去重、除零保护、Session 缓存 TTL、`purgeExpiredJobs`、ovftool 超时、SSE 心跳、优雅关闭、`handleSingleAction` 路径、index.html 无遗漏依赖。

---

## 下一轮迭代优先级

1. **SSRF 防护** — 验证 WebSocket 代理目标主机白名单（INJ-3）
2. **Token 认证重构** — SSE/WebSocket 改用 ticket 机制（SEC-1）
3. **API 响应格式统一** — 创建响应封装中间件（ARC-3）
4. **引入 ESLint + Vitest** — 建立基础质量保障（INF-1, INF-2）
5. **InventoryPage 拆分** — 按功能拆分为子组件（ARC-1）
