import { createHash } from "node:crypto";
import { SCHEMA_VERSION } from "../schemas";
import type { RawSourceDocument } from "../connectors";
import type {
  NormalizedRecord,
  Sensitivity,
  SourceApp,
  SourceType
} from "../schemas";

type JsonMessage = {
  role: "user" | "assistant";
  content: string;
};

type JsonInput = {
  source_app?: SourceApp;
  source_type?: SourceType;
  conversation_id: string;
  message_time?: string;
  project?: string;
  topic?: string;
  raw_path?: string;
  raw_source?: string;
  sensitivity?: Sensitivity;
  user_message?: string;
  ai_message?: string;
  messages?: JsonMessage[];
};

type ParsedTurn = {
  turn_index: number;
  message_index_start: number;
  message_index_end: number;
  user_message: string;
  ai_message: string;
  message_time: string | "unknown";
};

type ParsedDocument = {
  conversation_id: string;
  project: string;
  topic: string;
  raw_source: string;
  sensitivity: Sensitivity;
  turns: ParsedTurn[];
};

export function normalizeManualImport(document: RawSourceDocument, now = new Date().toISOString()): NormalizedRecord[] {
  const parsed = parseDocument(document);

  return parsed.turns.map((turn) => {
    const recordId = createRecordId(document, parsed.conversation_id, turn);

    return {
      schema_version: SCHEMA_VERSION.normalizedRecord,
      record_id: recordId,
      source_app: document.source_app,
      source_type: document.source_type,
      conversation_id: parsed.conversation_id,
      parent_conversation_id: parsed.conversation_id,
      turn_index: turn.turn_index,
      message_index_start: turn.message_index_start,
      message_index_end: turn.message_index_end,
      message_time: turn.message_time,
      project: parsed.project,
      topic: parsed.topic,
      user_message: turn.user_message,
      ai_message: turn.ai_message,
      raw_path: document.raw_path,
      raw_archive_path: document.raw_path,
      raw_checksum: createHash("sha256").update(document.content, "utf8").digest("hex"),
      raw_source: parsed.raw_source,
      sensitivity: parsed.sensitivity,
      can_enter_personal_kb: parsed.sensitivity === "personal",
      created_at: now,
      updated_at: now
    };
  });
}

function parseDocument(document: RawSourceDocument): ParsedDocument {
  if (document.content_type === "json") {
    return parseJsonDocument(document);
  }

  if (document.content_type === "markdown") {
    return parseMarkdownDocument(document);
  }

  return parseTxtDocument(document);
}

function parseJsonDocument(document: RawSourceDocument): ParsedDocument {
  const input = JSON.parse(document.content) as JsonInput;
  assertJsonSource(input, document);

  const base = {
    conversation_id: input.conversation_id,
    project: input.project ?? "unknown",
    topic: input.topic ?? "unknown",
    raw_source: input.raw_source ?? document.raw_source,
    sensitivity: parseSensitivity(input.sensitivity)
  };

  if (input.user_message !== undefined && input.ai_message !== undefined) {
    return {
      ...base,
      turns: [
        {
          turn_index: 0,
          message_index_start: 0,
          message_index_end: 1,
          user_message: input.user_message,
          ai_message: input.ai_message,
          message_time: input.message_time ?? "unknown"
        }
      ]
    };
  }

  if (!input.messages) {
    throw new Error("JSON import requires user_message/ai_message or messages.");
  }

  return {
    ...base,
    turns: pairMessages(input.messages, input.message_time ?? "unknown")
  };
}

function parseMarkdownDocument(document: RawSourceDocument): ParsedDocument {
  const { frontMatter, body } = parseFrontMatter(document.content);
  const userMessage = extractSection(body, "用户消息");
  const aiMessage = extractSection(body, "AI 回复");

  return {
    conversation_id: requireFrontMatter(frontMatter, "conversation_id"),
    project: frontMatter.project ?? "unknown",
    topic: frontMatter.topic ?? "unknown",
    raw_source: frontMatter.raw_source ?? document.raw_source,
    sensitivity: parseSensitivity(frontMatter.sensitivity),
    turns: [
      {
        turn_index: 0,
        message_index_start: 0,
        message_index_end: 1,
        user_message: userMessage,
        ai_message: aiMessage,
        message_time: frontMatter.message_time ?? "unknown"
      }
    ]
  };
}

function parseTxtDocument(document: RawSourceDocument): ParsedDocument {
  const userMessage = extractSection(document.content, "用户消息");
  const aiMessage = extractSection(document.content, "AI 回复");

  return {
    conversation_id: createHash("sha256").update(document.raw_path).digest("hex").slice(0, 16),
    project: "unknown",
    topic: "unknown",
    raw_source: document.raw_source,
    sensitivity: "private",
    turns: [
      {
        turn_index: 0,
        message_index_start: 0,
        message_index_end: 1,
        user_message: userMessage,
        ai_message: aiMessage,
        message_time: "unknown"
      }
    ]
  };
}

function assertJsonSource(input: JsonInput, document: RawSourceDocument): void {
  if (input.source_app && input.source_app !== document.source_app) {
    throw new Error(`JSON source_app does not match document source_app: ${input.source_app}`);
  }

  if (input.source_type && input.source_type !== document.source_type) {
    throw new Error(`JSON source_type does not match document source_type: ${input.source_type}`);
  }
}

function pairMessages(messages: JsonMessage[], messageTime: string | "unknown"): ParsedTurn[] {
  const turns: ParsedTurn[] = [];
  let index = 0;

  while (index < messages.length) {
    const user = messages[index];
    const assistant = messages[index + 1];

    if (!user || user.role !== "user") {
      throw new Error(`Expected user message at index ${index}.`);
    }

    if (!assistant || assistant.role !== "assistant") {
      throw new Error(`Expected assistant message after user message at index ${index}.`);
    }

    turns.push({
      turn_index: turns.length,
      message_index_start: index,
      message_index_end: index + 1,
      user_message: user.content,
      ai_message: assistant.content,
      message_time: messageTime
    });

    index += 2;
  }

  return turns;
}

function parseFrontMatter(content: string): { frontMatter: Record<string, string>; body: string } {
  if (!content.startsWith("---\n")) {
    throw new Error("Markdown import requires YAML front matter.");
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error("Markdown front matter is not closed.");
  }

  const rawFrontMatter = content.slice(4, end);
  const body = content.slice(end + 4);
  const frontMatter: Record<string, string> = {};

  for (const line of rawFrontMatter.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Invalid front matter line: ${line}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");
    frontMatter[key] = value;
  }

  return { frontMatter, body };
}

function extractSection(content: string, heading: string): string {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "m");
  const match = content.match(pattern);

  if (!match?.[1]) {
    throw new Error(`Missing required section: ${heading}`);
  }

  return match[1].trim();
}

function requireFrontMatter(frontMatter: Record<string, string>, key: string): string {
  const value = frontMatter[key];

  if (!value) {
    throw new Error(`Missing required front matter field: ${key}`);
  }

  return value;
}

function parseSensitivity(value: string | undefined): Sensitivity {
  if (value === undefined) {
    return "private";
  }

  if (value === "personal" || value === "private" || value === "confidential") {
    return value;
  }

  throw new Error(`Invalid sensitivity: ${value}`);
}

function createRecordId(document: RawSourceDocument, conversationId: string, turn: ParsedTurn): string {
  const seed = [
    document.source_app,
    document.raw_path,
    conversationId,
    turn.turn_index,
    turn.message_time,
    turn.user_message,
    turn.ai_message
  ].join("\n");

  return `rec_${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
