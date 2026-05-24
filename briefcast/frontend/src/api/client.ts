export interface Source {
  id: string;
  name: string;
  type: string;
  config: Record<string, string | number>;
  createdAt: string;
}

export interface Episode {
  id: string;
  title: string;
  script: string;
  articleCount: number;
  sourceCount: number;
  createdAt: string;
  audioSize: number;
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  sources: {
    list: () => req<Source[]>("/api/sources"),
    create: (body: { name: string; type: string; config: Record<string, string | number> }) =>
      req<Source>("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    delete: (id: string) => req<void>(`/api/sources/${id}`, { method: "DELETE" }),
  },
  episodes: {
    list: () => req<Episode[]>("/api/episodes"),
    generate: () => req<Episode>("/api/episodes/generate", { method: "POST" }),
    audioUrl: (id: string) => `/api/episodes/${id}/audio`,
  },
};
