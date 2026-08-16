# 账务与转发架构索引

本页是项目内部实现的导航索引，帮助维护者快速定位账务、模型转发、图片与异步任务相关代码。

它提供链接目标的职责概要；具体行为以链接的实现、测试和配置为准。

## 账务生命周期

- [预扣与结算编排](../service/billing.go)
  创建 `BillingSession`，并以实际额度与预扣额度的差额结算。
- [账务会话与资金来源](../service/billing_session.go)
  协调钱包、订阅和 Token 额度的预扣、补充预留、结算与退款。
- [文本与多模态用量结算](../service/text_quota.go)
  将实际 usage、缓存、图像、音频和工具附加费转换为最终额度及消费日志。
- [用量语义归一化](../service/billing_usage.go)
  统一 OpenAI、Claude、Gemini 等上游 usage 的计费语义。
- [额度数学与饱和保护](../common/quota_math.go)
  统一额度换算、舍入、溢出饱和，并返回供审计记录的饱和信息。
- [原子额度预留](../model/quota_reserve.go)
  Redis Lua、数据库条件更新和补偿路径，保护并发余额一致性。

## 模型定价

- [常规价格与预扣计算](../relay/helper/price.go)
  处理模型倍率、固定价格、分组倍率、图片请求倍率和阶梯表达式的预估入口。
- [模型倍率配置](../setting/ratio_setting/model_ratio.go)
  定义模型、输出、缓存、图像和音频等倍率的默认配置。
- [分组倍率配置](../setting/ratio_setting/group_ratio.go)
  定义渠道分组及用户分组的倍率配置。
- [阶梯计费设置](../setting/billing_setting/tiered_billing.go)
  保存、读取和烟雾验证 `tiered_expr` 配置。
- [阶梯表达式设计说明](../pkg/billingexpr/expr.md)
  描述表达式语言、版本、token 归一化和额度换算约定。
- [阶梯结算与快照](../service/tiered_settle.go)
  使用请求期捕获的账务快照和实际 usage 重新计算阶梯额度。

## 模型转发与协议转换

- [中继请求上下文](../relay/common/relay_info.go)
  `RelayInfo` 保存客户端格式、模型映射、渠道、流状态、账务会话与转换链。
- [文本格式转换注册表](../relaykit/relayconvert/text_converter_registry.go)
  维护 OpenAI Chat、OpenAI Responses、Claude Messages、Gemini generateContent 之间的转换。
- [渠道请求构造](../relay/channel/api_request.go)
  构造上游 URL、鉴权头和 HTTP 请求。
- [图片请求处理](../relay/image_handler.go)
  处理图片 DTO、渠道转换、上游响应和同步结算。
- [图片 DTO](../relaykit/dto/openai_image.go)
  定义 `/v1/images` 入口请求/响应结构和图片计费元数据。

## 异步任务

- [任务提交与查询](../relay/relay_task.go)
  提交视频、Suno 等任务，并处理下游任务查询。
- [任务账务](../service/task_billing.go)
  处理任务提交后的差额结算、失败退款和任务消费日志。
- [任务轮询](../service/task_polling.go)
  主动查询未完成任务，并以终态驱动结算或退款。
- [任务模型](../model/task.go)
  持久化公开任务 ID、私有上游 ID、账务快照和原始资金来源。
- [视频路由](../router/video-router.go)
  定义 OpenAI Video、Kling 和相关视频端点。

## 验证入口

- [文本结算测试](../service/text_quota_test.go)
- [阶梯结算测试](../service/tiered_settle_test.go)
- [表达式测试](../pkg/billingexpr/billingexpr_test.go)
- [额度预留测试](../model/quota_reserve_test.go)
- [任务账务测试](../service/task_billing_test.go)
- [图片请求验证测试](../relay/helper/openai_image_request_test.go)
- [图片流响应测试](../relay/channel/openai/image_stream_test.go)
- [协议转换 golden tests](../relaykit/relayconvert/golden_test.go)

## 维护约定

修改账务或转发逻辑前，应先从对应入口追踪完整路径：请求解析 → 定价/预扣 → 上游适配 → usage 或任务终态 → 结算/退款 → 日志。新增或变更行为时，优先更新靠近实现的测试。
