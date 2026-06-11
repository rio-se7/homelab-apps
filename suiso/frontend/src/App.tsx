import { useEffect, useMemo, useRef, useState } from 'react';
import { Aquarium } from './aquarium/engine';
import { type Pod } from './types';
import { useStream } from './useStream';

function fmtMem(bytes: number): string {
  if (bytes <= 0) return '—';
  const mib = bytes / 1048576;
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${Math.round(mib)} MiB`;
}

function fmtCpu(nano: number): string {
  return nano <= 0 ? '—' : `${Math.max(1, Math.round(nano / 1e6))}m`;
}

function fmtAge(startedAt: string): string {
  if (!startedAt) return '—';
  const sec = Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000);
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function hueOf(ns: string): number {
  let h = 0;
  for (let i = 0; i < ns.length; i++) h = (h * 31 + ns.charCodeAt(i)) >>> 0;
  return (h * 137.508) % 360;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Aquarium | null>(null);
  const { pods, events, connected } = useStream();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [pinnedNs, setPinnedNs] = useState<string | null>(null);

  useEffect(() => {
    const engine = new Aquarium(canvasRef.current!);
    engineRef.current = engine;
    engine.start();
    return () => engine.destroy();
  }, []);

  useEffect(() => {
    engineRef.current?.setData(pods);
  }, [pods]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.selectedUid = selectedUid;
  }, [selectedUid]);

  const selected = useMemo(
    () => pods.find((p) => p.uid === selectedUid) ?? null,
    [pods, selectedUid],
  );

  const counts = useMemo(() => {
    const c = { running: 0, pending: 0, trouble: 0, done: 0 };
    for (const p of pods) {
      if (p.reason === 'CrashLoopBackOff' || p.phase === 'Failed') c.trouble++;
      else if (p.phase === 'Pending') c.pending++;
      else if (p.phase === 'Succeeded') c.done++;
      else c.running++;
    }
    return c;
  }, [pods]);

  const namespaces = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pods) m.set(p.namespace, (m.get(p.namespace) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pods]);

  const totalMem = useMemo(() => pods.reduce((acc, p) => acc + p.memBytes, 0), [pods]);

  const setHighlight = (ns: string | null) => {
    if (engineRef.current) engineRef.current.highlightNs = ns;
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const hit = engineRef.current?.hitTest(e.clientX - rect.left, e.clientY - rect.top);
    setSelectedUid(hit ? hit.uid : null);
  };

  return (
    <div className="app">
      <canvas ref={canvasRef} className="tank" onClick={onCanvasClick} />

      <header className="panel header">
        <h1>
          水槽 <span className="sub">suiso — k3s aquarium</span>
        </h1>
        <div className="stats">
          <span className={connected ? 'dot ok' : 'dot bad'} />
          <span>🐟 {counts.running}</span>
          <span>🥚 {counts.pending}</span>
          <span className={counts.trouble > 0 ? 'warn' : ''}>💀 {counts.trouble}</span>
          <span>🪼 {counts.done}</span>
          <span className="mem">Σ {fmtMem(totalMem)}</span>
        </div>
      </header>

      <aside className="panel legend">
        {namespaces.map(([ns, count]) => (
          <button
            key={ns}
            className={pinnedNs === ns ? 'ns pinned' : 'ns'}
            onMouseEnter={() => setHighlight(ns)}
            onMouseLeave={() => setHighlight(pinnedNs)}
            onClick={() => {
              const next = pinnedNs === ns ? null : ns;
              setPinnedNs(next);
              setHighlight(next);
            }}
          >
            <span className="chip" style={{ background: `hsl(${hueOf(ns)}, 65%, 55%)` }} />
            {ns}
            <span className="count">{count}</span>
          </button>
        ))}
      </aside>

      {selected && (
        <section className="panel detail">
          <button className="close" onClick={() => setSelectedUid(null)}>
            ×
          </button>
          <h2>
            <span className="chip" style={{ background: `hsl(${hueOf(selected.namespace)}, 65%, 55%)` }} />
            {selected.name}
          </h2>
          <dl>
            <dt>namespace</dt>
            <dd>{selected.namespace}</dd>
            <dt>phase</dt>
            <dd>
              {selected.phase}
              {selected.reason ? ` (${selected.reason})` : ''}
              {selected.terminating ? ' · terminating' : ''}
            </dd>
            <dt>ready</dt>
            <dd>{selected.ready ? 'yes' : 'no'}</dd>
            <dt>restarts</dt>
            <dd>{selected.restarts}</dd>
            <dt>age</dt>
            <dd>{fmtAge(selected.startedAt)}</dd>
            <dt>cpu / mem</dt>
            <dd>
              {fmtCpu(selected.cpuNano)} / {fmtMem(selected.memBytes)}
            </dd>
            <dt>node</dt>
            <dd>{selected.node || '—'}</dd>
          </dl>
        </section>
      )}

      <footer className="ticker">
        {events.slice(-5).reverse().map((ev, i) => (
          <div key={`${ev.ts}-${ev.name}-${i}`} className={ev.etype === 'Warning' ? 'ev warn' : 'ev'}>
            <b>{ev.reason}</b> {ev.namespace}/{ev.name} — {ev.message}
          </div>
        ))}
      </footer>
    </div>
  );
}

export type { Pod };
