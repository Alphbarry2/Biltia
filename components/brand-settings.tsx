"use client";

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITÉ VISUELLE — l'artisan pose son logo, ses couleurs, ses mentions.
//
// Ce n'est pas de la décoration : ces éléments partent sur ses DEVIS et ses
// FACTURES, chez ses clients. D'où l'aperçu en direct — il doit voir ce que son
// client verra, avant d'envoyer, pas après.
//
// Écriture : le logo passe par /api/brand/logo (bucket protégé, service_role) ;
// le reste va dans tenants.company_info.brand via RLS (owner/admin).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { brandFromTenant, brandGaps, readableOn, normalizeHex, DEFAULT_PRIMARY, type BrandKit } from "@/lib/brand";

type Props = {
  tenantId: string | null;
  /** Réservé aux patrons : l'identité part sur TOUS les devis, ce n'est pas une
   *  préférence personnelle. */
  canEdit: boolean;
  t: (fr: string, en: string) => string;
};

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Les champs libres du Brand Kit, tels que stockés dans company_info.brand. */
type BrandForm = {
  primary: string;
  accent: string;
  phone: string;
  email: string;
  website: string;
  rcs: string;
  ape: string;
  capital: string;
  assurance: string;
  iban: string;
  bic: string;
  conditions_paiement: string;
  footer: string;
};

const EMPTY: BrandForm = {
  primary: DEFAULT_PRIMARY,
  accent: DEFAULT_PRIMARY,
  phone: "",
  email: "",
  website: "",
  rcs: "",
  ape: "",
  capital: "",
  assurance: "",
  iban: "",
  bic: "",
  conditions_paiement: "",
  footer: "",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  hint,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  textarea?: boolean;
}) {
  const cls =
    "mt-1.5 w-full rounded-xl border border-[#ECECF0] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] outline-none transition placeholder:text-[#B4B4BE] focus:border-[#6E56CF] disabled:bg-[#F6F6F8] disabled:text-[#9A9AA6]";
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[#63636B]">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          className={cls}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cls}
        />
      )}
      {hint ? <span className="mt-1 block text-[11px] text-[#9A9AA6]">{hint}</span> : null}
    </label>
  );
}

