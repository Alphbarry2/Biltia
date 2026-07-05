"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Widget de questions préalables à la création d'une app (façon Lovable) :
// une question à la fois, navigation ‹ ›, « Tout ignorer », récapitulatif.
//
// Types spéciaux :
//   • "color-palette"  → swatches de couleurs à côté de chaque option
//   • "layout-preview" → miniature wireframe à côté de chaque option
//                        filtrée par la réponse à la question "device"
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

export type ClarifyOption = {
  value: string;
  label: string;
  hint?: string;
  palette?: string[];
  wireframeId?: string;
  forDevice?: "mobile" | "desktop" | "tablet";
};

export type ClarifyQuestion = {
  id: string;
  question: string;
  multi: boolean;
  options: ClarifyOption[];
  type?: "color-palette" | "layout-preview";
};

type Answer = { values: string[]; custom: string };

// ── Wireframe SVG thumbnails ──────────────────────────────────────────────────
function WfSidebarKpi() {
  return (
    <svg viewBox="0 0 80 54" className="w-full h-full" fill="none">
      <rect width="80" height="54" rx="3" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="17" height="54" rx="3" fill="#EDE9FE"/>
      <rect x="2" y="8"  width="13" height="2.5" rx="1.2" fill="#A78BFA"/>
      <rect x="2" y="14" width="13" height="2.5" rx="1.2" fill="#7C3AED"/>
      <rect x="2" y="20" width="13" height="2.5" rx="1.2" fill="#A78BFA"/>
      <rect x="2" y="26" width="13" height="2.5" rx="1.2" fill="#A78BFA"/>
      <rect x="19" y="1"  width="59" height="7" rx="1.5" fill="#F1F5F9"/>
      <rect x="19" y="11" width="18" height="11" rx="2" fill="#EDE9FE" stroke="#DDD6FE" strokeWidth="0.5"/>
      <rect x="40" y="11" width="18" height="11" rx="2" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="0.5"/>
      <rect x="61" y="11" width="17" height="11" rx="2" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="0.5"/>
      <rect x="19" y="25" width="18" height="14" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="40" y="25" width="18" height="14" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="61" y="25" width="17" height="14" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="19" y="43" width="59" height="3" rx="1" fill="#F1F5F9"/>
      <rect x="19" y="48" width="59" height="3" rx="1" fill="#F1F5F9"/>
    </svg>
  );
}

function WfSidebarTable() {
  const rows = [10,17,24,31,38,45];
  return (
    <svg viewBox="0 0 80 54" className="w-full h-full" fill="none">
      <rect width="80" height="54" rx="3" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="17" height="54" rx="3" fill="#EDE9FE"/>
      <rect x="2" y="8"  width="13" height="2.5" rx="1.2" fill="#A78BFA"/>
      <rect x="2" y="14" width="13" height="2.5" rx="1.2" fill="#7C3AED"/>
      <rect x="2" y="20" width="13" height="2.5" rx="1.2" fill="#A78BFA"/>
      <rect x="19" y="1" width="59" height="7" rx="1.5" fill="#7C3AED"/>
      <rect x="21" y="2.5" width="7"  height="4" rx="1" fill="rgba(255,255,255,0.35)"/>
      <rect x="31" y="2.5" width="11" height="4" rx="1" fill="rgba(255,255,255,0.35)"/>
      <rect x="45" y="2.5" width="9"  height="4" rx="1" fill="rgba(255,255,255,0.35)"/>
      {rows.map((y, i) => (
        <g key={y}>
          <rect x="19" y={y} width="59" height="6" fill={i % 2 === 0 ? "#F8FAFC" : "white"} stroke="#E2E8F0" strokeWidth="0.3"/>
          <rect x="21" y={y+1.5} width="7"  height="3" rx="1" fill="#CBD5E1"/>
          <rect x="31" y={y+1.5} width="11" height="3" rx="1" fill="#E2E8F0"/>
          <rect x="45" y={y+1.5} width="9"  height="3" rx="1" fill="#E2E8F0"/>
        </g>
      ))}
    </svg>
  );
}

