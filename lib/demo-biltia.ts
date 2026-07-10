// ─────────────────────────────────────────────────────────────────────────────
// SDK DE DÉMO — pour l'APERÇU des apps phares (/t/[id], landing + galerie modèles).
//
// L'aperçu n'est PAS authentifié (pas de pont window.biltia vers /api). Pour montrer
// le VRAI design de l'app (pas une maquette figée), on sert le HTML fonctionnel de
// l'app + CE stub : un window.biltia 100 % LOCAL, pré-rempli de données BTP réalistes,
// dont les create/update/remove modifient un état en mémoire → l'aperçu est INTERACTIF
// (on peut cliquer, changer un statut, ouvrir une fiche), sans rien écrire nulle part.
// À injecter dans le <head> AVANT le <script> de l'app.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_BILTIA_SCRIPT = `<script>
/* biltia — démo locale (aperçu) */
(function(){
  if (window.biltia) return;
  window.__biltiaDemo = true;
  function toast(msg, kind){
    try{
      var host=document.getElementById("__biltia_toasts");
      if(!host){ host=document.createElement("div"); host.id="__biltia_toasts"; host.style.cssText="position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;font-family:Inter,system-ui,sans-serif"; document.body.appendChild(host); }
      var el=document.createElement("div");
      el.style.cssText="display:flex;align-items:center;gap:8px;max-width:92vw;background:#0A0A0A;color:#fff;font-size:13px;font-weight:600;padding:11px 15px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.22);opacity:0;transition:opacity .2s,transform .2s;transform:translateY(6px)";
      var ic=document.createElement("span"); ic.style.cssText="color:"+(kind==="error"?"#FB7185":"#34D399"); ic.textContent=kind==="error"?"⚠":"✓";
      var tx=document.createElement("span"); tx.textContent=String(msg||"");
      el.appendChild(ic); el.appendChild(tx); host.appendChild(el);
      requestAnimationFrame(function(){ el.style.opacity="1"; el.style.transform="none"; });
      setTimeout(function(){ el.style.opacity="0"; el.style.transform="translateY(6px)"; setTimeout(function(){el.remove();},250); }, 2400);
    }catch(e){}
  }
  var seq=1000; function nid(){ return "demo-"+(++seq); }
  // ── Jeu de données BTP de démonstration ──
  var db = {
    clients: [
      {id:"cl1",nom:"SCI Méditerranée",ville:"Aix-en-Provence",email:"contact@sci-med.fr",tel:"04 42 10 20 30"},
      {id:"cl2",nom:"Mairie de Lyon",ville:"Lyon",email:"marches@lyon.fr"},
      {id:"cl3",nom:"TransLog SAS",ville:"Lille",email:"achats@translog.fr"},
      {id:"cl4",nom:"M. & Mme Vasseur",ville:"Cap-Ferret",tel:"06 71 22 33 44"},
      {id:"cl5",nom:"Atrium Invest",ville:"Paris",email:"projets@atrium-invest.fr"}
    ],
    employees: [
      {id:"em1",prenom:"Marc",nom:"Dubois",role:"Chef de chantier",corps_metier:"Gros œuvre",statut:"actif",tel:"06 12 34 56 78"},
      {id:"em2",prenom:"Sophie",nom:"Laurent",role:"Chef de chantier",corps_metier:"Second œuvre",statut:"actif",tel:"06 23 45 67 89"},
      {id:"em3",prenom:"Karim",nom:"Benali",role:"Compagnon",corps_metier:"Maçon",statut:"actif"},
      {id:"em4",prenom:"Léa",nom:"Nguyen",role:"Conductrice de travaux",corps_metier:"",statut:"actif"},
      {id:"em5",prenom:"Ahmed",nom:"Traoré",role:"Compagnon",corps_metier:"Électricien",statut:"arret"}
    ],
    chantiers: [
      {id:"ch1",nom:"Résidence Les Oliviers",client_id:"cl1",ville:"Aix-en-Provence",adresse:"12 chemin des Pins",statut:"en_cours",avancement:68,budget:1250000,budget_engage:812000,chef_chantier_id:"em1",date_debut:"2026-01-15",date_fin_prevue:"2026-09-30",description:"Construction de 18 logements collectifs."},
      {id:"ch2",nom:"Extension École Jean Moulin",client_id:"cl2",ville:"Lyon",statut:"en_cours",avancement:42,budget:680000,budget_engage:295000,chef_chantier_id:"em2",date_debut:"2026-03-01",date_fin_prevue:"2026-08-15"},
      {id:"ch3",nom:"Hangar logistique Nord",client_id:"cl3",ville:"Lille",statut:"en_retard",avancement:35,budget:920000,budget_engage:510000,chef_chantier_id:"em1",date_debut:"2025-11-10",date_fin_prevue:"2026-06-30"},
      {id:"ch4",nom:"Villa Cap-Ferret",client_id:"cl4",ville:"Cap-Ferret",statut:"en_attente",avancement:0,budget:480000,budget_engage:12000,chef_chantier_id:"em1",date_debut:"2026-08-01",date_fin_prevue:"2027-03-15"},
      {id:"ch5",nom:"Réhabilitation Quai Saint-Jean",client_id:"cl2",ville:"Bordeaux",statut:"termine",avancement:100,budget:350000,budget_engage:342000,chef_chantier_id:"em2",date_debut:"2025-08-01",date_fin_prevue:"2026-05-20"},
      {id:"ch6",nom:"Immeuble de bureaux Atrium",client_id:"cl5",ville:"Paris",adresse:"22 bd Haussmann",statut:"en_cours",avancement:82,budget:3200000,budget_engage:2580000,chef_chantier_id:"em4",date_debut:"2025-06-01",date_fin_prevue:"2026-08-30"}
    ],
    materials: [
      // Parc matériel / engins (utilisé par l'app Suivi de chantiers).
      {id:"ma1",nom:"Grue à tour Liebherr 110",reference:"GR-001",categorie:"Engin",quantite:1,unite:"u",statut:"affecte",chantier_id:"ch1"},
      {id:"ma2",nom:"Pelleteuse CAT 320",reference:"PEL-003",categorie:"Engin",quantite:1,unite:"u",statut:"affecte",chantier_id:"ch3"},
      {id:"ma3",nom:"Bétonnière Altrad B180",reference:"BET-012",categorie:"Outillage",quantite:3,unite:"u",statut:"disponible"},
      {id:"ma4",nom:"Échafaudage 60m²",reference:"ECH-008",categorie:"Outillage",quantite:5,unite:"u",statut:"affecte",chantier_id:"ch6"},
      {id:"ma5",nom:"Nacelle élévatrice 12m",reference:"NAC-001",categorie:"Engin",quantite:1,unite:"u",statut:"maintenance"},
      {id:"ma6",nom:"Compresseur 50L",reference:"COMP-004",categorie:"Outillage",quantite:2,unite:"u",statut:"disponible"},
      // Stock de matériaux consommables (utilisé par l'app Stock & achats) : seuils + prix + fournisseur.
      {id:"ma7",nom:"Sac ciment CEM II 35 kg",reference:"CIM-35",categorie:"Gros œuvre",quantite:8,unite:"sac",seuil_alerte:20,prix_achat_ht:6.9,fournisseur_id:"sp5",statut:"disponible"},
      {id:"ma8",nom:"Parpaing creux 20",reference:"PAR-20",categorie:"Gros œuvre",quantite:340,unite:"u",seuil_alerte:100,prix_achat_ht:1.15,fournisseur_id:"sp5",statut:"disponible"},
      {id:"ma9",nom:"Big bag sable 0/4",reference:"SAB-04",categorie:"Gros œuvre",quantite:0,unite:"u",seuil_alerte:5,prix_achat_ht:48,fournisseur_id:"sp5",statut:"disponible"},
      {id:"ma10",nom:"Plaque placo BA13",reference:"BA13",categorie:"Placo",quantite:45,unite:"u",seuil_alerte:30,prix_achat_ht:5.6,fournisseur_id:"sp5",statut:"disponible"},
      {id:"ma11",nom:"Rouleau laine de verre 100mm",reference:"LDV-100",categorie:"Isolation",quantite:6,unite:"rlx",seuil_alerte:12,prix_achat_ht:32,fournisseur_id:"sp5",statut:"disponible"},
      {id:"ma12",nom:"Couronne câble 3G2.5",reference:"C-3G25",categorie:"Électricité",quantite:3,unite:"rlx",seuil_alerte:5,prix_achat_ht:68,fournisseur_id:"sp6",statut:"disponible"},
      {id:"ma13",nom:"Disjoncteur 16A",reference:"DJ-16",categorie:"Électricité",quantite:24,unite:"u",seuil_alerte:20,prix_achat_ht:8.4,fournisseur_id:"sp6",statut:"disponible"},
      {id:"ma14",nom:"Couronne gaine ICTA 20",reference:"ICTA-20",categorie:"Électricité",quantite:0,unite:"rlx",seuil_alerte:4,prix_achat_ht:22,fournisseur_id:"sp6",statut:"disponible"},
      {id:"ma15",nom:"Couronne tube PER 16",reference:"PER-16",categorie:"Plomberie",quantite:9,unite:"rlx",seuil_alerte:6,prix_achat_ht:34,statut:"disponible"},
      {id:"ma16",nom:"Peinture acrylique blanc 15L",reference:"PEIN-15",categorie:"Peinture",quantite:2,unite:"u",seuil_alerte:6,prix_achat_ht:58,statut:"disponible"},
      {id:"ma17",nom:"Boîte vis TF 4x40 (200)",reference:"VIS-440",categorie:"Quincaillerie",quantite:14,unite:"boîte",seuil_alerte:10,prix_achat_ht:7.2,fournisseur_id:"sp5",statut:"disponible"}
    ],
    tasks: [
      {id:"tk1",title:"Couler la dalle du R+2",chantier_id:"ch1",assignee_id:"em3",priority:"high",status:"todo",due_date:"2026-07-12"},
      {id:"tk2",title:"Tirage câbles électriques",chantier_id:"ch6",assignee_id:"em5",priority:"high",status:"doing",due_date:"2026-07-10"},
      {id:"tk3",title:"Pose des fenêtres aluminium",chantier_id:"ch2",assignee_id:"em2",priority:"normal",status:"todo",due_date:"2026-07-18"},
      {id:"tk4",title:"Réception de la couverture",chantier_id:"ch3",assignee_id:"em1",priority:"normal",status:"done",due_date:"2026-06-25",done_at:"2026-06-26"},
      {id:"tk5",title:"Montage échafaudage façade est",chantier_id:"ch1",assignee_id:"em1",priority:"normal",status:"doing",due_date:"2026-07-09"},
      {id:"tk6",title:"Commande menuiseries bois",chantier_id:"ch6",assignee_id:"em4",priority:"low",status:"todo",due_date:"2026-07-22"},
      {id:"tk7",title:"Pose du bardage",chantier_id:"ch2",assignee_id:"em2",priority:"normal",status:"done",due_date:"2026-07-01",done_at:"2026-07-04"},
      {id:"tk8",title:"Reprise étanchéité toiture",chantier_id:"ch3",assignee_id:"em3",priority:"high",status:"doing",due_date:"2026-07-06"},
      {id:"tk9",title:"Coffrage poteaux niveau 1",chantier_id:"ch1",assignee_id:"em1",priority:"normal",status:"todo",due_date:"2026-07-15"},
      {id:"tk10",title:"Peinture cage d'escalier",chantier_id:"ch6",assignee_id:"em4",priority:"low",status:"done",due_date:"2026-06-28",done_at:"2026-07-05"},
      {id:"tk11",title:"Raccordement tableau général",chantier_id:"ch1",assignee_id:"em1",priority:"high",status:"done",due_date:"2026-07-03",done_at:"2026-07-07"},
      {id:"tk12",title:"Nettoyage fin de chantier",chantier_id:"ch6",assignee_id:"em5",priority:"normal",status:"todo",due_date:"2026-07-20"}
    ],
    catalogue: [
      {id:"ca1",designation:"Dépose ancien carrelage",type:"main_oeuvre",unite:"m²",prix_vente_ht:18,taux_tva:10,corps_metier:"carreleur"},
      {id:"ca2",designation:"Fourniture carrelage grès cérame",type:"fourniture",unite:"m²",prix_vente_ht:34,taux_tva:10,corps_metier:"carreleur"},
      {id:"ca3",designation:"Pose carrelage sol collé",type:"main_oeuvre",unite:"m²",prix_vente_ht:42,taux_tva:10,corps_metier:"carreleur"},
      {id:"ca4",designation:"Peinture murs et plafond (2 couches)",type:"ouvrage",unite:"m²",prix_vente_ht:28,taux_tva:10,corps_metier:"peintre"},
      {id:"ca5",designation:"Point lumineux (fourniture + pose)",type:"ouvrage",unite:"u",prix_vente_ht:95,taux_tva:10,corps_metier:"electricien"},
      {id:"ca6",designation:"Tableau électrique 3 rangées",type:"fourniture",unite:"u",prix_vente_ht:280,taux_tva:20,corps_metier:"electricien"},
      {id:"ca7",designation:"Main d'œuvre plomberie",type:"main_oeuvre",unite:"h",prix_vente_ht:55,taux_tva:20,corps_metier:"plombier"},
      {id:"ca8",designation:"Fourniture + pose WC suspendu",type:"ouvrage",unite:"u",prix_vente_ht:620,taux_tva:10,corps_metier:"plombier"},
      {id:"ca9",designation:"Isolation combles laine soufflée",type:"ouvrage",unite:"m²",prix_vente_ht:24,taux_tva:5.5,corps_metier:"isolation"},
      {id:"ca10",designation:"Location échafaudage (semaine)",type:"fourniture",unite:"forfait",prix_vente_ht:340,taux_tva:20}
    ],
    devis: [
      {id:"dv1",numero:"D-2026-001",client_id:"cl4",chantier_id:"ch4",statut:"envoye",date_devis:"2026-06-24",date_validite:"2026-07-24",montant_ht:18500,montant_tva:1850,montant_ttc:20350,conditions:"Devis valable 30 jours. Acompte de 30% à la commande."},
      {id:"dv2",numero:"D-2026-002",client_id:"cl1",chantier_id:"ch1",statut:"accepte",date_devis:"2026-06-12",date_validite:"2026-07-12",montant_ht:42000,montant_tva:4200,montant_ttc:46200},
      {id:"dv3",numero:"D-2026-003",client_id:"cl3",chantier_id:"ch3",statut:"envoye",date_devis:"2026-05-28",date_validite:"2026-06-27",montant_ht:9800,montant_tva:1960,montant_ttc:11760,conditions:"Paiement à 30 jours fin de mois."},
      {id:"dv4",numero:"D-2026-004",client_id:"cl2",statut:"brouillon",date_devis:"2026-07-05",date_validite:"2026-08-04",montant_ht:15200,montant_tva:1520,montant_ttc:16720},
      {id:"dv5",numero:"D-2026-005",client_id:"cl5",statut:"refuse",date_devis:"2026-05-15",date_validite:"2026-06-14",montant_ht:7400,montant_tva:1480,montant_ttc:8880},
      {id:"dv6",numero:"D-2026-006",client_id:"cl1",chantier_id:"ch6",statut:"accepte",date_devis:"2026-06-26",date_validite:"2026-07-26",montant_ht:28000,montant_tva:2800,montant_ttc:30800}
    ],
    lignes: [
      {id:"lg1",devis_id:"dv1",designation:"Dépose ancien carrelage",quantite:45,unite:"m²",prix_unitaire_ht:18,taux_tva:10,total_ht:810,position:0},
      {id:"lg2",devis_id:"dv1",designation:"Fourniture carrelage grès cérame",quantite:45,unite:"m²",prix_unitaire_ht:34,taux_tva:10,total_ht:1530,position:1},
      {id:"lg3",devis_id:"dv1",designation:"Pose carrelage sol collé",quantite:45,unite:"m²",prix_unitaire_ht:42,taux_tva:10,total_ht:1890,position:2},
      {id:"lg4",devis_id:"dv1",designation:"Fourniture + pose WC suspendu",quantite:1,unite:"u",prix_unitaire_ht:620,taux_tva:10,total_ht:620,position:3},
      {id:"lg5",devis_id:"dv1",designation:"Peinture murs et plafond (2 couches)",quantite:62,unite:"m²",prix_unitaire_ht:28,taux_tva:10,total_ht:1736,position:4},
      {id:"lg6",devis_id:"dv2",designation:"Gros œuvre - fondations",quantite:1,unite:"forfait",prix_unitaire_ht:24000,taux_tva:10,total_ht:24000,position:0},
      {id:"lg7",devis_id:"dv2",designation:"Charpente bois",quantite:1,unite:"forfait",prix_unitaire_ht:18000,taux_tva:10,total_ht:18000,position:1},
      {id:"lg8",devis_id:"dv3",designation:"Tableau électrique 3 rangées",quantite:2,unite:"u",prix_unitaire_ht:280,taux_tva:20,total_ht:560,position:0},
      {id:"lg9",devis_id:"dv3",designation:"Point lumineux (fourniture + pose)",quantite:48,unite:"u",prix_unitaire_ht:95,taux_tva:20,total_ht:4560,position:1}
    ],
    factures: [
      {id:"fa1",numero:"F-2026-001",client_id:"cl1",chantier_id:"ch1",devis_id:"dv2",type:"situation",statut:"payee",date_facture:"2026-01-18",date_echeance:"2026-02-17",montant_ht:120000,montant_tva:12000,montant_ttc:132000,montant_paye:132000},
      {id:"fa2",numero:"F-2026-002",client_id:"cl2",chantier_id:"ch2",type:"acompte",statut:"payee",date_facture:"2026-02-12",date_echeance:"2026-03-14",montant_ht:68000,montant_tva:6800,montant_ttc:74800,montant_paye:74800},
      {id:"fa3",numero:"F-2026-003",client_id:"cl5",chantier_id:"ch6",type:"situation",statut:"payee",date_facture:"2026-03-08",date_echeance:"2026-04-07",montant_ht:210000,montant_tva:21000,montant_ttc:231000,montant_paye:231000},
      {id:"fa4",numero:"F-2026-004",client_id:"cl1",chantier_id:"ch1",type:"situation",statut:"partiellement_payee",date_facture:"2026-04-04",date_echeance:"2026-05-04",montant_ht:90000,montant_tva:9000,montant_ttc:99000,montant_paye:50000},
      {id:"fa5",numero:"F-2026-005",client_id:"cl3",chantier_id:"ch3",type:"facture",statut:"en_retard",date_facture:"2026-04-22",date_echeance:"2026-05-22",montant_ht:42000,montant_tva:8400,montant_ttc:50400,montant_paye:0},
      {id:"fa6",numero:"F-2026-006",client_id:"cl2",chantier_id:"ch2",type:"situation",statut:"payee",date_facture:"2026-05-10",date_echeance:"2026-06-09",montant_ht:88000,montant_tva:8800,montant_ttc:96800,montant_paye:96800},
      {id:"fa7",numero:"F-2026-007",client_id:"cl5",chantier_id:"ch6",type:"situation",statut:"envoyee",date_facture:"2026-06-06",date_echeance:"2026-07-06",montant_ht:180000,montant_tva:18000,montant_ttc:198000,montant_paye:0},
      {id:"fa8",numero:"F-2026-008",client_id:"cl4",chantier_id:"ch4",type:"acompte",statut:"envoyee",date_facture:"2026-06-26",date_echeance:"2026-07-26",montant_ht:48000,montant_tva:4800,montant_ttc:52800,montant_paye:0},
      {id:"fa9",numero:"F-2026-009",client_id:"cl3",chantier_id:"ch3",type:"facture",statut:"en_retard",date_facture:"2026-05-28",date_echeance:"2026-06-12",montant_ht:26000,montant_tva:5200,montant_ttc:31200,montant_paye:0},
      {id:"fa10",numero:"F-2026-010",client_id:"cl1",chantier_id:"ch1",type:"situation",statut:"brouillon",date_facture:"2026-07-04",date_echeance:"2026-08-03",montant_ht:60000,montant_tva:6000,montant_ttc:66000,montant_paye:0}
    ]
  };
  // Planning de démo, relatif à la semaine EN COURS (sinon l'aperçu serait vide) :
  (function(){
    var base=new Date(); base.setDate(base.getDate()-((base.getDay()+6)%7));
    function iso(x){ return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
    var plan=[ {e:"em1",c:"ch1",d:[0,1,2,3,4]}, {e:"em2",c:"ch2",d:[0,1,2]}, {e:"em2",c:"ch6",d:[3,4]}, {e:"em3",c:"ch1",d:[0,1,2,3,4]}, {e:"em4",c:"ch6",d:[1,2,3]} ];
    db.planning=[]; var pid=1;
    plan.forEach(function(p){ p.d.forEach(function(dow){ var dd=new Date(base); dd.setDate(base.getDate()+dow); db.planning.push({id:"pl"+(pid++),employee_id:p.e,chantier_id:p.c,date:iso(dd)}); }); });
    // Pointages (feuille d'heures) : cette semaine + quelques jours précédents.
    var pt=[
      {e:"em1",c:"ch1",d:0,h:8,t:"normal",v:true},{e:"em1",c:"ch1",d:1,h:8,t:"normal",v:true},{e:"em1",c:"ch1",d:2,h:9,t:"heure_sup",v:false},{e:"em1",c:"ch1",d:3,h:8,t:"normal",v:false},
      {e:"em2",c:"ch2",d:0,h:7.5,t:"normal",v:true},{e:"em2",c:"ch2",d:1,h:7.5,t:"normal",v:false},{e:"em2",c:"ch6",d:2,h:8,t:"normal",v:false},{e:"em2",c:"ch6",d:3,h:1.5,t:"trajet",v:false},
      {e:"em3",c:"ch1",d:0,h:8,t:"normal",v:true},{e:"em3",c:"ch1",d:1,h:8,t:"normal",v:false},{e:"em3",c:null,d:2,h:0,t:"absence",v:false},{e:"em3",c:"ch1",d:3,h:8.5,t:"heure_sup",v:false},
      {e:"em4",c:"ch6",d:1,h:7,t:"normal",v:true},{e:"em4",c:"ch6",d:2,h:7,t:"normal",v:false},{e:"em4",c:"ch6",d:3,h:8,t:"normal",v:false},
      {e:"em1",c:"ch1",d:-4,h:8,t:"normal",v:true},{e:"em2",c:"ch2",d:-3,h:8,t:"normal",v:true},{e:"em3",c:"ch1",d:-3,h:7.5,t:"normal",v:true}
    ];
    db.pointages=[]; var tid=1;
    pt.forEach(function(x){ var dd=new Date(base); dd.setDate(base.getDate()+x.d); db.pointages.push({id:"pt"+(tid++),employee_id:x.e,chantier_id:x.c,date_pointage:iso(dd),heures:x.h,type:x.t,valide:x.v}); });
    // Sous-traitants / fournisseurs : échéances d'assurance décennale relatives à aujourd'hui.
    var now2=new Date(); function isoOff(days){ var d=new Date(now2); d.setDate(d.getDate()+days); return iso(d); }
    db.suppliers=[
      {id:"sp1",nom:"Toiture Pro Méditerranée",categorie:"sous_traitant",specialite:"Couverture / étanchéité",siret:"812 456 789 00021",email:"contact@toiturepro.fr",tel:"04 42 55 66 77",ville:"Aix-en-Provence",code_postal:"13100",assurance_decennale:"AXA n°DC-88213",assurance_expire:isoOff(212)},
      {id:"sp2",nom:"Élec Provence",categorie:"sous_traitant",specialite:"Électricité",siret:"501 223 447 00013",email:"devis@elecprovence.fr",tel:"04 91 22 33 44",ville:"Marseille",code_postal:"13008",assurance_decennale:"MAAF n°EL-4521",assurance_expire:isoOff(18)},
      {id:"sp3",nom:"Plomberie Girard",categorie:"sous_traitant",specialite:"Plomberie / CVC",siret:"440 118 220 00019",email:"contact@plomberie-girard.fr",tel:"06 12 88 90 12",ville:"Lyon",code_postal:"69003",assurance_decennale:"Groupama n°PL-7788",assurance_expire:isoOff(-14)},
      {id:"sp4",nom:"Menuiserie Alpine",categorie:"sous_traitant",specialite:"Menuiserie bois / alu",siret:"390 552 661 00027",email:"info@menuiserie-alpine.fr",tel:"04 76 45 12 34",ville:"Grenoble",code_postal:"38000",assurance_decennale:"",assurance_expire:""},
      {id:"sp5",nom:"Point P Aix",categorie:"fournisseur",specialite:"Matériaux de construction",siret:"228 991 004 00045",email:"aix@pointp.fr",tel:"04 42 10 10 10",ville:"Aix-en-Provence",code_postal:"13290"},
      {id:"sp6",nom:"Rexel Marseille",categorie:"fournisseur",specialite:"Matériel électrique",siret:"117 448 220 00033",email:"marseille@rexel.fr",tel:"04 91 00 11 22",ville:"Marseille",code_postal:"13015"},
      {id:"sp7",nom:"Peinture & Déco Sud",categorie:"sous_traitant",specialite:"Peinture / finitions",siret:"620 771 883 00011",email:"contact@peinturesud.fr",tel:"06 33 44 55 66",ville:"Toulon",code_postal:"83000",assurance_decennale:"Allianz n°PE-2210",assurance_expire:isoOff(64)}
    ];
    // Opportunités (pipeline CRM) : dates d'action relatives à aujourd'hui.
    var op=[
      {c:"cl4",t:"Villa neuve Cap-Ferret",m:480000,e:"contact",s:"Site web",pa:"Envoyer la proposition",d:0},
      {c:"cl1",t:"Extension R+2 Les Oliviers",m:42000,e:"proposition",s:"Recommandation",pa:"Relancer après devis",d:-3},
      {c:"cl2",t:"Rénovation groupe scolaire",m:210000,e:"nouveau",s:"Appel d'offres",pa:"Prendre rendez-vous",d:4},
      {c:"cl3",t:"Entrepôt logistique phase 2",m:150000,e:"contact",s:"Client existant",pa:"Visite technique",d:2},
      {c:"cl5",t:"Aménagement bureaux Atrium",m:96000,e:"proposition",s:"Salon professionnel",pa:"Négocier le prix",d:11},
      {c:"cl1",t:"Ravalement façade sud",m:28000,e:"gagne",s:"Recommandation",pa:null,d:-12},
      {c:"cl2",t:"Réfection toiture école",m:64000,e:"gagne",s:"Appel d'offres",pa:null,d:-42},
      {c:"cl5",t:"Cloisons plateau 3e étage",m:38000,e:"gagne",s:"Client existant",pa:null,d:-73},
      {c:"cl3",t:"Extension quai (option)",m:52000,e:"perdu",s:"Appel d'offres",pa:null,d:-20}
    ];
    db.opportunites=[]; var oid=1;
    op.forEach(function(x){ db.opportunites.push({id:"op"+(oid++),client_id:x.c,titre:x.t,montant:x.m,etape:x.e,source:x.s,prochaine_action:x.pa,date_action:isoOff(x.d)}); });
    // Parc installé chez les clients (chaudières, PAC, VMC…), échéances d'entretien relatives à aujourd'hui.
    db.parc_installe=[
      {id:"pk1",client_id:"cl1",type:"chaudiere",marque:"Saunier Duval",modele:"ThemaPlus Condens",numero_serie:"SD-88213-A",localisation:"Chaufferie sous-sol",date_pose:"2023-03-14",date_garantie:isoOff(-40),dernier_entretien:isoOff(-350),prochain_entretien:isoOff(20)},
      {id:"pk2",client_id:"cl4",type:"pompe_chaleur",marque:"Daikin",modele:"Altherma 3",numero_serie:"DK-4521-B",localisation:"Local technique",date_pose:"2025-06-02",date_garantie:isoOff(420),dernier_entretien:isoOff(-120),prochain_entretien:isoOff(120)},
      {id:"pk3",client_id:"cl2",type:"vmc",marque:"Aldes",modele:"InspirAIR",numero_serie:"AL-7788",localisation:"Combles",date_pose:"2022-09-20",dernier_entretien:isoOff(-200),prochain_entretien:isoOff(-10)},
      {id:"pk4",client_id:"cl5",type:"climatisation",marque:"Mitsubishi",modele:"MSZ-AP",numero_serie:"MB-3320",localisation:"Bureaux 3e étage",date_pose:"2024-05-11",date_garantie:isoOff(180),dernier_entretien:isoOff(-160),prochain_entretien:isoOff(200)},
      {id:"pk5",client_id:"cl4",type:"chauffe_eau",marque:"Atlantic",modele:"Chaufféo 200L",numero_serie:"AT-1188",localisation:"Buanderie",date_pose:"2021-11-08",dernier_entretien:isoOff(-360),prochain_entretien:isoOff(9)},
      {id:"pk6",client_id:"cl3",type:"tableau_electrique",marque:"Schneider",modele:"Resi9",numero_serie:"SC-9021",localisation:"Entrée entrepôt",date_pose:"2023-01-30",prochain_entretien:isoOff(310)}
    ];
    // Contrats d'entretien récurrents.
    var ctr=[
      {c:"cl1",p:"pk1",r:"CTR-2026-014",t:"entretien",m:189,pe:"annuel",e:20,st:"actif"},
      {c:"cl4",p:"pk2",r:"CTR-2026-021",t:"maintenance",m:320,pe:"annuel",e:120,st:"actif"},
      {c:"cl2",p:"pk3",r:"CTR-2025-088",t:"entretien",m:45,pe:"trimestriel",e:-10,st:"actif"},
      {c:"cl5",p:"pk4",r:"CTR-2026-030",t:"maintenance",m:90,pe:"semestriel",e:200,st:"actif"},
      {c:"cl4",p:"pk5",r:"CTR-2026-007",t:"entretien",m:25,pe:"mensuel",e:9,st:"actif"},
      {c:"cl3",p:null,r:"CTR-2024-055",t:"garantie",m:150,pe:"annuel",e:-60,st:"expire"}
    ];
    db.contrats=[]; var cid=1;
    ctr.forEach(function(x){ db.contrats.push({id:"ct"+(cid++),client_id:x.c,parc_id:x.p,reference:x.r,type:x.t,montant:x.m,periodicite:x.pe,date_debut:isoOff(-330),prochaine_echeance:isoOff(x.e),statut:x.st}); });
    // Interventions (file de tickets) : mix de statuts + dates relatives à aujourd'hui.
    var itv=[
      {c:"cl2",e:"em5",ty:"Dépannage VMC",st:"planifie",dp:-2,du:null,de:null,ds:"VMC bruyante à l'étage, moteur à contrôler."},
      {c:"cl1",e:"em2",ty:"Entretien chaudière",st:"planifie",dp:0,du:null,de:null,ds:"Entretien annuel obligatoire — contrat CTR-2026-014."},
      {c:"cl4",e:"em1",ty:"Mise en service PAC",st:"en_cours",dp:-1,du:null,de:null,ds:"Mise en service pompe à chaleur Daikin Altherma 3."},
      {c:"cl5",e:"em2",ty:"Visite de contrôle",st:"planifie",dp:3,du:null,de:null,ds:"Contrôle clim bureaux avant l'été."},
      {c:"cl3",e:"em5",ty:"SAV sous garantie",st:"planifie",dp:6,du:null,de:null,ds:"Disjoncteur qui saute — tableau Resi9."},
      {c:"cl1",e:"em3",ty:"Dépannage fuite",st:"termine",dp:-9,du:2,de:-9,ds:"Fuite sous chaudière.",rp:"Remplacement du joint de bouclage et purge du circuit. RAS."},
      {c:"cl2",e:"em2",ty:"Entretien annuel",st:"termine",dp:-16,du:1.5,de:-16,ds:"Entretien VMC + filtres.",rp:"Nettoyage caisson, remplacement des filtres G4. Débit conforme."},
      {c:"cl4",e:"em1",ty:"Dépannage chauffe-eau",st:"termine",dp:-23,du:1,de:-23,ds:"Plus d'eau chaude.",rp:"Résistance entartrée remplacée. Anode vérifiée."},
      {c:"cl5",e:"em2",ty:"Entretien clim",st:"termine",dp:-30,du:2,de:-30,ds:"Entretien split bureaux.",rp:"Nettoyage échangeurs, recharge gaz d'appoint. OK."},
      {c:"cl3",e:"em5",ty:"Diagnostic tableau",st:"annule",dp:-5,du:null,de:null,ds:"RDV annulé par le client."},
      {c:"cl1",e:null,ty:"Réglage brûleur",st:"planifie",dp:null,du:null,de:null,ds:"À planifier avec le gardien."}
    ];
    db.interventions=[]; var iid=1;
    itv.forEach(function(x){ db.interventions.push({id:"in"+(iid++),client_id:x.c,employee_id:x.e,type:x.ty,statut:x.st,date_prevue:x.dp==null?null:isoOff(x.dp),date_reelle:x.de==null?null:isoOff(x.de),duree_heures:x.du,description:x.ds,rapport:x.rp||null}); });
  })();
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function coll(e){ if(!db[e]) db[e]=[]; return db[e]; }
  function matches(row,m){ if(!m) return true; for(var k in m){ if(String(row[k])!==String(m[k])) return false; } return true; }
  window.biltia = {
    list: function(e,opts){ opts=opts||{}; var rows=coll(e).filter(function(r){return matches(r,opts.match);});
      if(opts.order){ var asc=opts.ascending!==false; rows=rows.slice().sort(function(a,b){ var x=a[opts.order],y=b[opts.order]; if(x==null)return 1; if(y==null)return -1; return (x>y?1:x<y?-1:0)*(asc?1:-1); }); }
      if(opts.limit) rows=rows.slice(0,opts.limit);
      return Promise.resolve(clone(rows)); },
    get: function(e,id){ var r=coll(e).filter(function(x){return x.id===id;})[0]; return Promise.resolve(r?clone(r):null); },
    create: function(e,v){ var row=Object.assign({id:nid()},v||{}); coll(e).unshift(row); return Promise.resolve(clone(row)); },
    bulkCreate: function(e,rows){ (rows||[]).forEach(function(v){ coll(e).unshift(Object.assign({id:nid()},v)); }); return Promise.resolve({ok:true,inserted:(rows||[]).length}); },
    update: function(e,id,v){ var a=coll(e); for(var i=0;i<a.length;i++) if(a[i].id===id){ a[i]=Object.assign({},a[i],v); return Promise.resolve(clone(a[i])); } return Promise.resolve(null); },
    remove: function(e,id){ db[e]=coll(e).filter(function(x){return x.id!==id;}); return Promise.resolve(true); },
    notify: function(m){ toast(m,"success"); },
    extract: function(){ toast("Aperçu : l'analyse de photo est active dans l'app réelle.","error"); return Promise.reject(new Error("demo")); },
    transcribe: function(){ toast("Aperçu : la dictée est active dans l'app réelle.","error"); return Promise.reject(new Error("demo")); },
    parseDevis: function(){ toast("Aperçu : la dictée de devis est active dans l'app réelle.","error"); return Promise.reject(new Error("demo")); },
    sendEmail: function(){ toast("Aperçu : l'envoi d'email est actif dans l'app réelle."); return Promise.resolve({ok:true,via:"demo"}); },
    sendSms: function(){ toast("Aperçu : l'envoi de SMS est actif dans l'app réelle."); return Promise.resolve({ok:true,sent:1}); }
  };
})();
<\/script>`;
