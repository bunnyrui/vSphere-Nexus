# vSphere Nexus 审计报告

**版本：** v1.0.1-beta.1
**更新：** 2026-05-26（源码逐条验证）
**范围：** 前端 13 文件（约 3,100 行）、后端 5 文件（约 2,030 行）、配置文件

> 约定：🔴 高  🟡 中  🟢 低  |  ✅ 已修复  ⏳ 待处理  🔧 部分修复  📐 设计决策

---

## 总览

| 类别 | 数量 |
|---|---|
| ✅ 已修复 | 48 |
| 🔧 部分修复 | 6 |
| 📐 设计决策（不修） | 2 |
| ⏳ 待处理 | 70 |
| **合计** | **120** |

### 待处理按严重度

| 严重度 | 数量 |
|---|---|
| 🔴 高 | 12 |
| 🟡 中 | 42 |
| 🟢 低 | 16 |

---

## 待处理

### 🔴 高优先级（12）

#### 安全

| # | 问题 | 文件 |
|---|---|---|
| BE-SEC-2 | WebSocket 代理服务端请求伪造 — `host`/`port` 来自 URL 参数，无超时，可做慢速拒绝服务攻击 | `server/index.js` |
| BE-SEC-5 | 命令行参数注入 — 用户控制的值直接拼接为 ovftool 参数（`shell:false` 已阻断 shell 注入，但 ovftool 级别的参数注入仍有可能） | `server/ovftool.js` |
| BE-SEC-6 | 凭证暴露在进程命令行（`ps aux` 可见 ovftool 密码） | `server/ovftool.js` |
| BE-SEC-7 | 密码在部分 API 请求中冗余明文传输（`hydrateTargetFromSession` 已从 session 填充密码，前端传输是多余的） | `useAppStore.js`、`App.jsx` |
| BE-SEC-8 | 凭证明文驻留内存（`jobs.js` 中 `payloads` Map — 磁盘已加密，内存仍为明文） | `server/jobs.js` |
| BE-SEC-17 | TLS 证书验证全局禁用（`vimClient.js` 模块级 `insecureAgent` + WebSocket 代理 `rejectUnauthorized: false`） | `server/services/vimClient.js` |

#### 健壮性

| # | 问题 | 文件 |
|---|---|---|
| BE-ROB-1 | 正则解析 XML，非标准 SOAP 响应导致解析失败 | `server/services/vimClient.js` |

#### 基础设施

| # | 问题 |
|---|---|
| INF-1 | 无测试框架 |
| INF-2 | 无 ESLint |
| INF-3 | 无 CI/CD |
| INF-4 | 二进制大文件（`wmks.min.js`）存入 Git |
| INF-5 | 缺少 TypeScript 配置 |

---

### 🟡 中优先级（42 = 36 ⏳ + 6 🔧）

#### 前端 — 资源管理

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| I-2 | 全选复选框跨页选中 — `toggleSelectAll` 对全部过滤结果操作，而非当前页 | `InventoryPage.jsx:233-239` | ⏳ |
| I-3 | 搜索/筛选变更后 `selectedVms` 未清空，已选但不可见的虚拟机仍被批量操作影响 | `InventoryPage.jsx:155-157` | ⏳ |
| I-4 | CSV 导出公式注入防护 — 危险值仅加单引号前缀但未用双引号包裹，含逗号的值（如 `=SUM(1,2)`）会导致 CSV 格式损坏 | `InventoryPage.jsx` | 🔧 |
| I-5 | 单文件 1,088 行，内联模态框可提取为子组件（代码组织建议） | `InventoryPage.jsx` | ⏳ |
| I-7 | 排序中 `undefined` 值未归一化，含 undefined 的条目排序行为不可预测 | `InventoryPage.jsx` | ⏳ |
| I-8 | `configForm`/`setConfigSpec` 命名不匹配 | `InventoryPage.jsx` | ⏳ |
| I-9 | 全项目使用 `alert()`/`confirm()`，不可定制且阻塞线程 | 多文件 | ⏳ |

