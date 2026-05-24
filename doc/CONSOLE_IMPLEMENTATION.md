# WebMKS 控制台实现方案与兼容性说明

## 背景
在 vSphere 环境中，Web 控制台（WebMKS）的连接需要向服务器申请一个临时的认证票据（Ticket）。然而，独立 ESXi 主机与 vCenter Server 在 API 支持和协议解析上存在显著差异。

## 遇到的问题
1. **接口差异**：vCenter 推荐使用现代的 `AcquireWebMksTicket` 接口，但大多数独立 ESXi 主机（包括 6.0/6.5 乃至某些配置下的 8.0）并不支持该接口，会返回 `Unable to resolve WSDL method` 错误。
2. **SOAPAction 敏感**：ESXi 6.0 等旧版本对 HTTP Header 中的 `SOAPAction` 极其敏感。如果不提供或提供错误的 WSDL 版本号，服务器将拒绝解析请求。
3. **XML 架构严苛**：独立 ESXi 要求 XML Body 中的 `_this` 标签必须显式声明类型（如 `type="VirtualMachine"`），否则会解析失败。

## 最终解决方案（已实现）

### 1. 通信层优化 (`VimClient.js`)
- **固定 SOAPAction**：默认使用 `"urn:vim25/6.0"`。该版本号具有极强的向后兼容性，能够同时被 ESXi 6.0 到 8.0 以及各版本 vCenter 接受。
- **HTTPS 链路修复**：确保请求 Body 正确写入且 Session Cookie（`vmware_soap_session`）能够在登录后正确传递。

### 2. 控制台票据逻辑 (`vmService.js`)
采用了 **“优先通用、精准回退”** 的策略：

#### 步骤一：调用 `AcquireTicket` (webmks)
这是最通用的方法，被独立 ESXi（官方 UI 采用此法）和 vCenter 同时支持。
- **参数**：`ticketType="webmks"`
- **XML 结构**：
  ```xml
  <AcquireTicket xmlns="urn:vim25">
    <_this type="VirtualMachine">VM_ID</_this>
    <ticketType>webmks</ticketType>
  </AcquireTicket>
  ```
- **注意**：必须显式声明 `_this` 的 `type` 属性。

#### 步骤二：自动回退
如果 `AcquireTicket` 返回“方法未找到”相关错误（通常出现在极少数被禁用了旧接口的新版 vCenter 中），系统会自动尝试：
- 调用 `AcquireWebMksTicket` (现代 vCenter 专属)

## 验证结论
经过实测（环境：ESXi 8.0.3 及 vCenter 7.0+），该方案能够确保在不同虚拟化管理架构下，Web 控制台均能一键秒开，无需额外配置。
