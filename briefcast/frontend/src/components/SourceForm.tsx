import { useState } from "react";
import { api } from "../api/client.ts";

const SOURCE_TYPES = [
  { value: "url", label: "URL (記事・ブログ)" },
  { value: "youtube", label: "YouTube チャンネル" },
  { value: "hackernews", label: "Hacker News" },
  { value: "reddit", label: "Reddit" },
  { value: "github_trending", label: "GitHub Trending" },
] as const;

interface Props {
  onCreated: () => void;
}

export default function SourceForm({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState("hackernews");
  const [urlVal, setUrlVal] = useState("");
  const [channelId, setChannelId] = useState("");
  const [hnFeed, setHnFeed] = useState("top");
  const [hnLimit, setHnLimit] = useState("5");
  const [subreddit, setSubreddit] = useState("");
  const [redditSort, setRedditSort] = useState("hot");
  const [redditLimit, setRedditLimit] = useState("5");
  const [ghLang, setGhLang] = useState("");
  const [ghSince, setGhSince] = useState("daily");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function buildConfig(): Record<string, string | number> {
    switch (type) {
      case "url":
        return { url: urlVal };
      case "youtube":
        return { channel_id: channelId, limit: parseInt(hnLimit) };
      case "hackernews":
        return { feed: hnFeed, limit: parseInt(hnLimit) };
      case "reddit":
        return { subreddit, sort: redditSort, limit: parseInt(redditLimit) };
      case "github_trending":
        return { language: ghLang, since: ghSince };
      default:
        return {};
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api.sources.create({ name: name.trim(), type, config: buildConfig() });
      setName("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "#1e1e1e",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#eee",
    padding: "4px 8px",
    fontSize: 13,
  };
  const labelStyle: React.CSSProperties = { color: "#aaa", fontSize: 12 };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 140px" }}>
          <span style={labelStyle}>名前</span>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="ソース名" required />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={labelStyle}>タイプ</span>
          <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
            {SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {type === "url" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={labelStyle}>URL</span>
          <input style={{ ...inputStyle, width: "100%" }} value={urlVal} onChange={(e) => setUrlVal(e.target.value)} placeholder="https://example.com/article" required />
        </div>
      )}

      {type === "youtube" && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            <span style={labelStyle}>Channel ID</span>
            <input style={inputStyle} value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="UCxxxxx" required />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={labelStyle}>動画数</span>
            <input style={{ ...inputStyle, width: 60 }} type="number" min={1} max={10} value={hnLimit} onChange={(e) => setHnLimit(e.target.value)} />
          </div>
        </div>
      )}

      {type === "hackernews" && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={labelStyle}>フィード</span>
            <select style={inputStyle} value={hnFeed} onChange={(e) => setHnFeed(e.target.value)}>
              <option value="top">top</option>
              <option value="new">new</option>
              <option value="best">best</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={labelStyle}>件数</span>
            <input style={{ ...inputStyle, width: 60 }} type="number" min={1} max={20} value={hnLimit} onChange={(e) => setHnLimit(e.target.value)} />
          </div>
        </div>
      )}

      {type === "reddit" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={labelStyle}>Subreddit</span>
            <input style={inputStyle} value={subreddit} onChange={(e) => setSubreddit(e.target.value)} placeholder="programming" required />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={labelStyle}>ソート</span>
            <select style={inputStyle} value={redditSort} onChange={(e) => setRedditSort(e.target.value)}>
              <option value="hot">hot</option>
              <option value="new">new</option>
              <option value="top">top</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={labelStyle}>件数</span>
            <input style={{ ...inputStyle, width: 60 }} type="number" min={1} max={20} value={redditLimit} onChange={(e) => setRedditLimit(e.target.value)} />
          </div>
        </div>
      )}

      {type === "github_trending" && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={labelStyle}>言語 (省略可)</span>
            <input style={inputStyle} value={ghLang} onChange={(e) => setGhLang(e.target.value)} placeholder="python" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={labelStyle}>期間</span>
            <select style={inputStyle} value={ghSince} onChange={(e) => setGhSince(e.target.value)}>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
            </select>
          </div>
        </div>
      )}

      {error && <div style={{ color: "#f88", fontSize: 12 }}>{error}</div>}
      <button
        type="submit"
        disabled={loading}
        style={{ background: "#2a6", color: "#fff", border: "none", borderRadius: 4, padding: "6px 16px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, alignSelf: "flex-start" }}
      >
        {loading ? "追加中..." : "ソースを追加"}
      </button>
    </form>
  );
}