#### 前端 — 部署

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| DP-3 | 第 1→2 步不校验计算资源是否已选（只校验模板和存储） | `DeploymentPage.jsx:345` | ⏳ |
| DP-4 | 命名预览数量为 2/3 时末尾重复（条件 `count > 1` 应为 `count > 3`） | `DeploymentPage.jsx:87` | ⏳ |

#### 前端 — 任务监控

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| J-2 | `handleDelete` 中 `refreshJobs` 未 `await`，删除后短暂显示残留数据 | `JobsPage.jsx:166-170` | ⏳ |
| J-4 | 日志数组无虚拟化渲染（服务端已限 1,000 条，客户端可加裁剪窗口但非必要） | `JobsPage.jsx:81,312-324` | ⏳ |
| J-5 | `Token` 通过 URL 查询参数传递给 SSE（SSE 技术限制），泄露到日志和 `Referer` 头 | `JobsPage.jsx:71` | ⏳ |

#### 前端 — 仪表盘

| # | 问题 | 文件 |
|---|---|---|
| D-1 | StatCard 图标背景 `colorClass.replace('text-', 'text-opacity-20 bg-')` 生成无效的 `text-opacity-20` 类且与静态 `bg-secondary` 冲突 | `App.jsx` |

#### 前端 — 登录

| # | 问题 | 文件 |
|---|---|---|
| L-2 | 密码存入 Zustand 全局状态，可被开发者工具查看 | `App.jsx:159` |

#### 前端 — 其他

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| C-1 | 模态框缺少焦点陷阱、`Escape` 键关闭、ARIA 属性 | `VMConsole.jsx` | ⏳ |
| C-2 | 错误重试用 `window.location.reload()` 丢失全部状态 | `VMConsole.jsx` | ⏳ |
| C-3 | 依赖全局 `window.WMKS`，无类型安全（已知技术约束） | `VMConsole.jsx` | ⏳ |
| C-4 | WMKS 初始化 `setTimeout` 未清理，组件 200ms 内卸载时回调仍执行 | `VMConsole.jsx` | ⏳ |
| SP-1 | 侧滑面板缺少焦点陷阱和 `Escape` 键关闭 | `SnapshotPanel.jsx` | ⏳ |

#### 后端 — 安全

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| BE-SEC-9 | 限流仅基于 IP 地址（业界标准做法，可加用户名维度增强） | `server/index.js` | ⏳ |
| BE-SEC-10 | 会话 Map 无上限（内存溢出风险） | `server/index.js` | ⏳ |
| BE-SEC-11 | `/api/health` 返回服务器绝对路径 | `server/index.js` | ⏳ |
| BE-SEC-12 | 未设置安全 HTTP 头（CSP、X-Frame-Options 等） | `server/index.js` | ⏳ |
| BE-SEC-13 | 无结构化输入验证层（缺少 zod/joi） | `server/` | 🔧 |

#### 后端 — 健壮性

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| BE-ROB-3 | `initStore` 解密失败时 `catch` 块静默吞错，导致部分 payload 数据丢失 | `server/jobs.js` | ⏳ |
| BE-ROB-4 | `/api/vms/destroy` 未校验 `vmIds` 是否非空数组 | `server/index.js:386` | ⏳ |
| BE-ROB-5 | `ensureSession()` 并发竞态 — 缓存过期时多请求同时重新登录 | `server/services/vmService.js:14-46` | ⏳ |
| BE-ROB-6 | `saveToDisk` 非原子写入，崩溃会截断文件丢失全部任务数据 | `server/jobs.js` | ⏳ |
| BE-ROB-8 | `encryptField`/`decryptField` 同步函数不保证密钥已加载（正常调用链已由 `initStore` await 缓解） | `server/jobs.js` | 🔧 |
| BE-ROB-9 | SSE 心跳 `res.write` 无 `try/catch`，socket 错误可致未捕获异常 | `server/index.js` | 🔧 已加 `closed` 标志，但 `res.write` 仍无错误处理 |
| BE-ROB-10 | API 响应格式不一致（`{ ok }` 与 `{ error }` 与 `{ errors }` 混用） | `server/index.js` | ⏳ |
| BE-ROB-15 | `acquireWebMksTicket` 缺少 `ticket` 标签时返回 `undefined`（下游 `TypeError`） | `server/services/vmService.js` | 🔧 catch 块已重新抛出，但缺少 ticket 标签仍返回 undefined |

