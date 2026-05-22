# vSphere Nexus 项目重构进度与状态报告 (Project Status Report)

**报告日期：** 2026年5月22日
**当前版本：** v0.2.0 (Professional Edition Refactored)
**运行状态：** 稳定 (Stable)

---

## 1. 核心架构升级 (Architectural Evolution)
项目已从“单一功能脚本”彻底转型为“模块化管理平台”：
- **前端：**
    - **UI 系统：** 引入 Tailwind CSS + 类 shadcn 设计规范。
    - **路由：** 引入 React Router 实现多页面（仪表盘、部署、资源、监控、设置）。
    - **状态管理：** 引入 Zustand，实现全局会话（Auth）和应用状态（AppStore）的统一管理。
- **后端：**
    - **服务分层：** 原 `vsphere.js` 已彻底移除。核心逻辑已迁移至 `services/VimClient`（SOAP基础）和 `services/VmService`（业务逻辑）。
    - **模块化路由：** `index.js` 和 `jobs.js` 现已完全采用 `VmService` 实例进行操作。
    - **全平台适配：** 自动识别 macOS/Linux/Windows 并动态注入 `DYLD_LIBRARY_PATH` 等环境变量以调用内置 `ovftool`。

---

## 2. 已实现功能清单 (Implemented Features)

### ✅ 认证与连接 (Auth & Connectivity)
- [x] **统一登录：** 使用 vSphere IP/账号/密码直接登录，自动建立环境连接。
- [x] **刷新不掉线：** 实现 Session Hydration，刷新页面自动恢复资源清单和连接状态。
- [x] **快速切换：** 顶栏集成“切换连接”按钮，一键回到登录页并记忆历史输入。

### ✅ 批量部署 (Batch Deployment)
- [x] **分步向导：** 连接 -> 资源选择 -> VM配置 -> 最终确认。
- [x] **智能联动：** 选定计算资源（Host/Cluster）后，存储（Datastore）下拉列表自动过滤。
- [x] **智能命名：** 支持 `001` 格式的自动宽度补全预览；支持留空不编号模式。
- [x] **执行清单：** 开始前提供完整的待创建虚拟机清单核对。

### ✅ 资源管理与控制 (Inventory & Control)
- [x] **实时大盘：** 5秒高频静默心跳，实时感知电源状态变化。
- [x] **批量电源控制：** 批量开机、关机（支持强行关机策略）、重启、销毁。
- [x] **重命名与配置：** 支持对单个 VM 进行重命名、修改 CPU 核心数和内存容量。
- [x] **无感操作：** 采用 Fire & Forget 策略，解决 vCenter 任务反馈延迟导致的“假失败”。

### ✅ 快照管理中心 (Snapshot Manager)
- [x] **侧边面板：** 点击相机图标滑出快照抽屉。
- [x] **快照列表：** 实时拉取并展示快照历史。
- [x] **完整生命周期：** 支持创建快照（含内存开关）、回滚快照、删除快照。
- [x] **批量快照：** 支持选中多台机器一键统一拍摄快照。

### ✅ 控制台接入 (Console Integration)
- [x] **WebMKS 深度集成：** 采用 Raw Tunneling 技术，完美解决 WebSocket 双重封包导致的连接卡死问题。
- [x] **智能代理：** 自动识别内网 ESXi 拓扑，支持通过 vCenter MKS Proxy 进行连接回退。

---

## 3. 已修复的关键 Bug (Critical Fixes)
- [x] **macOS 库依赖：** 修复了 Mac 下 `ovftool` 移动后找不到 `lib` 的问题。
- [x] **vCenter 状态盲区：** 修复了 `PropertyCollector` 在 vCenter 下 ID 不匹配导致的关机跳步问题。
- [x] **控制台黑屏/转圈：** 通过重写 WebSocket 转发层为原始字节流隧道，彻底修复了画面不显示的问题。

---

## 4. 下一步建议 (Next Steps)
1. **性能监控图表：** 在详情页加入 CPU/内存/磁盘 IO 的实时趋势图。
2. **批量配置修改：** 选中多台 VM 后，一键统一调整 CPU 或内存规格。
3. **日志持久化：** 对 `ovftool` 部署日志进行更长周期的磁盘持久化。


---
**备注：** 所有的代码已就绪，当前生产环境可通过 `npm start` 运行，开发环境 `npm run dev`。
