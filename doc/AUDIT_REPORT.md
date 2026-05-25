# vSphere Nexus 审计报告

**版本：** v1.0.1-beta.1
**更新：** 2026-05-25（浏览器实测 + 源码审查）| 逐条复核：2026-05-25
**范围：** 前端 13 文件（约 3,100 行）、后端 5 文件（约 2,030 行）、配置文件

> 约定：🔴 高  🟡 中  🟢 低  |  ✅ 已修复  ⏳ 待处理  🔧 部分修复

---

## 总览

| | 数量 |
|---|---|
| 已修复 | 56 |
| 待处理 | 98 |
| **合计** | **157** |

### 待处理问题按严重度

| 严重度 | 数量 |
|---|---|
| 🔴 高 | 15 |
| 🟡 中 | 56 |
| 🟢 低 | 27 |

---

## 一、登录页

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| L-1 | 🔴 | ~~后端未返回 `token` 时降级为字面量 `'no-auth-needed'` 作为 `Bearer token`，所有认证端点返回 401~~ | `App.jsx:158` | ✅ 已移除内置认证，删除 `'no-auth-needed'` 降级逻辑 |
| L-2 | 🟡 | 密码存入 Zustand 全局状态，可被开发者工具查看 | `App.jsx:159` | ⏳ |
| L-3 | 🟡 | ~~登录未检查 HTTP 状态码，只看响应体的 `ok` 字段；非 JSON 响应导致不友好的错误提示~~ | `App.jsx:156-162` | ✅ 封装 `fetchJson`，统一拦截 5xx 响应 |
| L-4 | 🟡 | ~~多处 `response.json()` 未处理非 JSON 响应~~ | `App.jsx` 等 | ✅ 全部替换为 `fetchJson`，覆盖全部 11 处调用点 |

---

## 二、仪表盘

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| D-1 | 🟡 | StatCard 图标背景使用无效 Tailwind 类名（`text-opacity-*` 在 v3 中已弃用），显示为实色块 | `App.jsx` | ⏳ |
| D-2 | 🟡 | Dashboard 代码应在 `App.jsx` 中拆分到独立模块 | `App.jsx` | ⏳ |
| D-3 | 🟢 | 虚拟机过滤和字节转换逻辑重复出现 | `App.jsx` | ⏳ |

---

## 三、资源管理页

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| I-1 | 🔴 | `AlertCircle` 使用但未导入，打开运行中虚拟机的"修改配置"模态框触发 `ReferenceError` 崩溃 | `InventoryPage.jsx:1043` | ⏳ |
| I-2 | 🟡 | 全选复选框跨页选中 — `toggleSelectAll` 对全部过滤结果操作，而非当前页 | `InventoryPage.jsx:233-239` | ⏳ |
| I-3 | 🟡 | 搜索/筛选变更后 `selectedVms` 未清空，已选但不可见的虚拟机仍被批量操作影响 | `InventoryPage.jsx:155-157` | ⏳ |
| I-4 | 🟡 | CSV 导出公式注入防护转义格式有误（单引号开头但双引号结尾，引号不匹配） | `InventoryPage.jsx` | 🔧 |
| I-5 | 🟡 | 单文件 1,100 行，需按功能拆分为子组件 | `InventoryPage.jsx` | ⏳ |
| I-6 | 🟡 | 心跳轮询可能有陈旧闭包 | `InventoryPage.jsx` | ✅ 依赖数组已补全 |
| I-7 | 🟡 | 排序中 `undefined` 比较不稳定 | `InventoryPage.jsx` | ⏳ |
| I-8 | 🟡 | `configForm`/`setConfigSpec` 命名不匹配 | `InventoryPage.jsx` | ⏳ |
| I-9 | 🟡 | 全项目使用 `alert()`/`confirm()`，不可定制且阻塞线程 | 多文件 | ⏳ |
| I-10 | 🟢 | CSV 导出仅导出当前筛选结果，按钮标签无提示 | `InventoryPage.jsx:207` | ⏳ |
| I-11 | 🟢 | 表格复选框缺少 `aria-label` | `InventoryPage.jsx` | ⏳ |
| I-12 | 🟢 | `createObjectURL` 未释放（内存泄漏） | `InventoryPage.jsx` | ✅ `7641b82` |

