# vSphere Nexus 功能优化建议

## 高优先级

### 1. 任务持久化 ✅ 已实现

任务数据持久化到 `data/jobs.json`，500ms 防抖保存。服务重启后自动恢复历史任务，未完成任务标记为 `interrupted`。

---

### 2. 失败重试 / 断点续部署 ✅ 已实现

新增 `POST /api/jobs/:id/retry` 接口，payload 也持久化到 `data/payloads.json`。重试时仅对 `failed` 状态的 VM 重新部署，前端有重试按钮（RotateCcw 图标）。

---

### 3. 并发部署 ✅ 已实现

后端使用 worker pool 模式（`runWithConcurrency`），前端可配置 1-10 并发数。每个 job 记录 `concurrency` 字段。

---

### 4. 实时日志推送 ✅ 已实现

`GET /api/jobs/:id/events` SSE 端点推送日志和状态。前端用 `EventSource` 接收，日志框自动滚动到底部。任务完成后自动关闭连接。

---

### 5. ~~部署配置模板~~ 已移除

经评估运维场景无实际需求，已删除前后端模板 CRUD 路由和 UI。

---

## 中优先级

### 6. Web 界面认证 ✅ 已实现

环境变量 `MASSOVA_USER` / `MASSOVA_PASS` 启用 Token 认证。未配置时不影响使用。前端有登录页面，token 存 localStorage。

---

### 7. VM 名称冲突检测 ✅ 已实现

提交前调用 `POST /api/deployments/check`，通过 vSphere API 查询已有 VM 列表做比对。冲突时显示警告，用户可选择"返回修改"或"仍然部署"。

---

### 8. Datastore 容量校验 ✅ 已实现

discover 阶段获取 Datastore 的 `capacity` / `freeSpace`。提交前根据模板 `storageCommitted` × VM 数量估算所需空间，不足时预警。侧栏和 Datastore 下拉均显示容量信息。

---

### 9. 每台 VM 独立配置

**现状：** 所有 VM 共享同一套网络映射和 OVF 属性，无法为单台 VM 定制 IP、hostname 等。

**建议：** 在手动清单模式下，支持 CSV 列导入（如 `name,ip,gateway`），允许为每台 VM 设置不同的 OVF 属性值。生成的 ovftool 命令中按 VM 传入对应的 `--prop` 参数。

---

### 10. 日志导出 ✅ 已实现

任务面板中有导出按钮（Download 图标），将完整日志导出为 `.log` 文本文件。

---

## 低优先级 / 体验优化

### 11. 可视化进度条 ✅ 已实现

任务面板中有可视化进度条和完成/失败/待执行计数。

---

### 12. vSphere 会话复用 ✅ 已实现

同一 host+username 组合缓存 session cookie 和 serviceContent，10 分钟 TTL。短时间内多次操作不会重复登录。

---

### 13. 部署后自定义脚本

**现状：** 部署完成后仅支持 `--powerOn` 选项。

**建议：** 支持配置部署后自动执行的 guest customization 或自定义脚本，如通过 VMware Tools 执行 guest 内命令。

---

### 14. 多模板源

**现状：** 一次部署任务只能选择一个 vSphere 模板作为源。

**建议：** 支持在同一个批次中混合不同模板，每台 VM 可指定不同的模板源，满足异构批量部署需求。

---

### 15. 国际化 (i18n)

**现状：** UI 文案全部为中文硬编码在 JSX 中。

**建议：** 引入 i18n 框架（如 react-intl 或 i18next），将文案抽为资源文件，支持多语言切换。
