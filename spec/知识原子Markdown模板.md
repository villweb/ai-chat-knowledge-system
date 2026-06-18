# 知识原子 Markdown 模板

状态：已确认作为 P1 写入契约（2026-06-18）。

本文档定义 `KnowledgeAtom` 写入 Markdown 待确认区时必须遵守的文件命名、front matter、正文结构和状态规则。P1 的固定示例写入必须先符合本文档，再进入后续 AI 提炼实现。

## 1. 文件位置和命名

目录规则：

- `pending`：写入 `knowledge/inbox/`。
- `approved`：移动到 `knowledge/approved/`。
- `rejected`：移动到 `knowledge/rejected/`。
- `merged`：移动到 `knowledge/merged/`，并在 front matter 写明 `merged_into`。

文件名规则：

```text
{created_date}-{atom_id}-{safe_title}.md
```

字段说明：

- `created_date` 使用 `YYYY-MM-DD`。
- `atom_id` 创建后保持稳定，不随标题和正文修改变化。
- `safe_title` 来自标题，移除斜杠、路径分隔符、控制字符和首尾空白，空格替换为 `-`，最长保留 60 个字符。
- 如果标题为空，`safe_title` 使用 `untitled`。

示例：

```text
knowledge/inbox/2026-06-18-atom_01JZ8A3K2P9M-每日沉淀需要人工确认.md
```

## 2. Front Matter

Front matter 使用 YAML。字段顺序固定，方便人工审查和程序解析。

```yaml
---
schema_version: "knowledge_atom.v1"
atom_id: "atom_01JZ8A3K2P9M"
title: "每日沉淀需要人工确认"
type: "观点"
review_status: "pending"
source_app: "codex"
source_record_ids:
  - "rec_01JZ8A1B7Y6Q"
source_raw_paths:
  - "raw/imports/codex/示例记录.md"
project: "AI对话知识沉淀系统"
tags:
  - "个人知识库"
  - "AI对话"
sensitivity: "personal"
created_at: "2026-06-18T21:30:00+08:00"
updated_at: "2026-06-18T21:30:00+08:00"
evidence: "用户要求 AI 候选内容进入待确认区，而不是自动进入正式知识库。"
merged_into: ""
---
```

字段约束：

- `schema_version` 首版固定为 `knowledge_atom.v1`。
- `type` 只能使用：`观点`、`方法`、`决策`、`经验`、`素材`、`问题`、`偏好`。
- `review_status` 只能使用：`pending`、`approved`、`rejected`、`merged`。
- `source_raw_paths` 只写 vault-relative path，不写本机绝对路径。
- `evidence` 只放短证据摘要，不放大段原始对话。
- `merged_into` 仅在 `review_status` 为 `merged` 时必填，值为目标 `atom_id`。

## 3. 正文结构

```markdown
# 每日沉淀需要人工确认

## 内容

这里写单一知识原子的正文，只表达一个核心观点、方法、决策、经验、素材、问题或偏好。

## 证据

- 摘录：保留必要的短摘录或摘要，不复制大段原始对话。
- 判断：说明为什么这条内容属于用户观点、经验、素材或问题。

## 来源

- 来源应用：codex
- 来源记录：rec_01JZ8A1B7Y6Q
- 原始路径：raw/imports/codex/示例记录.md

## 处理记录

- 2026-06-18：创建为 pending。
```

正文规则：

- 标题必须与 front matter 的 `title` 一致。
- `## 内容` 是知识本体正文，后续用户编辑以该部分为准。
- `## 证据` 只保留足够回溯和判断的证据，不写敏感原文。
- `## 来源` 必须能对应 front matter 中的 `source_record_ids` 和 `source_raw_paths`。
- `## 处理记录` 记录人工批准、拒绝、合并或重要编辑。

## 4. 状态变更规则

- 新写入的候选知识必须是 `pending`，并位于 `knowledge/inbox/`。
- 批准时移动到 `knowledge/approved/`，`review_status` 改为 `approved`，更新 `updated_at`。
- 拒绝时移动到 `knowledge/rejected/`，`review_status` 改为 `rejected`，在 `## 处理记录` 写明拒绝原因。
- 合并时移动到 `knowledge/merged/`，`review_status` 改为 `merged`，`merged_into` 写目标 `atom_id`，并在目标知识原子中追加新证据。
- Markdown front matter 是知识正文和审核状态的准来源，SQLite 只镜像索引和查询字段。

## 5. 写入和索引边界

- P1 只实现固定示例 `KnowledgeAtom` 写入，不实现真实 AI 提炼。
- Core Engine 是唯一写入入口，UI、脚本和连接器不直接绕过 Core Engine 写正式知识。
- SQLite 可以镜像 `atom_id`、`title`、`type`、`review_status`、`source_record_ids`、`source_raw_paths`、`updated_at` 等字段，用于查询和重建索引。
- 当 Markdown 被用户在 Obsidian 中手动编辑后，系统只能重新索引，不覆盖用户修改。
