import React, { useState } from "react";
import { X } from "lucide-react";

const DISMISS_PREFIX = "ai_kb_dismissed_hints.";

export type HintSection = "import" | "pending" | "library" | "ask" | "run" | "settings" | "sources" | "privacy" | "commercial";

export function isHintDismissed(section: HintSection): boolean {
  try {
    return localStorage.getItem(`${DISMISS_PREFIX}${section}`) === "1";
  } catch {
    return false;
  }
}

export function dismissHint(section: HintSection): void {
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${section}`, "1");
  } catch {
    // 忽略本地存储不可用
  }
}

export function useDismissedHint(section: HintSection): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => isHintDismissed(section));
  const dismiss = () => {
    setDismissed(true);
    dismissHint(section);
  };
  return [dismissed, dismiss];
}

/** 表单字段标签行：文字与 (?) 帮助图标同一行，控件仍在下一行 */
export function FieldLabel({
  children,
  help,
  helpDetail
}: {
  children: React.ReactNode;
  help?: string;
  helpDetail?: string;
}) {
  return (
    <span className="labelWithHint">
      {children}
      {help && <HelpTip title={help} {...(helpDetail ? { detail: helpDetail } : {})} />}
    </span>
  );
}

/** 小号 (?) 图标，悬停显示说明 */
export function HelpTip({ title, detail }: { title: string; detail?: string }) {
  const bubbleText = detail ?? title;
  return (
    <span className="helpTip" tabIndex={0} aria-label={title}>
      <span className="helpTipIcon" aria-hidden="true">?</span>
      <span className="helpTipBubble" role="tooltip">{bubbleText}</span>
    </span>
  );
}

/** 标题或按钮下方的灰色小字提示 */
export function HintText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={["hintText", className].filter(Boolean).join(" ")}>{children}</p>;
}

/** 带可选帮助图标的区块标题 */
export function SectionHeading({
  title,
  hint,
  help
}: {
  title: string;
  hint?: string;
  help?: string;
}) {
  return (
    <div className="sectionHeadingWrap">
      <h2 className="sectionHeading">
        {title}
        {help && <HelpTip title={help} />}
      </h2>
      {hint && <HintText>{hint}</HintText>}
    </div>
  );
}

/** 首次进入某区块时显示，关闭后写入 localStorage 不再显示 */
export function FirstTimeBanner({
  section,
  children
}: {
  section: HintSection;
  children: React.ReactNode;
}) {
  const [dismissed, dismiss] = useDismissedHint(section);
  if (dismissed) {
    return null;
  }

  return (
    <div className="firstTimeBanner">
      <div className="firstTimeBannerBody">{children}</div>
      <button type="button" className="iconOnly firstTimeBannerClose" onClick={dismiss} title="关闭，不再显示">
        <X size={16} />
      </button>
    </div>
  );
}
