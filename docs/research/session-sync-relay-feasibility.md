# 用户会话调用标准同步 Relay 可行性调研

## 结论

可行，且不需要复制 Playground 的模型调用、渠道、计费或响应逻辑。最小实现是把现有标准同步 HTTP Relay 的认证层扩展为“用户会话或 API token”，为会话请求建立一个不落库的虚拟 token 上下文，再让 `GenRelayInfo` 将该请求标记为 `IsPlayground=true`。后续仍进入现有 `controller.Relay` 主链。

建议只开放同步 HTTP relay 路由；WebSocket realtime、异步任务、任务查询和模型管理接口继续保持 API token 认证，避免扩大本次改动范围。

本调研不修改 `/pg/chat/completions`，也不建议将其入口实现复制到新路径。

## 现有调用链

API token 标准 HTTP relay 当前是：

```text
/v1 HTTP 路由
  -> TokenAuth
  -> ModelRequestRateLimit
  -> Distribute
  -> controller.Relay
  -> GetAndValidateRequest
  -> GenRelayInfo
  -> EstimateRequestToken / ModelPriceHelper
  -> PreConsumeBilling
  -> 渠道重试与 relay adaptor
  -> usage 结算 / consume log / 标准响应
```

依据：

- `/v1` 路由和中间件：[router/relay-router.go:69-98](../../router/relay-router.go#L69-L98)
- 统一 Relay 生命周期：[controller/relay.go:71-228](../../controller/relay.go#L71-L228)
- 计费会话：[service/billing.go:20-70](../../service/billing.go#L20-L70)
- 文本 usage 结算和消费日志：[service/text_quota.go:397-540](../../service/text_quota.go#L397-L540)

旧 Playground 的作用主要是认证后的上下文适配：

- `/pg` 使用 `UserAuth` 和 `Distribute`：[router/relay-router.go:62-68](../../router/relay-router.go#L62-L68)
- `controller.Playground` 生成 `RelayInfo`、写入用户上下文、构造临时 token 上下文，然后调用 `Relay`：[controller/playground.go:15-55](../../controller/playground.go#L15-L55)
- `genBaseRelayInfo` 当前通过 `/pg` 路径设置 `IsPlayground`，并把日志请求路径转换为 `/v1/...`：[relay/common/relay_info.go:473-555](../../relay/common/relay_info.go#L473-L555)

## 复用条件

### 认证与上下文

项目已有 `TokenOrUserAuth`：

- dashboard access JWT 通过 `ParseDashboardAccessToken` 和 `ValidateLoginSession` 校验；
- 其他 opaque credential 继续转入原有 `TokenAuth`；
- API token 分支不会改变现有 token 校验、IP 限制、用户状态、分组和 token 上下文逻辑。

来源：[middleware/auth.go:246-273](../../middleware/auth.go#L246-L273)、[middleware/auth.go:352-483](../../middleware/auth.go#L352-L483)、[service/auth_session.go:114-134](../../service/auth_session.go#L114-L134)。

会话分支当前只建立 dashboard 用户上下文，没有建立 Relay 所需的 token 上下文。需要在认证中间件或紧邻的专用适配中补齐：

- `id`、用户分组、用户额度、用户设置等已有用户上下文；
- 空的 token ID/key/name；
- 空 token group 时回退用户分组；
- 禁用 token model limit、specific channel 和 token 跨组重试；
- 会话来源标记，供 `genBaseRelayInfo` 设置 `IsPlayground`。

最小方案是复用已有 `SetupContextForToken` 写入一个内存虚拟 token，再显式设置会话来源标记。虚拟 token 不应持久化，也不应伪造真实 API token 身份。

### 分发与渠道选择

`Distribute` 的正常选择路径主要依赖：

- 请求体中的 `model`；
- `ContextKeyUsingGroup`；
- 可选的 token model limit；
- 渠道缓存、模型映射、请求路径和重试参数。

来源：[middleware/distributor.go:33-165](../../middleware/distributor.go#L33-L165)。

会话上下文只要把 `ContextKeyUsingGroup` 设为用户当前可用分组，就可以进入同一套渠道选择、affinity、auto group 和重试流程。现有 `/pg` 对请求体 `group` 的特殊处理应继续只留在旧 Playground 路径，不要为了新入口复制这段逻辑。

需要明确的产品边界：新会话入口默认使用用户分组；若以后允许网页用户选择其他可用组，应在分发层增加通用的受控分组来源，并验证 `GroupInUserUsableGroups`，不能让请求体直接覆盖分组。

### 计费

现有计费实现已经有 `IsPlayground` 分支，适合承载“用户会话计用户钱包/订阅，不计 API token 额度”的语义：

- 预扣 token quota 在 `IsPlayground` 时跳过：[service/quota.go:387-407](../../service/quota.go#L387-L407)
- BillingSession 结算时跳过 token quota 调整：[service/billing_session.go:45-79](../../service/billing_session.go#L45-L79)
- 失败退款时跳过 token quota 返还，但仍退款资金来源：[service/billing_session.go:82-123](../../service/billing_session.go#L82-L123)
- 钱包/订阅预扣、结算和回退仍由 `BillingSession` 统一处理：[service/billing_session.go:185-220](../../service/billing_session.go#L185-L220)

因此只要在 `GenRelayInfo` 前后可靠设置 `IsPlayground`，后续计费链不需要新增一套分支。风险在于如果会话请求没有设置该字段，空 token ID/key 会进入真实 token 额度路径并导致错误，必须用测试锁住这一点。

### 日志与响应

同步 Relay 的成功日志由现有文本/音频/图片等 handler 生成，响应也由现有 adaptor 和 `Relay` 处理。消费日志允许 `token_id=0`、`token_name` 为空，并仍记录用户、模型、渠道、分组、请求 ID 和额度；日志结构见：[model/log.go:326-402](../../model/log.go#L326-L402)。

建议额外在 `other.admin_info` 标记认证来源，例如 `session` 或 `token`，便于管理员区分调用来源；这不是复用主链的前置条件，但对运营和排障有价值。现有 `admin_info` 对普通用户日志会被剥离：[model/log.go:117-130](../../model/log.go#L117-L130)。

上游默认鉴权头由渠道 adaptor 设置，通配符/正则 header passthrough 已排除 `Authorization`、`x-api-key` 和 `x-goog-api-key`：[relay/channel/api_request.go:73-100](../../relay/channel/api_request.go#L73-L100)。会话 access JWT 仍建议在认证完成后从出站可见请求头中剥离，避免显式 `{client_header:Authorization}` 配置将 dashboard JWT 传给上游；这是实现时需要确认的安全边界。

## 路由改造边界

当前 `/v1` 父路由把 `TokenAuth` 施加到 WebSocket 和所有 HTTP 子路由：[router/relay-router.go:69-85](../../router/relay-router.go#L69-L85)。若直接把父级替换为 `TokenOrUserAuth`，会意外允许用户会话访问 `/v1/realtime`。

推荐的最小路由调整：

1. `/v1` 保留公共标签和性能检查。
2. WebSocket `/v1/realtime` 单独使用 `TokenAuth`、限流和 `Distribute`。
3. 同步 HTTP relay 子路由使用 `TokenOrUserAuth`、限流和 `Distribute`。
4. `/v1/models`、`/v1beta/models` 等模型发现接口是否开放给会话用户单独决定；本目标只要求调用模型，可以先保持 token-only。
5. `/v1` 下的视频异步任务继续保持 token-only；当前视频路由单独使用 `TokenAuth`：[router/video-router.go:19-32](../../router/video-router.go#L19-L32)。媒体下载已有独立的 `TokenOrUserAuth`，不应借此扩大异步任务权限：[router/video-router.go:10-17](../../router/video-router.go#L10-L17)。

旧 `/pg/chat/completions` 保留原路由、认证和 controller，不迁移、不删除、不改入口。

## 主要风险

- **身份标记错误**：不能继续只用 URL `/pg` 判断 `IsPlayground`；新标准路径必须通过认证来源或上下文标记设置该字段，同时保持旧 `/pg` 兼容。
- **路由范围过宽**：父级直接换成 `TokenOrUserAuth` 会放开 realtime；需要按同步 HTTP 与 WebSocket 拆分中间件。
- **虚拟 token 配置过宽**：不能设置 `UnlimitedQuota=true`，否则可能命中 BillingSession 的信任额度旁路并跳过用户资金预扣。旧 Playground 的临时 token 默认不是 unlimited；会话适配也应保持这一语义。
- **分组越权**：会话不应继承任意 token group，也不应直接信任客户端 `group` 字段；应从用户可用分组中选择并校验。
- **凭证透传**：认证 JWT 不能成为上游凭证；默认渠道鉴权不会使用它，但显式客户端 header override 仍需定义和测试。
- **日志归因弱**：`token_id=0` 能正常落日志，但没有认证来源字段时管理员无法直接区分会话请求与异常的空 token 请求。
- **上下文污染**：请求重试会复用同一个 Gin context；会话 marker、用户分组和虚拟 token 字段必须在请求生命周期内稳定，不能在 retry 中被真实 token 值覆盖。

## 最小验收矩阵

- 有效 dashboard access JWT + `/v1/chat/completions`：成功进入标准 Relay，上游响应格式与 API token 一致。
- 同一请求的用户钱包/订阅正确预扣、结算和退款；真实 API token 的 `RemainQuota` 不变化。
- `RelayInfo.IsPlayground=true`，`TokenId=0`，消费日志带用户、模型、渠道、分组、请求 ID 和可选的 `auth_source=session`。
- 有效 API token + 原有 `/v1/chat/completions`：行为、token quota、日志和响应保持不变。
- 无效、过期、撤销或被禁用用户会话：返回未授权，不落入 API token 校验分支。
- 会话用户不能访问 `/v1/realtime`、异步任务和任务查询。
- 会话用户不能通过 `group` 或 token-specific-channel 参数绕过用户可用分组和渠道限制。
- `/pg/chat/completions` 的现有认证、分组、计费和响应回归测试继续通过。
- 上游请求不会收到 dashboard `Authorization` JWT。

## 建议实施顺序

1. 先抽出或补齐“会话 -> Relay 虚拟 token 上下文”的单一适配点，并定义会话来源 marker。
2. 拆分 `/v1` 的 WebSocket 与同步 HTTP 认证中间件。
3. 让 `genBaseRelayInfo` 同时兼容旧 `/pg` 路径和会话 marker 设置 `IsPlayground`，不要改变旧 Playground 的请求路径兼容逻辑。
4. 在日志生成公共位置补充认证来源，避免分别修改每个 adaptor。
5. 先做 middleware、路由、RelayInfo、BillingSession 和出站凭证测试，再用 PostgreSQL/Redis 环境跑目标链路验证。

## 最终判断

技术上是低到中等风险的局部改造，核心复用条件已经存在：`TokenOrUserAuth`、虚拟 token 上下文入口、`IsPlayground` 计费分支和统一 `controller.Relay`。真正需要谨慎处理的是认证中间件的路由边界、会话上下文补齐、`IsPlayground` 的来源，以及 dashboard JWT 的出站隔离；这些问题解决后，无需重写模型分发、渠道选择、计费、日志或响应处理。