---

## 四、批量部署页

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| DP-1 | 🔴 | 部署数量输入无上限，输入 999999 分配百万元素数组，冻结浏览器 | `DeploymentPage.jsx:392-395` | ⏳ |
| DP-2 | 🔴 | 第 2→3 步无任何验证，可不填命名规则和网络映射直接到确认页 | `DeploymentPage.jsx:463-468` | ⏳ |
| DP-3 | 🟡 | 第 1→2 步不校验计算资源是否已选（只校验模板和存储） | `DeploymentPage.jsx:345` | ⏳ |
| DP-4 | 🟡 | 命名预览数量为 2/3 时末尾重复（条件 `count > 1` 应为 `count > 3`） | `DeploymentPage.jsx:87` | ⏳ |
| DP-5 | 🟡 | 自动推进 `effect` 使库存存在时自动跳离第 0 步，用户无法停留在第 0 步修改凭据 | `DeploymentPage.jsx:164-168` | ⏳ |
| DP-6 | 🟡 | 空前缀 + 空起始编号生成空字符串虚拟机名称 | `DeploymentPage.jsx:97-99` | ⏳ |
| DP-7 | 🟡 | 网络映射空目标值未被拦截，可提交 `{ source, target: "" }` | `DeploymentPage.jsx:141-150` | ⏳ |
| DP-8 | 🟡 | 确认页网络映射预览写死 `inventory.networks[0]` | `DeploymentPage.jsx` | ✅ `1656a3c` |
| DP-9 | 🟢 | 探测按钮不校验密码为空 | `DeploymentPage.jsx:245` | ⏳ |
| DP-10 | 🟢 | 开关缺少 `role="switch"` 和 `aria-checked` | `DeploymentPage.jsx` | ⏳ |
| DP-11 | 🟢 | 提交按钮 `setSubmitting` 未在 `finally` 中重置 | `DeploymentPage.jsx` | ✅ `41a3a6c` |

---

## 五、任务监控页

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| J-1 | 🔴 | 删除全部任务后 `activeJob` 为 `undefined`，访问 `.id` 触发 `TypeError` 崩溃 | `JobsPage.jsx:52,199` | ✅ `jobs.length === 0` 早返回保护 |
| J-2 | 🟡 | `handleDelete` 中 `refreshJobs` 未 `await`，删除后短暂显示残留数据 | `JobsPage.jsx:166-170` | ⏳ |
| J-3 | 🟡 | 日志去重键 `timestamp:message` 过于激进，批量操作相同日志被吞掉 | `JobsPage.jsx:78-80` | ⏳ |
| J-4 | 🟡 | 日志数组无限增长无虚拟化，长时间部署导致 DOM 性能劣化 | `JobsPage.jsx:81,312-324` | ⏳ |
| J-5 | 🟡 | `Token` 通过 URL 查询参数传递给 SSE，泄露到日志和 `Referer` 头 | `JobsPage.jsx:71` | ⏳ |
| J-6 | 🟢 | SSE 关闭后缓冲事件可能污染新任务日志 | `JobsPage.jsx:62-68` | ✅ EventSource 关闭 + logs/seenLogs 清空 |
| J-7 | 🟢 | 进度百分比除零（`0/0`） | `JobsPage.jsx` | ✅ `c21c020` |
| J-8 | 🟢 | `React.useState` 和 `useState` 混用 | `JobsPage.jsx` | ⏳ |

---

## 六、设置页

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| S-1 | 🟢 | 暗色模式切换无即时视觉反馈，需点"保存更改"后才生效 | `SettingsPage.jsx:237,246` | ⏳ |
| S-2 | 🟢 | 保存为纯 `localStorage` 操作，500 毫秒延迟是模拟的（误导性） | `SettingsPage.jsx:62-79` | ⏳ |
| S-3 | 🟢 | 健康检查 `/api/health` 未携带认证 `token` | `SettingsPage.jsx:42` | ⏳ |
| S-4 | 🟢 | 子组件在函数体内定义，每次渲染重建 | `SettingsPage.jsx` | ⏳ |

