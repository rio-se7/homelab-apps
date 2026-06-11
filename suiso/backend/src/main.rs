// suiso (水槽) — renders a k3s cluster as a deep-sea aquarium.
// Watches pods/events via the Kubernetes API (in-cluster ServiceAccount) and
// streams normalized updates to the frontend over SSE.

use std::{
    collections::{HashMap, VecDeque},
    convert::Infallible,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use axum::{
    extract::State,
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
    Router,
};
use futures_util::{stream, Stream, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::{broadcast, RwLock};
use tower_http::services::{ServeDir, ServeFile};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Pod {
    uid: String,
    name: String,
    namespace: String,
    phase: String,
    ready: bool,
    restarts: i64,
    node: String,
    started_at: String,
    reason: String,
    terminating: bool,
    cpu_nano: i64,
    mem_bytes: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct K8sEvent {
    namespace: String,
    kind: String,
    name: String,
    reason: String,
    message: String,
    etype: String,
    ts: String,
}

struct App {
    pods: RwLock<HashMap<String, Pod>>,
    events: RwLock<VecDeque<K8sEvent>>,
    tx: broadcast::Sender<String>,
    ready: AtomicBool,
}

impl App {
    fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(512);
        Arc::new(Self {
            pods: RwLock::new(HashMap::new()),
            events: RwLock::new(VecDeque::new()),
            tx,
            ready: AtomicBool::new(false),
        })
    }

    async fn snapshot_json(&self) -> String {
        let pods: Vec<Pod> = self.pods.read().await.values().cloned().collect();
        let events: Vec<K8sEvent> = self.events.read().await.iter().cloned().collect();
        json!({ "type": "sync", "pods": pods, "events": events }).to_string()
    }

    fn broadcast(&self, msg: String) {
        let _ = self.tx.send(msg);
    }

    async fn push_event(&self, ev: K8sEvent) {
        let mut events = self.events.write().await;
        events.push_back(ev.clone());
        while events.len() > 60 {
            events.pop_front();
        }
        drop(events);
        self.broadcast(json!({ "type": "event", "event": ev }).to_string());
    }
}

// ---------------------------------------------------------------- k8s client

const SA_DIR: &str = "/var/run/secrets/kubernetes.io/serviceaccount";

#[derive(Clone)]
struct Kube {
    base: String,
    client: reqwest::Client,
    watch_client: reqwest::Client,
}

impl Kube {
    fn from_env() -> Option<Self> {
        let host = std::env::var("KUBERNETES_SERVICE_HOST").ok()?;
        let port = std::env::var("KUBERNETES_SERVICE_PORT").unwrap_or_else(|_| "443".into());
        let ca = std::fs::read(format!("{SA_DIR}/ca.crt")).ok()?;
        let cert = reqwest::Certificate::from_pem(&ca).ok()?;
        let build = |timeout: Option<Duration>| {
            let mut b = reqwest::Client::builder().add_root_certificate(cert.clone());
            if let Some(t) = timeout {
                b = b.timeout(t);
            }
            b.build().ok()
        };
        Some(Self {
            base: format!("https://{host}:{port}"),
            client: build(Some(Duration::from_secs(20)))?,
            // No timeout: watch connections are long-lived (server closes them
            // via timeoutSeconds in the query string instead).
            watch_client: build(None)?,
        })
    }

    fn token() -> String {
        // Bound SA tokens are rotated by the kubelet; read fresh per request.
        std::fs::read_to_string(format!("{SA_DIR}/token")).unwrap_or_default()
    }

    async fn get_json(&self, path: &str) -> Result<Value, String> {
        let resp = self
            .client
            .get(format!("{}{}", self.base, path))
            .bearer_auth(Self::token())
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("GET {path}: {}", resp.status()));
        }
        resp.json().await.map_err(|e| e.to_string())
    }

    async fn watch(&self, path: &str) -> Result<reqwest::Response, String> {
        let resp = self
            .watch_client
            .get(format!("{}{}", self.base, path))
            .bearer_auth(Self::token())
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("WATCH {path}: {}", resp.status()));
        }
        Ok(resp)
    }
}

