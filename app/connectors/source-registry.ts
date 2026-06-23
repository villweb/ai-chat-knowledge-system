import type { SourceApp } from "../schemas";
import { ManualImportConnector } from "./manual-import-connector";
import type { SourceConnector, SourceConnectorManifest } from "./source-connector";

const SOURCE_CONNECTORS: Record<SourceApp, SourceConnectorManifest> = {
  codex: {
    source_app: "codex",
    display_name: "Codex",
    status: "available",
    default_enabled: true,
    supported_source_types: ["manual_export"],
    supported_content_types: ["markdown", "txt", "json"],
    supported_extensions: [".md", ".markdown", ".txt", ".json"],
    import_path: "raw/imports/codex",
    raw_source: "codex_manual_path",
    permission_scope: "只读取用户选择或放入 raw/imports/codex 的本地文件。",
    reads: ["Markdown/TXT/JSON 对话导出", "结构化 conversation_id、messages 或用户/AI消息字段", "文件修改时间作为检测时间"],
    does_not_read: ["不读取浏览器会话", "不扫描系统任意目录", "不自动上传原始文件"],
    local_record_recognition: "按扩展名识别 Markdown/TXT/JSON；JSON 可识别单轮 user_message/ai_message 或 messages[] 多轮结构。",
    failure_help: "请确认文件位于 raw/imports/codex，且 JSON 的 source_app/source_type 与 Codex 导入契约一致。"
  },
  cursor: {
    source_app: "cursor",
    display_name: "Cursor",
    status: "available",
    default_enabled: true,
    supported_source_types: ["local_app"],
    supported_content_types: ["markdown", "txt", "json"],
    supported_extensions: [".md", ".markdown", ".txt", ".json"],
    import_path: "raw/imports/cursor",
    raw_source: "cursor_local_path",
    permission_scope: "只读取用户选择或放入 raw/imports/cursor 的 Cursor 对话导出或本地记录副本。",
    reads: ["Cursor 聊天导出文件", "工作区/项目名、主题、用户消息、AI 回复", "显式标记为 personal 的记录"],
    does_not_read: ["不读取 Cursor 数据库原件", "不自动遍历工作区代码", "不接入公司项目目录"],
    local_record_recognition: "按扩展名识别 Markdown/TXT/JSON；JSON 推荐 source_type=local_app。",
    failure_help: "请确认 Cursor 文件位于 raw/imports/cursor，JSON source_app 为 cursor，source_type 为 local_app。"
  },
  deepseek: {
    source_app: "deepseek",
    display_name: "DeepSeek",
    status: "available",
    default_enabled: true,
    supported_source_types: ["web_export"],
    supported_content_types: ["markdown", "txt", "json"],
    supported_extensions: [".md", ".markdown", ".txt", ".json"],
    import_path: "raw/imports/deepseek",
    raw_source: "deepseek_export_file",
    permission_scope: "只读取用户手动保存到 raw/imports/deepseek 的网页导出、复制内容或 JSON 文件。",
    reads: ["DeepSeek 网页端导出文件", "会话标题、用户问题、AI 回复", "缺失时间时允许 unknown"],
    does_not_read: ["不自动网页登录", "不读取浏览器 Cookie", "不绕过平台权限采集"],
    local_record_recognition: "按扩展名识别 Markdown/TXT/JSON；JSON 推荐 source_type=web_export。",
    failure_help: "请确认 DeepSeek 文件位于 raw/imports/deepseek，JSON source_app 为 deepseek，source_type 为 web_export。"
  },
  doubao: {
    source_app: "doubao",
    display_name: "豆包",
    status: "reserved",
    default_enabled: false,
    supported_source_types: ["manual_export"],
    supported_content_types: ["markdown", "txt", "json"],
    supported_extensions: [".md", ".markdown", ".txt", ".json"],
    import_path: "raw/imports/doubao",
    raw_source: "doubao_reserved",
    permission_scope: "P4 仅保留配置入口，后续确认导出方式后再启用读取。",
    reads: ["暂不读取"],
    does_not_read: ["不自动登录", "不抓取网页", "不读取未授权内容"],
    local_record_recognition: "预留，不参与本阶段导入。",
    failure_help: "豆包连接器仍为预留状态，请等待后续版本启用。"
  },
  workbuddy: {
    source_app: "workbuddy",
    display_name: "Workbuddy",
    status: "reserved",
    default_enabled: false,
    supported_source_types: ["manual_export"],
    supported_content_types: ["markdown", "txt", "json"],
    supported_extensions: [".md", ".markdown", ".txt", ".json"],
    import_path: "raw/imports/workbuddy",
    raw_source: "workbuddy_reserved",
    permission_scope: "P4 仅保留配置入口；涉及公司项目时必须先补隔离和权限策略。",
    reads: ["暂不读取"],
    does_not_read: ["不接入公司项目", "不读取客户或内部资料", "不写入个人知识库"],
    local_record_recognition: "预留，不参与本阶段导入。",
    failure_help: "Workbuddy 连接器仍为预留状态，请先完成公司项目隔离设计。"
  }
};

export function listSourceConnectorManifests(): SourceConnectorManifest[] {
  return Object.values(SOURCE_CONNECTORS);
}

export function getSourceConnectorManifest(sourceApp: SourceApp): SourceConnectorManifest {
  return SOURCE_CONNECTORS[sourceApp];
}

export function createSourceConnector(sourceApp: SourceApp): SourceConnector {
  const manifest = getSourceConnectorManifest(sourceApp);
  if (manifest.status !== "available") {
    throw new Error(`${manifest.display_name} connector is reserved and cannot import records in P4.`);
  }

  return new ManualImportConnector(manifest);
}

export function defaultEnabledSourceApps(): SourceApp[] {
  return listSourceConnectorManifests()
    .filter((manifest) => manifest.status === "available" && manifest.default_enabled)
    .map((manifest) => manifest.source_app);
}
