# MassOVA

MassOVA 是一个用于从 ESXi 或 vCenter 模板批量部署虚拟机的 Web 工具。前端用于选择模板、部署目标、网络和 VM 命名规则，后端负责生成并执行 `ovftool` 命令。

## 功能

- 批量 VM 名称输入，支持 `{{index}}` 模板变量。
- ESXi/vCenter 地址、账号、datastore、folder、resource pool、磁盘模式配置。
- vCenter 模式支持 inventory 目标路径，例如 `/Datacenter/host/172.16.109.3/Resources`。
- 连接并读取资源，可验证登录并把部署目标、datastore、network、folder 变成选项。
- 只允许选择已连接 ESXi/vCenter 上的模板作为部署源，不允许本地上传 OVA。
- 网络映射的源网络会从 vSphere 模板中读取并提供下拉选择。
- 虚拟机清单默认使用“名称前缀 + 数量 + 起始编号 + 编号位数”生成，也保留手动清单模式。
- 干跑模式，预览脱敏后的 `ovftool` 命令和任务日志。
- 真实执行模式，按 VM 顺序调用 `ovftool` 部署。
- 任务列表、进度、日志和取消运行中任务。

## 运行

```bash
npm install
npm run dev
```

开发地址：

- 前端：http://localhost:5174
- 后端：http://localhost:4173

## 真实部署前准备

安装 VMware OVF Tool，并确保后端进程能直接调用：

```bash
ovftool --version
```

如果 `ovftool` 不在 `PATH` 中，可以用环境变量指定：

```bash
OVFTOOL_PATH="/Applications/VMware OVF Tool/ovftool" npm run dev
```

当前机器上的可用路径示例：

```bash
OVFTOOL_PATH="/Users/ruihan/Personal/VMware OVF Tool/ovftool" npm run dev
```

部署源固定为 `vSphere 模板`。如果手里只有 OVA，请先手动导入一台虚拟机并转换成模板，再用 MassOVA 从该模板批量部署。这样大批量部署时不会重复把同一个 OVA 上传到 ESXi/vCenter。

关闭“干跑模式”后，后端会按 VM 清单逐台从模板部署。

## vCenter 目标路径

vCenter 模式会在连接后从 inventory 中读取部署目标，并自动生成目标路径。路径格式示例：

```text
/Datacenter
/Datacenter/host
/Datacenter/host/172.16.109.3
/Datacenter/host/172.16.109.3/Resources
```

最终部署通常使用资源池路径，例如 `/Datacenter/host/172.16.109.3/Resources`。

## 生产构建

```bash
npm run build
npm start
```