---

## 七、虚拟机控制台

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| C-1 | 🟡 | 模态框缺少焦点陷阱、`Escape` 键关闭、ARIA 属性 | `VMConsole.jsx` | ⏳ |
| C-2 | 🟡 | 错误重试用 `window.location.reload()` 丢失全部状态 | `VMConsole.jsx` | ⏳ |
| C-3 | 🟡 | 依赖全局 `window.WMKS`，无类型安全 | `VMConsole.jsx` | ⏳ |
| C-4 | 🟡 | WMKS 初始化 `setTimeout` 未清理 | `VMConsole.jsx` | ⏳ |
| C-5 | 🟢 | `wmks.min.js` 加载失败无提示 | `index.html` | ⏳ |

---

## 八、快照面板

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| SP-1 | 🟡 | 侧滑面板缺少焦点陷阱和 `Escape` 键关闭 | `SnapshotPanel.jsx` | ⏳ |
| SP-2 | 🟢 | 硬编码 `bg-white`，暗色主题不兼容 | `SnapshotPanel.jsx` | ⏳ |

---

## 九、后端 — 安全

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| BE-SEC-1 | 🔴 | WebSocket 代理认证绕过 — `token` 参数未调用 `isValidToken()`，任何人可连接任意 `host:port` | `server/index.js` | ⏳ |
| BE-SEC-2 | 🔴 | WebSocket 代理服务端请求伪造 — `host`/`port` 来自 URL 参数，无超时，可做慢速拒绝服务攻击 | `server/index.js` | ⏳ |
| BE-SEC-3 | 🔴 | WebSocket 代理 CRLF 注入 — `ticket`/`targetHost` 未校验换行符 | `server/index.js` | ⏳ |
| BE-SEC-4 | 🔴 | 凭证滥用 — `hydrateTargetFromSession` 允许请求中的 `host` 覆盖会话中的 `host`，可用缓存密码攻击其他主机 | `server/index.js` | ⏳ |
| BE-SEC-5 | 🔴 | 命令行参数注入 — 用户控制的值直接拼接为 ovftool 参数 | `server/ovftool.js` | ⏳ |
| BE-SEC-6 | 🔴 | 凭证暴露在进程命令行（`ps aux` 可见 ovftool 密码） | `server/ovftool.js` | ⏳ |
| BE-SEC-7 | 🔴 | 密码随每次 API 请求明文传输 | `useAppStore.js`、`App.jsx` | ⏳ |
| BE-SEC-8 | 🔴 | 凭证明文驻留内存（`jobs.js` 中 `payloads` Map） | `server/jobs.js` | ⏳ |
| BE-SEC-9 | 🟡 | 限流仅基于 IP 地址 | `server/index.js` | ⏳ |
| BE-SEC-10 | 🟡 | 会话 Map 无上限（内存溢出风险） | `server/index.js` | ⏳ |
| BE-SEC-11 | 🟡 | `/api/health` 返回服务器绝对路径 | `server/index.js` | ⏳ |
| BE-SEC-12 | 🟡 | 未设置安全 HTTP 头（CSP、X-Frame-Options 等） | `server/index.js` | ⏳ |
| BE-SEC-13 | 🟡 | 无结构化输入验证层（缺少 zod/joi） | `server/` | 🔧 |
| BE-SEC-14 | 🟢 | ovftool 命令引用规则不完整 | `server/ovftool.js` | ⏳ |
| BE-SEC-15 | 🟢 | Ticket 部分泄露到日志 | `server/index.js` | ⏳ |
| BE-SEC-16 | 🔴 | 加密密钥竞态条件 | `server/jobs.js` | ✅ `8da404a` |
| BE-SEC-17 | 🔴 | TLS 证书验证全局禁用（模块级 `insecureAgent`） | `server/services/vimClient.js` | ⏳ |
| BE-SEC-18 | 🔴 | 虚拟机 ID 未转义直接拼入 XML | `server/services/vmService.js` | ✅ `92481fb` |
| BE-SEC-19 | 🔴 | CDN 资源无 SRI 校验 | `index.html` | ✅ `4bcb29d→3efd7c5` |
| BE-SEC-20 | 🟡 | `action` 参数无枚举验证 | `server/index.js` | ✅ `d1fcf23` |
| BE-SEC-21 | 🟡 | `cpu`/`memory` 无范围校验 | `server/index.js` | ✅ `1e972fe` |
| BE-SEC-22 | 🟡 | 加密密钥文件权限默认 0644 | `server/jobs.js` | ✅ `9d058d7` |
| BE-SEC-23 | 🟡 | 基础设施信息硬编码（默认 IP 和用户名） | `App.jsx` | ✅ `42cb0a9` |
| BE-SEC-24 | 🟡 | `checkVmNameConflicts` 吞掉错误返回"无冲突" | `server/services/vmService.js` | ✅ `0949765` |

