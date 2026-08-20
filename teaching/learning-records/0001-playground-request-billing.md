# 0001 Playground 请求与计费主链

- 日期：2026-02-12
- 主题：用户态 Playground 调用模型与计费
- 状态：已完成第一课，等待用户反馈

## 已掌握

- Playground 请求从 React 的 `useChatHandler` 发出，目标是 `/pg/chat/completions`。
- `/pg` 入口使用用户会话认证；`controller.Playground` 创建临时 Token 上下文后复用统一 `controller.Relay`。
- `Relay` 的核心顺序是请求校验、`RelayInfo`、token 估算、价格、预扣费、渠道/适配器调用。
- 上游返回 usage 后，`PostTextConsumeQuota` 计算实际额度并通过 `SettleBilling` 补扣或返还。
- 失败路径由 `Relay` 的 defer 调用 `BillingSession.Refund`。

## 关键洞见

Playground 是统一 Relay 的用户态外壳，而不是独立的模型调用实现。临时 Token 主要承担上下文适配作用；`RelayInfo.IsPlayground` 则在结算时避免调整真实 API Token 的额度。

## 下次复习

先不看材料，画出：前端请求、Playground 入口、Relay、预扣、上游 usage、结算、退款、日志这 8 个节点，并说出每个节点的主要文件。
