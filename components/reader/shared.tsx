"use client";
import type { ReactNode } from "react";
import { Converter } from "opencc-js/t2cn";
import type { Settings } from "@/lib/reader/types";

export type Convert = (text: string) => string;

const simplified: Convert = Converter({ from: "tw", to: "cn" });
const unchanged: Convert = (text) => text;

let traditional: Promise<Convert> | undefined;

/**
 * The simplified-to-traditional dictionary is about 1.1 MB, ten times the
 * other direction, so it is fetched only when traditional text is shown.
 */
export function loadTraditional() {
  traditional ??= import("opencc-js/cn2t")
    .then(({ Converter }) => Converter({ from: "cn", to: "tw" }))
    .catch((error) => {
      traditional = undefined; // so that a later attempt can try again
      throw error;
    });
  return traditional;
}

/** Until the traditional dictionary arrives, text is shown as it is. */
export const converterFor = (
  script: Settings["script"],
  toTraditional?: Convert,
): Convert =>
  script === "tw"
    ? (toTraditional ?? unchanged)
    : script === "cn"
      ? simplified
      : unchanged;

export { editionLabel } from "@/lib/reader/works";

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "暫時無法讀取，請稍後重試";

export const formatDate = (time?: number) =>
  time
    ? new Intl.DateTimeFormat("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(time)
    : "尚未檢查";

export function IconButton({
  label,
  children,
  onClick,
  active,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const RANGES = [
  { key: "fontSize", label: "文字大小", min: 16, max: 36, step: 1, suffix: " px" },
  { key: "lineHeight", label: "行距", min: 1.4, max: 2.6, step: 0.1, suffix: "" },
  { key: "width", label: "閱讀寬度", min: 540, max: 1000, step: 20, suffix: " px" },
] as const;

export function SettingsControls({
  settings: s,
  onChange,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
}) {
  return (
    <div className="controls">
      <label className="control">
        <span>主題</span>
        <select
          value={s.theme}
          onChange={(e) =>
            onChange({ theme: e.target.value as Settings["theme"] })
          }
        >
          <option value="paper">暖色</option>
          <option value="light">白色</option>
          <option value="dark">深色</option>
        </select>
      </label>
      {RANGES.map((c) => (
        <label className="control" key={c.key}>
          <span>
            {c.label}
            <b>
              {Math.round(s[c.key] * 10) / 10}
              {c.suffix}
            </b>
          </span>
          <input
            type="range"
            min={c.min}
            max={c.max}
            step={c.step}
            value={s[c.key]}
            onChange={(e) => onChange({ [c.key]: +e.target.value })}
          />
        </label>
      ))}
      <label className="control">
        <span>字體</span>
        <select
          value={s.font}
          onChange={(e) =>
            onChange({ font: e.target.value as Settings["font"] })
          }
        >
          <option value="serif">宋體</option>
          <option value="sans">黑體</option>
        </select>
      </label>
      <label className="control">
        <span>文字顯示</span>
        <select
          value={s.script}
          onChange={(e) =>
            onChange({ script: e.target.value as Settings["script"] })
          }
        >
          <option value="tw">繁體中文</option>
          <option value="cn">简体中文</option>
          <option value="original">保留原文</option>
        </select>
      </label>
    </div>
  );
}
