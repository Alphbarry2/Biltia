"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Briques UI de la console admin : cartes, KPI, graphiques SVG animés.
// Aucune donnée inventée ici — ces composants ne font QUE afficher ce qu'on leur
// passe (issu de /api/admin/stats, calculé côté serveur sur la vraie base).
// ─────────────────────────────────────────────────────────────────────────────

import { motion } from "framer-motion";
import { useRef, useState } from "react";

// ── Formatage ────────────────────────────────────────────────────────────────
export const nf = new Intl.NumberFormat("fr-FR");
export const eur = (n: number) => `${nf.format(Math.round(n * 100) / 100)} €`;
export const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
export const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
export const pct = (n: number | null) => (n == null ? "—" : `${n} %`);
export const dur = (h: number | null) =>
  h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} j`;

// ── Carte ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      whileHover={hover ? { y: -3 } : undefined}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className={`rounded-2xl border border-[#ECECF2] bg-white shadow-[0_4px_16px_rgba(60,40,120,0.06)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────
export function Kpi({
  icon,
  value,
  label,
  hint,
  accent = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card
      hover
      className={`p-4 ${
        accent
          ? "border-0 bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_12px_30px_rgba(139,92,246,0.35)]"
          : ""
      }`}
    >
      <div
        className={`mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${
          accent ? "text-white/80" : "text-[#8A8A96]"
        }`}
      >
        <span className={accent ? "text-white" : "text-[#7C3AED]"}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className={`text-[20px] font-black leading-none tabular-nums sm:text-[26px] ${accent ? "text-white" : "text-[#0A0A0A]"}`}>
        {value}
      </p>
      {hint && <p className={`mt-1.5 text-[11px] ${accent ? "text-white/75" : "text-[#9A9AA6]"}`}>{hint}</p>}
    </Card>
  );
}

// ── Petite tuile compacte (bandeau produit) ──────────────────────────────────
export function Tile({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <Card hover className="p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[#7C3AED]">{icon}</div>
      <p className="text-xl font-black tabular-nums leading-none text-[#0A0A0A]">{value}</p>
      <p className="mt-1 text-[11px] text-[#9A9AA6]">{label}</p>
    </Card>
  );
}

// ── Graphique aire + ligne (séries temporelles), animé, avec survol ──────────
export type Point = { x: string; y: number; tip?: string };

export function AreaChart({
  data,
  format,
  height = 170,
  color = "#7C3AED",
  empty,
}: {
  data: Point[];
  format: (n: number) => string;
  height?: number;
  color?: string;
  empty?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<number | null>(null);

  const W = 600;
  const H = height;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 6;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = data.length;

  if (n === 0) return <p className="py-6 text-center text-sm text-[#9A9AA6]">{empty ?? "Aucune donnée."}</p>;

  const max = Math.max(1, ...data.map((d) => d.y));
  const xAt = (i: number) => (n <= 1 ? W / 2 : padL + innerW * (i / (n - 1)));
  const yAt = (v: number) => padT + innerH * (1 - v / max);
  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.y) }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const base = (padT + innerH).toFixed(1);
  const area = `${line} L${pts[n - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`;
  const gid = `area-${color.replace(/[^a-z0-9]/gi, "")}-${n}-${Math.round(max)}`;

  const leftPct = (i: number) => Math.max(7, Math.min(93, (xAt(i) / W) * 100));

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    const innerF = (f * W - padL) / innerW;
    let idx = Math.round(innerF * (n - 1));
    if (!isFinite(idx)) idx = 0;
    setHi(Math.max(0, Math.min(n - 1, idx)));
  };

  return (
    <div>
      <div
        ref={ref}
        className="relative w-full"
        style={{ height: H }}
        onMouseMove={onMove}
        onMouseLeave={() => setHi(null)}
      >
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        </svg>

        {/* Point final statique */}
        <div
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${(xAt(n - 1) / W) * 100}%`, top: yAt(data[n - 1].y), background: color }}
        />

        {/* Survol : guide vertical + point */}
        {hi != null && (
          <>
            <div
              className="pointer-events-none absolute w-px"
              style={{ left: `${(xAt(hi) / W) * 100}%`, top: padT, height: innerH, background: color, opacity: 0.25 }}
            />
            <div
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow"
              style={{ left: `${(xAt(hi) / W) * 100}%`, top: yAt(data[hi].y), borderColor: color }}
            />
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#0A0A0A] px-2.5 py-1.5 text-[11px] leading-tight text-white shadow-lg"
              style={{ left: `${leftPct(hi)}%`, top: -6 }}
            >
              <span className="font-semibold">{format(data[hi].y)}</span>
              <span className="ml-1.5 text-white/55">{data[hi].tip ?? data[hi].x}</span>
            </div>
          </>
        )}
      </div>

      {/* Axe X : premier / milieu / dernier */}
      <div className="mt-1 flex justify-between text-[10px] text-[#B4B4BE]">
        <span>{data[0]?.x}</span>
        {n > 2 && <span>{data[Math.floor((n - 1) / 2)]?.x}</span>}
        <span>{data[n - 1]?.x}</span>
      </div>
    </div>
  );
}

// ── Barres horizontales (classements), animées ───────────────────────────────
export type BarRow = { label: string; value: number; title?: string };

export function BarList({
  rows,
  format,
  empty,
}: {
  rows: BarRow[];
  format: (n: number) => string;
  empty?: string;
}) {
  if (!rows.length) return <p className="py-4 text-sm text-[#9A9AA6]">{empty ?? "Aucune donnée."}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.slice(0, 12).map((r, i) => (
        <div key={r.label + i} className="flex items-center gap-2 sm:gap-3" title={r.title}>
          <span className="w-16 shrink-0 truncate text-xs text-[#4B4B55] sm:w-28 md:w-36">
            {r.label}
          </span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[#F3F3F7]">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500"
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ duration: 0.7, ease: "easeOut", delay: i * 0.03 }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-[#0A0A0A] sm:w-20">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sélecteur de période (pills), pour filtrer les métriques temporelles ─────
export type RangeKey = "7d" | "30d" | "90d" | "180d" | "365d" | "all";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 j" },
  { key: "30d", label: "30 j" },
  { key: "90d", label: "3 mois" },
  { key: "180d", label: "6 mois" },
  { key: "365d", label: "1 an" },
  { key: "all", label: "Tout" },
];

export function TimeRangeSelect({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[#ECECF2] bg-white p-1">
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            value === o.key
              ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white"
              : "text-[#6E6E6C] hover:bg-[#F6F6F9]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Donut (répartitions catégorielles), animé ────────────────────────────────
const DONUT_COLORS = ["#7C3AED", "#EC4899", "#6366F1", "#14B8A6", "#F59E0B", "#94A3B8"];

export function Donut({
  data,
  size = 132,
  thickness = 18,
  empty,
}: {
  data: { label: string; value: number }[];
  size?: number;
  thickness?: number;
  empty?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total <= 0) return <p className="py-4 text-sm text-[#9A9AA6]">{empty ?? "Aucune donnée."}</p>;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F3F7" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * c;
          const off = -acc * c;
          acc += frac;
          return (
            <motion.circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={off}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            />
          );
        })}
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-[#4B4B55]">{d.label}</span>
            <span className="font-semibold tabular-nums text-[#0A0A0A]">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Titre de bloc dans une section ───────────────────────────────────────────
export function BlockTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && <span className="text-[#7C3AED]">{icon}</span>}
      <h3 className="text-sm font-bold text-[#0A0A0A]">{children}</h3>
    </div>
  );
}
