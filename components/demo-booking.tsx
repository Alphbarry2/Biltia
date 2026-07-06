"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée « Réserver une démo » : un provider global (dans le layout
// racine) expose open(), et un seul exemplaire de la modale est monté à la
// demande. La modale est chargée en LAZY (import dynamique) : aucun poids ajouté
// tant que personne ne clique.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useCallback } from "react";
import dynamic from "next/dynamic";

const DemoBookingModal = dynamic(() => import("./demo-booking-modal"), { ssr: false });

type Ctx = { open: () => void };
const DemoBookingCtx = createContext<Ctx>({ open: () => {} });

export function useDemoBooking(): Ctx {
  return useContext(DemoBookingCtx);
}

export function DemoBookingProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  return (
    <DemoBookingCtx.Provider value={{ open }}>
      {children}
      {isOpen && <DemoBookingModal onClose={() => setIsOpen(false)} />}
    </DemoBookingCtx.Provider>
  );
}

/** Bouton prêt à l'emploi qui ouvre la modale. `className` = style libre. */
export function ReserveDemoButton({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const { open } = useDemoBooking();
  return (
    <button type="button" onClick={() => { onClick?.(); open(); }} className={className}>
      {children}
    </button>
  );
}
