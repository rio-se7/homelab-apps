import { useState, useEffect } from "react";
import { api } from "../api/client.ts";
import { type Episode } from "../api/client.ts";

interface Props {
  refreshKey: number;
}

export default function EpisodeList({ refreshKey }: Props) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.episodes.list().then(setEpisodes).catch(() => {/* ignore */});
  }, [refreshKey]);

  if (episodes.length === 0) {
    return <p style={{ color: "#666", fontSize: 13 }}>エピソードがありません。ソースを追加して生成してください。</p>;
  }

  return (
    <section>
      <h2 style={{ color: "#ccc", fontSize: 16, marginBottom: 12 }}>エピソード</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {episodes.map((ep) => (
          <div key={ep.id} style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ color: "#ddd", fontWeight: 600, fontSize: 14 }}>{ep.title}</div>
                <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
                  {ep.articleCount} 記事 / {ep.sourceCount} ソース &nbsp;·&nbsp;
                  {new Date(ep.createdAt).toLocaleString("ja-JP")} &nbsp;·&nbsp;
                  {(ep.audioSize / 1024).toFixed(0)} KB
                </div>
              </div>
              <button
                onClick={() => setExpanded(expanded === ep.id ? null : ep.id)}
                style={{ background: "none", border: "1px solid #444", color: "#aaa", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12, flexShrink: 0 }}
              >
                {expanded === ep.id ? "閉じる" : "スクリプト"}
              </button>
            </div>
            <audio
              controls
              src={api.episodes.audioUrl(ep.id)}
              style={{ width: "100%", height: 36, marginBottom: expanded === ep.id ? 8 : 0 }}
            />
            {expanded === ep.id && (
              <pre style={{ color: "#bbb", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0, marginTop: 8, background: "#111", padding: 10, borderRadius: 4 }}>
                {ep.script}
              </pre>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
