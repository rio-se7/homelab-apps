import { useEffect, useRef, useState } from 'react';
import { type K8sEvent, type Pod, type StreamMsg } from './types';

export function useStream() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const mapRef = useRef(new Map<string, Pod>());

  useEffect(() => {
    const es = new EventSource('/api/stream');
    const commit = () => setPods([...mapRef.current.values()]);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // EventSource auto-reconnects
    es.onmessage = (raw) => {
      let msg: StreamMsg;
      try {
        msg = JSON.parse(raw.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'sync': {
          mapRef.current = new Map(msg.pods.map((p) => [p.uid, p]));
          setEvents(msg.events.slice(-30));
          commit();
          break;
        }
        case 'pod': {
          mapRef.current.set(msg.pod.uid, msg.pod);
          commit();
          break;
        }
        case 'delete': {
          mapRef.current.delete(msg.uid);
          commit();
          break;
        }
        case 'event': {
          setEvents((prev) => [...prev.slice(-29), msg.event]);
          break;
        }
        case 'metrics': {
          for (const m of msg.items) {
            const pod = mapRef.current.get(m.uid);
            if (pod) {
              mapRef.current.set(m.uid, { ...pod, cpuNano: m.cpuNano, memBytes: m.memBytes });
            }
          }
          commit();
          break;
        }
      }
    };
    return () => es.close();
  }, []);

  return { pods, events, connected };
}