---

## 十、后端 — 健壮性

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| BE-ROB-1 | 🔴 | 正则解析 XML，非标准 SOAP 响应导致解析失败 | `server/services/vimClient.js` | ⏳ |
| BE-ROB-2 | 🔴 | 任务无所有权校验 | `server/jobs.js` | ⏳ |
| BE-ROB-3 | 🟡 | `initStore` 解密失败时 `catch` 块静默吞错，导致部分 payload 数据丢失 | `server/jobs.js` | ⏳ |
| BE-ROB-4 | 🟡 | `/api/vms/destroy` 未校验 `vmIds` 是否非空数组 | `server/index.js:386` | ⏳ |
| BE-ROB-5 | 🟡 | `ensureSession()` 并发竞态 — 缓存过期时多请求同时重新登录 | `server/services/vmService.js:14-46` | ⏳ |
| BE-ROB-6 | 🟡 | `saveToDisk` 非原子写入，崩溃会截断文件丢失全部任务数据 | `server/jobs.js` | ⏳ |
| BE-ROB-7 | 🟡 | `progress.failed` 在 `retryFailed` 中可能变负数 | `server/jobs.js` | ✅ `c998b23` |
| BE-ROB-8 | 🟡 | `encryptField`/`decryptField` 同步函数不保证密钥已加载 | `server/jobs.js` | 🔧 |
| BE-ROB-9 | 🟡 | SSE 心跳 `res.write` 无 `try/catch`，socket 错误可致未捕获异常 | `server/index.js` | 🔧 已加 `closed` 标志，但 `res.write` 仍无错误处理 |
| BE-ROB-10 | 🟡 | API 响应格式不一致（`{ ok }` 与 `{ error }` 与 `{ errors }` 混用） | `server/index.js` | ⏳ |
| BE-ROB-11 | 🟡 | vimClient 超时无效 | `server/services/vimClient.js` | ✅ `00d316c` |
| BE-ROB-12 | 🟡 | ovftool 子进程无超时 | `server/ovftool.js` | ✅ `fdd00ea` |
| BE-ROB-13 | 🟡 | 无优雅关闭 | `server/index.js` | ✅ `23538b0` |
| BE-ROB-14 | 🟡 | `powerOff` 错误被静默吞掉 | `server/jobs.js` | ✅ `13bb5a5` |
| BE-ROB-15 | 🟡 | `acquireWebMksTicket` 缺少 `ticket` 标签时返回 `undefined`（下游 `TypeError`） | `server/services/vmService.js` | 🔧 catch 块已重新抛出，但缺少 ticket 标签仍返回 undefined |
| BE-ROB-16 | 🟢 | catch-all 路由在非生产环境下返回 HTML | `server/index.js` | ⏳ |

---

