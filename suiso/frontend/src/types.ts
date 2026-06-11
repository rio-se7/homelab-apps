export interface Pod {
  uid: string;
  name: string;
  namespace: string;
  phase: string;
  ready: boolean;
  restarts: number;
  node: string;
  startedAt: string;
  reason: string;
  terminating: boolean;
  cpuNano: number;
  memBytes: number;
}

export interface K8sEvent {
  namespace: string;
  kind: string;
  name: string;
  reason: string;
  message: string;
  etype: string;
  ts: string;
}

export type StreamMsg =
  | { type: 'sync'; pods: Pod[]; events: K8sEvent[] }
  | { type: 'pod'; pod: Pod }
  | { type: 'delete'; uid: string }
  | { type: 'event'; event: K8sEvent }
  | { type: 'metrics'; items: { uid: string; cpuNano: number; memBytes: number }[] };
