# AI Chat Knowledge System

AI Chat Knowledge System 是一个本地优先的 AI 对话知识沉淀系统。它用于把用户在 Codex、Cursor、DeepSeek 等 AI 工具里的对话记录导入本地，经过标准化、候选知识提炼、人工确认后，沉淀为可长期维护的个人知识库。

项目目标不是简单保存聊天记录，而是把对话中的观点、方法、经验、素材、问题和偏好拆成可追溯、可审查、可迁移的知识原子。

## 核心能力

- 本地导入 AI 对话导出文件，支持 Markdown、TXT、JSON。
- 将原始对话标准化为统一的 `NormalizedRecord`。
- 归档原始记录，并保留来源路径和校验信息。
- 生成待确认知识原子，写入 Markdown 知识库。
- 使用 SQLite 维护标准化记录、索引和运行状态。
- 支持 AI 候选提炼、低价值过滤、重复识别和合并建议。
- 提供 Electron 桌面端，用于导入、每日运行、审查、编辑、批准、拒绝和合并知识。
- 支持 Codex、Cursor、DeepSeek 首批来源，豆包和 Workbuddy 预留连接器入口。
- 支持应用打开时的每日自动化运行、空闲检测、运行前确认、失败重试和运行历史。
- 支持知识库搜索、来源/类型/项目/标签筛选、每日沉淀日历、Markdown 导出、Obsidian 索引、本地备份和恢复。
- 支持本地敏感内容识别、来源授权说明、原始记录保留策略、按来源删除、用户数据导出和彻底删除。
- 支持 API Key 本地加密保存，避免明文散落在普通配置文件中。
- 支持 macOS DMG/ZIP、Windows NSIS/portable 安装包配置、发布通道和应用更新检查入口。
- 支持 Free/Trial/Pro 商业状态、离线授权、购买入口、官网需求、更新公告和反馈入口。
- 支持上线前质量闸门，自动检查首次启动、无 API Key、异常导入、模型失败、重复运行、隐私导出删除和发布配置。
- 支持发布就绪检查，识别签名证书、更新服务器、授权服务、支付账号和反馈入口配置状态。

## 数据和隐私边界

本项目默认采用本地优先策略：

- 原始记录、SQLite 数据库、运行日志和知识库默认保存在本机。
- 只读取用户明确放入导入目录或通过桌面端选择的文件。
- 不自动网页登录，不读取浏览器 Cookie，不绕过平台权限。
- API Key 仅在当前会话中使用，不写入普通配置文件。
- 未明确判断可进入个人知识库的内容默认按更保守策略处理。

真实用户数据目录默认不提交到 Git。

## 当前项目状态

项目已经完成本地核心引擎、AI 提炼、桌面端最小版本、首批连接器、每日自动化、知识库体验、基础隐私安全能力、跨平台安装包配置、商业化入口和上线前质量闸门。

## 目录结构

```text
app/
  connectors/      来源连接器
  core/            核心业务流程
  desktop/         Electron 桌面端
  schemas/         数据结构定义
  services/        日志和凭据接口
  storage/         SQLite、Markdown、归档和路径工具
data/              本地运行数据，默认不提交
knowledge/         Markdown 知识库，默认不提交
raw/               原始导入和归档数据，默认不提交
scripts/           命令行入口
tests/             自动化测试
```

## 本地开发

安装依赖：

```bash
npm install
```

如果 `better-sqlite3` 因 Node ABI 切换报错，执行：

```bash
npm run sqlite:rebuild
```

类型检查：

```bash
npm run typecheck
```

运行测试：

```bash
npm test
```

启动桌面端开发模式：

```bash
npm run desktop:dev
```

构建桌面端前端产物：

```bash
npm run desktop:build
```

生成本机打包目录：

```bash
npm run desktop:pack
```

生成 macOS 安装包：

```bash
npm run desktop:dist:mac
```

生成 Windows 安装包：

```bash
npm run desktop:dist:win
```

运行上线前质量闸门：

```bash
npm run quality:gate
```

检查真实发布外部配置：

```bash
npm run launch:readiness
```

## 常用命令

运行 Codex 示例导入和标准化：

```bash
npm run p1:codex-import
```

运行 AI 候选提炼，本地 fixture provider 不联网：

```bash
npm run p2:extract-candidates
```

重建本地索引：

```bash
npm run p1:rebuild-indexes
```

## 说明

`spec/` 目录用于本地规划和验收记录，不提交到远程仓库。

桌面端使用说明见 [`spec/操作说明.md`](spec/操作说明.md)（导入路径、运行步骤、待确认区与自动化行为）。