## 十一、后端 — 性能

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| BE-PERF-1 | 🟡 | 过期任务仅启动时清理一次，运行期间无限累积 | `server/jobs.js` | 🔧 `a82b22b` |
| BE-PERF-2 | 🟡 | `validateTemplateSource` 每次创建新 `VmService` 实例 | `server/index.js` | ⏳ |
| BE-PERF-3 | 🟡 | `/api/deployments/check` 调用了两次 `discoverInventory` | `server/index.js:310-312` | ⏳ |
| BE-PERF-4 | 🟡 | `hydrateTargetFromSession` 直接修改 `req.body` | `server/index.js` | ⏳ |
| BE-PERF-5 | 🟡 | 每次 `textTag` 调用都 `new RegExp` | `server/services/vimClient.js` | ⏳ |
| BE-PERF-6 | 🟡 | `folderPathParts`/`findDatacenter` 重复创建 Map（每次 O(n)） | `server/services/vmService.js` | ⏳ |
| BE-PERF-7 | 🟡 | 会话缓存永不过期 | `server/services/vmService.js` | ✅ `0401bb6` |
| BE-PERF-8 | 🟡 | `Layout.jsx` 订阅过多 store 状态 | `Layout.jsx` | ⏳ |
| BE-PERF-9 | 🟢 | `jobs.js` 日志截断使用 `splice`（大数组性能差） | `server/jobs.js` | ⏳ |
| BE-PERF-10 | 🟢 | ovftool 缓存路径不可刷新 | `server/ovftool.js` | ⏳ |
| BE-PERF-11 | 🟢 | ovftool URL 可能双重编码 | `server/ovftool.js` | ⏳ |
| BE-PERF-12 | 🟢 | 911 行废弃 CSS 打包进生产构建 | `src/styles.css` | ✅ `7cd2859` |
| BE-PERF-13 | 🟢 | `JobsPage` 日志去重 O(n) | `JobsPage.jsx` | ✅ `5879806` |

---

## 十二、架构与代码质量

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| ARC-1 | 🟡 | 并发限制不匹配 — 前端允许 20，后端硬编码 10 | `SettingsPage.jsx` 与 `server/index.js` | ⏳ |
| ARC-2 | 🟡 | 无结构化日志系统 | `server/` | ⏳ |
| ARC-3/12 | 🟡 | `WebSocket` 从 `ws` 导入但从未使用（ARC-3 与 ARC-12 合并） | `server/index.js:7` | ⏳ |
| ARC-4 | 🟡 | Zustand store 接收回调参数（反模式） | `useAuthStore.js` | ⏳ |
| ARC-5 | 🟢 | `Layout.jsx` 路径映射应改为对象 | `Layout.jsx` | ⏳ |
| ARC-6 | 🟢 | `textTag` 的 `tag` 参数未清理 | `server/services/vimClient.js` | ⏳ |
| ARC-7 | 🟢 | `useAppStore.js` localStorage 键为魔法字符串 | `useAppStore.js` | ⏳ |
| ARC-8 | 🟢 | `useAuthStore.setToken` 不验证 token 格式 | `useAuthStore.js` | ⏳ |
| ARC-9 | 🟢 | `useAuthStore` 中 `token` 存在但 `isAuthenticated` 为 `false`（时序问题） | `useAuthStore.js` | ⏳ |
| ARC-10 | 🟢 | `useAuthStore.logout()` 未调用 `resetStore()` | `useAuthStore.js` | ⏳ |
| ARC-11 | 🟢 | `InventoryPage` 每次渲染生成当前时间（不更新） | `InventoryPage.jsx` | ⏳ |
| ARC-13 | 🟢 | localStorage 持久化逻辑已提取 | `useAppStore.js` | ✅ `cf4d27b` |
| ARC-14 | 🟢 | `lucide-react` 错误归类为 `devDependencies` | `package.json` | ✅ `8f69f98` |

---

## 十三、基础设施

