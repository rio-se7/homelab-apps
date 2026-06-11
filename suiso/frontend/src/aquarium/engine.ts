import { type Pod } from '../types';

interface Fish {
  uid: string;
  pod: Pod;
  x: number;
  y: number;
  angle: number;
  size: number;
  targetSize: number;
  hue: number;
  seed: number;
  phase: number;
  mode: 'swim' | 'egg' | 'dead' | 'ghost';
  alpha: number;
  dying: boolean;
  flash: number;
  spawn: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  wobble: number;
  alpha: number;
}

interface School {
  hue: number;
  ax: number; // anchor as fraction of width/height
  ay: number;
  idx: number;
}

const TAU = Math.PI * 2;

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h * 137.508) % 360;
}

function podMode(p: Pod): Fish['mode'] {
  if (p.reason === 'CrashLoopBackOff' || p.phase === 'Failed') return 'dead';
  if (p.phase === 'Pending') return 'egg';
  if (p.phase === 'Succeeded') return 'ghost';
  return 'swim';
}

function podSize(p: Pod): number {
  // Fish size from memory usage, log-scaled: 32Mi ≈ 13px, 1Gi ≈ 28px.
  const mib = Math.max(p.memBytes / 1048576, 8);
  return Math.min(36, Math.max(10, 6 + Math.log2(mib) * 3.1));
}