#### 后端 — 性能

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| BE-PERF-1 | 过期任务仅启动时清理一次，运行期间无限累积 | `server/jobs.js` | 🔧 `a82b22b` |
| BE-PERF-2 | `validateTemplateSource` 每次创建新 `VmService` 实例 | `server/index.js` | ⏳ |
| BE-PERF-3 | `/api/deployments/check` 调用了两次 `discoverInventory` | `server/index.js:310-312` | ⏳ |
| BE-PERF-4 | `hydrateTargetFromSession` 直接修改 `req.body` | `server/index.js` | ⏳ |
| BE-PERF-6 | `folderPathParts`/`findDatacenter` 重复创建 Map（每次 O(n)） | `server/services/vmService.js` | ⏳ |
| BE-PERF-8 | `Layout.jsx` 解构整个 store 导致不相关状态变化时也重新渲染 | `Layout.jsx` | ⏳ |

#### 架构

| # | 问题 | 文件 |
|---|---|---|
| ARC-1 | 并发限制不匹配 — 前端允许 20，后端硬编码 10 | `SettingsPage.jsx` 与 `server/index.js` |
| ARC-2 | 无结构化日志系统 | `server/` |
| ARC-3/12 | `WebSocket` 从 `ws` 导入但从未使用（ARC-3 与 ARC-12 合并） | `server/index.js:7` |
| ARC-4 | Zustand store 接收回调参数（反模式） | `useAuthStore.js` |

---

### 🟢 低优先级（16）

#### 前端

| # | 问题 | 文件 |
|---|---|---|
| D-3 | 虚拟机过滤和字节转换逻辑重复出现（可提取为 `utils.js` 工具函数） | `App.jsx` |
| I-10 | CSV 导出按钮标签无提示，未说明导出范围 | `InventoryPage.jsx:207` |
| I-11 | 表格复选框缺少 `aria-label` | `InventoryPage.jsx` |
| DP-9 | 探测按钮不校验密码为空 | `DeploymentPage.jsx:245` |
| DP-10 | 开关缺少 `role="switch"` 和 `aria-checked` | `DeploymentPage.jsx` |
| J-8 | `React.useState` 和 `useState` 混用 | `JobsPage.jsx` |
| C-5 | `wmks.min.js` 加载失败无提示 | `index.html` |
| SP-2 | 硬编码 `bg-white`，暗色主题不兼容（应改为 `bg-card`） | `SnapshotPanel.jsx` |
| S-1 | 暗色模式切换无即时视觉反馈，需点"保存更改"后才生效 | `SettingsPage.jsx:237,246` |
| S-4 | 子组件在函数体内定义，每次渲染重建 | `SettingsPage.jsx` |

#### 后端

| # | 问题 | 文件 |
|---|---|---|
| BE-SEC-15 | Ticket 部分泄露到日志（前 8-10 字符） | `server/index.js` |
| BE-PERF-10 | ovftool 缓存路径不可刷新，运行时安装需重启 | `server/ovftool.js` |

#### 架构

| # | 问题 | 文件 |
|---|---|---|
| ARC-10 | `useAuthStore.logout()` 未调用 `resetStore()`（`Layout.handleLogout` 已手动调用两者，但 `SettingsPage` 直接调 `logout()` 时 appStore 未清理） | `useAuthStore.js` |
| ARC-11 | `InventoryPage` 每次渲染生成当前时间（应记录最近一次刷新时间戳） | `InventoryPage.jsx` |

#### 基础设施

