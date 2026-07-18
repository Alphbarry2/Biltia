"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SiteMap — carte interactive avec point(s), SANS clé d'API.
//
// Leaflet + tuiles Carto (gratuites). Leaflet touche `window` dès son import : on
// le charge donc DYNAMIQUEMENT dans un effet (client only), jamais au niveau du
// module — sinon le rendu serveur planterait sur « window is not defined ». Seul
// le CSS est importé statiquement (sans effet de bord serveur).
//
// Marqueur = divIcon SVG maison (pas d'image → évite le bug classique des icônes
// Leaflet cassées par le bundler, et reste aux couleurs Biltia).
// ─────────────────────────────────────────────────────────────────────────────

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";

export type MapPoint = { lat: number; lng: number; label?: string; id?: string };

// Pin violet Biltia (28×36), pointe en bas.
const PIN_HTML =
  '<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 12.1 20.6 12.6 21.1a2 2 0 0 0 2.8 0C15.9 34.6 28 23.5 28 14 28 6.27 21.73 0 14 0z" fill="#7c3aed"/>' +
  '<circle cx="14" cy="14" r="5.2" fill="#ffffff"/></svg>';

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

export function SiteMap({
  points,
  zoom = 15,
  className,
  ariaLabel = "Carte de localisation",
  onPointClick,
}: {
  points: MapPoint[];
  zoom?: number;
  className?: string;
  ariaLabel?: string;
  /** Clic sur un marqueur (ouvre la fiche). Reçoit l'`id` du point. */
  onPointClick?: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  // Toujours le dernier handler (évite une fermeture périmée dans l'effet).
  const clickRef = useRef(onPointClick);
  clickRef.current = onPointClick;

  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod = await import("leaflet");
      const L = (mod as unknown as { default?: typeof import("leaflet") }).default ?? mod;
      if (disposed || !elRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(elRef.current, { scrollWheelZoom: false, attributionControl: true });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd",
          maxZoom: 20,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      const map = mapRef.current;
      const layer = layerRef.current!;
      layer.clearLayers();

      const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (valid.length === 0) {
        map.setView([46.6, 2.5], 5); // centroïde France par défaut
        return;
      }

      const icon = L.divIcon({
        html: PIN_HTML,
        className: "biltia-pin",
        iconSize: [28, 36],
        iconAnchor: [14, 34],
        popupAnchor: [0, -30],
      });
      const latlngs: [number, number][] = [];
      for (const p of valid) {
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(layer);
        if (p.label) {
          const safe = escapeHtml(p.label);
          // Survol = nom ; clic = ouvre la fiche si un handler + id sont fournis.
          if (p.id && clickRef.current) {
            marker.bindTooltip(safe, { direction: "top", offset: [0, -30] });
            marker.on("click", () => clickRef.current?.(p.id as string));
          } else {
            marker.bindPopup(safe);
          }
        }
        latlngs.push([p.lat, p.lng]);
      }
      if (latlngs.length === 1) map.setView(latlngs[0], zoom);
      else map.fitBounds(latlngs, { padding: [32, 32], maxZoom: 16 });

      // Le conteneur vient d'être dimensionné/ouvert (modal) : Leaflet doit
      // recalculer sa taille, sinon les tuiles s'affichent en damier gris.
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      disposed = true;
    };
  }, [points, zoom]);

  // Détruit la carte au démontage (le composant peut revenir plus tard).
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    },
    []
  );

  // `isolation:isolate` = un contexte d'empilement PROPRE : les z-index internes de
  // Leaflet (tuiles 400, tooltips 650, contrôles 1000) restent ENFERMÉS dans la carte
  // et ne débordent plus par-dessus le tiroir de fiche (z-50) ni les modales (z-120).
  return <div ref={elRef} className={className} style={{ isolation: "isolate" }} role="img" aria-label={ariaLabel} />;
}
