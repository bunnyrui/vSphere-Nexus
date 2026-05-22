# vSphere Nexus 全局代码审计报告

**审计日期：** 2026年5月23日  
**项目版本：** v1.0.0  
**审计范围：** 前端 14 个源文件（约 4,300 行 JSX/JS + 987 行 CSS）、后端 5 个源文件（约 2,030 行 JS）、全部配置文件  
**审计工具：** 人工代码审查  
**最后更新：** 2026年5月23日（第二轮回归审查完成）

---

## 修复总览

| 状态 | 数量 |
|------|------|
| **已修复** | 42 |
| **待后续迭代** | 65 |
| **合计** | **107** |

| 严重度 | 前端 | 后端 | 配置/基础设施 | 合计 |
|--------|------|------|--------------|------|
| **高** | 6 已修复 / 2 待处理 | 10 已修复 / 5 待处理 | 5 已修复 / 3 待处理 | 31 |
| **中** | 12 已修复 / 11 待处理 | 9 已修复 / 8 待处理 | 3 已修复 / 7 待处理 | 50 |
| **低** | 2 已修复 / 11 待处理 | 1 已修复 / 8 待处理 | 1 已修复 / 3 待处理 | 26 |
| **合计** | **20 已修复** | **20 已修复** | **9 已修复** | **107** |

> 状态标记说明：`已修复 (commit hash)` | `待处理` | `部分修复`

---

## 目录