function WfTopnavDash() {
  return (
    <svg viewBox="0 0 80 54" className="w-full h-full" fill="none">
      <rect width="80" height="54" rx="3" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="80" height="9" rx="3" fill="#7C3AED"/>
      <rect x="3"  y="2.5" width="10" height="4" rx="1" fill="rgba(255,255,255,0.4)"/>
      <rect x="17" y="2.5" width="8"  height="4" rx="1" fill="rgba(255,255,255,0.25)"/>
      <rect x="29" y="2.5" width="8"  height="4" rx="1" fill="rgba(255,255,255,0.25)"/>
      <rect x="2"  y="12" width="18" height="11" rx="2" fill="#EDE9FE" stroke="#DDD6FE" strokeWidth="0.5"/>
      <rect x="22" y="12" width="18" height="11" rx="2" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="0.5"/>
      <rect x="42" y="12" width="17" height="11" rx="2" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="0.5"/>
      <rect x="61" y="12" width="17" height="11" rx="2" fill="#FFF7ED" stroke="#FDE68A" strokeWidth="0.5"/>
      <rect x="2" y="26" width="48" height="25" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <polyline points="5,48 13,40 21,43 29,35 37,38 47,31" stroke="#7C3AED" strokeWidth="1" fill="none"/>
      <rect x="53" y="26" width="25" height="11" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="53" y="40" width="25" height="11" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
    </svg>
  );
}

function WfSimple() {
  return (
    <svg viewBox="0 0 80 54" className="w-full h-full" fill="none">
      <rect width="80" height="54" rx="3" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="80" height="9" rx="3" fill="#7C3AED"/>
      <rect x="3" y="2.5" width="16" height="4" rx="1" fill="rgba(255,255,255,0.4)"/>
      <rect x="4" y="13" width="72" height="9" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="4" y="25" width="72" height="9" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="4" y="37" width="72" height="9" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="4" y="48" width="28" height="4" rx="2" fill="#7C3AED"/>
    </svg>
  );
}

function WfBottomTabs() {
  return (
    <svg viewBox="0 0 50 82" className="w-full h-full" fill="none">
      <rect width="50" height="82" rx="6" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="50" height="8" rx="6" fill="#7C3AED"/>
      <rect x="3" y="11" width="44" height="12" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="3" y="26" width="44" height="12" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="3" y="41" width="44" height="12" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="66" width="50" height="16" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="64" width="50" height="2" fill="#F1F5F9"/>
      <rect x="4"  y="69" width="9" height="8" rx="1.5" fill="#EDE9FE"/>
      <rect x="16" y="69" width="9" height="8" rx="1.5" fill="#7C3AED"/>
      <rect x="28" y="69" width="9" height="8" rx="1.5" fill="#EDE9FE"/>
      <rect x="40" y="69" width="7" height="8" rx="1.5" fill="#EDE9FE"/>
    </svg>
  );
}

function WfBurgerCards() {
  return (
    <svg viewBox="0 0 50 82" className="w-full h-full" fill="none">
      <rect width="50" height="82" rx="6" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="50" height="11" rx="6" fill="#7C3AED"/>
      <rect x="3" y="2.5" width="6" height="1.2" rx="0.6" fill="white"/>
      <rect x="3" y="4.5" width="6" height="1.2" rx="0.6" fill="white"/>
      <rect x="3" y="6.5" width="6" height="1.2" rx="0.6" fill="white"/>
      <rect x="13" y="3.5" width="14" height="3" rx="1.2" fill="rgba(255,255,255,0.4)"/>
      {[14,29,44,59].map(y => (
        <g key={y}>
          <rect x="3" y={y} width="44" height="13" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
          <rect x="5" y={y+2} width="9" height="9" rx="1.5" fill="#EDE9FE"/>
          <rect x="17" y={y+2.5} width="16" height="3" rx="1" fill="#CBD5E1"/>
          <rect x="17" y={y+7.5} width="10" height="2" rx="1" fill="#E2E8F0"/>
        </g>
      ))}
    </svg>
  );
}

