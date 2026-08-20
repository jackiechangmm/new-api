# 资源

## 项目一手资料

- `web/src/features/playground/index.tsx`：Playground 组件组合入口。
- `web/src/features/playground/hooks/use-chat-handler.ts`：发送、流式更新、停止和错误状态。
- `web/src/features/playground/hooks/use-stream-request.ts`：SSE/流式 HTTP 请求实现。
- `web/src/features/playground/lib/streaming/payload-builder.ts`：请求体构造。
- `controller/playground.go`：用户态 `/pg/chat/completions` 入口，以及转入统一 Relay 前的上下文设置。
- `controller/relay.go`：统一请求管线，包含校验、估算、价格、预扣费、渠道重试和下游适配器调用。
- `relay/common/relay_info.go`：一次请求的运行时上下文对象 `RelayInfo`。
- `relay/helper/price.go`：模型价格和预扣费额度计算。
- `service/billing.go`、`service/billing_session.go`：预扣费、结算和退款会话。
- `service/text_quota.go`：文本请求根据上游 usage 结算并写消费日志。
- `model/quota_reserve.go`：Redis Lua 原子预扣与 PostgreSQL 降级路径。

## 技术栈官方资料

- [Gin 文档](https://gin-gonic.com/docs/)：路由和 `gin.Context`。
- [React 文档](https://react.dev/learn)：组件、Hook 和状态。
- [TanStack Query 文档](https://tanstack.com/query/latest/docs/framework/react/overview)：服务端数据查询与缓存。
- [GORM 文档](https://gorm.io/docs/)：数据库访问。
- [Go 官方教程](https://go.dev/doc/tutorial/)：Go 模块与基础语法。
