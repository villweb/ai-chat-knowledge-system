import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  BookOpenCheck,
  Check,
  Database,
  FileInput,
  FolderOpen,
  ListChecks,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Split,
  SquarePen,
  X
} from "lucide-react";
import "./styles.css";

type ReviewStatus = "pending" | "approved" | "rejected" | "merged";
type KnowledgeAtomType = "观点" | "方法" | "决策" | "经验" | "素材" | "问题" | "偏好";
type NavKey = "guide" | "sources" | "import" | "run" | "pending" | "detail" | "settings" | "logs";

interface KnowledgeAtom {
  atom_id: string;
  title: string;
  type: KnowledgeAtomType;
  content: string;
  review_status: ReviewStatus;
  source_app: string;
  source_record_ids: string[];
  source_raw_paths: string[];
  project: string;
  tags: string[];
  sensitivity: string;
  evidence: string;
  merged_into: string;
  updated_at: string;
}

interface KnowledgeAtomDocument {
  atom: KnowledgeAtom;
  file_path: string;
}

interface LogEvent {
  event_id: string;
  event_type: string;
  message: string;
  level?: string;
  source_app?: string;
  record_count?: number;
  created_at: string;
}

interface DesktopState {
  vaultRoot: string;
  sourceApp: string;
  aiProvider: string;
  apiKeyConfigured: boolean;
  events: LogEvent[];
  atoms: KnowledgeAtomDocument[];
  logs: LogEvent[];
}

interface SessionConfigInput {
  sourceApp: string;
  aiProvider: string;
  baseUrl?: string;
  model?: string;
  apiKey: string;
}

interface AtomUpdateInput {
  atom_id: string;
  title?: string;
  type?: KnowledgeAtomType;
  content?: string;
  tags?: string[];
  review_status?: ReviewStatus;
  merged_into?: string;
}

interface DesktopApi {
  getState(): Promise<DesktopState>;
  chooseVault(): Promise<DesktopState>;
  chooseImportFiles(sourceApp: string): Promise<unknown>;
  runImport(): Promise<unknown>;
  runDaily(): Promise<unknown>;
  listAtoms(): Promise<KnowledgeAtomDocument[]>;
  updateAtom(input: AtomUpdateInput): Promise<KnowledgeAtomDocument>;
  listLogs(): Promise<LogEvent[]>;
  saveSessionConfig(input: SessionConfigInput): Promise<DesktopState>;
}

declare global {
  interface Window {
    desktopApi?: DesktopApi;
  }
}

const desktopApi = getDesktopApi();

const navItems: Array<{ key: NavKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "guide", label: "引导", icon: BookOpenCheck },
  { key: "sources", label: "来源", icon: Database },
  { key: "import", label: "导入", icon: FileInput },
  { key: "run", label: "运行", icon: Play },
  { key: "pending", label: "待确认", icon: ListChecks },
  { key: "detail", label: "详情", icon: SquarePen },
  { key: "settings", label: "设置", icon: Settings },
  { key: "logs", label: "日志", icon: Archive }
];

const typeOptions: KnowledgeAtomType[] = ["观点", "方法", "决策", "经验", "素材", "问题", "偏好"];

function getDesktopApi(): DesktopApi {
  if (window.desktopApi) {
    return window.desktopApi;
  }

  const sampleAtom: KnowledgeAtomDocument = {
    file_path: "knowledge/inbox/2026/preview-atom.md",
    atom: {
      atom_id: "preview-atom",
      title: "预览知识卡片",
      type: "观点",
      content: "桌面预览模式会展示完整交互结构；真实导入、抽取和写入需要在 Electron 应用中运行。",
      review_status: "pending",
      source_app: "codex",
      source_record_ids: ["preview-record"],
      source_raw_paths: ["raw/imports/codex/preview.md"],
      project: "personal",
      tags: ["preview", "desktop"],
      sensitivity: "personal",
      evidence: "预览数据",
      merged_into: "",
      updated_at: new Date().toISOString()
    }
  };

  const sampleLog: LogEvent = {
    event_id: "preview-log",
    event_type: "desktop_preview",
    message: "Renderer preview is active.",
    level: "info",
    source_app: "codex",
    created_at: new Date().toISOString()
  };

  const previewState: DesktopState = {
    vaultRoot: "/Users/may/Documents/Claude/Projects/探索个人天赋/ai-chat-knowledge-system",
    sourceApp: "codex",
    aiProvider: "fixture",
    apiKeyConfigured: false,
    events: [sampleLog],
    atoms: [sampleAtom],
    logs: [sampleLog]
  };

  return {
    async getState() {
      return previewState;
    },
    async chooseVault() {
      return previewState;
    },
    async chooseImportFiles() {
      return { copied: 0 };
    },
    async runImport() {
      return { ok: true };
    },
    async runDaily() {
      return { ok: true };
    },
    async listAtoms() {
      return previewState.atoms;
    },
    async updateAtom(input) {
      previewState.atoms = previewState.atoms.map((item) => {
        if (item.atom.atom_id !== input.atom_id) {
          return item;
        }

        return {
          ...item,
          atom: {
            ...item.atom,
            ...input,
            updated_at: new Date().toISOString()
          }
        };
      });
      return previewState.atoms.find((item) => item.atom.atom_id === input.atom_id) ?? sampleAtom;
    },
    async listLogs() {
      return previewState.logs;
    },
    async saveSessionConfig(input) {
      previewState.sourceApp = input.sourceApp;
      previewState.aiProvider = input.aiProvider;
      previewState.apiKeyConfigured = Boolean(input.apiKey);
      return previewState;
    }
  };
}