function WfFabList() {
  return (
    <svg viewBox="0 0 50 82" className="w-full h-full" fill="none">
      <rect width="50" height="82" rx="6" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="50" height="11" rx="6" fill="#7C3AED"/>
      <rect x="3" y="3.5" width="16" height="3" rx="1.2" fill="rgba(255,255,255,0.4)"/>
      {[14,25,36,47,58].map(y => (
        <g key={y}>
          <rect x="3" y={y} width="44" height="9" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
          <rect x="5" y={y+2} width="12" height="2.5" rx="1" fill="#CBD5E1"/>
          <rect x="5" y={y+5.5} width="8" height="1.5" rx="0.75" fill="#E2E8F0"/>
        </g>
      ))}
      <circle cx="41" cy="74" r="6" fill="#7C3AED"/>
      <rect x="38.5" y="73" width="5" height="2" rx="1" fill="white"/>
      <rect x="40"   y="71.5" width="2" height="5" rx="1" fill="white"/>
    </svg>
  );
}

function WfSidebarTabs() {
  return (
    <svg viewBox="0 0 80 82" className="w-full h-full" fill="none">
      <rect width="80" height="82" rx="4" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="80" height="9" rx="4" fill="#7C3AED"/>
      <rect x="3" y="2.5" width="14" height="4" rx="1" fill="rgba(255,255,255,0.4)"/>
      <rect x="0" y="9" width="21" height="57" fill="#EDE9FE"/>
      <rect x="2" y="14" width="17" height="3" rx="1.5" fill="#7C3AED"/>
      <rect x="2" y="20" width="17" height="3" rx="1.5" fill="#A78BFA"/>
      <rect x="2" y="26" width="17" height="3" rx="1.5" fill="#A78BFA"/>
      <rect x="2" y="32" width="17" height="3" rx="1.5" fill="#A78BFA"/>
      <rect x="23" y="11" width="55" height="10" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="23" y="24" width="26" height="16" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="52" y="24" width="26" height="16" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="23" y="43" width="55" height="22" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="66" width="80" height="16" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="5"  y="69" width="13" height="9" rx="2" fill="#EDE9FE"/>
      <rect x="23" y="69" width="13" height="9" rx="2" fill="#7C3AED"/>
      <rect x="41" y="69" width="13" height="9" rx="2" fill="#EDE9FE"/>
      <rect x="59" y="69" width="16" height="9" rx="2" fill="#EDE9FE"/>
    </svg>
  );
}

function WfSplitView() {
  return (
    <svg viewBox="0 0 80 82" className="w-full h-full" fill="none">
      <rect width="80" height="82" rx="4" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="80" height="9" rx="4" fill="#7C3AED"/>
      <rect x="0" y="9" width="33" height="73" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      {[12,24,36,48,60,72].map((y, i) => (
        <rect key={y} x="2" y={y} width="29" height="11" rx="2" fill={i===0?"#EDE9FE":"#F8FAFC"} stroke="#E2E8F0" strokeWidth="0.3"/>
      ))}
      <rect x="34" y="9" width="46" height="73" fill="#F8FAFC"/>
      <rect x="36" y="12" width="42" height="7"  rx="2" fill="#EDE9FE"/>
      <rect x="36" y="22" width="42" height="3"  rx="1" fill="#E2E8F0"/>
      <rect x="36" y="28" width="28" height="3"  rx="1" fill="#E2E8F0"/>
      <rect x="36" y="35" width="42" height="24" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="36" y="63" width="20" height="8"  rx="4" fill="#7C3AED"/>
    </svg>
  );
}

function WfTopnavWide() {
  const cells = [
    { x: 2,  y: 14, color: "#EDE9FE" },
    { x: 41, y: 14, color: "#EFF6FF" },
    { x: 2,  y: 46, color: "#F0FDF4" },
    { x: 41, y: 46, color: "#FFF7ED" },
  ];
  return (
    <svg viewBox="0 0 80 82" className="w-full h-full" fill="none">
      <rect width="80" height="82" rx="4" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5"/>
      <rect x="0" y="0" width="80" height="11" rx="4" fill="#7C3AED"/>
      <rect x="3"  y="3" width="10" height="5" rx="1" fill="rgba(255,255,255,0.4)"/>
      <rect x="17" y="3" width="8"  height="5" rx="1" fill="rgba(255,255,255,0.25)"/>
      <rect x="29" y="3" width="8"  height="5" rx="1" fill="rgba(255,255,255,0.25)"/>
      {cells.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={c.y} width="37" height="30" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
          <rect x={c.x+2} y={c.y+2} width="16" height="12" rx="2" fill={c.color}/>
          <rect x={c.x+2} y={c.y+17} width="33" height="3" rx="1" fill="#E2E8F0"/>
          <rect x={c.x+2} y={c.y+23} width="20" height="3" rx="1" fill="#E2E8F0"/>
        </g>
      ))}
    </svg>
  );
}

