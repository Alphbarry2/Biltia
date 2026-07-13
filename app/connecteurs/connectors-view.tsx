"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PAGE PUBLIQUE /connecteurs — « ce que chaque outil peut faire, et ce qu'il ne
// peut pas faire ».
//
// Tout le contenu DÉRIVE de lib/connectors.ts (can / cannot / scopeNote /
// status). Aucune promesse en dur ici : si un connecteur n'est pas branché, il
// est dans la section « En cours », et il y reste tant que le code n'existe pas.
// ─────────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import {
  Check,
  X,
  Lock,
  ArrowRight,
  ShieldCheck,
  Unplug,
  EyeOff,
  Smartphone,
  FileSpreadsheet,
  MessageSquare,
  Puzzle,
} from "lucide-react";
import {
  LIVE_CONNECTORS,
  SOON_CONNECTORS,
  connectorName,
  connectorDesc,
  connectorWorks,
  connectorCan,
  connectorCannot,
  connectorScopeNote,
  type Connector,
} from "@/lib/connectors";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter, BLACK } from "@/components/site";
import { useT, useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";

// ── Icône de secours (exports, téléphone, SMS n'ont pas de logo de marque) ────
function FallbackIcon({ id, className = "w-5 h-5" }: { id: string; className?: string }) {
  if (id === "phone") return <Smartphone className={className} />;
  if (id === "sms") return <MessageSquare className={className} />;
  if (id.startsWith("export")) return <FileSpreadsheet className={className} />;
  return <Puzzle className={className} />;
}

function ConnectorLogo({ c, size = 44, dim = false }: { c: Connector; size?: number; dim?: boolean }) {
  const t = useT();
  const inner = Math.round(size * 0.55);
  return (
    <span
      className={`flex items-center justify-center flex-shrink-0 rounded-2xl border border-[#EDEAF4] bg-white shadow-[0_2px_8px_rgba(60,40,120,0.05)] ${dim ? "grayscale opacity-60" : ""}`}
      style={{ width: size, height: size }}
    >
      {c.logo ? (
        <Image
          src={c.logo}
          alt={t(`Logo ${c.name}`, `${c.name} logo`)}
          width={inner}
          height={inner}
          style={{ width: inner, height: inner }}
          className="object-contain"
        />
      ) : (
        <FallbackIcon id={c.id} className="text-[#7C3AED]" />
      )}
    </span>
  );
}

// ── Carte d'un connecteur actif : pouvoirs, limites, droit exact demandé ──────
function LiveCard({ c, locale, tr }: { c: Connector; locale: Locale; tr: (fr: string, en: string) => string }) {
  const can = connectorCan(c, locale);
  const cannot = connectorCannot(c, locale);
  const note = connectorScopeNote(c, locale);
  const works = connectorWorks(c, locale);

  return (
    <Spot className="glass rounded-[26px] border border-[#ECE7F6] bg-white/70 p-6 sm:p-7 h-full flex flex-col">
      <div className="flex items-start gap-4">
        <ConnectorLogo c={c} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[19px] font-bold text-[#0A0A0A] tracking-[-0.01em]">{connectorName(c, locale)}</h3>
            {c.kind === "oauth" ? (
              <span className="rounded-full border border-[#E2D9F8] bg-[#F3EFFC] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#7C3AED]">
                {tr("Connexion requise", "Connection required")}
              </span>
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-600">
                {tr("Intégré", "Built-in")}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[#5B5B66]">{connectorDesc(c, locale)}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-emerald-600">
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
            {tr("Ce qu'il peut faire", "What it can do")}
          </p>
          <ul className="space-y-2">
            {can.map((line, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-[#3A3A46]">
                <Check className="mt-[3px] w-3.5 h-3.5 flex-shrink-0 text-emerald-500" strokeWidth={3} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-[#9A9AA6]">
            <X className="w-3.5 h-3.5" strokeWidth={3} />
            {tr("Ce qu'il ne peut pas faire", "What it cannot do")}
          </p>
          <ul className="space-y-2">
            {cannot.map((line, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-[#7A7A86]">
                <X className="mt-[3px] w-3.5 h-3.5 flex-shrink-0 text-[#C4C4CE]" strokeWidth={3} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {note && (
        <div className="mt-6 flex gap-2.5 rounded-2xl border border-[#E6E1F0] bg-[#F8F7FC] px-4 py-3">
          <Lock className="mt-[2px] w-3.5 h-3.5 flex-shrink-0 text-[#7C3AED]" />
          <p className="text-[12.5px] leading-relaxed text-[#5B5B66]">{note}</p>
        </div>
      )}

      {c.kind === "oauth" && works && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#9A9AA6]">{works}</p>
      )}

      <div className="mt-auto" />
    </Spot>
  );
}

// ── Carte « en cours » : ce qu'il fera, ce qui couvre le besoin en attendant ──
function SoonCard({ c, locale, tr }: { c: Connector; locale: Locale; tr: (fr: string, en: string) => string }) {
  const will = connectorCan(c, locale);
  const meanwhile = connectorCannot(c, locale)[0];

  return (
    <div className="rounded-[22px] border border-dashed border-[#E0DCE9] bg-white/50 p-5 h-full flex flex-col">
      <div className="flex items-center gap-3">
        <ConnectorLogo c={c} size={36} dim />
        <span className="text-[15px] font-semibold text-[#5B5B66]">{connectorName(c, locale)}</span>
        <span className="ml-auto rounded-full border border-[#E4E4EA] bg-[#F5F5F7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8B8B96]">
          {tr("Bientôt", "Soon")}
        </span>
      </div>

      <ul className="mt-4 space-y-1.5">
        {will.map((line, i) => (
          <li key={i} className="text-[13px] leading-relaxed text-[#7A7A86]">
            {line}
          </li>
        ))}
      </ul>

      {meanwhile && (
        <p className="mt-4 rounded-xl bg-[#F6F4FB] px-3 py-2 text-[12.5px] leading-relaxed text-[#5B5B66]">
          {meanwhile}
        </p>
      )}
    </div>
  );
}

export default function ConnectorsView() {
  const tr = useT();
  const locale = useLocale();

  const principles = [
    {
      icon: EyeOff,
      title: tr("Le strict minimum", "The bare minimum"),
      body: tr(
        "Biltia ne demande que le droit dont il a besoin, et rien de plus. Le droit d'envoyer un email ne donne pas celui de les lire. C'est Google qui l'impose, pas nous qui le promettons.",
        "Biltia asks for the one permission it needs, and nothing else. The right to send an email does not grant the right to read them. That is enforced by Google, not merely promised by us.",
      ),
    },
    {
      icon: Unplug,
      title: tr("Débranchable en un clic", "Unplug in one click"),
      body: tr(
        "Vous coupez l'accès quand vous voulez, depuis Biltia ou depuis votre compte Google. Vos apps, vos données et vos documents restent intacts.",
        "You cut access whenever you want, from Biltia or from your Google account. Your apps, your data and your documents stay intact.",
      ),
    },
    {
      icon: ShieldCheck,
      title: tr("Jamais pour entraîner une IA", "Never to train an AI"),
      body: tr(
        "Ce qui transite par un connecteur sert à faire votre travail, point. Données hébergées en France, isolées par entreprise, jamais utilisées pour entraîner des modèles.",
        "Whatever passes through a connector serves your work, full stop. Data hosted in France, isolated per company, never used to train models.",
      ),
    },
  ];

  const faq = [
    {
      q: tr("Biltia peut-il lire mes emails ?", "Can Biltia read my email?"),
      a: tr(
        "Non, et ce n'est pas qu'une question de confiance : le droit que Biltia demande à Google (gmail.send) n'ouvre aucun accès en lecture. Même en le voulant, Biltia ne pourrait pas ouvrir votre boîte de réception.",
        "No, and it is not a matter of trust: the permission Biltia requests from Google (gmail.send) opens no read access at all. Even if it wanted to, Biltia could not open your inbox.",
      ),
    },
    {
      q: tr("Que se passe-t-il si je ne connecte rien ?", "What happens if I connect nothing?"),
      a: tr(
        "Biltia fonctionne. Les emails partent depuis son adresse d'expédition, les rendez-vous s'ajoutent avec un fichier .ics, les documents se téléchargent en PDF. Connecter vos outils ne débloque pas le produit : ça le rend automatique, et ça fait partir vos emails de chez vous.",
        "Biltia works. Emails go out from its sending address, appointments are added with an .ics file, documents download as PDFs. Connecting your tools does not unlock the product: it makes it automatic, and it makes your emails leave from your own address.",
      ),
    },
    {
      q: tr("Mes agents peuvent-ils envoyer sans moi ?", "Can my agents send without me?"),
      a: tr(
        "Par email, oui, c'est tout l'intérêt : la relance de devis part le mardi matin sans que vous y pensiez. Par WhatsApp, non : le message est préparé, mais c'est vous qui appuyez sur envoyer.",
        "By email, yes, that is the whole point: the quote follow-up goes out on Tuesday morning without you thinking about it. By WhatsApp, no: the message is prepared, but you are the one who taps send.",
      ),
    },
    {
      q: tr("Et mon logiciel de compta ?", "What about my accounting software?"),
      a: tr(
        "Pas de connecteur natif Batigest, EBP ou Pennylane aujourd'hui. L'export CSV et Excel sort tout votre workspace, et se ré-importe dans la quasi-totalité des logiciels du marché.",
        "No native Batigest, EBP or Pennylane connector today. The CSV and Excel export pulls your whole workspace, and re-imports into nearly every package on the market.",
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] antialiased overflow-x-hidden">
      <InteractiveMesh />
      <SiteNav />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative px-5 sm:px-8 pt-32 sm:pt-40 pb-14">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal>
            <div className="glass inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full mb-7">
              <span className="flex -space-x-1.5">
                {LIVE_CONNECTORS.filter((c) => c.logo).map((c) => (
                  <span
                    key={c.id}
                    className="w-[18px] h-[18px] rounded-full bg-white border border-[#ECECF2] flex items-center justify-center overflow-hidden"
                  >
                    <Image src={c.logo!} alt={c.name} width={12} height={12} className="w-3 h-3 object-contain" />
                  </span>
                ))}
              </span>
              <span className="text-[13px] font-medium text-[#4A4A56]">
                {tr("Vos outils, sans mauvaise surprise", "Your tools, no nasty surprises")}
              </span>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="text-[38px] sm:text-[54px] leading-[1.05] font-bold tracking-[-0.03em]">
              {tr("Ce que Biltia fait avec vos outils.", "What Biltia does with your tools.")}
              <br />
              <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                {tr("Et ce qu'il ne fait pas.", "And what it does not.")}
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 text-[16.5px] sm:text-[18px] leading-relaxed text-[#5B5B66] max-w-2xl mx-auto">
              {tr(
                "Un outil qui touche à votre messagerie, ça se mérite. Alors voici, connecteur par connecteur, ce que Biltia peut faire, ce qu'il ne peut pas faire, et le droit exact qu'il demande.",
                "A tool that touches your mailbox has to earn it. So here it is, connector by connector: what Biltia can do, what it cannot do, and the exact permission it asks for.",
              )}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Trois principes ─────────────────────────────────────────────────── */}
      {/* `relative` obligatoire : InteractiveMesh est en `absolute`, donc il peint
          au-dessus de tout contenu statique. Sans ça, la section est invisible. */}
      <section className="relative px-5 sm:px-8 pb-20">
        <div className="max-w-5xl mx-auto grid gap-4 sm:grid-cols-3">
          {principles.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06} className="h-full">
              <div className="glass h-full rounded-[22px] border border-[#ECE7F6] bg-white/60 p-5">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                  <p.icon className="h-[17px] w-[17px]" />
                </span>
                <p className="text-[14.5px] font-bold text-[#0A0A0A]">{p.title}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5B5B66]">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Connecteurs actifs ──────────────────────────────────────────────── */}
      {/* `relative` obligatoire : InteractiveMesh est en `absolute`, donc il peint
          au-dessus de tout contenu statique. Sans ça, la section est invisible. */}
      <section className="relative px-5 sm:px-8 pb-20">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="mb-8">
              <h2 className="text-[26px] sm:text-[32px] font-bold tracking-[-0.02em]">
                {tr("Ce qui marche aujourd'hui", "What works today")}
              </h2>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#5B5B66]">
                {tr(
                  `${LIVE_CONNECTORS.length} connecteurs, câblés et utilisables tout de suite. Pour chacun : ce qu'il peut faire, ce qu'il ne peut pas faire, et le droit exact qu'il demande à votre compte.`,
                  `${LIVE_CONNECTORS.length} connectors, wired up and usable right now. For each one: what it can do, what it cannot do, and the exact permission it asks of your account.`,
                )}
              </p>
            </div>
          </Reveal>

          <div className="grid gap-4 lg:grid-cols-2">
            {LIVE_CONNECTORS.map((c, i) => (
              <Reveal key={c.id} delay={Math.min(i, 3) * 0.05} className="h-full">
                <LiveCard c={c} locale={locale} tr={tr} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── En cours d'intégration (honnêteté : rien à connecter pour l'instant) */}
      {/* `relative` obligatoire : InteractiveMesh est en `absolute`, donc il peint
          au-dessus de tout contenu statique. Sans ça, la section est invisible. */}
      <section className="relative px-5 sm:px-8 pb-20">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-[26px] sm:text-[32px] font-bold tracking-[-0.02em]">
              {tr("En cours d'intégration", "Coming soon")}
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#5B5B66]">
              {tr(
                "Autant le dire franchement : ces connecteurs ne sont pas encore branchés. Vous ne trouverez donc pas de bouton « Connecter » qui ne servirait à rien, et rien de tout ça ne vous manque pour travailler dès aujourd'hui.",
                "Let us be blunt: these connectors are not wired up yet. So you will not find a “Connect” button that does nothing, and none of this is missing for you to work today.",
              )}
            </p>
          </Reveal>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SOON_CONNECTORS.map((c, i) => (
              <Reveal key={c.id} delay={Math.min(i, 3) * 0.05} className="h-full">
                <SoonCard c={c} locale={locale} tr={tr} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      {/* `relative` obligatoire : InteractiveMesh est en `absolute`, donc il peint
          au-dessus de tout contenu statique. Sans ça, la section est invisible. */}
      <section className="relative px-5 sm:px-8 pb-20">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <h2 className="mb-8 text-[26px] sm:text-[32px] font-bold tracking-[-0.02em]">
              {tr("Les questions qu'on nous pose", "The questions we get")}
            </h2>
          </Reveal>
          <div className="grid gap-3">
            {faq.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.04}>
                <div className="glass rounded-[20px] border border-[#ECE7F6] bg-white/60 p-5">
                  <p className="text-[15px] font-bold text-[#0A0A0A]">{f.q}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#5B5B66]">{f.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Conformité Google (Limited Use) ─────────────────────────────────
          Attestation publique exigée par la vérification OAuth de Google. La
          phrase anglaise est normative : elle doit rester mot pour mot. ───── */}
      <section className="relative px-5 sm:px-8 pb-20">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <div className="rounded-2xl border border-[#ECECF2] bg-white/70 p-6 backdrop-blur-md sm:p-8">
              <h2 className="text-[19px] font-bold tracking-[-0.01em] text-[#0A0A0A]">
                {tr("Usage limité des données Google", "Google Limited Use")}
              </h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[#5B5B66]">
                {tr(
                  "Nous ne demandons que les droits strictement nécessaires : envoyer un email, gérer vos événements d'agenda, et accéder aux seuls fichiers créés avec Biltia. Vos données Google ne sont jamais vendues, jamais utilisées pour de la publicité, et jamais utilisées pour entraîner des modèles d'intelligence artificielle généralisés.",
                  "We request only the strictly necessary permissions: send an email, manage your calendar events, and access only the files created with Biltia. Your Google data is never sold, never used for advertising, and never used to train generalized artificial intelligence models.",
                )}
              </p>
              <p className="mt-4 border-l-2 border-[#C4B5FD] pl-4 text-[14px] italic leading-relaxed text-[#3A3F4C]">
                Biltia&rsquo;s use and transfer of information received from Google APIs to any other
                app will adhere to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 hover:underline"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <Link
                href="/confidentialite#google"
                className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-violet-600 hover:underline"
              >
                {tr("Lire le détail dans la politique de confidentialité", "Read the details in our privacy policy")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="relative px-5 sm:px-8 pb-28">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal>
            <h2 className="text-[28px] sm:text-[36px] font-bold tracking-[-0.02em]">
              {tr("Branchez ce que vous voulez. Rien n'est obligatoire.", "Plug in what you want. Nothing is mandatory.")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-[#5B5B66]">
              {tr(
                "Vous pouvez utiliser Biltia sans connecter le moindre outil. Et le jour où vous voulez que vos devis partent de votre adresse, c'est un clic.",
                "You can use Biltia without connecting a single tool. And the day you want your quotes to leave from your own address, it is one click.",
              )}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href="/signup"
                className={`${BLACK} inline-flex items-center gap-1.5 rounded-full px-7 py-3.5 text-[15px] font-semibold`}
              >
                {tr("Commencer gratuitement", "Start for free")}
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/tarifs"
                className="rounded-full border border-[#E6E1F0] bg-white/70 px-7 py-3.5 text-[15px] font-semibold text-[#0A0A0A] transition-colors hover:bg-white"
              >
                {tr("Voir les tarifs", "See pricing")}
              </Link>
            </div>
            <p className="mt-4 text-[12.5px] text-[#9A9AA6]">
              {tr("Aucune carte bancaire requise.", "No credit card required.")}
            </p>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
