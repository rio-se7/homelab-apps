import { useState, useEffect } from "react";
import { api } from "../api/client.ts";
import { type Source } from "../api/client.ts";
import SourceForm from "./SourceForm.tsx";

const TYPE_LABELS: Record<string, string> = {
  url: "URL",
  youtube: "YouTube",
  hackernews: "HN",
  reddit: "Reddit",
  github_trending: "GitHub",
};

interface Props {
  onSourcesChange: () => void;
}

export default function SourceManager({ onSourcesChange }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    try {
      setSources(await api.sources.list());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await api.sources.delete(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
      onSourcesChange();
    } finally {
      setDeleting(null);
    }
  }

  function handleCreated() {
    void load();
    onSourcesChange();
  }

  function configSummary(s: Source): string {
    const c = s.config;
    switch (s.type) {
      case "url": return String(c.url ?? "");
      case "youtube": return `channel: ${String(c.channel_id ?? "")}`;
      case "hackernews": return `${String(c.feed ?? "top")} top ${String(c.limit ?? 5)}`;
      case "reddit": return `r/${String(c.subreddit ?? "")} ${String(c.sort ?? "hot")}`;
      case "github_trending": return `${String(c.language || "all")} ${String(c.since ?? "daily")}`;
      default: return "";
    }
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ color: "#ccc", fontSize: 16, marginBottom: 12 }}>ソース管理</h2>
      <SourceForm onCreated={handleCreated} />
      {sources.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13 }}>ソースが登録されていません</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sources.map((s) => (
            <div
              key={s.id}
              style={{
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 6,
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ background: "#2a2a2a", color: "#aaa", borderRadius: 4, padding: "1px 6px", fontSize: 11, flexShrink: 0 }}>
                {TYPE_LABELS[s.type] ?? s.type}
              </span>
              <span style={{ color: "#ddd", fontWeight: 600, fontSize: 13 }}>{s.name}</span>
              <span style={{ color: "#666", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {configSummary(s)}
              </span>
              <button
                onClick={() => void handleDelete(s.id)}
                disabled={deleting === s.id}
                style={{ background: "none", border: "1px solid #555", color: "#888", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
