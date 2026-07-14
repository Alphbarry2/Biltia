"use client";

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITÉ VISUELLE — logo, UNE couleur, téléphone, email. Quatre champs.
//
// C'est une identité visuelle, pas une fiche d'entreprise : le SIRET / n° BCE,
// la TVA et l'adresse sont déjà dans l'onglet Entreprise (qui s'adapte au pays)
// et les documents vont les y chercher. On ne redemande rien.
//
// Règle tenue dans l'aperçu : tout ce qu'on demande ici SE VOIT sur le document.
// Un champ qu'on saisit sans jamais le retrouver nulle part n'a pas lieu d'être.
//
// Écriture : le logo passe par /api/brand/logo (bucket protégé, service_role) ;
// la couleur et les coordonnées vont dans tenants.company_info.brand (RLS owner/admin).
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

type BrandForm = { primary: string; phone: string; email: string };

/** Quelques couleurs sûres, pour l'artisan qui n'a pas envie d'ouvrir un
 *  sélecteur de couleur — le cas le plus fréquent. Le noir reste le défaut. */
const PRESETS = ["#111114", "#0B4F6C", "#1F6F43", "#B54708", "#8B2942", "#3B3A6B"];

export default function BrandSettings({ tenantId, canEdit, t }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<BrandForm>({ primary: DEFAULT_PRIMARY, phone: "", email: "" });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [kit, setKit] = useState<BrandKit | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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

    setForm({
      primary: normalizeHex(b.primary, DEFAULT_PRIMARY),
      phone: typeof b.phone === "string" ? b.phone : "",
      email: typeof b.email === "string" ? b.email : "",
    });
    setLogoUrl(row.logo_url ?? null);
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
      // On refusionne le JSON COMPLET : company_info porte aussi la fiche
      // entreprise (pays, SIRET/BCE, TVA, adresse) et les réponses d'inscription.
      const { data } = await supabase.from("tenants").select("company_info").eq("id", tenantId).maybeSingle();
      const full = ((data?.company_info ?? {}) as Record<string, unknown>) || {};

      const brand = {
        primary: normalizeHex(form.primary, DEFAULT_PRIMARY),
        phone: form.phone.trim(),
        email: form.email.trim(),
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

  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-[#F6F6F8]" />;

  const primary = normalizeHex(form.primary, DEFAULT_PRIMARY);
  const onPrimary = readableOn(primary);
  const entreprise = kit?.entreprise ?? "";
  const gaps = kit ? brandGaps({ ...kit, logoUrl }) : [];
  const inputCls =
    "mt-1.5 w-full rounded-xl border border-[#ECECF0] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] outline-none transition placeholder:text-[#B4B4BE] focus:border-[#6E56CF] disabled:bg-[#F6F6F8] disabled:text-[#9A9AA6]";

  return (
    <div className="space-y-5">
      {/* Aperçu : le haut du devis tel que le client le recevra. Tout ce qu'on
          demande ci-dessous s'y retrouve — logo, couleur, téléphone, email. */}
      <div className="overflow-hidden rounded-2xl border border-[#ECECF0] bg-white">
        <div style={{ background: primary }} className="h-1.5 w-full" />
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-10 w-auto max-w-[150px] object-contain" />
          ) : (
            <div className="text-base font-extrabold text-[#0A0A0A]">{entreprise || "—"}</div>
          )}
          <div className="text-right text-[11px] leading-relaxed text-[#63636B]">
            {logoUrl && entreprise ? <div className="font-bold text-[#0A0A0A]">{entreprise}</div> : null}
            {kit?.address ? <div>{kit.address}</div> : null}
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
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#B4B4BE]">
            {t("Aperçu", "Preview")}
          </div>
        </div>
        <div className="px-5 pb-5">
          <div
            className="flex items-center justify-between rounded-lg px-4 py-2.5"
            style={{ background: primary, color: onPrimary }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {t("Total TTC", "Total incl. VAT")}
            </span>
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
              "Le reste se remplit dans l'onglet Entreprise.",
              "The rest is filled in the Company tab."
            )}
          </p>
        </div>
      ) : null}

      {/* Logo */}
      <div className="rounded-2xl border border-[#ECECF0] bg-white p-5">
        <h3 className="text-sm font-bold text-[#0A0A0A]">{t("Logo", "Logo")}</h3>
        <p className="mt-1 text-[13px] text-[#63636B]">
          {t("PNG ou JPEG, 2 Mo maximum.", "PNG or JPEG, 2 MB max.")}
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
                ? t("Remplacer", "Replace")
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

      {/* Couleur — une seule */}
      <div className="rounded-2xl border border-[#ECECF0] bg-white p-5">
        <h3 className="text-sm font-bold text-[#0A0A0A]">{t("Couleur", "Color")}</h3>
        <p className="mt-1 text-[13px] text-[#63636B]">
          {t(
            "Par défaut vos documents sont en noir — toujours élégant.",
            "By default your documents are black — always elegant."
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={!canEdit}
              onClick={() => setForm((f) => ({ ...f, primary: c }))}
              aria-label={c}
              className={`h-9 w-9 rounded-full transition disabled:opacity-50 ${
                primary === c ? "ring-2 ring-[#0A0A0A] ring-offset-2" : "hover:scale-110"
              }`}
              style={{ background: c }}
            />
          ))}
          <label className="ml-1 inline-flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#63636B]">{t("Autre", "Other")}</span>
            <input
              type="color"
              value={primary}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, primary: e.target.value }))}
              className="h-9 w-11 cursor-pointer rounded-lg border border-[#ECECF0] bg-white p-1 disabled:opacity-50"
            />
          </label>
        </div>
      </div>

      {/* Coordonnées — les deux seules qui s'affichent sur le document */}
      <div className="rounded-2xl border border-[#ECECF0] bg-white p-5">
        <h3 className="text-sm font-bold text-[#0A0A0A]">{t("Contact", "Contact")}</h3>
        <p className="mt-1 text-[13px] text-[#63636B]">
          {t(
            "Affiché en haut de vos documents et sous vos emails, pour que le client puisse vous joindre.",
            "Shown at the top of your documents and under your emails, so the client can reach you."
          )}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-[#63636B]">{t("Téléphone", "Phone")}</span>
            <input
              type="text"
              value={form.phone}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="06 12 34 56 78"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-[#63636B]">{t("Email", "Email")}</span>
            <input
              type="email"
              value={form.email}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="contact@entreprise.fr"
              className={inputCls}
            />
          </label>
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
            {t(
              "Seuls le Propriétaire et l'Admin peuvent modifier l'identité visuelle.",
              "Only Owner and Admin can change the visual identity."
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