function App() {
  const [active, setActive] = useState<NavKey>("guide");
  const [state, setState] = useState<DesktopState | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo(() => {
    return state?.atoms.find((item) => item.atom.atom_id === selectedId) ?? state?.atoms[0] ?? null;
  }, [selectedId, state]);

  const filteredAtoms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (state?.atoms ?? []).filter((item) => {
      if (!needle) {
        return true;
      }

      return [item.atom.title, item.atom.content, item.atom.evidence, item.atom.project, item.atom.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [query, state]);

  const counts = useMemo(() => {
    const items = state?.atoms ?? [];
    return {
      pending: items.filter((item) => item.atom.review_status === "pending").length,
      approved: items.filter((item) => item.atom.review_status === "approved").length,
      rejected: items.filter((item) => item.atom.review_status === "rejected").length,
      merged: items.filter((item) => item.atom.review_status === "merged").length
    };
  }, [state]);

  async function refresh() {
    const nextState = await desktopApi.getState() as DesktopState;
    setState(nextState);
    if (!selectedId && nextState.atoms[0]) {
      setSelectedId(nextState.atoms[0].atom.atom_id);
    }
  }

  async function withBusy(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return <div className="boot">正在加载本地知识库</div>;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">AI</div>
          <div>
            <strong>Chat Knowledge</strong>
            <span>Local Vault</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={active === item.key ? "nav active" : "nav"} onClick={() => setActive(item.key)} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="vaultBox">
          <span>知识库</span>
          <strong>{compactPath(state.vaultRoot)}</strong>
          <button className="iconText" onClick={() => withBusy(() => desktopApi.chooseVault(), "知识库位置已更新")} disabled={busy}>
            <FolderOpen size={16} />
            <span>选择</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{titleFor(active)}</h1>
            <p>{subtitleFor(active)}</p>
          </div>
          <button className="iconOnly" onClick={refresh} title="刷新" disabled={busy}>
            <RefreshCw size={18} />
          </button>
        </header>

        {notice && <div className="notice">{notice}</div>}

        {active === "guide" && <GuidePanel state={state} counts={counts} />}
        {active === "sources" && <SourcesPanel sourceApp={state.sourceApp} />}
        {active === "import" && <ImportPanel busy={busy} onChoose={() => withBusy(() => desktopApi.chooseImportFiles(state.sourceApp), "文件已导入")} onRun={() => withBusy(() => desktopApi.runImport(), "导入和标准化完成")} />}
        {active === "run" && <RunPanel busy={busy} events={state.events} onRun={() => withBusy(() => desktopApi.runDaily(), "每日沉淀完成")} />}
        {active === "pending" && <PendingPanel atoms={filteredAtoms} counts={counts} query={query} selectedId={selected?.atom.atom_id ?? ""} onQuery={setQuery} onSelect={(atomId) => { setSelectedId(atomId); setActive("detail"); }} />}
        {active === "detail" && selected && <DetailPanel document={selected} atoms={state.atoms} busy={busy} onUpdate={(input) => withBusy(() => desktopApi.updateAtom(input), "知识已更新")} />}
        {active === "settings" && <SettingsPanel state={state} busy={busy} onSave={(input) => withBusy(() => desktopApi.saveSessionConfig(input), "会话配置已保存")} />}
        {active === "logs" && <LogsPanel logs={[...state.events, ...state.logs]} />}
      </section>
    </main>
  );
}

function GuidePanel({ state, counts }: { state: DesktopState; counts: Record<ReviewStatus, number> }) {
  return (
    <div className="grid two">
      <section className="panel">
        <h2>当前状态</h2>
        <div className="metricGrid">
          <Metric label="待确认" value={counts.pending} />
          <Metric label="已批准" value={counts.approved} />
          <Metric label="已拒绝" value={counts.rejected} />
          <Metric label="已合并" value={counts.merged} />
        </div>
      </section>
      <section className="panel">
        <h2>启动检查</h2>
        <ul className="checkList">
          <li><Check size={16} />知识库位置：{compactPath(state.vaultRoot)}</li>
          <li><Check size={16} />来源：{state.sourceApp}</li>
          <li><Shield size={16} />AI 服务：{state.aiProvider}</li>
          <li><Shield size={16} />API Key：{state.apiKeyConfigured ? "当前会话已配置" : "未保存到磁盘"}</li>
        </ul>
      </section>
    </div>
  );
}

function SourcesPanel({ sourceApp }: { sourceApp: string }) {
  return (
    <section className="panel">
      <h2>来源管理</h2>
      <div className="sourceTable">
        {["codex", "cursor", "deepseek", "doubao", "workbuddy"].map((source) => (
          <div className="sourceRow" key={source}>
            <span>{source}</span>
            <strong>{source === sourceApp ? "已启用" : "预留"}</strong>
            <small>{source === "codex" ? "手动导入可用" : "等待 P4 连接器"}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImportPanel({ busy, onChoose, onRun }: { busy: boolean; onChoose: () => void; onRun: () => void }) {
  return (
    <div className="grid two">
      <section className="panel">
        <h2>手动导入</h2>
        <p className="muted">支持 Markdown、TXT、JSON，本阶段写入 Codex 手动导入目录。</p>
        <button className="primary" onClick={onChoose} disabled={busy}><FolderOpen size={17} /><span>选择文件</span></button>
      </section>
      <section className="panel">
        <h2>标准化</h2>
        <p className="muted">导入后运行 P1 标准化、归档、SQLite 写入和固定待确认卡片写入。</p>
        <button className="primary" onClick={onRun} disabled={busy}><Play size={17} /><span>运行导入</span></button>
      </section>
    </div>
  );
}

function RunPanel({ busy, events, onRun }: { busy: boolean; events: LogEvent[]; onRun: () => void }) {
  return (
    <div className="grid twoWide">
      <section className="panel">
        <h2>每日运行</h2>
        <p className="muted">串联导入、标准化、P2 候选提炼和每日摘要。</p>
        <button className="primary" onClick={onRun} disabled={busy}><Play size={17} /><span>开始</span></button>
      </section>
      <section className="panel">
        <h2>运行进度</h2>
        <EventList events={events} />
      </section>
    </div>
  );
}

function PendingPanel({ atoms, counts, query, selectedId, onQuery, onSelect }: { atoms: KnowledgeAtomDocument[]; counts: Record<ReviewStatus, number>; query: string; selectedId: string; onQuery: (value: string) => void; onSelect: (atomId: string) => void }) {
  return (
    <section className="panel fill">
      <div className="listHeader">
        <div className="statusPills">
          <span>pending {counts.pending}</span>
          <span>approved {counts.approved}</span>
          <span>rejected {counts.rejected}</span>
          <span>merged {counts.merged}</span>
        </div>
        <label className="search"><Search size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索标题、正文、证据" /></label>
      </div>
      <div className="atomList">
        {atoms.map((item) => (
          <button key={item.atom.atom_id} className={selectedId === item.atom.atom_id ? "atomRow active" : "atomRow"} onClick={() => onSelect(item.atom.atom_id)}>
            <strong>{item.atom.title}</strong>
            <span>{item.atom.type} · {item.atom.review_status} · {item.atom.source_app}</span>
            <small>{item.atom.evidence}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function DetailPanel({ document, atoms, busy, onUpdate }: { document: KnowledgeAtomDocument; atoms: KnowledgeAtomDocument[]; busy: boolean; onUpdate: (input: AtomUpdateInput) => void }) {
  const [title, setTitle] = useState(document.atom.title);
  const [type, setType] = useState<KnowledgeAtomType>(document.atom.type);
  const [content, setContent] = useState(document.atom.content);
  const [tags, setTags] = useState(document.atom.tags.join(", "));
  const [mergedInto, setMergedInto] = useState(document.atom.merged_into);

  useEffect(() => {
    setTitle(document.atom.title);
    setType(document.atom.type);
    setContent(document.atom.content);
    setTags(document.atom.tags.join(", "));
    setMergedInto(document.atom.merged_into);
  }, [document.atom.atom_id]);

  const baseInput = { atom_id: document.atom.atom_id, title, type, content, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) };

  return (
    <section className="panel detail">
      <div className="detailHead">
        <div>
          <h2>{document.atom.title}</h2>
          <p>{document.file_path}</p>
        </div>
        <span className={`status ${document.atom.review_status}`}>{document.atom.review_status}</span>
      </div>
      <div className="formGrid">
        <label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>类型<select value={type} onChange={(event) => setType(event.target.value as KnowledgeAtomType)}>{typeOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
        <label>合并到<select value={mergedInto} onChange={(event) => setMergedInto(event.target.value)}><option value="">不合并</option>{atoms.filter((item) => item.atom.atom_id !== document.atom.atom_id).map((item) => <option key={item.atom.atom_id} value={item.atom.atom_id}>{item.atom.title}</option>)}</select></label>
      </div>
      <label className="fullField">内容<textarea value={content} onChange={(event) => setContent(event.target.value)} /></label>
      <div className="evidence"><strong>证据</strong><p>{document.atom.evidence}</p><small>{document.atom.source_raw_paths.join(", ")}</small></div>
      <div className="actions">
        <button onClick={() => onUpdate(baseInput)} disabled={busy}><SquarePen size={16} />保存</button>
        <button onClick={() => onUpdate({ ...baseInput, review_status: "approved" })} disabled={busy}><Check size={16} />批准</button>
        <button onClick={() => onUpdate({ ...baseInput, review_status: "rejected" })} disabled={busy}><X size={16} />拒绝</button>
        <button onClick={() => onUpdate({ ...baseInput, review_status: "merged", merged_into: mergedInto })} disabled={busy || !mergedInto}><Split size={16} />合并</button>
      </div>
    </section>
  );
}

function SettingsPanel({ state, busy, onSave }: { state: DesktopState; busy: boolean; onSave: (input: SessionConfigInput) => void }) {
  const [sourceApp, setSourceApp] = useState(state.sourceApp);
  const [aiProvider, setAiProvider] = useState(state.aiProvider);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <section className="panel settingsPanel">
      <h2>设置</h2>
      <div className="formGrid">
        <label>默认来源<select value={sourceApp} onChange={(event) => setSourceApp(event.target.value)}><option value="codex">codex</option><option value="cursor">cursor</option><option value="deepseek">deepseek</option><option value="doubao">doubao</option><option value="workbuddy">workbuddy</option></select></label>
        <label>AI 服务<select value={aiProvider} onChange={(event) => setAiProvider(event.target.value)}><option value="fixture">fixture</option><option value="openai-compatible">openai-compatible</option></select></label>
        <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
        <label>模型<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model-name" /></label>
        <label>API Key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="仅当前会话" /></label>
      </div>
      <button className="primary" onClick={() => onSave({ sourceApp, aiProvider, baseUrl, model, apiKey })} disabled={busy}><Shield size={17} /><span>保存会话配置</span></button>
    </section>
  );
}

function LogsPanel({ logs }: { logs: LogEvent[] }) {
  return (
    <section className="panel fill">
      <h2>日志和错误</h2>
      <EventList events={logs} />
    </section>
  );
}

function EventList({ events }: { events: LogEvent[] }) {
  return (
    <div className="eventList">
      {events.map((event, index) => (
        <div className="eventRow" key={`${event.event_id}-${event.created_at}-${index}`}>
          <span>{new Date(event.created_at).toLocaleString()}</span>
          <strong>{event.event_type}</strong>
          <p>{event.message}</p>
        </div>
      ))}
      {events.length === 0 && <p className="muted">暂无记录</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function titleFor(active: NavKey): string {
  return navItems.find((item) => item.key === active)?.label ?? "工作台";
}

function subtitleFor(active: NavKey): string {
  const subtitles: Record<NavKey, string> = {
    guide: "首次启动、知识库位置和运行状态",
    sources: "来源启用状态和后续连接器边界",
    import: "手动导入本地导出文件",
    run: "执行每日沉淀流程",
    pending: "审查候选知识原子",
    detail: "编辑、批准、拒绝或合并",
    settings: "AI 服务和本地配置",
    logs: "运行事件和错误摘要"
  };
  return subtitles[active];
}

function compactPath(value: string): string {
  const parts = value.split("/");
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : value;
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