export default function BrandSettings({ tenantId, canEdit, t }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<BrandForm>(EMPTY);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [kit, setKit] = useState<BrandKit | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const set = <K extends keyof BrandForm>(k: K, v: BrandForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("tenants")
      .select("name, logo_url, company_info")
      .eq("id", tenantId)
      .maybeSingle();

    const row = (data ?? {}) as { name?: string; logo_url?: string | null; company_info?: unknown };
    const b = ((row.company_info as { brand?: Record<string, unknown> } | null)?.brand ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");

    setForm({
      primary: normalizeHex(b.primary, DEFAULT_PRIMARY),
      accent: normalizeHex(b.accent, DEFAULT_PRIMARY),
      phone: s("phone"),
      email: s("email"),
      website: s("website"),
      rcs: s("rcs"),
      ape: s("ape"),
      capital: s("capital"),
      assurance: s("assurance"),
      iban: s("iban"),
      bic: s("bic"),
      conditions_paiement: s("conditions_paiement"),
      footer: s("footer"),
    });
    setLogoUrl(row.logo_url ?? null);
    setCompanyName(row.name ?? "");
    setKit(brandFromTenant(row));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPickLogo(file: File) {
    setMsg(null);
    if (file.size > MAX_LOGO_BYTES) {
      setMsg({ kind: "err", text: t("Le logo doit peser moins de 2 Mo.", "The logo must be under 2 MB.") });
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });

      const res = await fetch("/api/brand/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: file.type, data: dataUrl }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; logoUrl?: string; error?: string };
      if (!res.ok || !json.ok || !json.logoUrl) {
        setMsg({ kind: "err", text: json.error || t("Envoi impossible.", "Upload failed.") });
        return;
      }
      setLogoUrl(json.logoUrl);
      setKit((k) => (k ? { ...k, logoUrl: json.logoUrl! } : k));
      setMsg({ kind: "ok", text: t("Logo enregistré.", "Logo saved.") });
    } catch {
      setMsg({ kind: "err", text: t("Envoi impossible.", "Upload failed.") });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    setMsg(null);
    setUploading(true);
    try {
      const res = await fetch("/api/brand/logo", { method: "DELETE" });
      if (!res.ok) {
        setMsg({ kind: "err", text: t("Suppression impossible.", "Could not remove.") });
        return;
      }
      setLogoUrl(null);
      setKit((k) => (k ? { ...k, logoUrl: null } : k));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!tenantId || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const supabase = createClient();
      // On refusionne le JSON complet : company_info porte aussi la fiche
      // entreprise (SIRET, TVA, adresse) et les réponses d'inscription.
      const { data } = await supabase.from("tenants").select("company_info").eq("id", tenantId).maybeSingle();
      const full = ((data?.company_info ?? {}) as Record<string, unknown>) || {};

      const brand: BrandForm = {
        ...form,
        primary: normalizeHex(form.primary, DEFAULT_PRIMARY),
        accent: normalizeHex(form.accent, DEFAULT_PRIMARY),
      };

      const { error } = await supabase
        .from("tenants")
        .update({ company_info: { ...full, brand } })
        .eq("id", tenantId);
      if (error) throw error;

      setForm(brand);
      await load();
      setMsg({ kind: "ok", text: t("Identité visuelle enregistrée.", "Visual identity saved.") });
    } catch {
      setMsg({
        kind: "err",
        text: t(
          "Échec (seuls Propriétaire et Admin peuvent modifier).",
          "Failed (only Owner and Admin can edit)."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-[#F6F6F8]" />;
  }

  const primary = normalizeHex(form.primary, DEFAULT_PRIMARY);
  const accent = normalizeHex(form.accent, DEFAULT_PRIMARY);
  const onPrimary = readableOn(primary);
  // Le kit vient de la BASE (donc les champs déjà enregistrés), mais on y injecte
  // les couleurs EN COURS d'édition pour que l'aperçu réagisse au color-picker.
  const gaps = kit ? brandGaps({ ...kit, logoUrl }) : [];

  return (
    <div className="space-y-5">
      {/* Aperçu : ce que le client verra en haut du devis */}
      <div className="overflow-hidden rounded-2xl border border-[#ECECF0] bg-white">
        <div style={{ background: primary }} className="h-1.5 w-full" />
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-10 w-auto max-w-[150px] object-contain" />
          ) : (
            <div className="text-base font-extrabold text-[#0A0A0A]">{companyName || "—"}</div>
          )}
          <div className="text-right text-[11px] leading-relaxed text-[#63636B]">
            {logoUrl && companyName ? <div className="font-bold text-[#0A0A0A]">{companyName}</div> : null}
            {form.phone || form.email ? <div>{[form.phone, form.email].filter(Boolean).join(" · ")}</div> : null}
          </div>
        </div>
        <div className="flex items-end justify-between px-5 pb-4 pt-4">
          <div>
            <div className="text-xl font-extrabold tracking-tight" style={{ color: primary }}>
              DEVIS
            </div>
            <div className="text-sm font-bold text-[#0A0A0A]">D-2026-001</div>
          </div>
          <div
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: accent }}
          >
            {t("Aperçu", "Preview")}
          </div>
        </div>
        <div className="px-5 pb-5">
          <div
            className="flex items-center justify-between rounded-lg px-4 py-2.5"
            style={{ background: primary, color: onPrimary }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest">{t("Total TTC", "Total incl. VAT")}</span>
            <span className="text-base font-extrabold">7 686,00 €</span>
          </div>
        </div>
      </div>

      {gaps.length ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#FEC84B] bg-[#FFFAEB] px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B54708]" />
          <p className="text-[13px] leading-relaxed text-[#93370D]">
            {t("Il manque sur vos documents : ", "Missing on your documents: ")}
            <strong>{gaps.join(", ")}</strong>.{" "}
            {t(
              "Un devis incomplet se défend mal auprès d'un client.",
              "An incomplete quote is hard to defend with a client."
            )}
          </p>
        </div>
      ) : null}

      {/* Logo */}
      <div className="rounded-2xl border border-[#ECECF0] bg-white p-5">
        <h3 className="text-sm font-bold text-[#0A0A0A]">{t("Logo", "Logo")}</h3>
        <p className="mt-1 text-[13px] text-[#63636B]">
          {t(
            "PNG ou JPEG, 2 Mo maximum. Il apparaît en haut de vos devis, factures et emails.",
            "PNG or JPEG, 2 MB max. It appears at the top of your quotes, invoices and emails."
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickLogo(f);
            }}
          />
          <button
            type="button"
            disabled={!canEdit || uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#1F1F23] disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploading
              ? t("Envoi…", "Uploading…")
              : logoUrl
                ? t("Remplacer le logo", "Replace logo")
                : t("Choisir un logo", "Choose a logo")}
          </button>
          {logoUrl ? (
            <button
              type="button"
              disabled={!canEdit || uploading}
              onClick={() => void removeLogo()}
              className="inline-flex items-center gap-2 rounded-xl border border-[#ECECF0] px-4 py-2.5 text-[13px] font-bold text-[#63636B] transition hover:text-[#0A0A0A] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {t("Retirer", "Remove")}
            </button>
          ) : null}
        </div>
      </div>

      {/* Couleurs */}
      <div className="rounded-2xl border border-[#ECECF0] bg-white p-5">
        <h3 className="text-sm font-bold text-[#0A0A0A]">{t("Couleurs", "Colors")}</h3>
        <p className="mt-1 text-[13px] text-[#63636B]">
          {t(
            "Par défaut, vos documents sont en noir et blanc — toujours élégant. Choisissez vos couleurs pour les personnaliser.",
            "By default your documents are black and white — always elegant. Pick your colors to personalize them."
          )}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {([
            ["primary", t("Couleur principale", "Primary color"), t("Bandeau, titres, total TTC.", "Band, titles, total.")],
            ["accent", t("Couleur secondaire", "Accent color"), t("Intitulés, liserés.", "Labels, accents.")],
          ] as const).map(([key, label, hint]) => (
            <div key={key}>
              <span className="text-xs font-semibold text-[#63636B]">{label}</span>
              <div className="mt-1.5 flex items-center gap-2.5">
                <input
                  type="color"
                  value={normalizeHex(form[key], DEFAULT_PRIMARY)}
                  disabled={!canEdit}
                  onChange={(e) => set(key, e.target.value)}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[#ECECF0] bg-white p-1 disabled:opacity-50"
                />
                <input
                  type="text"
                  value={form[key]}
                  disabled={!canEdit}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder="#111114"
                  className="w-full rounded-xl border border-[#ECECF0] bg-white px-3.5 py-2.5 font-mono text-sm text-[#0A0A0A] outline-none transition focus:border-[#6E56CF] disabled:bg-[#F6F6F8]"
                />
              </div>
              <span className="mt-1 block text-[11px] text-[#9A9AA6]">{hint}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Coordonnées affichées sur les documents */}
      <div className="rounded-2xl border border-[#ECECF0] bg-white p-5">
        <h3 className="text-sm font-bold text-[#0A0A0A]">{t("Coordonnées", "Contact details")}</h3>
        <p className="mt-1 text-[13px] text-[#63636B]">
          {t("Affichées en haut de vos documents et dans la signature de vos emails.", "Shown at the top of your documents and in your email signature.")}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label={t("Téléphone", "Phone")} value={form.phone} onChange={(v) => set("phone", v)} placeholder="06 12 34 56 78" disabled={!canEdit} />
          <Field label={t("Email", "Email")} value={form.email} onChange={(v) => set("email", v)} placeholder="contact@entreprise.fr" disabled={!canEdit} />
          <Field label={t("Site web", "Website")} value={form.website} onChange={(v) => set("website", v)} placeholder="entreprise.fr" disabled={!canEdit} />
        </div>
      </div>

      {/* Mentions légales */}
      <div className="rounded-2xl border border-[#ECECF0] bg-white p-5">
        <h3 className="text-sm font-bold text-[#0A0A0A]">{t("Mentions légales", "Legal information")}</h3>
        <p className="mt-1 text-[13px] text-[#63636B]">
          {t(
            "Le SIRET, la TVA et l'adresse viennent de l'onglet Entreprise. Complétez ici le reste du pied de page.",
            "SIRET, VAT and address come from the Company tab. Complete the rest of the footer here."
          )}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="RCS" value={form.rcs} onChange={(v) => set("rcs", v)} placeholder="Marseille B 912 345 678" disabled={!canEdit} />
          <Field label={t("Code APE", "APE code")} value={form.ape} onChange={(v) => set("ape", v)} placeholder="4321A" disabled={!canEdit} />
          <Field label={t("Capital social", "Share capital")} value={form.capital} onChange={(v) => set("capital", v)} placeholder="10 000 €" disabled={!canEdit} />
        </div>
        <div className="mt-4">
          <Field
            label={t("Assurance décennale", "Ten-year liability insurance")}
            value={form.assurance}
            onChange={(v) => set("assurance", v)}
            placeholder={t("AXA France — contrat n° 4412887 — France entière", "AXA France — policy no. 4412887 — nationwide")}
            disabled={!canEdit}
            hint={t(
              "Obligatoire sur un devis BTP en France : assureur, n° de contrat et zone couverte.",
              "Mandatory on a French construction quote: insurer, policy number and coverage area."
            )}
          />
        </div>
      </div>

      {/* Paiement */}
      <div className="rounded-2xl border border-[#ECECF0] bg-white p-5">
        <h3 className="text-sm font-bold text-[#0A0A0A]">{t("Règlement", "Payment")}</h3>
        <p className="mt-1 text-[13px] text-[#63636B]">
          {t("L'IBAN n'apparaît que sur les FACTURES, jamais sur un devis.", "The IBAN only appears on INVOICES, never on a quote.")}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="IBAN" value={form.iban} onChange={(v) => set("iban", v)} placeholder="FR76 3000 1007 9412 3456 7890 185" disabled={!canEdit} />
          <Field label="BIC" value={form.bic} onChange={(v) => set("bic", v)} placeholder="BDFEFRPPCCT" disabled={!canEdit} />
        </div>
        <div className="mt-4">
          <Field
            label={t("Conditions de règlement", "Payment terms")}
            value={form.conditions_paiement}
            onChange={(v) => set("conditions_paiement", v)}
            placeholder={t(
              "Acompte de 30 % à la commande, solde à réception des travaux.",
              "30% deposit on order, balance on completion."
            )}
            disabled={!canEdit}
            textarea
            hint={t(
              "Utilisées quand le document n'a pas ses propres conditions.",
              "Used when the document has no conditions of its own."
            )}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canEdit || saving}
          className="rounded-xl bg-[#0A0A0A] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#1F1F23] disabled:opacity-50"
        >
          {saving ? t("Enregistrement…", "Saving…") : t("Enregistrer", "Save")}
        </button>
        {msg ? (
          <span
            className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${
              msg.kind === "ok" ? "text-[#067647]" : "text-[#D92D20]"
            }`}
          >
            {msg.kind === "ok" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {msg.text}
          </span>
        ) : null}
        {!canEdit ? (
          <span className="text-[13px] text-[#9A9AA6]">
            {t("Seuls le Propriétaire et l'Admin peuvent modifier l'identité visuelle.", "Only Owner and Admin can change the visual identity.")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