// ------------------------------------------------------------- pod parsing

fn s(v: &Value, ptr: &str) -> String {
    v.pointer(ptr).and_then(Value::as_str).unwrap_or("").to_string()
}

fn parse_pod(item: &Value) -> Option<Pod> {
    let uid = s(item, "/metadata/uid");
    if uid.is_empty() {
        return None;
    }
    let statuses = item
        .pointer("/status/containerStatuses")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let restarts: i64 = statuses
        .iter()
        .filter_map(|c| c.pointer("/restartCount").and_then(Value::as_i64))
        .sum();
    let ready = !statuses.is_empty()
        && statuses
            .iter()
            .all(|c| c.pointer("/ready").and_then(Value::as_bool).unwrap_or(false));
    // Surface the most interesting waiting reason (CrashLoopBackOff etc.).
    let reason = statuses
        .iter()
        .filter_map(|c| {
            c.pointer("/state/waiting/reason")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .next()
        .unwrap_or_else(|| s(item, "/status/reason"));
    Some(Pod {
        uid,
        name: s(item, "/metadata/name"),
        namespace: s(item, "/metadata/namespace"),
        phase: s(item, "/status/phase"),
        ready,
        restarts,
        node: s(item, "/spec/nodeName"),
        started_at: s(item, "/status/startTime"),
        reason,
        terminating: item.pointer("/metadata/deletionTimestamp").is_some(),
        cpu_nano: 0,
        mem_bytes: 0,
    })
}

fn parse_event(item: &Value) -> Option<K8sEvent> {
    let reason = s(item, "/reason");
    if reason.is_empty() {
        return None;
    }
    let mut message = s(item, "/message");
    message.truncate(200);
    let ts = [
        s(item, "/lastTimestamp"),
        s(item, "/eventTime"),
        s(item, "/metadata/creationTimestamp"),
    ]
    .into_iter()
    .find(|t| !t.is_empty())
    .unwrap_or_default();
    Some(K8sEvent {
        namespace: s(item, "/metadata/namespace"),
        kind: s(item, "/involvedObject/kind"),
        name: s(item, "/involvedObject/name"),
        reason,
        message,
        etype: s(item, "/type"),
        ts,
    })
}

// ------------------------------------------------------------- watch loops

async fn pods_loop(kube: Kube, app: Arc<App>) {
    loop {
        if let Err(e) = pods_list_and_watch(&kube, &app).await {
            eprintln!("[pods] {e}; relisting in 5s");
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }
}

async fn pods_list_and_watch(kube: &Kube, app: &Arc<App>) -> Result<(), String> {
    let list = kube.get_json("/api/v1/pods?limit=1000").await?;
    let rv = s(&list, "/metadata/resourceVersion");
    let mut fresh: HashMap<String, Pod> = HashMap::new();
    for item in list.pointer("/items").and_then(Value::as_array).into_iter().flatten() {
        if let Some(p) = parse_pod(item) {
            fresh.insert(p.uid.clone(), p);
        }
    }
    {
        // Keep last-known metrics across relists so fish sizes don't reset.
        let mut pods = app.pods.write().await;
        for (uid, p) in fresh.iter_mut() {
            if let Some(old) = pods.get(uid) {
                p.cpu_nano = old.cpu_nano;
                p.mem_bytes = old.mem_bytes;
            }
        }
        *pods = fresh;
    }
    app.ready.store(true, Ordering::Relaxed);
    let snapshot = app.snapshot_json().await;
    app.broadcast(snapshot);

    let resp = kube
        .watch(&format!(
            "/api/v1/pods?watch=1&resourceVersion={rv}&allowWatchBookmarks=true&timeoutSeconds=540"
        ))
        .await?;
    let mut body = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.extend_from_slice(&chunk);
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let Ok(ev) = serde_json::from_slice::<Value>(&line) else { continue };
            match ev.pointer("/type").and_then(Value::as_str).unwrap_or("") {
                "ADDED" | "MODIFIED" => {
                    if let Some(mut p) = ev.pointer("/object").and_then(parse_pod_ref) {
                        let mut pods = app.pods.write().await;
                        if let Some(old) = pods.get(&p.uid) {
                            p.cpu_nano = old.cpu_nano;
                            p.mem_bytes = old.mem_bytes;
                        }
                        pods.insert(p.uid.clone(), p.clone());
                        drop(pods);
                        app.broadcast(json!({ "type": "pod", "pod": p }).to_string());
                    }
                }
                "DELETED" => {
                    if let Some(uid) = ev.pointer("/object/metadata/uid").and_then(Value::as_str) {
                        app.pods.write().await.remove(uid);
                        app.broadcast(json!({ "type": "delete", "uid": uid }).to_string());
                    }
                }
                "BOOKMARK" => {}
                _ => return Err("watch error event (likely 410 Gone)".into()),
            }
        }
    }
    // Server closed the watch after timeoutSeconds — normal, caller relists.
    Ok(())
}

fn parse_pod_ref(v: &Value) -> Option<Pod> {
    parse_pod(v)
}

async fn events_loop(kube: Kube, app: Arc<App>) {
    loop {
        if let Err(e) = events_list_and_watch(&kube, &app).await {
            eprintln!("[events] {e}; retrying in 10s");
            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    }
}

async fn events_list_and_watch(kube: &Kube, app: &Arc<App>) -> Result<(), String> {
    let list = kube.get_json("/api/v1/events?limit=200").await?;
    let rv = s(&list, "/metadata/resourceVersion");
    let mut items: Vec<K8sEvent> = list
        .pointer("/items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(parse_event)
        .collect();
    items.sort_by(|a, b| a.ts.cmp(&b.ts));
    {
        let mut events = app.events.write().await;
        events.clear();
        for ev in items.into_iter().rev().take(30).rev() {
            events.push_back(ev);
        }
    }

    let resp = kube
        .watch(&format!(
            "/api/v1/events?watch=1&resourceVersion={rv}&allowWatchBookmarks=true&timeoutSeconds=540"
        ))
        .await?;
    let mut body = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.extend_from_slice(&chunk);
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let Ok(ev) = serde_json::from_slice::<Value>(&line) else { continue };
            match ev.pointer("/type").and_then(Value::as_str).unwrap_or("") {
                "ADDED" | "MODIFIED" => {
                    if let Some(e) = ev.pointer("/object").and_then(parse_event_ref) {
                        app.push_event(e).await;
                    }
                }
                "DELETED" | "BOOKMARK" => {}
                _ => return Err("watch error event".into()),
            }
        }
    }
    Ok(())
}

fn parse_event_ref(v: &Value) -> Option<K8sEvent> {
    parse_event(v)
}

// ------------------------------------------------------------------ metrics

fn parse_cpu_nano(q: &str) -> i64 {
    let q = q.trim();
    let (num, mult) = match q.chars().last() {
        Some('n') => (&q[..q.len() - 1], 1.0),
        Some('u') => (&q[..q.len() - 1], 1e3),
        Some('m') => (&q[..q.len() - 1], 1e6),
        _ => (q, 1e9),
    };
    (num.parse::<f64>().unwrap_or(0.0) * mult) as i64
}

fn parse_mem_bytes(q: &str) -> i64 {
    let q = q.trim();
    for (suffix, mult) in [
        ("Ki", 1024.0),
        ("Mi", 1048576.0),
        ("Gi", 1073741824.0),
        ("Ti", 1099511627776.0),
        ("k", 1e3),
        ("M", 1e6),
        ("G", 1e9),
    ] {
        if let Some(num) = q.strip_suffix(suffix) {
            return (num.parse::<f64>().unwrap_or(0.0) * mult) as i64;
        }
    }
    q.parse::<f64>().unwrap_or(0.0) as i64
}

async fn metrics_loop(kube: Kube, app: Arc<App>) {
    loop {
        tokio::time::sleep(Duration::from_secs(20)).await;
        let Ok(list) = kube.get_json("/apis/metrics.k8s.io/v1beta1/pods").await else {
            continue; // metrics-server absent or briefly unavailable — fish keep default sizes
        };
        let mut usage: HashMap<(String, String), (i64, i64)> = HashMap::new();
        for item in list.pointer("/items").and_then(Value::as_array).into_iter().flatten() {
            let key = (s(item, "/metadata/namespace"), s(item, "/metadata/name"));
            let mut cpu = 0i64;
            let mut mem = 0i64;
            for c in item.pointer("/containers").and_then(Value::as_array).into_iter().flatten() {
                cpu += parse_cpu_nano(&s(c, "/usage/cpu"));
                mem += parse_mem_bytes(&s(c, "/usage/memory"));
            }
            usage.insert(key, (cpu, mem));
        }
        let mut updates = Vec::new();
        {
            let mut pods = app.pods.write().await;
            for p in pods.values_mut() {
                if let Some(&(cpu, mem)) = usage.get(&(p.namespace.clone(), p.name.clone())) {
                    p.cpu_nano = cpu;
                    p.mem_bytes = mem;
                    updates.push(json!({ "uid": p.uid, "cpuNano": cpu, "memBytes": mem }));
                }
            }
        }
        if !updates.is_empty() {
            app.broadcast(json!({ "type": "metrics", "items": updates }).to_string());
        }
    }
}

// ---------------------------------------------------------------- mock mode

// Tiny deterministic PRNG so mock mode needs no extra dependency.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

async fn mock_loop(app: Arc<App>) {
    let namespaces = [
        "argocd", "monitoring", "kube-system", "zublo", "dobutsu-analyzer", "arc-runners",
    ];
    let mut rng = Rng(0x5150_d1e5);
    let mut counter = 0u64;
    {
        let mut pods = app.pods.write().await;
        for (i, ns) in namespaces.iter().enumerate() {
            for j in 0..(3 + i % 3) {
                counter += 1;
                let uid = format!("mock-{counter}");
                let phase = match (i + j) % 11 {
                    9 => "Pending",
                    10 => "Succeeded",
                    _ => "Running",
                };
                pods.insert(
                    uid.clone(),
                    Pod {
                        uid,
                        name: format!("{ns}-pod-{j}"),
                        namespace: ns.to_string(),
                        phase: phase.into(),
                        ready: phase == "Running",
                        restarts: (rng.below(3)) as i64,
                        node: "mock-node".into(),
                        started_at: "2026-06-11T00:00:00Z".into(),
                        reason: if i == 2 && j == 0 { "CrashLoopBackOff".into() } else { String::new() },
                        terminating: false,
                        cpu_nano: (10 + rng.below(400)) as i64 * 1_000_000,
                        mem_bytes: (32 + rng.below(700)) as i64 * 1_048_576,
                    },
                );
            }
        }
    }
    app.ready.store(true, Ordering::Relaxed);
    loop {
        tokio::time::sleep(Duration::from_secs(4)).await;
        let mut pods = app.pods.write().await;
        let uids: Vec<String> = pods.keys().cloned().collect();
        if uids.is_empty() {
            continue;
        }
        let uid = &uids[rng.below(uids.len() as u64) as usize];
        let roll = rng.below(10);
        if roll == 0 {
            let removed = pods.remove(uid);
            drop(pods);
            if removed.is_some() {
                app.broadcast(json!({ "type": "delete", "uid": uid }).to_string());
            }
            let mut pods = app.pods.write().await;
            counter += 1;
            let ns = namespaces[rng.below(namespaces.len() as u64) as usize];
            let p = Pod {
                uid: format!("mock-{counter}"),
                name: format!("{ns}-pod-{counter}"),
                namespace: ns.to_string(),
                phase: "Running".into(),
                ready: true,
                restarts: 0,
                node: "mock-node".into(),
                started_at: "2026-06-11T00:00:00Z".into(),
                reason: String::new(),
                terminating: false,
                cpu_nano: 50_000_000,
                mem_bytes: 64 * 1_048_576,
            };
            pods.insert(p.uid.clone(), p.clone());
            drop(pods);
            app.broadcast(json!({ "type": "pod", "pod": p }).to_string());
            app.push_event(K8sEvent {
                namespace: ns.into(),
                kind: "Pod".into(),
                name: p.name.clone(),
                reason: "Scheduled".into(),
                message: format!("Successfully assigned {}/{} to mock-node", ns, p.name),
                etype: "Normal".into(),
                ts: String::new(),
            })
            .await;
        } else if roll == 1 {
            if let Some(p) = pods.get_mut(uid) {
                p.restarts += 1;
                let p = p.clone();
                drop(pods);
                app.broadcast(json!({ "type": "pod", "pod": p }).to_string());
                app.push_event(K8sEvent {
                    namespace: p.namespace.clone(),
                    kind: "Pod".into(),
                    name: p.name.clone(),
                    reason: "BackOff".into(),
                    message: "Back-off restarting failed container".into(),
                    etype: "Warning".into(),
                    ts: String::new(),
                })
                .await;
            }
        } else {
            let mut updates = Vec::new();
            for p in pods.values_mut() {
                let delta = rng.below(40) as i64 - 20;
                p.mem_bytes = (p.mem_bytes + delta * 1_048_576).max(16 * 1_048_576);
                p.cpu_nano = (p.cpu_nano + (rng.below(60) as i64 - 30) * 1_000_000).max(1_000_000);
                updates.push(json!({ "uid": p.uid, "cpuNano": p.cpu_nano, "memBytes": p.mem_bytes }));
            }
            drop(pods);
            app.broadcast(json!({ "type": "metrics", "items": updates }).to_string());
        }
    }
}

// ------------------------------------------------------------------- server

async fn state_handler(State(app): State<Arc<App>>) -> axum::response::Response {
    let body = app.snapshot_json().await;
    axum::response::Response::builder()
        .header("content-type", "application/json")
        .body(body.into())
        .unwrap()
}

async fn ready_handler(State(app): State<Arc<App>>) -> (StatusCode, &'static str) {
    if app.ready.load(Ordering::Relaxed) {
        (StatusCode::OK, "ready")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "warming up")
    }
}