| # | 问题 |
|---|---|
| INF-7 | `vite.config.js` 代理目标硬编码（不跟随 `PORT` 环境变量） |
| INF-9 | `start` 脚本 `NODE_ENV=production` 前缀 Windows 不兼容 |

---

## 已修复（43）

| # | 严重度 | 问题 | 修复说明 |
|---|---|---|---|
| L-1 | 🔴 | 后端未返回 `token` 时降级为字面量 `'no-auth-needed'` 作为 `Bearer token` | 已移除内置认证，删除降级逻辑 |
| I-1 | 🔴 | `AlertCircle` 使用但未导入，`ReferenceError` 崩溃 | 补充导入，移除不可达警告提示（入口已拦截） |
| DP-1 | 🔴 | 部署数量无上限，大数冻结浏览器 | 前端软限制 + 后端 vms.length ≤ 100 |
| DP-2 | 🔴 | 第 2→3 步无验证 | 前缀必填 + 网络映射必选，禁用下一步 |
| DP-6 | 🟡 | 空前缀 + 空起始编号生成空字符串 VM 名称 | 被 DP-2 修复覆盖（前端禁用 + 提交校验 + 后端验证） |
| DP-7 | 🟡 | 网络映射空目标值未被拦截 | 被 DP-2 修复覆盖（`hasUnmappedNetwork` 检测 + 禁用下一步） |
| J-1 | 🔴 | 删除全部任务后 `activeJob` 为 `undefined` | `jobs.length === 0` 早返回保护 |
| BE-SEC-1 | 🔴 | WebSocket 代理认证绕过 — `token` 参数未调用 `isValidToken()` | upgrade 时调用 `isValidToken()` 验证 token |
| BE-SEC-3 | 🔴 | WebSocket 代理 CRLF 注入 — `ticket`/`targetHost` 未校验换行符 | 添加 `\r\n` 正则检测，含换行符的参数直接拒绝 |
| BE-SEC-4 | 🔴 | 凭证滥用 — `hydrateTargetFromSession` 允许请求中的 `host` 覆盖会话中的 `host` | 锁定 host/username/password 为 session 值 |
| DP-5 | 🟡 | 自动推进 effect 使库存存在时自动跳离第 0 步 | 移除整个连接步骤，4步精简为3步 |
| BE-SEC-16 | 🔴 | 加密密钥竞态条件 | `8da404a` |
| BE-SEC-18 | 🔴 | 虚拟机 ID 未转义直接拼入 XML | `92481fb` |
| BE-SEC-19 | 🔴 | CDN 资源无 SRI 校验 | `4bcb29d→3efd7c5` |
| BE-ROB-7 | 🟡 | `progress.failed` 可能变负数 | `c998b23` |
| BE-SEC-20 | 🟡 | `action` 参数无枚举验证 | `d1fcf23` |
| BE-SEC-21 | 🟡 | `cpu`/`memory` 无范围校验 | `1e972fe` |
| BE-SEC-22 | 🟡 | 加密密钥文件权限默认 0644 | `9d058d7` |
| BE-SEC-23 | 🟡 | 基础设施信息硬编码（默认 IP 和用户名） | `42cb0a9` |
| BE-SEC-24 | 🟡 | `checkVmNameConflicts` 吞掉错误返回"无冲突" | `0949765` |
| BE-ROB-11 | 🟡 | vimClient 超时无效 | `00d316c` |
| BE-ROB-12 | 🟡 | ovftool 子进程无超时 | `fdd00ea` |
| BE-ROB-13 | 🟡 | 无优雅关闭 | `23538b0` |
| BE-ROB-14 | 🟡 | `powerOff` 错误被静默吞掉 | `13bb5a5` |
| BE-PERF-7 | 🟡 | 会话缓存永不过期 | `0401bb6` |
| L-3 | 🟡 | 登录未检查 HTTP 状态码，非 JSON 响应导致不友好的错误提示 | 封装 `fetchJson`，统一拦截 5xx |
| L-4 | 🟡 | 多处 `response.json()` 未处理非 JSON 响应 | 全部替换为 `fetchJson`，覆盖 11 处 |
| I-6 | 🟡 | 心跳轮询可能有陈旧闭包 | 依赖数组已补全 |
| DP-8 | 🟡 | 确认页网络映射预览写死 `inventory.networks[0]` | `1656a3c` |
| ST-2 | 🟡 | `resetStore()` 未清除 `localStorage` | `5c9475e` |
| I-12 | 🟢 | `createObjectURL` 未释放（内存泄漏） | `7641b82` |
| J-6 | 🟢 | SSE 关闭后缓冲事件可能污染新任务日志 | EventSource 关闭 + logs 清空 |
| J-7 | 🟢 | 进度百分比除零（`0/0`） | `c21c020` |
| DP-11 | 🟢 | 提交按钮 `setSubmitting` 未在 `finally` 中重置 | `41a3a6c` |
| BE-PERF-12 | 🟢 | 911 行废弃 CSS 打包进生产构建 | `7cd2859` |
| BE-PERF-13 | 🟢 | `JobsPage` 日志去重 O(n) | `5879806` |
| ARC-13 | 🟢 | localStorage 持久化逻辑已提取 | `cf4d27b` |
| ARC-14 | 🟢 | `lucide-react` 错误归类为 `devDependencies` | `8f69f98` |
| INF-13 | 🟢 | jQuery/jQuery UI 仅为 wmks 隐式依赖，已加 SRI | `4bcb29d→3efd7c5` |
| INF-14 | 🟢 | `.env.example` 已补全 | `03f55c4` |
| INF-15 | 🟢 | `.gitignore` 已补全 | `03f55c4` |
| INF-16 | 🟢 | `engines` 字段已添加 | `03f55c4` |
| INF-17 | 🟢 | `.editorconfig` 已添加 | `03f55c4` |
| INF-18 | 🟢 | `.env.*` 规则已修正 | `03f55c4` |
| INF-19 | 🟢 | 废弃代码已清理 | `11619de`、`3bb01f1` |
| INF-20 | 🟢 | VimClient HTTPS 链路重构（ESXi 兼容性） | — |
| INF-21 | 🟢 | 废弃代码（`navigate`、`uniqueOptions`）已删除 | — |
| ST-1 | 🟡 | 401 后 `logout()` 不刷新页面 | `00d316c` |