| # | 严重度 | 问题 | 状态 |
|---|---|---|---|
| INF-1 | 🔴 | 无测试框架 | ⏳ |
| INF-2 | 🔴 | 无 ESLint | ⏳ |
| INF-3 | 🔴 | 无 CI/CD | ⏳ |
| INF-4 | 🔴 | 二进制大文件（`wmks.min.js`）存入 Git | ⏳ |
| INF-5 | 🔴 | 缺少 TypeScript 配置 | ⏳ |
| INF-6 | 🟡 | Express 版本范围过宽（`^5.1.0`） | ⏳ |
| INF-7 | 🟡 | `vite.config.js` 代理目标硬编码 | ⏳ |
| INF-8 | 🟡 | `vite.config.js` 缺少生产构建优化 | ⏳ |
| INF-9 | 🟡 | `start` 脚本 Windows 不兼容 | ⏳ |
| INF-10 | 🟡 | 缺少 Prettier 配置 | ⏳ |
| INF-12 | 🟢 | `package.json` 与 `package-lock.json` 版本号不一致 | ⏳ |
| INF-13 | 🟢 | jQuery/jQuery UI 仅为 wmks 隐式依赖，已加 SRI | ✅ `4bcb29d→3efd7c5` |
| INF-14 | 🟢 | `.env.example` 已补全 | ✅ `03f55c4` |
| INF-15 | 🟢 | `.gitignore` 已补全 | ✅ `03f55c4` |
| INF-16 | 🟢 | `engines` 字段已添加 | ✅ `03f55c4` |
| INF-17 | 🟢 | `.editorconfig` 已添加 | ✅ `03f55c4` |
| INF-18 | 🟢 | `.env.*` 规则已修正 | ✅ `03f55c4` |
| INF-19 | 🟢 | 废弃代码已清理 | ✅ `11619de`、`3bb01f1` |
| INF-20 | 🟢 | VimClient HTTPS 链路重构（ESXi 兼容性） | ✅ |
| INF-21 | 🟢 | 废弃代码（`navigate`、`uniqueOptions`）已删除 | ✅ |

---

## 十四、前端状态管理

| # | 严重度 | 问题 | 文件 | 状态 |
|---|---|---|---|---|
| ST-1 | 🟡 | 401 后 `logout()` 不刷新页面 | `useAppStore.js` | ✅ `00d316c` |
| ST-2 | 🟡 | `resetStore()` 未清除 `localStorage` | `useAppStore.js` | ✅ `5c9475e` |

---

## 十五、WMKS 依赖链

```
jQuery 3.7.1 → jQuery UI 1.13.2 → wmks.min.js
     $              $.widget         WMKS SDK
```

`wmks.min.js` 隐式依赖 jQuery 和 jQuery UI。三者在 `index.html` 中按此顺序加载，均已加 SRI 校验。曾因误删 jQuery 导致 `$.widget is not a function` 回归（已修复）。

---

## 十六、已验证的端到端部署

**日期：** 2026-05-25
**路径：** 模板 `debian-openclaw` → 主机 `172.16.109.3` → 存储 `nvme` → 网络 `openwrt→VLAN50`
**结果：** ✅ 成功（任务 `EaXg1Xnl`，3 分 14 秒，含自动开机）

修复了以下问题后才成功：
- `normalizeInventory` 缺少 `sourceNetworks`（模板网络名降级到 `VM Network`）
- `encodeInventoryPath` 缺少前导 `/`（VI URL 拼接错误）
- `vmFolder`/`hostFolder` 名称解析失败（SOAP 返回字符串 ID）
- 任务监控页 power/destroy/snapshot 任务统一显示"部署 N 台虚拟机"

---

## 十七、全部提交记录

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
| `d8031d3` | 审计报告更新 |
| `1656a3c` | 修复部署流水线（inventory path、VI URL、sourceNetworks、映射清空） |
| `04376f7` | 任务类型标签 + ovftool 架构不匹配提示 |

---

## 十八、优先级建议

1. **🔴 高优先级 — 崩溃类**：I-1（AlertCircle 缺失）、DP-1/DP-2（部署验证）、BE-ROB-2（任务无所有权校验）
2. **🔴 高优先级 — 安全**：BE-SEC-1~6（WebSocket 请求伪造/注入/凭证暴露）、BE-SEC-17（TLS 证书验证全局禁用）
3. **🟡 中优先级 — 功能缺陷**：I-2/I-3（选择状态）、DP-3~7（部署向导）、J-2~4（任务监控）
4. **🟢 低优先级**：体验优化、无障碍访问、代码规范
5. **长期**：测试框架、CI/CD、TypeScript 迁移