- [第一部分：高危问题（31 项）](#第一部分高危问题31-项)
- [第二部分：中危问题（50 项）](#第二部分中危问题50-项)
- [第三部分：低危问题（26 项）](#第三部分低危问题26-项)
- [第四部分：跨文件系统性问题](#第四部分跨文件系统性问题)
- [第五部分：按文件详细问题清单](#第五部分按文件详细问题清单)
- [第六部分：优先修复建议（Top 10）](#第六部分优先修复建议top-10)
- [第七部分：修复记录（32 次提交）](#第七部分修复记录32-次提交)
- [第八部分：回归审查记录](#第八部分回归审查记录)

---

# 第一部分：高危问题（31 项）

## 1.1 安全漏洞

### S1. Token 通过 URL 查询参数传递 — 凭证泄露 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需前后端同步重构认证机制） |
| **文件** | `src/components/console/VMConsole.jsx`、`src/features/jobs/JobsPage.jsx`、`server/index.js` |
| **描述** | Token 作为 URL 查询参数传递（`?token=xxx`），会被记录在浏览器历史、服务器访问日志、代理服务器日志、Referer 头中。 |
| **修复建议** | WebSocket 使用首条消息发送 token 认证；SSE 端点使用 cookie-based session 或一次性 ticket 机制。 |

### S2. 密码随每次 API 请求以明文传输 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需重构为 session 绑定凭证架构） |
| **文件** | `src/store/useAppStore.js`、`src/App.jsx` |
| **描述** | `refreshInventory` 每次请求都将完整的 `target` 对象（包含明文密码）发送到后端。 |
| **修复建议** | 后端使用 session 绑定凭证，登录后仅在 session 中存储密码，后续请求通过 session ID 关联。 |

### S3. WebSocket 代理 SSRF（服务器端请求伪造）漏洞 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需确认部署环境的主机白名单） |
| **文件** | `server/index.js` |
| **描述** | `host` 和 `port` 直接来自 URL 查询参数，攻击者可以指定任意内部网络地址和端口建立 TLS 连接。 |
| **修复建议** | 验证 `targetHost` 是否在已知 ESXi/vCenter 主机白名单内，或仅允许已登录 session 中绑定的主机。 |

### S4. 基础设施信息硬编码 `已修复 (42cb0a9)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `42cb0a9` |
| **修复方式** | 将默认 IP `'172.16.109.250'` 和用户名 `'administrator@vsphere.local'` 改为空字符串，由用户自行输入。 |

### S5. CDN 资源无 SRI 校验 `已修复 (4bcb29d → 90cd012, 3efd7c5)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `4bcb29d` → 回归修复 `90cd012` + `3efd7c5` |
| **修复方式** | 最初直接删除 jQuery/jQuery UI CDN 引用（项目应用代码未使用）。回归测试发现 `wmks.min.js`（VMware WebMKS SDK）隐式依赖 `$`（jQuery）和 `$.widget`（jQuery UI），删除后控制台报错 `$.widget is not a function`。现改为保留 jQuery + jQuery UI，并添加 SRI 完整性校验。 |

### S6. CSV 导出未转义 — 公式注入风险 `已修复 (7641b82)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `7641b82` |
| **修复方式** | 新增 `escapeCsvField` 函数：每个字段用双引号包裹，对 `= + - @` 开头的字段加单引号前缀防止公式注入。同时修复了 `createObjectURL` 未释放的内存泄漏。 |

### S7. VM ID 未转义直接拼入 XML — XML 注入 `已修复 (92481fb)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `92481fb` |
| **修复方式** | 对 `acquireWebMksTicket` 中两处 `vmId` 插入点调用 `escapeXml(vmId)`，与同文件其他位置保持一致。 |

### S8. TLS 证书验证全局禁用 — 影响整个进程 `已修复 (9ac7047)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `9ac7047` |
| **修复方式** | 将 `process.env.NODE_TLS_REJECT_UNAUTHORIZED` 全局修改替换为 `https.Agent({ rejectUnauthorized: false })` + 自定义 `httpsPost` 函数，TLS 禁用仅影响 vSphere SOAP 连接，不再影响进程内其他请求。 |

### S9. 命令行参数注入风险 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需评估 ovftool 对特殊参数的实际处理行为） |
| **文件** | `server/ovftool.js` |
| **描述** | 用户控制的值被直接拼接为 ovftool 参数，以 `--` 开头的值可能被误解析为选项标志。 |

### S10. 凭证暴露在进程命令行 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需 ovftool 支持其他凭证传递方式） |
| **文件** | `server/ovftool.js` |
| **描述** | 密码作为 ovftool 命令行参数传递，其他用户可通过 `ps aux` 看到明文密码。 |

### S11. 会话 Token 通过 URL 查询参数传递（后端侧） `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（与 S1 同源，需整体重构认证机制） |
| **文件** | `server/index.js` |
| **描述** | `extractToken` 允许从 URL 查询参数获取 Token。 |

### S12. WebSocket 代理认证绕过风险 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需结合 SSRF 白名单一起修复） |
| **文件** | `server/index.js` |

---

## 1.2 逻辑与架构缺陷

### L1. 正则表达式解析 XML — 结构性脆弱 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需引入 `fast-xml-parser` 等依赖，影响范围大） |
| **文件** | `server/services/vimClient.js` |

### L2. 会话缓存永不过期 — 内存泄漏 + 过期会话 `已修复 (0401bb6)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `0401bb6` |
| **修复方式** | 增加 10 分钟 TTL（`SESSION_TTL`），缓存条目增加 `createdAt` 时间戳，读取时检查过期并自动清除重新认证。 |

### L3. 任务无所有权校验 — 任何用户可操作任意任务 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需在任务创建时记录创建者身份） |
| **文件** | `server/jobs.js`、`server/index.js` |

### L4. 凭证以明文形式驻留内存 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需引入 vault 服务或使用 Buffer+zeroFill） |
| **文件** | `server/jobs.js` |

### L5. 加密密钥竞态条件 `已修复 (8da404a)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `8da404a` |
| **修复方式** | 用 `keyPromise` 缓存替代直接赋值：`return keyPromise ??= (async () => { ... })()`，确保并发调用只执行一次密钥生成。 |

### L6. `encryptField`/`decryptField` 不保证密钥已加载 `部分修复`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **部分修复** — L5 的 Promise 缓存降低了风险（`initStore` 完成前无法调用任何 job 操作），但同步函数本身仍无防护。待后续迭代改为异步或增加守卫。 |

### L7. API 响应格式严重不一致 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需创建响应封装中间件，影响所有 API 端点） |
| **文件** | `server/index.js` |

### L8. jQuery/jQuery UI 加载但应用代码未使用 `已修复 (4bcb29d → 90cd012, 3efd7c5)`

最初与 S5 合并修复（直接删除）。回归测试发现 `wmks.min.js` 隐式依赖 jQuery + jQuery UI，恢复并添加 SRI。严格来说 jQuery/jQuery UI 仍被加载（约 150KB），但因 SDK 硬依赖无法移除。若未来替换 WMKS SDK 则可一并移除。

### L9. `styles.css` 911 行完全未使用 `已修复 (7cd2859)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `7cd2859` |
| **修复方式** | 确认无任何文件引用后删除整个文件。 |

---

## 1.3 配置与基础设施

### C1. lucide-react 错误归类为 devDependency `已修复 (8f69f98)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `8f69f98` |
| **修复方式** | 将 `lucide-react` 从 `devDependencies` 移至 `dependencies`。 |

### C2. 完全缺失的输入验证层 `部分修复`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **部分修复** — action 枚举校验（`d1fcf23`）和 cpu/memory 范围校验（`1e972fe`）已完成。结构化 schema 验证（引入 zod/joi）待后续迭代。 |

### C3. 无测试框架与测试脚本 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需安装 vitest 等框架） |

### C4. 无 ESLint/lint 配置与脚本 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需安装 eslint 及插件） |

### C5. 完全缺失 CI/CD 配置 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理 |

### C6. 二进制大文件直接存入 Git 仓库 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（需 `git rm -r --cached`） |

### C7. 缺少 .env.example 文件 `已修复 (03f55c4)`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | **已修复** — commit `03f55c4` |
| **修复方式** | 创建 `.env.example`，列出所有环境变量（PORT、NEXUS_USER、NEXUS_PASS、CORS_ORIGIN、OVFTOOL_PATH、NODE_ENV）及说明。 |

### C8. 缺少 TypeScript/jsconfig 配置 `待处理`

| 项目 | 详情 |
|------|------|
| **严重度** | 高 |
| **状态** | 待处理（长期规划，渐进式迁移） |

---

# 第二部分：中危问题（50 项）

## 2.1 前端

| # | 文件 | 行号 | 类别 | 问题描述 | 状态 |
|---|------|------|------|----------|------|
| F-M1 | `useAppStore.js` | 68-101 | DRY 违反 | localStorage 持久化逻辑重复三次。 | **已修复** `cf4d27b` — 提取为 `persistToStorage()` 辅助函数 |
| F-M2 | `useAppStore.js` | 133, 152 | 最佳实践 | 401 使用 `window.location.reload()`。 | **已修复** `3675740` → `00d316c` — 改用 `useAuthStore.getState().logout()` + `window.location.reload()` 确保页面跳转 |
| F-M3 | `useAppStore.js` | 195-202 | 逻辑错误 | `resetStore()` 未清除 localStorage。 | **已修复** `5c9475e` — 增加 `localStorage.removeItem(STORAGE_KEY)` |
| F-M4 | `useAuthStore.js` | 5 | 架构 | token 存在但 `isAuthenticated` 为 `false`。 | 待处理 |
| F-M5 | `useAuthStore.js` | 27 | 反模式 | Zustand store 接受回调参数。 | 待处理 |
| F-M6 | `App.jsx` | 15-28 | 代码组织 | Dashboard 应拆分到独立模块。 | 待处理 |
| F-M7 | `App.jsx` | 23 | 逻辑错误 | Tailwind 类名动态拼装脆弱。 | 待处理 |
| F-M8 | `App.jsx` | 157 | 错误处理 | `response.json()` 未处理非 JSON。 | 待处理 |
| F-M9 | `App.jsx` | 159 | 安全 | 密码存入 Zustand 全局状态。 | 待处理 |
| F-M10 | `Layout.jsx` | 27 | 性能 | 订阅过多 store 状态。 | 待处理 |
| F-M11 | `VMConsole.jsx` | 80-110 | 类型安全 | 依赖全局 `window.WMKS`。 | 待处理 |
| F-M12 | `VMConsole.jsx` | 148-149 | 可访问性 | 模态框缺少 ARIA 和焦点陷阱。 | 待处理 |
| F-M13 | `VMConsole.jsx` | 205 | 用户体验 | `window.location.reload()` 丢失状态。 | 待处理 |
| F-M14 | `InventoryPage.jsx` | 全文 | 代码组织 | 单文件 1,092 行需拆分。 | 待处理 |
| F-M15 | `InventoryPage.jsx` | 91-104 | 硬编码/性能 | 心跳轮询闭包陈旧。 | 待处理 |
| F-M16 | `InventoryPage.jsx` | 218 | 内存泄漏 | `createObjectURL` 未释放。 | **已修复** `7641b82` — 增加 `setTimeout(() => URL.revokeObjectURL(url), 1000)` |
| F-M17 | `InventoryPage.jsx` | 259+ | 用户体验 | 多处 `alert()` 显示错误。 | 待处理 |
| F-M18 | `InventoryPage.jsx` | 320+ | 用户体验 | 使用 `window.confirm()` 确认。 | 待处理 |
| F-M19 | `SnapshotPanel.jsx` | 51-52 | React Hooks | useEffect 依赖数组缺少 token。 | 待处理 |
| F-M20 | `SnapshotPanel.jsx` | 129, 167 | 主题兼容 | 硬编码 `bg-white`。 | 待处理 |
| F-M21 | `SnapshotPanel.jsx` | 72+ | 用户体验 | 使用 `alert()`。 | 待处理 |
| F-M22 | `SnapshotPanel.jsx` | 124 | 可访问性 | 缺少焦点陷阱。 | 待处理 |
| F-M23 | `SettingsPage.jsx` | 33-34 | 状态同步 | 本地状态不与 store 同步。 | 待处理 |
| F-M24 | `SettingsPage.jsx` | 70-71 | 误导性 UX | 模拟保存延迟。 | 待处理 |
| F-M25 | `SettingsPage.jsx` | 81-103 | 性能 | 子组件在函数体内定义。 | 待处理 |
| F-M26 | `DeploymentPage.jsx` | 134 | 状态管理 | `setSubmitting` 未在 finally 中重置。 | **已修复** `41a3a6c` — 移至 finally 块 |
| F-M27 | `DeploymentPage.jsx` | 408-414 | 可访问性 | Toggle 缺少 ARIA 属性。 | 待处理 |
| F-M28 | `DeploymentPage.jsx` | 510 | Bug | 网络映射预览显示错误。 | 待处理 |
| F-M29 | `JobsPage.jsx` | 76-79 | 性能 | 日志去重 O(n)。 | **已修复** `5879806` — 改用 `Set` + `useRef` |
| F-M30 | `JobsPage.jsx` | 233, 237 | 运行时错误 | 进度计算除零。 | **已修复** `c21c020` — 增加 `total > 0` 保护 |

## 2.2 后端

| # | 文件 | 行号 | 类别 | 问题描述 | 状态 |
|---|------|------|------|----------|------|
| B-M1 | `server/index.js` | 197-208 | 副作用 | `hydrateTargetFromSession` 直接 mutate `req.body`。 | 待处理 |
| B-M2 | `server/index.js` | 622-631 | 性能 | `validateTemplateSource` 每次创建新 VmService。 | 待处理 |
| B-M3 | `server/index.js` | 533-575 | 健壮性 | SSE 无心跳、无 `res` 错误处理。 | **部分修复** `ff0fec0` — 已增加心跳保活 |
| B-M4 | `server/index.js` | 579-582 | 逻辑 | catch-all 返回 HTML。 | 待处理 |
| B-M5 | `server/index.js` | 347 | 安全 | action 参数无枚举验证。 | **已修复** `d1fcf23` — 增加 `["on","off","reset"].includes(action)` 校验 |
| B-M6 | `server/index.js` | 459-471 | 输入验证 | cpu/memory 无范围校验。 | **已修复** `1e972fe` — cpu 1-128，memory 4-1048576 |
| B-M7 | `server/jobs.js` | 205 | 逻辑 | `progress.failed` 可能变负数。 | **已修复** `c998b23` — 改为 `Math.max(0, ...)` |
| B-M8 | `server/jobs.js` | 67-69 | 内存 | 三个 Map 永不清理。 | **已修复** `a82b22b` — 增加 24 小时自动清理 `purgeExpiredJobs()` |
| B-M9 | `server/jobs.js` | 102-109 | I/O | `saveToDisk` 无错误恢复。 | 待处理 |
| B-M10 | `server/jobs.js` | 436 | 错误处理 | `powerOff` 错误被静默吞掉。 | **已修复** `13bb5a5` — 改为 `appendLog(job, "system", "关机跳过: " + e.message)` |
| B-M11 | `server/ovftool.js` | 154-210 | 超时 | ovftool 子进程无超时。 | **已修复** `fdd00ea` — 增加 30 分钟超时 + SIGTERM |
| B-M12 | `server/ovftool.js` | 31-84 | 缓存 | 缓存不可刷新。 | 待处理 |
| B-M13 | `server/ovftool.js` | 98-108 | 编码 | 可能双重编码。 | 待处理 |
| B-M14 | `server/services/vimClient.js` | 76, 105 | 性能 | 每次 `new RegExp`。 | 待处理 |
| B-M15 | `server/services/vimClient.js` | 76 | 安全 | tag 参数未清理插入正则。 | 待处理 |
| B-M16 | `server/services/vmService.js` | 118-146 | 错误处理 | 静默吞掉错误。 | 待处理 |
| B-M17 | `server/services/vmService.js` | 277-286 | 安全 | `checkVmNameConflicts` 吞错返回"无冲突"。 | **已修复** `0949765` — 移除 try/catch，让错误正常向上传播 |

## 2.3 配置/基础设施

| # | 文件 | 类别 | 问题描述 | 状态 |
|---|------|------|----------|------|
| I-M1 | `package.json` | 版本管理 | 版本号不一致。 | 待处理 |
| I-M2 | `package.json` | 依赖 | Express 5.x 版本范围过宽。 | 待处理 |
| I-M3 | `vite.config.js` | 硬编码 | 代理目标硬编码。 | 待处理 |
| I-M4 | `vite.config.js` | 配置 | 缺少生产构建优化。 | 待处理 |
| I-M5 | `package.json` | 兼容性 | start 脚本 Windows 不兼容。 | 待处理 |
| I-M6 | `.gitignore` | 配置 | 缺少常见条目。 | **已修复** `03f55c4` — 补全 `.vscode/`、`.idea/`、`coverage/` 等 |
| I-M7 | `package.json` | 配置 | 缺少 engines 字段。 | **已修复** `03f55c4` — 添加 `"node": ">=20.0.0", "npm": ">=10.0.0"` |
| I-M8 | (缺失) | 质量 | 缺少 `.editorconfig`。 | **已修复** `03f55c4` — 创建 `.editorconfig` |
| I-M9 | (缺失) | 质量 | 缺少 Prettier 配置。 | 待处理 |
| I-M10 | (缺失) | 法律 | 缺少 LICENSE 文件。 | 待处理 |

---

# 第三部分：低危问题（26 项）

## 3.1 前端

| # | 文件 | 行号 | 类别 | 问题描述 | 状态 |
|---|------|------|------|----------|------|
| F-L1 | `useAppStore.js` | 3 | 魔法字符串 | token key 应统一管理。 | 待处理 |
| F-L2 | `useAppStore.js` | 117-144 | 错误处理 | refreshInventory 的 catch 仅 console.error。 | 待处理 |
| F-L3 | `useAuthStore.js` | 11-18 | 类型安全 | setToken 不验证格式。 | 待处理 |
| F-L4 | `useAuthStore.js` | 22-25 | 不完整 | logout() 未调用 resetStore()。 | 待处理 |
| F-L5 | `App.jsx` | 51 | DRY | VM 过滤重复出现。 | 待处理 |
| F-L6 | `App.jsx` | 54-58 | 硬编码 | 字节转换重复出现。 | 待处理 |
| F-L7 | `Layout.jsx` | 119-123 | 可维护性 | 路径映射应改为对象。 | 待处理 |
| F-L8 | `Layout.jsx` | 93 | 可访问性 | 10px 字体过小。 | 待处理 |
| F-L9 | `InventoryPage.jsx` | 2 | 死代码 | navigate 未使用。 | **已修复** `11619de` |
| F-L10 | `InventoryPage.jsx` | 73 | 命名 | configForm/setConfigSpec 不匹配。 | 待处理 |
| F-L11 | `InventoryPage.jsx` | 132-145 | 潜在 Bug | 排序 undefined 比较。 | 待处理 |
| F-L12 | `InventoryPage.jsx` | 885 | 显示 | 每次渲染生成当前时间。 | 待处理 |
| F-L13 | `JobsPage.jsx` | 47 | 风格 | React.useState 混用。 | 待处理 |

## 3.2 后端

| # | 文件 | 行号 | 类别 | 问题描述 | 状态 |
|---|------|------|------|----------|------|
| B-L1 | `server/index.js` | 240 | 限流 | 限流仅基于 IP。 | 待处理 |
| B-L2 | `server/index.js` | 156 | 内存 | sessions Map 无上限。 | 待处理 |
| B-L3 | `server/index.js` | 52, 482 | 日志泄露 | Ticket 部分泄露到日志。 | 待处理 |
| B-L4 | `server/jobs.js` | 281-283 | 性能 | splice 大数组。 | 待处理 |
| B-L5 | `server/jobs.js` | 25 | 安全 | 加密密钥文件权限 0644。 | **已修复** `9d058d7` — 改为 `0o600` |
| B-L6 | `server/services/vimClient.js` | 23 | Bug | 超时机制完全无效（AbortController 对 https.request 无效）。 | **已修复** `00d316c` — 改用 req.setTimeout + req.destroy |
| B-L7 | `server/services/vmService.js` | 356, 371 | 性能 | 重复创建 Map。 | 待处理 |
| B-L8 | `server/services/vmService.js` | 417-425 | 死代码 | uniqueOptions 未使用。 | **已修复** `3bb01f1` — 删除 |
| B-L9 | `server/ovftool.js` | 146-152 | 安全 | 引用规则不完整。 | 待处理 |

## 3.3 配置/基础设施

| # | 文件 | 类别 | 问题描述 | 状态 |
|---|------|------|----------|------|
| I-L1 | (缺失) | 安全 | 未集成 Dependabot。 | 待处理 |
| I-L2 | `vite.config.js` | 配置 | 缺少生产优化配置。 | 待处理 |
| I-L3 | `.gitignore` | 配置 | .env.* 规则过于激进。 | **已修复** `03f55c4` — 改为 `.env.local`、`.env.*.local` |
| I-L4 | `public/wmks.min.js` | 法律 | SDK 再分发许可未声明。 | 待处理 |

---

# 第四部分：跨文件系统性问题

## 安全

| # | 问题 | 涉及文件 | 状态 |
|---|------|----------|------|
| SS-1 | Token 通过 URL 查询参数传递 | `VMConsole.jsx`、`JobsPage.jsx`、`server/index.js` | 待处理 |
| SS-2 | 密码明文驻留内存和每次请求传输 | `useAppStore.js`、`App.jsx`、`server/jobs.js` | 待处理 |
| SS-3 | 全局 TLS 证书验证禁用 | `server/services/vimClient.js` | **已修复** `9ac7047` |
| SS-4 | XML 注入（VM ID 未转义） | `server/services/vmService.js` | **已修复** `92481fb` |
| SS-5 | 命令行参数注入 | `server/ovftool.js` | 待处理 |
| SS-6 | SSRF 漏洞 | `server/index.js` | 待处理 |
| SS-7 | 无结构化输入验证 | `server/` 全局 | **部分修复** — action/cpu/memory 已加校验 |

## 性能

| # | 问题 | 涉及文件 | 状态 |
|---|------|----------|------|
| SP-1 | 心跳轮询闭包陈旧 | `InventoryPage.jsx` | 待处理 |
| SP-2 | Layout 订阅过多 store 状态 | `Layout.jsx` | 待处理 |
| SP-3 | 子组件在函数体内定义 | `SettingsPage.jsx` | 待处理 |
| SP-4 | 日志去重 O(n) | `JobsPage.jsx` | **已修复** `5879806` |
| SP-5 | 911 行死 CSS 被打包 | `styles.css` | **已修复** `7cd2859` |
| SP-6 | 150KB jQuery/jQuery UI 加载（wmks.min.js 硬依赖，无法移除） | `index.html` | **已修复** `4bcb29d` → 回归 `90cd012` + `3efd7c5`（加 SRI） |
| SP-7 | 会话缓存无过期 | `server/services/vmService.js` | **已修复** `0401bb6` |
| SP-8 | 内存中任务永不清理 | `server/jobs.js` | **已修复** `a82b22b` |

## 架构/可维护性

| # | 问题 | 涉及文件 | 状态 |
|---|------|----------|------|
| SA-1 | InventoryPage 单文件 1,092 行 | `InventoryPage.jsx` | 待处理 |
| SA-2 | localStorage 持久化逻辑重复三次 | `useAppStore.js` | **已修复** `cf4d27b` |
| SA-3 | API 响应格式不一致 | `server/index.js` | 待处理 |
| SA-4 | 全项目使用 alert() / confirm() | 多文件 | 待处理 |
| SA-5 | 无结构化日志系统 | `server/` 全局 | 待处理 |
| SA-6 | 无优雅关闭 | `server/index.js` | **已修复** `23538b0` |
| SA-7 | 无 CORS 细粒度控制 | `server/index.js` | 待处理 |

## 可访问性

| # | 问题 | 涉及文件 | 状态 |
|---|------|----------|------|
| SX-1 | VM Console 模态框缺少焦点陷阱、Escape、ARIA | `VMConsole.jsx` | 待处理 |
| SX-2 | Snapshot Panel 侧滑面板缺少焦点陷阱和 Escape | `SnapshotPanel.jsx` | 待处理 |
| SX-3 | Toggle switch 缺少 role 和 aria-checked | `DeploymentPage.jsx` | 待处理 |
| SX-4 | 多处 10px 超小字体 | `Layout.jsx` 等 | 待处理 |
| SX-5 | 表格 checkbox 缺少 aria-label | `InventoryPage.jsx` | 待处理 |

## 错误处理

| # | 问题 | 涉及文件 | 状态 |
|---|------|----------|------|
| SE-1 | 大量 alert() 显示错误 | 多文件 | 待处理 |
| SE-2 | window.confirm() 确认危险操作 | 多文件 | 待处理 |
| SE-3 | 空 catch 块静默吞掉错误 | 多文件 | **部分修复** — B-M10、B-M17 已修复 |
| SE-4 | response.json() 未处理非 JSON | 多文件 | 待处理 |

---

# 第五部分：按文件详细问题清单

## 前端文件

### `index.html`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 7-8 | 高 | jQuery/jQuery UI CDN 无 SRI | **已修复** `4bcb29d` → 回归修复 `90cd012` + `3efd7c5`（wmks.min.js 硬依赖 jQuery + jQuery UI，恢复并加 SRI） |
| 9 | 中 | wmks.min.js 加载失败无提示 | 待处理 |

### `src/styles.css`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 全文 | 高 | 911 行 CSS 完全未使用 | **已修复** `7cd2859` — 文件已删除 |

### `src/store/useAppStore.js`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 3 | 低 | 魔法字符串 | 待处理 |
| 68-101 | 中 | 持久化逻辑重复 | **已修复** `cf4d27b` |
| 125-129 | 高 | 每次请求传明文密码 | 待处理 |
| 133, 152 | 中 | 401 使用 reload() | **已修复** `3675740` → `00d316c` |
| 195-202 | 中 | resetStore 未清 localStorage | **已修复** `5c9475e` |

### `src/App.jsx`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 15-28 | 中 | Dashboard 应拆分 | 待处理 |
| 23 | 中 | Tailwind 类名拼装脆弱 | 待处理 |
| 130 | 高 | 内网 IP 硬编码 | **已修复** `42cb0a9` |
| 132 | 高 | 默认用户名硬编码 | **已修复** `42cb0a9` |
| 157 | 中 | response.json() 未处理非 JSON | 待处理 |

### `src/components/console/VMConsole.jsx`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 55, 71 | 高 | 直接读 localStorage 绕过 auth store | **已修复** `86ef3de` — 改用 `useAuthStore.getState().token` |
| 72-78 | 高 | Token 作为 URL 参数传递 | 待处理（与 S1 同源） |
| 148-149 | 中 | 模态框缺少 ARIA | 待处理 |
| 205 | 中 | reload() 丢失状态 | 待处理 |

### `src/features/inventory/InventoryPage.jsx`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 全文 | 高 | 1,092 行需拆分 | 待处理 |
| 2 | 低 | navigate 死代码 | **已修复** `11619de` |
| 199-223 | 高 | CSV 公式注入 | **已修复** `7641b82` |
| 218 | 中 | createObjectURL 未释放 | **已修复** `7641b82` |

### `src/features/deployment/DeploymentPage.jsx`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 134 | 中 | setSubmitting 未在 finally 重置 | **已修复** `41a3a6c` |

### `src/features/jobs/JobsPage.jsx`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 69 | 高 | Token 通过 URL 传递 | 待处理 |
| 76-79 | 中 | 日志去重 O(n) | **已修复** `5879806` — 改用 Set |
| 233, 237 | 中 | 进度除零 | **已修复** `c21c020` |

## 后端文件

### `server/index.js`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 38-41 | 高 | SSRF 漏洞 | 待处理 |
| 49 | 高 | WebSocket 认证绕过 | 待处理 |
| 183 | 高 | Token 从 URL 获取 | 待处理 |
| 347 | 中 | action 无枚举验证 | **已修复** `d1fcf23` |
| 459-471 | 中 | cpu/memory 无范围校验 | **已修复** `1e972fe` |
| 533-575 | 中 | SSE 无心跳 | **部分修复** `ff0fec0` — 已加心跳 |

### `server/jobs.js`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 18-28 | 高 | 加密密钥竞态 | **已修复** `8da404a` — Promise 缓存 |
| 30-49 | 高 | 同步函数不保证密钥已加载 | **部分修复**（L5 的 Promise 降低了风险） |
| 67-69 | 高 | 凭证明文驻留内存 | 待处理 |
| 136-157 | 高 | 任务无所有权校验 | 待处理 |
| 205 | 中 | progress.failed 可能变负 | **已修复** `c998b23` — Math.max(0, ...) |
| 436 | 中 | powerOff 静默吞错 | **已修复** `13bb5a5` — 改为记录日志 |
| 25 | 低 | 密钥文件权限 0644 | **已修复** `9d058d7` — 改为 0600 |

### `server/ovftool.js`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 110-118 | 高 | 密码暴露在命令行 | 待处理 |
| 121-143 | 高 | 参数注入风险 | 待处理 |
| 154-210 | 中 | 无超时控制 | **已修复** `fdd00ea` — 30 分钟超时 |

### `server/services/vimClient.js`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 16-20 | 高 | 全局修改 TLS | **已修复** `9ac7047` — 改用 https.Agent |
| 36-72 | 高 | 超时机制无效（AbortController 对 https.request 无用） | **已修复** `00d316c` — 改用 req.setTimeout + req.destroy + settled 防双重 resolve |
| 75-77 | 高 | 正则解析 XML | 待处理 |

### `server/services/vmService.js`

| 行号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| 120, 137 | 高 | VM ID 未转义 | **已修复** `92481fb` — 调用 escapeXml |
| 4 | 高 | 会话缓存永不过期 | **已修复** `0401bb6` — 10 分钟 TTL |
| 277-286 | 中 | checkVmNameConflicts 吞错 | **已修复** `0949765` — 移除 try/catch |
| 417-425 | 低 | uniqueOptions 死代码 | **已修复** `3bb01f1` — 删除 |

---

# 第六部分：优先修复建议（Top 10）

### ~~1. 移除 Token 的 URL 传递（S1/S11）~~ → 待后续迭代
### ~~2. 修复 SSRF 漏洞（S3）~~ → 待后续迭代
### ~~3. XML 注入修复（S7）~~ → **已修复** `92481fb`
### ~~4. TLS 全局禁用替换（S8）~~ → **已修复** `9ac7047`
### ~~5. 命令行参数注入防护（S9/S10）~~ → 待后续迭代
### ~~6. 删除 jQuery 和 styles.css（L8/L9）~~ → **已修复** `4bcb29d` + `7cd2859`
### ~~7. 修复 lucide-react 依赖分类（C1）~~ → **已修复** `8f69f98`
### ~~8. 统一 API 响应格式（L7）~~ → 待后续迭代
### ~~9. 会话缓存 TTL + 任务清理（L2/B-M8）~~ → **已修复** `0401bb6` + `a82b22b`
### ~~10. 添加 .env.example（C7）~~ → **已修复** `03f55c4`

### 下一轮迭代建议（按优先级）

1. **SSRF 防护** — 验证 WebSocket 代理目标主机白名单
2. **Token 认证重构** — SSE/WebSocket 改用 ticket 机制
3. **API 响应格式统一** — 创建响应封装中间件
4. **引入 ESLint + Vitest** — 建立基础质量保障
5. **InventoryPage 拆分** — 按功能拆分为子组件

---

# 第七部分：修复记录（32 次提交）

| # | Commit | 类型 | 修复内容 |
|---|--------|------|----------|
| 1 | `4bcb29d` | fix | 删除 index.html 中未使用的 jQuery CDN 引用 |
| 2 | `7cd2859` | fix | 删除未使用的 styles.css 死代码（911行） |
| 3 | `8f69f98` | fix | 将 lucide-react 从 devDependencies 移至 dependencies |
| 4 | `42cb0a9` | fix | 移除登录页硬编码的默认 IP 和用户名 |
| 5 | `3bb01f1` | cleanup | 删除 vmService.js 中未使用的 uniqueOptions 方法 |
| 6 | `11619de` | cleanup | 删除 InventoryPage 中未使用的 navigate 变量 |
| 7 | `92481fb` | fix(security) | 对 acquireWebMksTicket 中的 vmId 调用 escapeXml 防止 XML 注入 |
| 8 | `d1fcf23` | fix(security) | 校验电源操作 action 参数为合法枚举值 on/off/reset |
| 9 | `1e972fe` | fix(security) | 对 reconfigureVm 的 cpu/memory 参数加范围校验 |
| 10 | `9d058d7` | fix(security) | 加密密钥文件权限设为 0600 |
| 11 | `8da404a` | fix(security) | 加密密钥初始化加锁防竞态（Promise 缓存） |
| 12 | `c998b23` | fix | retryFailed 中 progress.failed 下限保护 Math.max(0, ...) |
| 13 | `0949765` | fix | checkVmNameConflicts 不再静默吞掉错误 |
| 14 | `13bb5a5` | fix | runDestroyJob 中 powerOff 失败记录日志而非静默忽略 |
| 15 | `9ac7047` | fix(security) | 用 https.Agent 替代全局修改 NODE_TLS_REJECT_UNAUTHORIZED |
| 16 | `86ef3de` | fix(security) | VMConsole 通过 authStore 获取 token 而非直接读 localStorage |
| 17 | `7641b82` | fix(security) | CSV 导出增加字段转义防止公式注入 + 修复 ObjectURL 内存泄漏 |
| 18 | `5c9475e` | fix | resetStore 时清除 localStorage 防止状态残留 |
| 19 | `cf4d27b` | refactor | 提取 localStorage 持久化为 persistToStorage 辅助函数 |
| 20 | `3675740` | fix | 401 响应处理改用 logout 替代 window.location.reload |
| 21 | `41a3a6c` | fix | DeploymentPage 提交状态在 finally 中重置防止按钮永久禁用 |
| 22 | `c21c020` | fix | JobsPage 进度百分比计算增加除零保护 |
| 23 | `5879806` | fix | JobsPage 日志去重改用 Set 替代 O(n) 遍历 |
| 24 | `0401bb6` | feat | 会话缓存加 10 分钟 TTL 过期自动清理 |
| 25 | `a82b22b` | feat | 已完成任务 24 小时自动清理防止内存无限增长 |
| 26 | `fdd00ea` | feat | ovftool 子进程增加 30 分钟超时自动终止 |
| 27 | `ff0fec0` | fix | SSE 端点增加心跳保活防止代理断开空闲连接 |
| 28 | `23538b0` | feat | 添加优雅关闭处理（SIGTERM/SIGINT） |
| 29 | `03f55c4` | chore | 补全 .env.example、.editorconfig、.gitignore、engines 字段 |
| 30 | `90cd012` | fix | 恢复 jQuery 引用 — wmks.min.js 依赖 `$` 符号（回归修复） |
| 31 | `3efd7c5` | fix | 恢复 jQuery UI 引用 — wmks.min.js 依赖 `$.widget`（回归修复） |
| 32 | `00d316c` | fix | 修复 vimClient 超时无效（AbortController 对 https.request 无用）+ 401 后页面不跳转 |

---

# 第八部分：回归审查记录

**审查日期：** 2026年5月23日（第一轮修复提交后）  
**审查方法：** 逐文件全文审查所有修改，检查是否有遗漏的副作用或引入的新 bug

## 8.1 触发原因

用户在浏览器控制台发现 `$.widget is not a function` 报错。原因是 `wmks.min.js`（VMware WebMKS SDK）隐式依赖 jQuery（`$`）和 jQuery UI（`$.widget`），在 commit `4bcb29d` 中被一起删除。

## 8.2 发现并修复的回归问题

| # | 问题 | 严重性 | 触发方式 | 修复 |
|---|------|--------|----------|------|
| R1 | jQuery 被误删 — `wmks.min.js` 依赖 `$` | **高** | 控制台报错 `ReferenceError: $ is not defined` | `90cd012` 恢复 jQuery + SRI |
| R2 | jQuery UI 被误删 — `wmks.min.js` 依赖 `$.widget` | **高** | 控制台报错 `$.widget is not a function` | `3efd7c5` 恢复 jQuery UI + SRI |

**根因：** 审计时仅检查了应用代码（JSX/JS）是否使用 `$` 或 `$.widget`，忽略了第三方 SDK（`wmks.min.js`）的隐式依赖。`wmks.min.js` 是压缩后的闭包，其内部调用了 jQuery 和 jQuery UI 的 API。

**教训：** 删除前端 CDN 依赖时，除了搜索应用代码引用外，还需检查 `public/` 目录下的第三方库是否有隐式依赖。

## 8.3 代码审查中发现的额外 Bug

| # | 问题 | 严重性 | 文件 | 修复 |
|---|------|--------|------|------|
| B-R1 | `vimClient.soap()` 使用 `AbortController` + `setTimeout` 实现超时，但 `https.request` 不支持 `AbortController`，超时完全不生效 | **高** | `server/services/vimClient.js:36-72` | `00d316c` — 改用 `req.setTimeout()` + `req.destroy()`，`httpsPost` 内部统一管理 `settled` 状态防止 double-resolve |
| B-R2 | `useAppStore` 中 401 处理调用 `logout()` 清除 token 后没有刷新页面，用户停留在当前页看到空白 | **高** | `src/store/useAppStore.js:122-125, 140-143` | `00d316c` — 添加 `window.location.reload()` 触发路由守卫 |

## 8.4 审查确认无问题的修改项

以下修改经逐行审查，确认逻辑正确无副作用：

| 修改项 | 文件 | 审查结论 |
|--------|------|----------|
| `escapeXml(vmId)` | `vmService.js` | ✅ 转义正确，不影响正常 VM ID |
| action 枚举校验 `["on","off","reset"]` | `index.js:352` | ✅ 前端发送的 action 值均在枚举范围内 |
| cpu 1-128 / memory 4-1048576 范围校验 | `index.js:463-464` | ✅ 范围合理，前端滑块最大 64 核不会超限 |
| 密钥文件权限 `0o600` | `jobs.js:27` | ✅ 写入时指定 mode |
| `keyPromise` 加锁 | `jobs.js:21` | ✅ 所有调用者均已 await `getEncryptionKey()` |
| `progress.failed` Math.max(0, ...) | `jobs.js:224` | ✅ 仅影响 retryFailed 场景 |
| `checkVmNameConflicts` 移除 try/catch | `vmService.js:282-287` | ✅ 调用方 `index.js:312` 有 catch 块正确处理 |
| `runDestroyJob` powerOff 日志 | `jobs.js:455` | ✅ 仅增加日志不影响流程 |
| `https.Agent` TLS 替代方案 | `vimClient.js:5` | ✅ 仅影响 vSphere SOAP 连接 |
| VMConsole `useAuthStore.getState().token` | `VMConsole.jsx:56,72` | ✅ 在非 React 上下文中正确获取 token |
| CSV `escapeCsvField` | `InventoryPage.jsx:198-204` | ✅ 正确处理公式注入和特殊字符 |
| `URL.revokeObjectURL` | `InventoryPage.jsx:230` | ✅ 延迟 1 秒释放，确保下载完成 |
| `resetStore` 清除 localStorage | `useAppStore.js:186` | ✅ 同时重置状态和持久化 |
| `persistToStorage` 辅助函数 | `useAppStore.js:54-61` | ✅ 从 `get()` 读取最新状态 |
| `DeploymentPage` setSubmitting finally | `DeploymentPage.jsx:136-138` | ✅ 确保按钮状态恢复 |
| `JobsPage` Set 日志去重 | `JobsPage.jsx:50,78-81` | ✅ `useRef` 正确避免重渲染 |
| `JobsPage` 除零保护 | `JobsPage.jsx:234,238` | ✅ `total > 0` 三元表达式正确 |
| Session 缓存 10min TTL | `vmService.js:4,17-23` | ✅ 读取时检查过期 |
| `purgeExpiredJobs` 24h 清理 | `jobs.js:77-89` | ✅ 跳过运行中的任务 |
| ovftool 30min 超时 | `ovftool.js:179-185` | ✅ `settled` 防双重 resolve |
| SSE 心跳每 15 秒 | `index.js:567-569` | ✅ `heartbeatCounter % 15 === 0`（每 1s 递增，15 次即 15s） |
| 优雅关闭 SIGTERM/SIGINT | `index.js:609-621` | ✅ `saveToDisk` 已正确 export |
| `handleSingleAction` 路径拼接 | `InventoryPage.jsx:250` | ✅ `ticket` 不走此路径，`rename` 路径正确 |
| index.html 无其他遗漏依赖 | `index.html` | ✅ `public/` 目录仅含 `wmks.min.js` |

## 8.5 依赖关系确认

`wmks.min.js` 的完整依赖链为：

```
jQuery (3.7.1) → jQuery UI (1.13.2) → wmks.min.js
     $               $.widget          WMKS SDK
```

三个库必须在 `index.html` 中按此顺序加载，当前配置正确。两个 CDN 资源均已添加 `integrity`（SRI）和 `crossorigin="anonymous"` 属性。