---

## 设计决策（2）

| # | 原严重度 | 问题 | 决策理由 |
|---|---|---|---|
| BE-ROB-2 | 🔴 | 任务无所有权校验 | 单用户工具，不需要多租户隔离 |
| J-3 | 🟡 | 日志去重键 `at:message` 碰撞概率极低，对 SSE 重连去重有正面价值 | 理论问题非实际风险 |

---

## WMKS 依赖链

```
jQuery 3.7.1 → jQuery UI 1.13.2 → wmks.min.js
     $              $.widget         WMKS SDK
```

`wmks.min.js` 隐式依赖 jQuery 和 jQuery UI。三者在 `index.html` 中按此顺序加载，均已加 SRI 校验。曾因误删 jQuery 导致 `$.widget is not a function` 回归（已修复）。

---

## 已验证的端到端部署

**日期：** 2026-05-25
**路径：** 模板 `debian-openclaw` → 主机 `172.16.109.3` → 存储 `nvme` → 网络 `openwrt→VLAN50`
**结果：** ✅ 成功（任务 `EaXg1Xnl`，3 分 14 秒，含自动开机）

修复了以下问题后才成功：
- `normalizeInventory` 缺少 `sourceNetworks`（模板网络名降级到 `VM Network`）
- `encodeInventoryPath` 缺少前导 `/`（VI URL 拼接错误）
- `vmFolder`/`hostFolder` 名称解析失败（SOAP 返回字符串 ID）
- 任务监控页 power/destroy/snapshot 任务统一显示"部署 N 台虚拟机"

---

## 全部提交记录

