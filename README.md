# MassOVA

MassOVA 是一个用于从 ESXi 或 vCenter 模板批量部署虚拟机的 Web 工具。

## 功能

- 从 vSphere 模板批量部署虚拟机，支持 ESXi 和 vCenter
- 连接后自动读取 Datastore、网络、模板等资源
- 简单生成模式（前缀 + 编号）和手动清单模式
- 可调并发数（1-10），并行执行 ovftool
- SSE 实时日志推送，可视化进度条
- 失败重试，仅重新部署失败的 VM
- 任务数据持久化，重启不丢失
- 提交前 VM 名称冲突检测和 Datastore 容量预警
- 部署配置模板保存/加载
- 日志导出
- 可选 Web 界面认证（Token）
- 内置 ovftool 三平台支持（macOS/Linux/Windows）

## 文档

- [部署文档](docs/DEPLOY.md) — 安装、配置、生产部署
- [使用文档](docs/USAGE.md) — 操作步骤、功能说明、常见问题

## 快速开始

```bash
npm install
npm run dev
```

开发地址：http://localhost:5174（前端，自动代理到后端 :4173）

## 生产构建

```bash
npm run build
npm start
```

## ovftool 安装

```bash
# 辅助脚本安装（推荐）
./setup-ovftool.sh /path/to/VMware-ovftool-*.dmg

# 或手动放置到对应平台目录
cp ovftool bin/linux/ovftool          # Linux
cp ovftool bin/darwin/ovftool         # macOS
cp ovftool.exe bin/win32/ovftool.exe  # Windows

# 或使用环境变量
OVFTOOL_PATH=/path/to/ovftool npm start
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `4173` | 服务端口 |
| `NODE_ENV` | - | `production` 启用静态托管 |
| `OVFTOOL_PATH` | 自动检测 | ovftool 路径 |
| `MASSOVA_USER` | - | 认证用户名 |
| `MASSOVA_PASS` | - | 认证密码 |

## License

Private
