# 用户会话调用复用标准 Relay 路由

用户会话调用直接接入标准同步 HTTP relay 路由，复用 API token 调用已有的协议、渠道选择和用户余额结算。此决定消除前端专用模型调用路径，同时保持 API token 的权限与额度语义不变。

## 认证与授权

- 仅接受 `Authorization: Bearer <dashboard access JWT>`；refresh cookie 不用于 relay 认证。
- 用户会话调用按用户及其可用组授权，使用虚拟 token 上下文，不结算 API token 余额。
- 单个请求同时携带用户会话 JWT 和 API token 时返回 `400`。
- 认证成功后剥离用户会话 JWT，防止渠道请求头透传给上游。

## 路由范围

- 支持所有标准同步 HTTP relay 格式和模型列表；API token 调用保持既有行为。
- 用户会话调用 `/v1/realtime` 返回 `403`。
- WebSocket realtime、异步任务、任务查询、媒体下载继续仅接受 API token。
- 保留 `/pg/chat/completions` 兼容路径，Playground 迁移至 `/v1/chat/completions`。

## 分组与模型发现

- 模型请求通过 `X-Relay-Group` 选择实际使用分组，并兼容 OpenAI JSON 请求体中的 `group`；前者优先。
- 模型列表仅通过 `?group=` 选择实际使用分组。
- 分组元数据仅用于网关的选路和计费；认证后剥离 `X-Relay-Group`，并在所有出站请求体中移除 JSON `group`。
- 用户会话请求 `/v1/models` 且携带 `anthropic-version` 时返回 Anthropic 格式；`/v1beta/models` 返回 Gemini 格式；其余 `/v1/models` 返回 OpenAI 格式。

## 可观测性

所有可归因的 relay 消费日志在 `other.admin_info.auth_source` 写入 `session` 或 `token`。
