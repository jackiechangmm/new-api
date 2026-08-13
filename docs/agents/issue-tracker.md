# Issue 跟踪器：GitHub

本仓库的 Issue 和规格说明均使用 GitHub Issues 管理。所有操作使用 `gh` CLI。

## 约定

- 创建 Issue：`gh issue create --title "..." --body "..."`
- 读取 Issue：`gh issue view <编号> --comments`，同时读取标签。
- 列出 Issue：`gh issue list --state open --json number,title,body,labels,comments`，按需使用 `--label` 和 `--state` 过滤。
- 评论 Issue：`gh issue comment <编号> --body "..."`
- 添加或移除标签：`gh issue edit <编号> --add-label "..."` / `--remove-label "..."`
- 关闭 Issue：`gh issue close <编号> --comment "..."`

在本仓库内运行时，`gh` 会从 Git 远程仓库自动推断目标仓库。

## Pull Request 作为分诊入口

**PR 作为请求入口：否。**

## 当技能要求“发布到 Issue 跟踪器”时

创建 GitHub Issue。

## 当技能要求“获取相关工单”时

执行 `gh issue view <编号> --comments`。