| 提交 | 内容 |
|---|---|
| `42cb0a9` | 移除硬编码默认 IP 和用户名 |
| `92481fb` | 虚拟机 ID `escapeXml` 防 XML 注入 |
| `9ac7047` | `https.Agent` 替代全局 `NODE_TLS_REJECT_UNAUTHORIZED` 禁用（证书验证仍关闭） |
| `86ef3de` | 虚拟机控制台通过 authStore 获取 token |
| `d1fcf23` | `action` 参数枚举校验 |
| `1e972fe` | `cpu`/`memory` 范围校验 |
| `9d058d7` | 密钥文件权限 0600 |
| `8da404a` | 密钥初始化加锁防竞态 |
| `7641b82` | CSV 公式注入防护 + ObjectURL 释放 |
| `11619de` | 删除 `navigate` 废弃代码 |
| `5c9475e` | `resetStore` 清除 localStorage |
| `cf4d27b` | 提取 `persistToStorage()` |
| `3675740` | 401 改用 `logout()` |
| `41a3a6c` | `setSubmitting` 移至 `finally` |
| `c21c020` | 进度百分比除零保护 |
| `5879806` | 日志去重改用 `Set` |
| `00d316c` | 401 后 `window.location.reload()` + vimClient 超时修复 |
| `3bb01f1` | 删除 `uniqueOptions` 废弃代码 |
| `c998b23` | `progress.failed` 下限保护 |
| `0949765` | `checkVmNameConflicts` 不再吞错 |
| `13bb5a5` | `powerOff` 失败记录日志 |
| `0401bb6` | 会话缓存 10 分钟 TTL |
| `a82b22b` | 已完成任务 24 小时自动清理 |
| `fdd00ea` | ovftool 30 分钟超时 |
| `ff0fec0` | SSE 心跳保活 |
| `23538b0` | 优雅关闭 SIGTERM/SIGINT |
| `4bcb29d→3efd7c5` | jQuery/jQuery UI 恢复 + SRI |
| `7cd2859` | 删除 911 行废弃 CSS |
| `8f69f98` | `lucide-react` 移至 `dependencies` |
| `03f55c4` | 补全 `.env.example`、`.editorconfig`、`.gitignore`、`engines` |
| `1656a3c` | 修复部署流水线（inventory path、VI URL、sourceNetworks、映射清空） |
| `04376f7` | 任务类型标签 + ovftool 架构不匹配提示 |
| `a14e905` | 移除内置认证系统，始终强制 token 验证 |
| `b3e8375` | 封装 `fetchJson` 工具函数 |
| `0b0225d` | 全部 11 处 `fetch` 调用替换为 `fetchJson` |
| `56f9677` | 审计报告更新（L-1、L-3、L-4） |
| `bbc8dfa` | 修复 I-1 AlertCircle 未导入崩溃 |
| `9c71086` | 修复 DP-1 部署数量限制上限 100 |
| `98fffa7` | 修复 DP-2 前缀必填+网络映射必选校验 |

---

## 优先级路线图

1. **🔴 安全（6 项）**：BE-SEC-2/5~8（WebSocket SSRF/凭证暴露）、BE-SEC-17（TLS 全局禁用）
2. **🔴 健壮性（1 项）**：BE-ROB-1（正则解析 XML）
3. **🔴 基础设施（5 项）**：INF-1~5（测试、Lint、CI/CD、二进制管理、TypeScript）
4. **🟡 前端功能缺陷（12 项）**：I-2~9（资源管理）、DP-3~4（部署向导）、J-2/4/5（任务监控）、C-1~4（控制台）、SP-1（快照）
5. **🟡 后端中优先级（17 项）**：BE-SEC-9~13（安全加固）、BE-ROB-3~6/8~10/15（健壮性）、BE-PERF-1~3/4/6/8（性能）、ARC-1~4（架构）
6. **🟢 低优先级（16 项）**：体验优化、无障碍访问、代码规范
7. **长期**：测试框架、CI/CD、TypeScript 迁移