export class Aquarium {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fishes = new Map<string, Fish>();
  private schools = new Map<string, School>();
  private bubbles: Bubble[] = [];
  private t = 0;
  private last = 0;
  private raf = 0;
  private w = 0;
  private h = 0;
  private observer: ResizeObserver;
  private seaweedSeeds: number[] = [];
  selectedUid: string | null = null;
  highlightNs: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    for (let i = 0; i < 7; i++) this.seaweedSeeds.push(Math.random() * 100);
    this.resize();
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.t += dt;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
  }

  /** Reconcile engine entities with the latest pod set. */
  setData(pods: Pod[]) {
    const seen = new Set<string>();
    const namespaces = [...new Set(pods.map((p) => p.namespace))].sort();
    namespaces.forEach((ns, i) => {
      if (!this.schools.has(ns)) {
        this.schools.set(ns, { hue: hashHue(ns), ax: 0.5, ay: 0.5, idx: i });
      }
    });
    // Lay schools out on a loose grid, away from edges and HUD areas.
    const cols = Math.max(1, Math.ceil(Math.sqrt(namespaces.length)));
    const rows = Math.max(1, Math.ceil(namespaces.length / cols));
    namespaces.forEach((ns, i) => {
      const school = this.schools.get(ns)!;
      school.idx = i;
      school.ax = 0.16 + 0.68 * (cols === 1 ? 0.5 : (i % cols) / (cols - 1));
      school.ay = 0.22 + 0.5 * (rows === 1 ? 0.5 : Math.floor(i / cols) / (rows - 1));
    });
    for (const ns of [...this.schools.keys()]) {
      if (!namespaces.includes(ns)) this.schools.delete(ns);
    }

    for (const pod of pods) {
      seen.add(pod.uid);
      const existing = this.fishes.get(pod.uid);
      if (existing) {
        if (pod.restarts > existing.pod.restarts) {
          existing.flash = 1;
          this.burst(existing.x, existing.y);
        }
        existing.pod = pod;
        existing.mode = podMode(pod);
        existing.targetSize = podSize(pod);
        existing.dying = pod.terminating;
      } else {
        const school = this.schools.get(pod.namespace);
        const seed = Math.random() * 1000;
        this.fishes.set(pod.uid, {
          uid: pod.uid,
          pod,
          x: (school ? school.ax : 0.5) * this.w + (Math.random() - 0.5) * 80,
          y: (school ? school.ay : 0.5) * this.h + (Math.random() - 0.5) * 60,
          angle: Math.random() * TAU,
          size: 2,
          targetSize: podSize(pod),
          hue: school ? school.hue : 200,
          seed,
          phase: Math.random() * TAU,
          mode: podMode(pod),
          alpha: 0,
          dying: pod.terminating,
          flash: 0,
          spawn: 0,
        });
      }
    }
    for (const [uid, fish] of this.fishes) {
      if (!seen.has(uid)) fish.dying = true;
    }
  }

  applyMetrics(items: { uid: string; cpuNano: number; memBytes: number }[]) {
    for (const m of items) {
      const fish = this.fishes.get(m.uid);
      if (fish) {
        fish.pod = { ...fish.pod, cpuNano: m.cpuNano, memBytes: m.memBytes };
        fish.targetSize = podSize(fish.pod);
      }
    }
  }

  hitTest(px: number, py: number): Pod | null {
    let best: Fish | null = null;
    let bestDist = Infinity;
    for (const fish of this.fishes.values()) {
      const d = Math.hypot(fish.x - px, fish.y - py);
      if (d < Math.max(fish.size * 1.5, 16) && d < bestDist) {
        best = fish;
        bestDist = d;
      }
    }
    return best ? best.pod : null;
  }

  private burst(x: number, y: number) {
    for (let i = 0; i < 14; i++) {
      this.bubbles.push({
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 16,
        r: 1.5 + Math.random() * 3,
        vy: 40 + Math.random() * 50,
        wobble: Math.random() * TAU,
        alpha: 0.9,
      });
    }
  }

  // ------------------------------------------------------------- simulation

  private update(dt: number) {
    // Ambient bubbles.
    if (Math.random() < dt * 1.6 && this.bubbles.length < 80) {
      this.bubbles.push({
        x: Math.random() * this.w,
        y: this.h + 8,
        r: 1 + Math.random() * 2.5,
        vy: 18 + Math.random() * 26,
        wobble: Math.random() * TAU,
        alpha: 0.35,
      });
    }
    this.bubbles = this.bubbles.filter((b) => {
      b.y -= b.vy * dt;
      b.x += Math.sin(this.t * 2 + b.wobble) * 12 * dt;
      if (b.alpha > 0.4) b.alpha -= dt * 0.4;
      return b.y > -10;
    });

    for (const [uid, fish] of this.fishes) {
      fish.spawn = Math.min(1, fish.spawn + dt * 1.5);
      fish.size += (fish.targetSize * fish.spawn - fish.size) * Math.min(1, dt * 3);
      fish.flash = Math.max(0, fish.flash - dt * 1.2);

      if (fish.dying) {
        fish.alpha -= dt * 0.8;
        if (fish.alpha <= 0) {
          this.fishes.delete(uid);
          if (this.selectedUid === uid) this.selectedUid = null;
        }
        continue;
      }
      fish.alpha = Math.min(fish.mode === 'ghost' ? 0.45 : 1, fish.alpha + dt * 1.2);

      const school = this.schools.get(fish.pod.namespace);
      const ax = (school ? school.ax : 0.5) * this.w + Math.sin(this.t * 0.05 + (school?.idx ?? 0) * 2.1) * this.w * 0.04;
      const ay = (school ? school.ay : 0.5) * this.h + Math.cos(this.t * 0.04 + (school?.idx ?? 0)) * this.h * 0.03;

      switch (fish.mode) {
        case 'swim': {
          const spread = 60 + fish.size * 2.5;
          const tx = ax + Math.cos(fish.seed + this.t * 0.33) * spread;
          const ty = ay + Math.sin(fish.seed * 1.7 + this.t * 0.27) * spread * 0.6;
          const desired = Math.atan2(ty - fish.y, tx - fish.x);
          let diff = desired - fish.angle;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          fish.angle += diff * Math.min(1, dt * 2.2);
          // Busy pods swim faster (CPU usage → speed).
          const cpuBoost = Math.min(2, fish.pod.cpuNano / 200_000_000);
          const speed = (26 + 14 * cpuBoost) * (fish.pod.ready ? 1 : 0.45);
          fish.x += Math.cos(fish.angle) * speed * dt;
          fish.y += Math.sin(fish.angle) * speed * dt;
          break;
        }
        case 'egg': {
          fish.x += (ax - fish.x) * dt * 0.6;
          fish.y += (ay - 50 - fish.y) * dt * 0.6 + Math.sin(this.t * 2 + fish.seed) * 8 * dt;
          break;
        }
        case 'dead': {
          const floor = this.h - 46;
          if (fish.y < floor) fish.y += 22 * dt;
          fish.x += Math.sin(this.t * 1.4 + fish.seed) * 6 * dt;
          fish.angle = Math.sin(this.t * 1.1 + fish.seed) * 0.12;
          break;
        }
        case 'ghost': {
          const ceiling = this.h * 0.16;
          if (fish.y > ceiling) fish.y -= 14 * dt;
          fish.x += Math.sin(this.t * 0.8 + fish.seed) * 10 * dt;
          break;
        }
      }
      fish.x = Math.max(24, Math.min(this.w - 24, fish.x));
      fish.y = Math.max(24, Math.min(this.h - 24, fish.y));
    }
  }

  // -------------------------------------------------------------- rendering

  private draw() {
    const { ctx, w, h, t } = this;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#06314f');
    bg.addColorStop(0.5, '#032238');
    bg.addColorStop(1, '#010a14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Light shafts.
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.2 + i * 0.3) + Math.sin(t * 0.1 + i * 2) * 40;
      ctx.save();
      ctx.translate(cx, 0);
      ctx.rotate(0.18 + Math.sin(t * 0.07 + i) * 0.06);
      const ray = ctx.createLinearGradient(0, 0, 0, h * 0.9);
      ray.addColorStop(0, 'rgba(140, 210, 255, 0.10)');
      ray.addColorStop(1, 'rgba(140, 210, 255, 0)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(30, 0);
      ctx.lineTo(120, h * 0.9);
      ctx.lineTo(-120, h * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    this.drawSeaweed();

    // Sand floor.
    const sand = ctx.createLinearGradient(0, h - 50, 0, h);
    sand.addColorStop(0, 'rgba(70, 78, 92, 0)');
    sand.addColorStop(1, 'rgba(70, 78, 92, 0.55)');
    ctx.fillStyle = sand;
    ctx.fillRect(0, h - 50, w, 50);

    // Namespace labels under each school.
    ctx.textAlign = 'center';
    ctx.font = '11px ui-monospace, monospace';
    for (const [ns, school] of this.schools) {
      const dim = this.highlightNs !== null && this.highlightNs !== ns;
      ctx.fillStyle = `hsla(${school.hue}, 60%, 75%, ${dim ? 0.08 : 0.3})`;
      ctx.fillText(ns, school.ax * w, school.ay * h + 64);
    }

    // Fish, small ones first for a cheap depth illusion.
    const sorted = [...this.fishes.values()].sort((a, b) => a.size - b.size);
    for (const fish of sorted) this.drawFish(fish);

    // Bubbles.
    for (const b of this.bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.strokeStyle = `rgba(190, 230, 255, ${b.alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawSeaweed() {
    const { ctx, w, h, t } = this;
    this.seaweedSeeds.forEach((seed, i) => {
      const baseX = w * ((i + 0.5) / this.seaweedSeeds.length) + Math.sin(seed) * 30;
      const height = 60 + (seed % 1) * 70;
      const segments = 6;
      ctx.beginPath();
      ctx.moveTo(baseX, h);
      for (let s2 = 1; s2 <= segments; s2++) {
        const frac = s2 / segments;
        const sway = Math.sin(t * 0.8 + seed + frac * 2.5) * 10 * frac;
        ctx.lineTo(baseX + sway, h - height * frac);
      }
      ctx.strokeStyle = `hsla(${150 + (seed % 1) * 40}, 45%, 28%, 0.5)`;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  }

  private drawFish(fish: Fish) {
    const { ctx, t } = this;
    const p = fish.pod;
    const dim = this.highlightNs !== null && this.highlightNs !== p.namespace;
    const alpha = fish.alpha * (dim ? 0.15 : 1);
    if (alpha <= 0.01) return;

    if (fish.mode === 'egg') {
      this.drawEgg(fish, alpha);
      return;
    }
    if (fish.mode === 'ghost') {
      this.drawJelly(fish, alpha);
      return;
    }

    const dead = fish.mode === 'dead';
    const sat = p.ready || dead ? 62 : 25;
    const size = fish.size;

    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.rotate(fish.angle);
    // Keep the fish upright when heading left; flip belly-up when dead.
    if (Math.cos(fish.angle) < 0) ctx.scale(1, -1);
    if (dead) ctx.scale(1, -1);
    ctx.globalAlpha = alpha;

    const wag = Math.sin(t * (dead ? 1.5 : 7) + fish.phase) * (dead ? 0.15 : 0.5);
    const hue = dead ? 4 : fish.hue;
    const light = dead ? 42 : 52;

    // Tail.
    ctx.beginPath();
    ctx.moveTo(-size * 0.7, 0);
    ctx.quadraticCurveTo(-size * 1.1, wag * size * 0.3, -size * 1.45, -size * 0.42 + wag * size * 0.5);
    ctx.quadraticCurveTo(-size * 1.15, wag * size * 0.4, -size * 1.45, size * 0.42 + wag * size * 0.5);
    ctx.quadraticCurveTo(-size * 1.1, wag * size * 0.3, -size * 0.7, 0);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light - 10}%, 0.95)`;
    ctx.fill();

    // Body.
    const grad = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
    grad.addColorStop(0, `hsl(${hue}, ${sat}%, ${light + 12}%)`);
    grad.addColorStop(1, `hsl(${hue}, ${sat + 6}%, ${light - 16}%)`);
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.55, 0, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();

    // Dorsal fin.
    ctx.beginPath();
    ctx.moveTo(-size * 0.25, -size * 0.5);
    ctx.quadraticCurveTo(size * 0.1, -size * 1.0, size * 0.4, -size * 0.45);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light - 6}%, 0.9)`;
    ctx.fill();

    // Pectoral fin (paddles with the tail beat).
    ctx.beginPath();
    ctx.moveTo(size * 0.1, size * 0.15);
    ctx.quadraticCurveTo(-size * 0.15, size * (0.55 + wag * 0.2), size * 0.32, size * 0.42);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light - 4}%, 0.8)`;
    ctx.fill();

    // Stripe.
    if (size > 16) {
      ctx.beginPath();
      ctx.ellipse(-size * 0.15, 0, size * 0.12, size * 0.5, 0, 0, TAU);
      ctx.fillStyle = `hsla(${hue}, ${sat + 8}%, ${light - 20}%, 0.35)`;
      ctx.fill();
    }

    // Eye (X-ed out when dead).
    if (dead) {
      ctx.strokeStyle = 'rgba(20, 8, 8, 0.9)';
      ctx.lineWidth = 1.6;
      const ex = size * 0.55;
      const ey = -size * 0.1;
      const r = size * 0.12;
      ctx.beginPath();
      ctx.moveTo(ex - r, ey - r);
      ctx.lineTo(ex + r, ey + r);
      ctx.moveTo(ex + r, ey - r);
      ctx.lineTo(ex - r, ey + r);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(size * 0.55, -size * 0.1, size * 0.16, 0, TAU);
      ctx.fillStyle = '#e9f4ff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(size * 0.6, -size * 0.1, size * 0.08, 0, TAU);
      ctx.fillStyle = '#101820';
      ctx.fill();
    }

    // Restart flash.
    if (fish.flash > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, size * (1.3 + (1 - fish.flash) * 0.8), 0, TAU);
      ctx.strokeStyle = `rgba(255, 245, 200, ${fish.flash})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    // Selection ring + label (drawn unrotated).
    if (this.selectedUid === fish.uid) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(fish.x, fish.y, fish.size * 1.6 + 6, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(p.name, fish.x, fish.y - fish.size * 1.6 - 12);
      ctx.restore();
    }
    if (dead && !this.selectedUid) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 120, 110, 0.9)';
      ctx.fillText('!', fish.x, fish.y - fish.size - 8);
      ctx.restore();
    }
  }

  private drawEgg(fish: Fish, alpha: number) {
    const { ctx, t } = this;
    const r = Math.max(7, fish.size * 0.55);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(fish.x, fish.y + Math.sin(t * 2 + fish.seed) * 3);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = `hsla(${fish.hue}, 50%, 80%, 0.25)`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${fish.hue}, 60%, 85%, 0.6)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 0.1, r * 0.15, r * 0.35, 0, TAU);
    ctx.fillStyle = `hsla(${fish.hue}, 65%, 60%, 0.8)`;
    ctx.fill();
    ctx.restore();
  }

  private drawJelly(fish: Fish, alpha: number) {
    const { ctx, t } = this;
    const r = Math.max(8, fish.size * 0.7);
    const pulse = 1 + Math.sin(t * 2.4 + fish.seed) * 0.08;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(fish.x, fish.y);
    ctx.beginPath();
    ctx.arc(0, 0, r * pulse, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = `hsla(${fish.hue}, 60%, 75%, 0.5)`;
    ctx.fill();
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.3, 0);
      ctx.quadraticCurveTo(
        i * r * 0.3 + Math.sin(t * 3 + i + fish.seed) * 4,
        r * 0.9,
        i * r * 0.25 + Math.sin(t * 2 + i) * 6,
        r * 1.6,
      );
      ctx.strokeStyle = `hsla(${fish.hue}, 60%, 80%, 0.4)`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.restore();
  }
}
