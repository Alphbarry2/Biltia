"use client";

export function MockupSuiviChantiers() {
  return (
    <div className="flex h-full text-[6px]" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="w-12 bg-[#1C1C1C] flex flex-col">
        <div className="px-2 py-2 border-b border-white/10">
          <div className="w-5 h-5 rounded-md bg-[#14B8A6] flex items-center justify-center mb-1"><div className="w-2 h-2 bg-white rounded-sm" /></div>
          <div className="text-[5px] font-bold text-white leading-tight">Bâtisuivi</div>
        </div>
        {["Tableau de bord","Chantiers","Équipes","Matériel","Planning"].map((l, i) => (
          <div key={l} className={`mx-1 my-0.5 px-1.5 py-1 rounded text-[4.5px] ${i === 0 ? "bg-white/15 text-white font-bold" : "text-white/40"}`}>{l}</div>
        ))}
      </div>
      <div className="flex-1 bg-[#F7F7F7] overflow-hidden">
        <div className="h-4 bg-white border-b border-[#EBEBEB] flex items-center px-2 justify-between">
          <div className="w-20 h-2 bg-[#F0F0F0] rounded" />
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#1C1C1C]" /></div>
        </div>
        <div className="mx-1.5 mt-1.5 rounded-xl overflow-hidden" style={{ height: 44, background: "linear-gradient(135deg,#1C1C1C,#6B4226)" }}>
          <div className="p-2">
            <div className="text-[5px] text-white/50 mb-0.5">Vendredi 26 juin · Tout est sous contrôle</div>
            <div className="text-[7px] font-bold text-white leading-tight">Bonjour Marc,</div>
            <div className="text-[6px] text-white/70 leading-tight">vos chantiers avancent bien.</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1 px-1.5 mt-1.5">
          {[["4","Chantiers"],["8","Équipe"],["73%","Budget"],["3","Urgent"]].map(([v,l]) => (
            <div key={l} className="bg-white rounded-lg p-1 border border-[#EBEBEB]">
              <div className="text-[8px] font-bold text-[#0A0A0A]">{v}</div>
              <div className="text-[4px] text-[#9CA3AF]">{l}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 px-1.5 mt-1.5">
          <div className="flex-1 bg-white rounded-xl border border-[#EBEBEB] overflow-hidden">
            <div className="px-2 py-1 border-b border-[#F5F5F7]">
              <div className="text-[5.5px] font-bold text-[#0A0A0A]">Chantiers en activité</div>
            </div>
            {[["Résidence Les Oliviers","68",""],["École Jean Moulin","42",""],["Hangar logistique Nord","35","red"]].map(([n,p,red]) => (
              <div key={String(n)} className="px-2 py-1.5 border-b border-[#F5F5F7] last:border-0">
                <div className="text-[5px] font-semibold text-[#0A0A0A] truncate mb-1">{String(n)}</div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-1 bg-[#F0F0F0] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: String(p) + "%", background: red ? "#EF4444" : "#1C1C1C" }} />
                  </div>
                  <span className="text-[4.5px] font-bold text-[#0A0A0A]">{String(p)}%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="w-16 bg-white rounded-xl border border-[#EBEBEB] overflow-hidden">
            <div className="px-1.5 py-1 border-b border-[#F5F5F7] flex items-center justify-between">
              <div className="text-[5px] font-bold text-[#0A0A0A]">À traiter</div>
              <div className="w-3 h-3 rounded-full bg-rose-500 flex items-center justify-center text-[4px] font-bold text-white">3</div>
            </div>
            {["Couler dalle R+2","Livraison fenêtres","Contrôle élec.","Réception toiture"].map(t => (
              <div key={t} className="px-1.5 py-1 border-b border-[#F5F5F7] last:border-0">
                <div className="flex items-start gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-[4px] text-[#0A0A0A] leading-tight">{t}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MockupGestionDevis() {
  const rows = [
    { num: "DEV-2024-001", client: "M. Dumont J-P", montant: "18 792 €", s: "accepte" },
    { num: "DEV-2024-002", client: "Mairie Villeurbanne", montant: "52 438 €", s: "envoye" },
    { num: "DEV-2024-003", client: "Mme Mercier S.", montant: "4 032 €", s: "brouillon" },
  ];
  return (
    <div className="flex h-full">
      <div className="w-20 bg-white border-r border-[#EBEBEB] flex flex-col">
        <div className="px-2 py-2 border-b border-[#EBEBEB] flex items-center justify-between">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-md bg-blue-50 flex items-center justify-center"><div className="w-2 h-1.5 bg-blue-400 rounded-sm" /></div>
            <span className="text-[5.5px] font-bold text-[#0A0A0A]">Devis</span>
          </div>
          <div className="w-3 h-3 rounded bg-[#0A0A0A] flex items-center justify-center"><div className="text-[6px] text-white font-bold">+</div></div>
        </div>
        <div className="p-1 flex-1">
          {rows.map((r, i) => (
            <div key={r.num} className={`px-1.5 py-1.5 rounded-lg mb-0.5 ${i === 0 ? "bg-[#0A0A0A]" : "bg-[#F5F5F5]"}`}>
              <div className={`text-[5px] font-bold leading-tight ${i === 0 ? "text-white" : "text-[#0A0A0A]"}`}>{r.num}</div>
              <div className={`text-[4.5px] mt-0.5 ${i === 0 ? "text-white/50" : "text-[#9CA3AF]"}`}>{r.client}</div>
              <div className={`text-[5px] font-semibold mt-0.5 ${i === 0 ? "text-white/70" : "text-[#0A0A0A]"}`}>{r.montant}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-[#F7F7F7] p-2">
        <div className="bg-white rounded-xl border border-[#EBEBEB] overflow-hidden mb-2">
          <div className="flex items-start justify-between px-3 py-2 border-b border-[#F5F5F7]">
            <div>
              <div className="text-[7px] font-bold text-[#0A0A0A]">M. Dumont Jean-Pierre</div>
              <div className="flex gap-1 mt-0.5">
                <span className="text-[4.5px] text-[#9CA3AF]">DEV-2024-001 · 12/03/2024</span>
              </div>
            </div>
            <div className="px-1.5 py-0.5 rounded text-[4.5px] font-bold" style={{ background: "#ECFDF5", color: "#059669" }}>Accepté</div>
          </div>
          {[["A1","Terrassement m²","120","m²","18 €","2 160 €"],["A2","Béton fondations","15","m³","285 €","4 275 €"],["B1","Maçonnerie briques","200","m²","42 €","8 400 €"]].map(cols => (
            <div key={cols[0]} className="grid border-b border-[#F5F5F7] last:border-0 px-2 py-1.5 items-center" style={{ gridTemplateColumns: "20px 1fr 24px 24px 36px 36px" }}>
              {cols.map((c, ci) => <div key={ci} className="text-[4.5px] text-[#0A0A0A]">{c}</div>)}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <div className="bg-white rounded-xl border border-[#EBEBEB] px-3 py-2 w-28">
            {[["Total HT","14 835 €",true],["TVA 10%","1 483 €",false],["Total TTC","16 319 €",true]].map(([l,v,b]) => (
              <div key={String(l)} className={`flex justify-between py-0.5 ${b ? "border-t border-[#EBEBEB]" : ""}`}>
                <span className={`text-[4.5px] ${b ? "font-bold text-[#0A0A0A]" : "text-[#9CA3AF]"}`}>{String(l)}</span>
                <span className={`text-[4.5px] tabular-nums ${b ? "font-bold text-[#0A0A0A]" : "text-[#6B7280]"}`}>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MockupPlanningEquipes() {
  const EMPS = [
    { name: "Karim B.", color: "#14B8A6" },
    { name: "Marc D.", color: "#3B82F6" },
    { name: "Sofiane K.", color: "#8B5CF6" },
    { name: "Thomas R.", color: "#F59E0B" },
    { name: "Luc M.", color: "#EF4444" },
  ];
  const DAYS = ["Lun","Mar","Mer","Jeu","Ven","Sam"];
  const CHANTIERS = ["Villa Dumont","École Bellevue","Entrepôt Nord","Résidence Prés"];
  const CC = ["#14B8A6","#3B82F6","#8B5CF6","#F59E0B"];
  const DATA = [
    [0,1,-1,0,0,-1],[1,1,2,-1,1,-1],[-1,2,2,0,2,-1],[0,-1,3,3,-1,-1],[-1,1,-1,1,3,-1],
  ];
  return (
    <div className="flex flex-col h-full bg-[#F5F5F7]">
      <div className="h-7 bg-white border-b border-[#EBEBEB] flex items-center justify-between px-2 flex-shrink-0">
        <span className="text-[6px] font-bold text-[#0A0A0A]">Planning Équipes</span>
        <div className="flex gap-1">
          {CHANTIERS.map((c,i) => <span key={c} className="flex items-center gap-0.5 text-[4.5px] text-[#6B7280]"><span className="w-1.5 h-1.5 rounded-sm" style={{background:CC[i]}} />{c.split(" ")[0]}</span>)}
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-1.5">
        <div className="bg-white rounded-xl border border-[#EBEBEB] overflow-hidden h-full">
          <div className="grid border-b border-[#F5F5F7] bg-[#FAFAFA]" style={{ gridTemplateColumns:"44px repeat(6,1fr)" }}>
            <div className="px-1 py-1" />
            {DAYS.map(d => <div key={d} className="text-center py-1 text-[4.5px] font-bold text-[#9CA3AF]">{d}</div>)}
          </div>
          {EMPS.map((e, ei) => (
            <div key={e.name} className="grid border-b border-[#F5F5F7] last:border-0" style={{ gridTemplateColumns:"44px repeat(6,1fr)" }}>
              <div className="flex items-center gap-1 px-1 py-1.5">
                <div className="w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center text-[3.5px] font-bold text-white" style={{background:e.color}}>{e.name.split(" ")[0][0]}{e.name.split(" ")[1][0]}</div>
                <span className="text-[4.5px] text-[#0A0A0A] truncate font-medium">{e.name.split(" ")[0]}</span>
              </div>
              {DATA[ei].map((ci, di) => (
                <div key={di} className="p-0.5 min-h-[20px]">
                  {ci >= 0 && (
                    <div className="rounded-sm px-0.5 py-0.5" style={{ borderLeft: `2px solid ${CC[ci]}`, background: CC[ci]+"18" }}>
                      <div className="text-[4px] font-bold truncate" style={{color:CC[ci]}}>{CHANTIERS[ci].split(" ")[0]}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MockupPointageHeures() {
  const OUVRIERS = ["Karim B.","Marc D.","Sofiane K.","Thomas R.","Luc M."];
  const JOURS = ["Lun 17","Mar 18","Mer 19","Jeu 20","Ven 21","Sam 22"];
  const DATA = [
    [9,8,10,8,-1,-1],[8,9.5,8,8,8,-1],[8,8,8,8,8,-1],[-1,8,-1,7,8,-1],[8,9,-1,-1,8,-1],
  ];
  return (
    <div className="flex flex-col h-full bg-[#F5F5F7]">
      <div className="h-7 bg-white border-b border-[#EBEBEB] flex items-center justify-between px-2 flex-shrink-0">
        <span className="text-[6px] font-bold text-[#0A0A0A]">Pointage des Heures</span>
        <div className="flex gap-1.5">
          {[["205h","normales","text-[#0A0A0A]"],["12h","supp","text-amber-500"],["4","à valider","text-rose-500"]].map(([v,l,c]) => (
            <div key={String(l)} className="text-center">
              <div className={`text-[6px] font-bold tabular-nums ${c}`}>{v}</div>
              <div className="text-[4px] text-[#9CA3AF]">{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-1.5 overflow-hidden">
        <div className="bg-white rounded-xl border border-[#EBEBEB] overflow-hidden h-full">
          <div className="grid border-b border-[#F5F5F7] bg-[#FAFAFA]" style={{ gridTemplateColumns:"44px repeat(6,1fr) 24px" }}>
            <div className="px-1 py-1 text-[4.5px] font-bold text-[#C4C4C4] uppercase">Ouvrier</div>
            {JOURS.map(j => <div key={j} className="text-center py-1 text-[4px] font-bold text-[#C4C4C4] uppercase">{j}</div>)}
            <div className="text-center py-1 text-[4px] font-bold text-[#C4C4C4]">Tot.</div>
          </div>
          {OUVRIERS.map((o, oi) => {
            const total = DATA[oi].filter(h => h > 0).reduce((s,h)=>s+h,0);
            return (
              <div key={o} className={`grid border-b border-[#F5F5F7] last:border-0 items-center ${oi%2===0?"bg-white":"bg-[#FAFAFA]/50"}`} style={{ gridTemplateColumns:"44px repeat(6,1fr) 24px" }}>
                <div className="px-1 py-1.5">
                  <div className="w-4 h-4 rounded-full bg-[#0A0A0A] flex items-center justify-center text-[3.5px] font-bold text-white mb-0.5">{o.split(" ").map(n=>n[0]).join("")}</div>
                  <div className="text-[4px] text-[#0A0A0A] font-semibold truncate">{o.split(" ")[0]}</div>
                </div>
                {DATA[oi].map((h, di) => (
                  <div key={di} className="p-0.5">
                    {h > 0 ? (
                      <div className={`rounded-md px-0.5 py-0.5 text-center ${h > 8 ? "bg-amber-50 border border-amber-100" : "bg-emerald-50 border border-emerald-100"}`}>
                        <div className={`text-[5.5px] font-bold tabular-nums ${h > 8 ? "text-amber-700" : "text-emerald-700"}`}>{h}h</div>
                      </div>
                    ) : <div className="h-4 bg-[#F5F5F7] rounded-md" />}
                  </div>
                ))}
                <div className="text-center text-[5.5px] font-bold text-[#0A0A0A]">{total}h</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MockupSiteVitrine() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "white" }}>
      <div className="h-5 bg-white border-b border-[#EBEBEB] flex items-center justify-between px-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded bg-[#10B981]" />
          <span className="text-[5.5px] font-bold text-[#0A0A0A]">BTP Martin & Fils</span>
        </div>
        <div className="px-1.5 py-0.5 rounded-full bg-[#10B981] text-[4.5px] text-white font-bold">Devis gratuit</div>
      </div>
      <div className="relative px-2 py-3 text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#0A0A0A,#1a1a1a)", minHeight: 52 }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "16px 16px" }} />
        <div className="relative">
          <div className="text-[5px] text-white/40 mb-0.5">RGE · Qualibat · 25 ans d&apos;expérience</div>
          <div className="text-[8px] font-bold text-white leading-tight mb-1">Votre projet BTP<br /><span style={{color:"#10B981"}}>entre de bonnes mains</span></div>
          <div className="flex gap-1">
            <div className="px-1.5 py-0.5 rounded-full bg-[#10B981] text-[4.5px] text-white font-bold">Devis gratuit →</div>
            <div className="px-1.5 py-0.5 rounded-full border border-white/20 text-[4.5px] text-white/70">04 78 00 00 00</div>
          </div>
        </div>
      </div>
      <div className="flex-1 px-2 py-2">
        <div className="grid grid-cols-2 gap-1 mb-2">
          {[["Gros Œuvre","#10B981"],["Rénovation","#3B82F6"],["Charpente","#8B5CF6"],["Aménagement","#F59E0B"]].map(([l,c]) => (
            <div key={String(l)} className="bg-[#F8F8F8] border border-[#F0F0F0] rounded-lg p-1.5">
              <div className="w-4 h-4 rounded-lg mb-1 flex items-center justify-center" style={{background:String(c)+"20"}}>
                <div className="w-2 h-2 rounded-sm" style={{background:String(c)}} />
              </div>
              <div className="text-[5px] font-bold text-[#0A0A0A]">{l}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {[0,1,2].map(i => (
            <div key={i} className="flex-1 bg-[#F8F8F8] border border-[#F0F0F0] rounded-lg p-1.5">
              <div className="text-[5px] text-amber-400 mb-0.5">★★★★★</div>
              <div className="text-[4px] text-[#6B7280] leading-tight">Excellent travail, équipe sérieuse.</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MockupSuiviST() {
  const STS = [
    { nom: "Élec Pro SARL", corps: "Électricité", score: 80, color: "#F59E0B" },
    { nom: "Plomberie Durand", corps: "Plomberie", score: 95, color: "#10B981" },
    { nom: "Béton & Chape SAS", corps: "Maçonnerie", score: 72, color: "#EF4444" },
  ];
  const DOCS = ["Kbis","URSSAF","RC Pro","Attestation","Carte BTP"];
  const STATUTS = ["valide","expire","valide","attente","valide"];
  const DS: Record<string, string> = { valide: "#10B981", expire: "#EF4444", attente: "#F59E0B", manquant: "#D1D5DB" };
  return (
    <div className="flex h-full">
      <div className="w-24 bg-white border-r border-[#EBEBEB] flex flex-col">
        <div className="px-2 py-2 border-b border-[#EBEBEB] flex items-center justify-between">
          <span className="text-[5.5px] font-bold text-[#0A0A0A]">Sous-traitants</span>
          <div className="w-3 h-3 rounded-full bg-rose-500 flex items-center justify-center text-[4px] font-bold text-white">1</div>
        </div>
        <div className="flex-1 p-1 space-y-0.5">
          {STS.map((s, i) => (
            <div key={s.nom} className={`px-1.5 py-1.5 rounded-lg ${i === 0 ? "bg-[#0A0A0A]" : "bg-[#F5F5F5]"}`}>
              <div className={`text-[5px] font-bold truncate ${i===0?"text-white":"text-[#0A0A0A]"}`}>{s.nom}</div>
              <div className={`text-[4px] mb-1 ${i===0?"text-white/50":"text-[#9CA3AF]"}`}>{s.corps}</div>
              <div className="flex items-center gap-1">
                <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${s.score}%`, background: s.color}} />
                </div>
                <span className={`text-[4.5px] font-bold tabular-nums ${i===0?"text-white":""}`} style={i!==0?{color:s.color}:{}}>{s.score}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-[#F5F5F7] p-1.5">
        <div className="bg-white rounded-xl border border-[#EBEBEB] overflow-hidden mb-1.5">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#F5F5F7]">
            <div>
              <div className="text-[6px] font-bold text-[#0A0A0A]">Élec Pro SARL</div>
              <div className="text-[4.5px] text-[#9CA3AF]">SIRET 824 531 902 00023</div>
            </div>
            <div className="relative w-10 h-10">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#F5F5F5" strokeWidth="3"/>
                <circle cx="18" cy="18" r="14" fill="none" stroke="#F59E0B" strokeWidth="3" strokeDasharray="80 100" strokeLinecap="round"/>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[5.5px] font-bold" style={{color:"#F59E0B"}}>80%</div>
            </div>
          </div>
          <div className="px-2 pb-1.5 pt-1">
            <div className="text-[4.5px] font-bold text-[#C4C4C4] uppercase tracking-wider mb-1">Documents obligatoires</div>
            <div className="space-y-1">
              {DOCS.map((d,i) => (
                <div key={d} className="flex items-center justify-between">
                  <div className="text-[5px] text-[#0A0A0A]">{d}</div>
                  <div className="w-2 h-2 rounded-full" style={{background: DS[STATUTS[i]]}} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const MOCKUP_MAP: Record<string, React.ReactNode> = {
  "suivi-chantiers": <MockupSuiviChantiers />,
  "gestion-devis": <MockupGestionDevis />,
  "planning-equipes": <MockupPlanningEquipes />,
  "pointage-heures": <MockupPointageHeures />,
  "site-vitrine-btp": <MockupSiteVitrine />,
  "suivi-sous-traitants": <MockupSuiviST />,
};
