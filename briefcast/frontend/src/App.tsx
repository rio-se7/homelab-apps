import { useState, useEffect } from "react";
import SourceManager from "./components/SourceManager.tsx";
import EpisodeList from "./components/EpisodeList.tsx";
import { api } from "./api/client.ts";

export default function App() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/health")
      .then((r) => setBackendOk(r.ok))
      .catch(() => setBackendOk(false));
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError("");
    try {
      await api.episodes.generate();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "エラー");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#eee", fontFamily: "system-ui, sans-serif", padding: "24px 20px", maxWidth: 720, margin: "0 auto" }}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff" }}>briefcast</h1>
            <p style={{ margin: "4px 0 0", color: "#777", fontSize: 12 }}>
              Web / YouTube / HN / Reddit / GitHub → AI 要約 → 音声ポッドキャスト
            </p>
          </div>
          <span style={{ fontSize: 11, color: backendOk === null ? "#888" : backendOk ? "#4d4" : "#f66" }}>
            Backend: {backendOk === null ? "確認中..." : backendOk ? "OK" : "オフライン"}
          </span>
        </div>
      </header>

      <SourceManager onSourcesChange={() => setRefreshKey((k) => k + 1)} />

      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => void handleGenerate()}
          disabled={generating || !backendOk}
          style={{
            background: generating ? "#333" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "10px 24px",
            cursor: generating || !backendOk ? "default" : "pointer",
            fontSize: 14,
            fontWeight: 600,
            opacity: !backendOk ? 0.5 : 1,
          }}
        >
          {generating ? "生成中... (数分かかる場合があります)" : "エピソードを生成"}
        </button>
        {generateError && <div style={{ color: "#f88", fontSize: 12, marginTop: 6 }}>{generateError}</div>}
      </div>

      <EpisodeList refreshKey={refreshKey} />
    </div>
  );
}
