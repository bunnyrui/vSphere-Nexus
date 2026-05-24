# vSphere Nexus

**vSphere Nexus** 是一款专为企业级虚拟化环境设计的专业管理平台。它提供了一个现代化的、响应式的 Web 界面，用于管理 vCenter Server 和独立 ESXi 主机，支持虚拟机生命周期管理、批量部署及实时 Web 控制台访问。

[![License](https://img.shields.io/badge/license-Private-red.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1--beta.1-blue.svg)](package.json)

---

## 🌟 核心特性

-   **全平台兼容控制台**：深度适配 ESXi 6.0/6.5/7.0/8.0 及 vCenter，通过 WebMKS 提供无插件、低延迟的浏览器控制台体验。
-   **自动化批量部署**：集成 `ovftool`，支持通过 OVF/OVA 模板进行大规模虚拟机自动部署。
-   **实时资源监控**：直观展示数据中心、主机、存储及网络的利用率，支持虚拟机运行状态的实时同步。
-   **快照管理**：一键创建、恢复及管理虚拟机快照。
-   **轻量化架构**：前端采用 React 19 + Tailwind CSS，后端使用 Node.js + Express，具备极高的响应速度和扩展性。

## 🛠️ 技术栈

-   **前端**: React 19, Vite, Lucide Icons, Zustand (状态管理), Tailwind CSS
-   **后端**: Node.js, Express, WebSocket (ws), SOAP API
-   **工具**: VMware OVF Tool (集成支持)

## 🚀 快速开始

### 前提条件

-   Node.js >= 20.0.0
-   VMware OVF Tool (若需使用部署功能)

### 安装步骤

1.  **克隆仓库**
    ```bash
    git clone https://github.com/bunnyrui/vSphere-Nexus.git
    cd vSphere-Nexus
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **配置环境**
    复制 `.env.example` 为 `.env` 并根据实际环境调整配置。

4.  **启动开发服务器**
    ```bash
    npm run dev
    ```
    -   前端访问地址: `http://localhost:5174`
    -   后端 API 地址: `http://localhost:4173`

### 生产环境部署

```bash
npm run build
npm start
```

## 📖 技术文档

关于 Web 控制台在独立 ESXi 主机上的特殊实现及兼容性挑战，请参阅：
-   [WebMKS 控制台实现方案](doc/CONSOLE_IMPLEMENTATION.md)

## 🛡️ 安全审计

本项目已进行多轮深度代码审计，详细的已知问题及修复状态请查看：
-   [全局代码审计报告](AUDIT_REPORT.md)

## 🤝 贡献指南

如果您发现了 Bug 或有功能建议，欢迎提交 Issue 或 Pull Request。

1.  Fork 本项目
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  开启一个 Pull Request

---

© 2026 vSphere Nexus Team. 由 芮晗 开发。