async fn stream_handler(
    State(app): State<Arc<App>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let snapshot = app.snapshot_json().await;
    let rx = app.tx.subscribe();
    let initial = stream::once(async move { Ok(Event::default().data(snapshot)) });
    let updates = stream::unfold(rx, |mut rx| async move {
        loop {
            match rx.recv().await {
                Ok(msg) => return Some((Ok(Event::default().data(msg)), rx)),
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    });
    Sse::new(initial.chain(updates)).keep_alive(KeepAlive::default())
}

#[tokio::main]
async fn main() {
    let app = App::new();

    if std::env::var("SUISO_MOCK").is_ok() {
        eprintln!("suiso: SUISO_MOCK set — serving generated aquarium");
        tokio::spawn(mock_loop(app.clone()));
    } else if let Some(kube) = Kube::from_env() {
        tokio::spawn(pods_loop(kube.clone(), app.clone()));
        tokio::spawn(events_loop(kube.clone(), app.clone()));
        tokio::spawn(metrics_loop(kube, app.clone()));
    } else {
        eprintln!("suiso: no in-cluster credentials found (set SUISO_MOCK=1 for local dev)");
        std::process::exit(1);
    }

    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "static".into());
    let index = format!("{static_dir}/index.html");
    let serve = ServeDir::new(&static_dir).not_found_service(ServeFile::new(index));

    let router = Router::new()
        .route("/api/state", get(state_handler))
        .route("/api/stream", get(stream_handler))
        .route("/healthz", get(|| async { "ok" }))
        .route("/readyz", get(ready_handler))
        .fallback_service(serve)
        .with_state(app);

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.unwrap();
    eprintln!("suiso: listening on :{port}");
    axum::serve(listener, router).await.unwrap();
}