const WIREFRAME_MAP: Record<string, () => React.ReactElement> = {
  "sidebar-kpi":   WfSidebarKpi,
  "sidebar-table": WfSidebarTable,
  "topnav-dash":   WfTopnavDash,
  "simple":        WfSimple,
  "bottom-tabs":   WfBottomTabs,
  "burger-cards":  WfBurgerCards,
  "fab-list":      WfFabList,
  "sidebar-tabs":  WfSidebarTabs,
  "split-view":    WfSplitView,
  "topnav-wide":   WfTopnavWide,
};

// ── Widget principal ──────────────────────────────────────────────────────────
export function ClarifyWidget({
  questions,
  onSubmit,
}: {
  questions: ClarifyQuestion[];
  onSubmit: (answersText: string | null, structured?: Record<string, string[]>) => void;
}) {
  const [idx, setIdx]       = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  const get      = (id: string): Answer => answers[id] ?? { values: [], custom: "" };
  const isRecap  = idx >= questions.length;
  const q        = isRecap ? null : questions[idx];
  const deviceAnswer = answers["device"]?.values[0] as "mobile"|"desktop"|"tablet"|undefined;

  const toggle = (qu: ClarifyQuestion, value: string) => {
    setAnswers((prev) => {
      const a = prev[qu.id] ?? { values: [], custom: "" };
      const values = qu.multi
        ? a.values.includes(value) ? a.values.filter((v) => v !== value) : [...a.values, value]
        : a.values.includes(value) ? [] : [value];
      return { ...prev, [qu.id]: { ...a, values } };
    });
  };

  const setCustom = (qu: ClarifyQuestion, custom: string) =>
    setAnswers((prev) => ({ ...prev, [qu.id]: { ...(prev[qu.id] ?? { values: [], custom: "" }), custom } }));

  const answeredLabels = (qu: ClarifyQuestion): string[] => {
    const a = get(qu.id);
    const labels = a.values.map((v) => qu.options.find((o) => o.value === v)?.label ?? v);
    if (a.custom.trim()) labels.push(a.custom.trim());
    return labels;
  };

  const send = () => {
    const lines = questions
      .map((qu) => {
        const labels = answeredLabels(qu);
        return labels.length ? `- ${qu.question} → ${labels.join(", ")}` : null;
      })
      .filter(Boolean) as string[];
    const structured: Record<string, string[]> = {};
    for (const qu of questions) {
      const a = get(qu.id);
      if (a.values.length) structured[qu.id] = a.values;
    }
    onSubmit(lines.length ? lines.join("\n") : null, structured);
  };

  // Options visibles : pour layout, on filtre par device sélectionné
  const visibleOptions = (qu: ClarifyQuestion): ClarifyOption[] => {
    if (qu.type !== "layout-preview" || !deviceAnswer) return qu.options;
    const filtered = qu.options.filter((o) => !o.forDevice || o.forDevice === deviceAnswer);
    return filtered.length ? filtered : qu.options;
  };

  return (
    <div className="w-full max-w-[600px] rounded-2xl border border-[#ECECF2] bg-white shadow-[0_12px_36px_rgba(60,40,120,0.08)] overflow-hidden animate-scale-in">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 border-b border-[#F1F1F5] px-5 py-3.5">
        <p className="text-[13.5px] font-bold leading-snug text-[#0A0A0A]">
          {isRecap ? "Vérifiez vos réponses" : q!.question}
        </p>
        <span className="flex-shrink-0 rounded-full bg-[#F6F6F9] px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-[#9A9AA6]">
          {Math.min(idx + 1, questions.length)}/{questions.length}
        </span>
      </div>

      {/* Corps */}
      <div className="px-3 py-3">
        {isRecap ? (
          // ── Récapitulatif ────────────────────────────────────────────────
          <div className="space-y-3 px-2 py-1">
            {questions.map((qu) => {
              const labels = answeredLabels(qu);
              return (
                <div key={qu.id}>
                  <p className="text-[12px] leading-snug text-[#6E6E6C]">{qu.question}</p>
                  {labels.length ? (
                    <ul className="mt-0.5">
                      {labels.map((l) => (
                        <li key={l} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0A0A0A]">
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500"/>
                          {l}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-[#9A9AA6]">Ignorée</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : q!.type === "color-palette" ? (
          // ── Palettes de couleurs (+ description libre) ───────────────────
          <div>
          <div className="grid grid-cols-2 gap-1.5">
            {q!.options.map((o) => {
              const active = get(q!.id).values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(q!, o.value)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-[#F3EFFC] ring-1 ring-violet-300" : "hover:bg-[#F6F6F9]"}`}
                >
                  <span className={`grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full border transition-all ${active ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4] bg-white"}`}>
                    {active && <Check className="h-3 w-3 text-white" strokeWidth={3.5}/>}
                  </span>
                  {/* Color swatches */}
                  {o.palette && (
                    <span className="flex gap-0.5 flex-shrink-0">
                      {o.palette.map((hex, i) => (
                        <span
                          key={i}
                          className="w-4 h-4 rounded-full border border-white/60 shadow-sm"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className={`block text-[12.5px] leading-snug ${active ? "font-bold text-[#0A0A0A]" : "font-semibold text-[#2A2A32]"}`}>
                      {o.label}
                    </span>
                    {o.hint && <span className="block text-[11px] leading-snug text-[#9A9AA6]">{o.hint}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Palette décrite librement : prise en compte telle quelle à la création */}
          <div className="mt-2 flex items-center gap-3 rounded-xl px-3 py-1.5">
            <span className={`grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full border bg-white ${get(q!.id).custom.trim() ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4]"}`}>
              {get(q!.id).custom.trim() && <Check className="h-3 w-3 text-white" strokeWidth={3.5}/>}
            </span>
            <input
              value={get(q!.id).custom}
              onChange={(e) => setCustom(q!, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (idx >= questions.length - 1) setIdx(questions.length);
                  else setIdx((i) => i + 1);
                }
              }}
              placeholder="Ou décrivez la vôtre : « tons orangés chaleureux »…"
              className="w-full rounded-lg border border-[#E7E7E4] bg-white px-3 py-2 text-[13px] text-[#0A0A0A] placeholder-[#9A9AA6] transition-all focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-violet-500/15"
            />
          </div>
          </div>
        ) : q!.type === "layout-preview" ? (
          // ── Aperçus wireframe ────────────────────────────────────────────
          <div className="grid grid-cols-2 gap-2">
            {visibleOptions(q!).map((o) => {
              const active   = get(q!.id).values.includes(o.value);
              const WfComp   = o.wireframeId ? WIREFRAME_MAP[o.wireframeId] : null;
              const isPortrait = o.forDevice === "mobile";
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(q!, o.value)}
                  className={`flex flex-col rounded-xl overflow-hidden border transition-all text-left ${active ? "border-violet-400 ring-2 ring-violet-200 shadow-[0_4px_16px_rgba(124,58,237,0.15)]" : "border-[#E2E2EA] hover:border-[#C9C9D6]"}`}
                >
                  {/* Wireframe thumbnail */}
                  <div className={`w-full flex items-center justify-center bg-[#F6F6FB] p-2 ${isPortrait ? "h-24" : "h-20"}`}>
                    {WfComp ? (
                      <div className={isPortrait ? "h-full w-auto aspect-[50/82]" : "h-full w-auto aspect-[80/54]"}>
                        <WfComp/>
                      </div>
                    ) : (
                      <div className="w-12 h-8 rounded bg-[#E2E2EA]"/>
                    )}
                  </div>
                  {/* Label */}
                  <div className={`flex items-start gap-2 px-2.5 py-2 ${active ? "bg-[#F3EFFC]" : "bg-white"}`}>
                    <span className={`mt-0.5 grid h-[15px] w-[15px] flex-shrink-0 place-items-center rounded-full border transition-all ${active ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4] bg-white"}`}>
                      {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5}/>}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[12px] leading-snug ${active ? "font-bold text-[#0A0A0A]" : "font-semibold text-[#2A2A32]"}`}>
                        {o.label}
                      </span>
                      {o.hint && <span className="block text-[10.5px] leading-snug text-[#9A9AA6]">{o.hint}</span>}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          // ── Options standard ─────────────────────────────────────────────
          <div className="space-y-1">
            {q!.options.map((o) => {
              const active = get(q!.id).values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(q!, o.value)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-[#F3EFFC]" : "hover:bg-[#F6F6F9]"}`}
                >
                  <span className={`mt-0.5 grid h-[18px] w-[18px] flex-shrink-0 place-items-center border transition-all ${q!.multi ? "rounded-[5px]" : "rounded-full"} ${active ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4] bg-white"}`}>
                    {active && <Check className="h-3 w-3 text-white" strokeWidth={3.5}/>}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13.5px] leading-snug ${active ? "font-bold text-[#0A0A0A]" : "font-semibold text-[#2A2A32]"}`}>
                      {o.label}
                    </span>
                    {o.hint && <span className="block text-[12px] leading-snug text-[#9A9AA6]">{o.hint}</span>}
                  </span>
                </button>
              );
            })}
            {/* Champ libre */}
            <div className="flex items-center gap-3 rounded-xl px-3 py-1.5">
              <span className={`grid h-[18px] w-[18px] flex-shrink-0 place-items-center border bg-white ${q!.multi ? "rounded-[5px]" : "rounded-full"} ${get(q!.id).custom.trim() ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4]"}`}>
                {get(q!.id).custom.trim() && <Check className="h-3 w-3 text-white" strokeWidth={3.5}/>}
              </span>
              <input
                value={get(q!.id).custom}
                onChange={(e) => setCustom(q!, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (idx >= questions.length - 1) setIdx(questions.length); // go to recap
                    else setIdx((i) => i + 1);
                  }
                }}
                placeholder="Rédigez la vôtre… (Entrée pour continuer)"
                className="w-full rounded-lg border border-[#E7E7E4] bg-white px-3 py-2 text-[13px] text-[#0A0A0A] placeholder-[#9A9AA6] transition-all focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-violet-500/15"
              />
            </div>
          </div>
        )}
      </div>

      {/* Pied */}
      <div className="flex items-center justify-between border-t border-[#F1F1F5] px-4 py-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Question précédente"
            className="rounded-lg p-1.5 text-[#6E6E6C] transition-colors hover:bg-[#F6F6F9] hover:text-[#0A0A0A] disabled:opacity-30">
            <ChevronLeft className="h-4 w-4"/>
          </button>
          <button type="button" onClick={() => setIdx((i) => Math.min(questions.length, i + 1))} disabled={isRecap} aria-label="Question suivante"
            className="rounded-lg p-1.5 text-[#6E6E6C] transition-colors hover:bg-[#F6F6F9] hover:text-[#0A0A0A] disabled:opacity-30">
            <ChevronRight className="h-4 w-4"/>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onSubmit(null)}
            className="text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
            Tout ignorer
          </button>
          {isRecap ? (
            <button type="button" onClick={send}
              className="rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 px-5 py-2 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(139,92,246,0.35)] transition-all hover:shadow-[0_8px_24px_rgba(139,92,246,0.5)] active:scale-[0.98]">
              Envoyer
            </button>
          ) : (
            <button type="button" onClick={() => setIdx((i) => i + 1)}
              className="rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 px-5 py-2 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(139,92,246,0.35)] transition-all hover:shadow-[0_8px_24px_rgba(139,92,246,0.5)] active:scale-[0.98]">
              {idx === questions.length - 1 ? "Réviser" : "Suivant"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
