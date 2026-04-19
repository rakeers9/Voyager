'use client';

import { useEffect, useRef } from 'react';

/**
 * Decorative globe for the login page's left panel.
 *
 * Renders a partial sphere covered in scattered "data" dots with an orbiting
 * halo cloud and atmospheric glow. Inspired by Palantir Gotham's landing hero.
 *
 * Implementation notes:
 * - Pure Canvas 2D — no three.js, keeps the auth bundle small.
 * - Dots are distributed with a Fibonacci sphere lattice for even coverage,
 *   plus a slightly denser random overlay to suggest landmass clustering.
 * - Each frame rotates every point around Y (spin) and around X (slow camera
 *   tilt via a sinusoid) and does a cheap z-sort via painter ordering to fake
 *   depth without needing a proper depth buffer.
 * - Honors prefers-reduced-motion: locks to a static tilt and skips rAF.
 */
export default function GlobeCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const context = el.getContext('2d');
    if (!context) return;
    // Capture non-nullable aliases so the closures below keep the narrowed types.
    const canvas: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = context;

    // Palantir-ish palette: cool cyan dominant + gold accents
    const COLORS = {
      cyan: [56, 189, 248] as const,   // sky-400
      ice: [125, 211, 252] as const,   // sky-300
      gold: [251, 191, 36] as const,   // amber-400
    };

    // Build the surface features — Fibonacci lattice gives a pleasing even
    // distribution. Each point is either a radial spike or a flat dot; the
    // mix makes the globe feel more like the app (nodes + antennas, not a
    // uniform fur of pins).
    type Spike = {
      kind: 'spike';
      x: number; y: number; z: number;
      rgb: readonly [number, number, number];
      width: number;
      length: number;
    };
    type SurfaceDot = {
      kind: 'dot';
      x: number; y: number; z: number;
      rgb: readonly [number, number, number];
      size: number;
    };
    type SurfaceItem = Spike | SurfaceDot;

    const SURFACE_COUNT = 1500;
    const surface: SurfaceItem[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < SURFACE_COUNT; i++) {
      const y = 1 - (i / (SURFACE_COUNT - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const colorRoll = rand(i * 7.13);
      const rgb = colorRoll < 0.08 ? COLORS.gold : colorRoll < 0.22 ? COLORS.ice : COLORS.cyan;

      // ~45% spikes, ~55% dots. Seeded so the mix doesn't flicker on reload.
      const kindRoll = rand(i * 4.91);
      if (kindRoll < 0.45) {
        const width = 0.55 + rand(i * 11.7) * 0.85;
        const lenRoll = rand(i * 19.4);
        const length = lenRoll < 0.85
          ? 0.022 + rand(i * 3.17) * 0.055
          : 0.08 + rand(i * 5.71) * 0.07;
        surface.push({ kind: 'spike', x, y, z, rgb, width, length });
      } else {
        const size = 0.7 + rand(i * 13.3) * 1.4;
        surface.push({ kind: 'dot', x, y, z, rgb, size });
      }
    }

    // Road-like route arcs — base is a great circle, but each sample is
    // displaced perpendicular to the arc plane by a smooth multi-octave
    // noise function. Endpoints stay pinned; the wobble tapers to zero at
    // t=0 and t=1 so the "stop" markers land exactly on the anchors.
    type Path = {
      a: readonly [number, number, number];
      b: readonly [number, number, number];
      axis: readonly [number, number, number]; // normal to great-circle plane
      rgb: readonly [number, number, number];
      phase: number;    // offset so each path's playhead moves independently
      seed: number;     // randomizes the noise shape per-path
      wobble: number;   // amplitude of perpendicular displacement (sphere-radius units)
    };
    const spherePoint = (lat: number, lng: number): [number, number, number] => {
      const ry = Math.max(-0.999, Math.min(0.999, lat));
      const rr = Math.sqrt(1 - ry * ry);
      return [Math.cos(lng) * rr, ry, Math.sin(lng) * rr];
    };
    const pathFromAnchors = (
      a: readonly [number, number, number],
      b: readonly [number, number, number],
      rgb: readonly [number, number, number],
      phase: number,
      seed: number,
      wobble = 0.045,
    ): Path => {
      // axis = a × b, normalized — perpendicular to the great-circle plane.
      let ax = a[1] * b[2] - a[2] * b[1];
      let ay = a[2] * b[0] - a[0] * b[2];
      let az = a[0] * b[1] - a[1] * b[0];
      const len = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
      ax /= len; ay /= len; az /= len;
      return { a, b, axis: [ax, ay, az], rgb, phase, seed, wobble };
    };
    // wobble=0 keeps the arcs as clean great circles (their earlier look).
    // Noise machinery is retained so the playhead still samples via pathSample.
    const paths: Path[] = [
      pathFromAnchors(spherePoint(0.28, 0.4),   spherePoint(0.55, 1.8),  COLORS.cyan, 0.00, 1.7,  0),
      pathFromAnchors(spherePoint(-0.15, 1.1),  spherePoint(0.35, 2.7),  COLORS.gold, 0.33, 4.9,  0),
      pathFromAnchors(spherePoint(0.05, -0.6),  spherePoint(0.42, 0.9),  COLORS.cyan, 0.67, 9.2,  0),
      pathFromAnchors(spherePoint(-0.25, 2.2),  spherePoint(0.1, 3.4),   COLORS.ice,  0.17, 13.3, 0),
      pathFromAnchors(spherePoint(0.38, -0.2),  spherePoint(0.6, 2.3),   COLORS.cyan, 0.5,  17.1, 0),
    ];

    // Smooth multi-octave noise along a path parameter t ∈ [0,1].
    // Returns a signed value roughly in [-1, 1]. Endpoints taper via sin(πt).
    const pathNoise = (t: number, seed: number): number => {
      const envelope = Math.sin(Math.PI * t);
      const n =
        0.55 * Math.sin(seed * 1.0 + t * 11.3) +
        0.30 * Math.sin(seed * 2.7 + t * 24.1 + 1.0) +
        0.15 * Math.sin(seed * 4.3 + t * 53.7 + 2.0);
      return envelope * n;
    };

    // Sample a single point on a noisy path at parameter t, returning the
    // 3D position on (or just off) the sphere surface.
    const pathSample = (p: Path, t: number): [number, number, number] => {
      const dot = p.a[0] * p.b[0] + p.a[1] * p.b[1] + p.a[2] * p.b[2];
      const omega = Math.acos(Math.max(-1, Math.min(1, dot)));
      const sinO = Math.sin(omega) || 1;
      const ka = Math.sin((1 - t) * omega) / sinO;
      const kb = Math.sin(t * omega) / sinO;
      let x = p.a[0] * ka + p.b[0] * kb;
      let y = p.a[1] * ka + p.b[1] * kb;
      let z = p.a[2] * ka + p.b[2] * kb;
      // Displace perpendicular to the arc plane (along the axis) with noise
      const w = pathNoise(t, p.seed) * p.wobble;
      x += p.axis[0] * w;
      y += p.axis[1] * w;
      z += p.axis[2] * w;
      // Re-normalize so the sample still sits on (or near) the sphere surface.
      const r = Math.sqrt(x * x + y * y + z * z) || 1;
      return [x / r, y / r, z / r];
    };

    // Sparse halo of floating dots to keep a sense of "live data" above the spikes.
    type Dot = { x: number; y: number; z: number; rgb: readonly [number, number, number]; size: number };
    const HALO_COUNT = 110;
    const halo: Dot[] = [];
    for (let i = 0; i < HALO_COUNT; i++) {
      const u = rand(i * 3.3 + 100);
      const v = rand(i * 5.7 + 200);
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const rr = 1.08 + rand(i * 2.1) * 0.14;
      const roll = rand(i * 13.1);
      halo.push({
        x: rr * Math.sin(phi) * Math.cos(theta),
        y: rr * Math.cos(phi),
        z: rr * Math.sin(phi) * Math.sin(theta),
        rgb: roll < 0.4 ? COLORS.gold : COLORS.ice,
        size: 0.8 + rand(i * 17.3) * 1.2,
      });
    }

let DPR = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * DPR));
      canvas.height = Math.max(1, Math.floor(h * DPR));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let rafId = 0;

    function render(now: number) {
      const t = (now - start) / 1000;
      const rotY = reduced ? 0.6 : t * 0.06;          // slow spin (~1 turn / ~100s)
      const tilt = reduced ? -0.28 : -0.28 + Math.sin(t * 0.09) * 0.09; // gentle camera pan

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Centered horizontally, anchored low so only the upper dome shows.
      const cx = W * 0.5;
      const cy = H * 0.95;
      const radius = Math.min(W, H) * 0.775;

      // Outer atmospheric glow
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.85, cx, cy, radius * 1.35);
      glow.addColorStop(0, 'rgba(56,189,248,0)');
      glow.addColorStop(0.55, 'rgba(56,189,248,0.07)');
      glow.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Globe body — near-black disc with a subtle radial shade that reads
      // as a terminator (the lit/unlit boundary on a planet).
      const body = ctx.createRadialGradient(
        cx - radius * 0.35, cy - radius * 0.35, radius * 0.1,
        cx, cy, radius,
      );
      body.addColorStop(0, 'rgba(18,26,42,1)');
      body.addColorStop(0.6, 'rgba(10,14,24,1)');
      body.addColorStop(1, 'rgba(5,8,15,1)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      const sY = Math.sin(rotY), cY = Math.cos(rotY);
      const sT = Math.sin(tilt), cT = Math.cos(tilt);

      // Helper: rotate a unit-sphere point through the current spin + tilt
      // and return its projected screen position plus viewer z-depth.
      const project = (x: number, y: number, z: number) => {
        const x1 = x * cY + z * sY;
        const z1 = -x * sY + z * cY;
        const y2 = y * cT - z1 * sT;
        const z2 = y * sT + z1 * cT;
        return {
          px: cx + x1 * radius,
          py: cy - y2 * radius,
          z2,
        };
      };

      // --- Route paths drawn on the surface, under the spikes ---
      ctx.lineCap = 'round';
      const ARC_SAMPLES = 96;
      for (const path of paths) {
        const [ax, ay, az] = path.a;
        const [bx, by, bz] = path.b;
        const dot = ax * bx + ay * by + az * bz;
        const omega = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (omega < 0.02) continue;

        // Sample the noisy path densely.
        const samples: { px: number; py: number; z2: number }[] = new Array(ARC_SAMPLES + 1);
        for (let i = 0; i <= ARC_SAMPLES; i++) {
          const tt = i / ARC_SAMPLES;
          const [x, y, z] = pathSample(path, tt);
          samples[i] = project(x, y, z);
        }

        const [r, g, b] = path.rgb;
        ctx.lineWidth = 1.1 * DPR;
        ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i <= ARC_SAMPLES; i++) {
          const s = samples[i];
          if (s.z2 < 0.02) { pen = false; continue; }
          if (!pen) { ctx.moveTo(s.px, s.py); pen = true; }
          else { ctx.lineTo(s.px, s.py); }
        }
        ctx.stroke();

        // Endpoint "stop" markers — project anchors directly (noise=0 there)
        const endA = project(path.a[0], path.a[1], path.a[2]);
        const endB = project(path.b[0], path.b[1], path.b[2]);
        for (const p of [endA, endB]) {
          if (p.z2 < 0) continue;
          ctx.fillStyle = `rgba(${r},${g},${b},${(0.4 + p.z2 * 0.6).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.px, p.py, 2.2 * DPR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${(0.25 + p.z2 * 0.4).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.px, p.py, 1.1 * DPR, 0, Math.PI * 2);
          ctx.fill();
        }

      }

      // --- Surface: mixed spikes and dots ---
      for (const s of surface) {
        const inner = project(s.x, s.y, s.z);
        if (inner.z2 < 0) continue;
        const facing = Math.max(0, inner.z2);
        const [r, g, b] = s.rgb;

        if (s.kind === 'spike') {
          const r2 = 1 + s.length;
          const outer = project(s.x * r2, s.y * r2, s.z * r2);
          const alpha = 0.18 + facing * 0.72;
          const grad = ctx.createLinearGradient(inner.px, inner.py, outer.px, outer.py);
          grad.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
          grad.addColorStop(1, `rgba(${r},${g},${b},${(alpha * 0.15).toFixed(3)})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(0.5, s.width * (0.6 + facing * 0.6)) * DPR;
          ctx.beginPath();
          ctx.moveTo(inner.px, inner.py);
          ctx.lineTo(outer.px, outer.py);
          ctx.stroke();
        } else {
          // Flat surface dot
          const brightness = Math.max(0.15, 0.25 + facing * 0.75);
          const depthScale = 0.65 + facing * 0.45;
          ctx.fillStyle = `rgba(${r},${g},${b},${brightness.toFixed(3)})`;
          const size = Math.max(0.4, s.size * depthScale) * DPR;
          ctx.beginPath();
          ctx.arc(inner.px, inner.py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // --- Halo dots: small floating accents above the spike field ---
      for (const d of halo) {
        const p = project(d.x, d.y, d.z);
        if (p.z2 < -0.2) continue;
        const facing = Math.max(0.25, 0.4 + p.z2 * 0.6);
        const depthScale = 0.65 + p.z2 * 0.45;
        const [r, g, b] = d.rgb;
        ctx.fillStyle = `rgba(${r},${g},${b},${facing.toFixed(3)})`;
        const size = Math.max(0.4, d.size * depthScale) * DPR;
        ctx.beginPath();
        ctx.arc(p.px, p.py, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rim highlight — a thin bright arc on the lit side
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rim = ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.01);
      rim.addColorStop(0, 'rgba(125,211,252,0)');
      rim.addColorStop(1, 'rgba(125,211,252,0.18)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.01, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!reduced) rafId = requestAnimationFrame(render);
    }

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}

// Deterministic pseudo-random so the starfield doesn't flicker across
// hot-reloads during development.
function rand(seed: number): number {
  const x = Math.sin(seed * 999.13) * 43758.5453;
  return x - Math.floor(x);
}

