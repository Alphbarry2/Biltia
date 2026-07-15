// Image d'aperçu social (Open Graph / Twitter Card) pour TOUTE la landing.
// Générée par next/og, sans asset externe : à chaque partage (LinkedIn, X,
// iMessage, WhatsApp…), c'est la même carte de marque qui s'affiche. Un aperçu
// cohérent = un signal de marque « Biltia » répété, qui aide Google et les LLM
// à cristalliser l'entité (et à la distinguer de tout homonyme).

import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand-entity";

export const alt = "Biltia — l'OS conversationnel du BTP";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "radial-gradient(1000px 500px at 100% 0%, #EDE9FE 0%, #FAFAF9 55%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "18px",
              background: "#7C3AED",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "44px",
              fontWeight: 800,
            }}
          >
            b
          </div>
          <div style={{ fontSize: "40px", fontWeight: 700, color: "#0A0A0A" }}>
            Biltia
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: "76px",
              fontWeight: 800,
              lineHeight: 1.05,
              color: "#0A0A0A",
              letterSpacing: "-2px",
            }}
          >
            {BRAND.slogan}
          </div>
          <div style={{ fontSize: "34px", color: "#5B5B66", lineHeight: 1.3 }}>
            Décrivez votre problème, Biltia livre la solution : document,
            application, réponse ou automatisation.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: "28px", color: "#7C3AED", fontWeight: 600 }}>
            biltia.com
          </div>
          <div style={{ fontSize: "24px", color: "#9A9AA6" }}>
            Logiciel BTP · France &amp; Belgique
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
