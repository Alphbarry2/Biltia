"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AddressAutocomplete — champ d'adresse géolocalisé, réutilisable.
//
// On tape → suggestions d'adresses RÉELLES (via /api/geo/search, débounce 250 ms)
// → on choisit → l'adresse est découpée (voie / ville / code postal) et géocodée
// (lat/lng), et un point apparaît sur une mini-carte. Bouton « ma position » pour
// remplir depuis le GPS du téléphone (géocodage inverse).
//
// Contrôlé : le parent détient `value` (la voie) et `lat`/`lng`. `onTextChange`
// suit la frappe libre ; `onPick` livre l'adresse structurée choisie.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, LocateFixed, Search, X } from "lucide-react";
import { getCurrentPosition } from "@/lib/integrations";
import { SiteMap } from "@/components/site-map";

export type GeoPick = {
  label: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
};

export function AddressAutocomplete({
  value,
  lat,
  lng,
  onTextChange,
  onPick,
  onClear,
  inputClassName,
  placeholder,
  locale,
}: {
  value: string;
  lat: number | null;
  lng: number | null;
  onTextChange: (v: string) => void;
  onPick: (p: GeoPick) => void;
  /** Efface le point géolocalisé (croix sur la carte, ou reprise de la frappe). */
  onClear?: () => void;
  inputClassName: string;
  placeholder?: string;
  locale: "fr" | "en";
}) {
  const t = (fr: string, en: string) => (locale === "en" ? en : fr);
  const [items, setItems] = useState<GeoPick[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const justPicked = useRef(false);
  const acRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recherche débouncée — UNIQUEMENT sur frappe utilisateur (champ focus), jamais
  // au montage d'une fiche pré-remplie (édition) ni juste après un choix.
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (!focusedRef.current) return;

    const q = value.trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 3) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        const j = await res.json();
        const list: GeoPick[] = Array.isArray(j.results) ? j.results : [];
        setItems(list);
        setOpen(list.length > 0);
        setActive(-1);
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") {
          setItems([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Ferme la liste au clic à l'extérieur.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (s: GeoPick) => {
    justPicked.current = true;
    onPick(s);
    onTextChange(s.street || s.label);
    setItems([]);
    setOpen(false);
    setActive(-1);
    setErr(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const useMyLocation = async () => {
    setErr(null);
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      let picked: GeoPick = {
        label: "",
        street: "",
        postcode: "",
        city: "",
        country: "",
        lat: pos.lat,
        lng: pos.lng,
      };
      try {
        const res = await fetch(`/api/geo/reverse?lat=${pos.lat}&lng=${pos.lng}`);
        const j = await res.json();
        if (j.result) picked = { ...(j.result as GeoPick), lat: pos.lat, lng: pos.lng };
      } catch {
        /* adresse introuvable : on garde au moins le point GPS */
      }
      justPicked.current = true;
      onPick(picked);
      onTextChange(picked.street || picked.label || value);
      setOpen(false);
    } catch (e) {
      setErr((e as Error)?.message ?? t("Position indisponible.", "Location unavailable."));
    } finally {
      setLocating(false);
    }
  };

  // Padding horizontal remplacé (icône loupe à gauche, boutons à droite).
  const inputCls = /\bpx-[\d.]+\b/.test(inputClassName)
    ? inputClassName.replace(/\bpx-[\d.]+\b/, "pl-9 pr-10")
    : `${inputClassName} pl-9 pr-10`;

  const hasPin = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const secondaryLine = (s: GeoPick) =>
    [s.postcode, s.city, s.country && s.country !== "France" ? s.country : ""]
      .filter(Boolean)
      .join(" ");

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B4B8C2]" />
        <input
          type="text"
          value={value}
          placeholder={placeholder ?? t("Commencez à taper une adresse…", "Start typing an address…")}
          onChange={(e) => {
            onTextChange(e.target.value);
            // Reprendre la saisie invalide l'ancien point : la carte disparaît
            // (elle reviendra au prochain choix). Évite une carte « fantôme ».
            if (hasPin) onClear?.();
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            focusedRef.current = true;
            if (items.length) setOpen(true);
          }}
          onBlur={() => {
            focusedRef.current = false;
          }}
          className={inputCls}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          title={t("Utiliser ma position", "Use my location")}
          aria-label={t("Utiliser ma position", "Use my location")}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
        </button>
        {loading && (
          <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-violet-400" />
        )}
      </div>

      {open && items.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-[130] mt-1.5 w-full max-h-64 overflow-auto rounded-xl border border-[#E7E7EE] bg-white shadow-[0_20px_50px_rgba(20,20,50,0.18)] py-1"
        >
          {items.map((s, i) => (
            <li
              key={`${s.label}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // garde le focus input (évite le blur avant le clic)
                choose(s);
              }}
              className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer ${
                i === active ? "bg-violet-50" : "hover:bg-[#FAFAFC]"
              }`}
            >
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-violet-500" />
              <span className="min-w-0">
                <span className="block text-[13px] text-[#0A0A0A] truncate">{s.street || s.label}</span>
                {secondaryLine(s) && (
                  <span className="block text-[11.5px] text-[#8A8A94] truncate">{secondaryLine(s)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {err && <p className="mt-1.5 text-[12px] text-rose-600">{err}</p>}

      {hasPin && !open && (
        <div className="mt-2.5">
          <div className="relative">
            <SiteMap
              points={[{ lat: lat as number, lng: lng as number, label: value }]}
              zoom={16}
              className="h-40 w-full rounded-xl overflow-hidden border border-[#E7E7EE]"
            />
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                title={t("Retirer le point", "Remove pin")}
                aria-label={t("Retirer le point", "Remove pin")}
                className="absolute top-2 right-2 z-[400] grid place-items-center w-7 h-7 rounded-lg bg-white/95 text-[#5A5A66] shadow-md hover:text-[#0A0A0A] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-[#8A8A94]">
            <MapPin className="w-3 h-3 text-emerald-500" />
            {t("Point géolocalisé", "Geolocated point")} · {(lat as number).toFixed(5)}, {(lng as number).toFixed(5)}
          </p>
        </div>
      )}
    </div>
  );
}
