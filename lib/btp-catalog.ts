// ─────────────────────────────────────────────────────────────────────────────
// CATALOGUE BTP — classification à deux niveaux (catégorie → sous-métier).
// Structure inspirée des fédérations professionnelles (FFB, CAPEB, FNTP).
//
// Chaque sous-métier embarque son propre bloc de knowledge (~80 tokens).
// La génération n'assemble QUE les blocs des sous-métiers sélectionnés.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

export type SubTrade = {
  id: string;
  categoryId: string;
  label: string;
  keywords: string[];
  knowledge: string;
};

export type Category = {
  id: string;
  label: string;
  emoji: string;
  subTrades: SubTrade[];
};

export type ActivityType = {
  id: string;
  label: string;
  hint: string;
};

// ── Catalogue des 12 catégories ───────────────────────────────────────────────

export const CATEGORIES: Category[] = [
  {
    id: "gros_oeuvre",
    label: "Gros œuvre",
    emoji: "🧱",
    subTrades: [
      {
        id: "maconnerie",
        categoryId: "gros_oeuvre",
        label: "Maçonnerie",
        keywords: ["maçon", "maçonnerie", "parpaing", "brique", "mur", "élévation", "linteau"],
        knowledge: `Maçonnerie : fondations, semelles, parpaings, briques, élévation des murs, linteaux, chape, enduit. Unités : m², m³, ml. Documents : devis quantitatif, métré, suivi de chantier. TVA 20% neuf, 10% rénovation.`,
      },
      {
        id: "beton_arme",
        categoryId: "gros_oeuvre",
        label: "Béton armé",
        keywords: ["béton", "dalle", "toupie", "coulage", "béton armé", "m³"],
        knowledge: `Béton armé : coulage dalles/voiles, commande toupies (m³), bon de livraison béton, résistance (C20/25…), délai décoffrage. Unités : m³, m². Documents : suivi de coulage, bon livraison, plan béton.`,
      },
      {
        id: "coffrage",
        categoryId: "gros_oeuvre",
        label: "Coffrage",
        keywords: ["coffrage", "banché", "banche", "décoffrage", "coffre"],
        knowledge: `Coffrage : banches, étais, coffrages perdus, temps de décoffrage, location matériel. Unités : m², j (location). Documents : planning décoffrage, bon de location, suivi coulage.`,
      },
      {
        id: "ferraillage",
        categoryId: "gros_oeuvre",
        label: "Ferraillage",
        keywords: ["ferraillage", "acier", "HA", "treillis", "armature", "kg acier"],
        knowledge: `Ferraillage : aciers HA, treillis soudés, façonnage, plans d'armature, quantitatif acier (kg). Unités : kg, T, ml. Documents : plan ferraillage, bon de commande acier, métré acier.`,
      },
      {
        id: "demolition",
        categoryId: "gros_oeuvre",
        label: "Démolition / Désamiantage",
        keywords: ["démolition", "déconstruction", "désamiantage", "amiante", "dépollution"],
        knowledge: `Démolition/Désamiantage : repérage amiante, rapport HAP, plan de retrait, évacuation gravats (m³ benne), certificats déchets dangereux. Documents : rapport diagnostiqueur, plan de retrait, BSD (bordereau suivi déchets).`,
      },
    ],
  },

  {
    id: "terrassement_vrd",
    label: "Terrassement & VRD",
    emoji: "🚧",
    subTrades: [
      {
        id: "terrassement",
        categoryId: "terrassement_vrd",
        label: "Terrassement",
        keywords: ["terrassement", "déblai", "remblai", "fouille", "pelle", "mini-pelle", "compacteur"],
        knowledge: `Terrassement : déblai, remblai, fouilles, cubatures (m³), location engins (pelle, mini-pelle, compacteur, tombereau). Documents : bon de location engin, suivi de cubature, bon d'évacuation terres.`,
      },
      {
        id: "vrd",
        categoryId: "terrassement_vrd",
        label: "VRD / Voirie",
        keywords: ["vrd", "voirie", "enrobé", "bordure", "caniveau", "plateforme"],
        knowledge: `VRD : voirie, enrobés (m²), bordures (ml), caniveaux, avaloirs, signalisation horizontale/verticale. Unités : m², ml, T (enrobé). Documents : métré voirie, suivi de pose, récolement.`,
      },
      {
        id: "assainissement",
        categoryId: "terrassement_vrd",
        label: "Assainissement",
        keywords: ["assainissement", "EU", "EP", "fosse", "réseau", "collecteur", "regard"],
        knowledge: `Assainissement : eaux usées (EU), eaux pluviales (EP), fosses toutes eaux, collecteurs PVC, regards de visite. Unités : ml, u. Documents : plan de réseau, attestation conformité, récolement.`,
      },
      {
        id: "reseaux_enterres",
        categoryId: "terrassement_vrd",
        label: "Réseaux enterrés",
        keywords: ["réseaux", "ENEDIS", "GRDF", "télécom", "fibre", "gaine", "câble enterré"],
        knowledge: `Réseaux enterrés : fourreaux ENEDIS/GRDF/télécom/fibre, grillages avertisseurs, dalles de protection. Concessionnaires : ENEDIS, GRDF, Orange, FTTH. Unités : ml. Documents : DT/DICT, récolement géoréférencé.`,
      },
      {
        id: "genie_civil",
        categoryId: "terrassement_vrd",
        label: "Génie civil léger",
        keywords: ["génie civil", "mur de soutènement", "gabion", "ouvrage hydraulique"],
        knowledge: `Génie civil léger : murs de soutènement, gabions, ouvrages hydrauliques, bassins de rétention. Unités : m³, m². Documents : note de calcul, CCTP, devis quantitatif.`,
      },
    ],
  },

  {
    id: "structure_bois_toiture",
    label: "Structure bois & Toiture",
    emoji: "🏚️",
    subTrades: [
      {
        id: "charpente",
        categoryId: "structure_bois_toiture",
        label: "Charpente",
        keywords: ["charpente", "charpentier", "fermette", "panne", "chevron", "poutre"],
        knowledge: `Charpente : fermettes industrielles, charpente traditionnelle (pannes, chevrons, sablières), calcul de section. Unités : m³ (bois), ml, m². Documents : plan de charpente, note de calcul, devis charpente.`,
      },
      {
        id: "couverture",
        categoryId: "structure_bois_toiture",
        label: "Couverture",
        keywords: ["couverture", "couvreur", "tuile", "ardoise", "faîtage", "noue", "velux"],
        knowledge: `Couverture : tuiles, ardoises, faîtage, noue, arêtier, velux, écran sous-toiture. Unités : m² (surface de toiture), ml (faîtage/noue). Documents : devis couverture, relevé toiture, suivi pose.`,
      },
      {
        id: "zinguerie",
        categoryId: "structure_bois_toiture",
        label: "Zinguerie",
        keywords: ["zinc", "zinguerie", "gouttière", "chéneau", "descente EP", "noue zinc"],
        knowledge: `Zinguerie : zinc, cuivre, gouttières, chéneaux, descentes EP, solins, bavettes. Unités : ml (gouttière/chéneau), m² (zinc façonné). Documents : devis zinguerie, métré linéaire.`,
      },
      {
        id: "ossature_bois",
        categoryId: "structure_bois_toiture",
        label: "Ossature bois / CLT",
        keywords: ["ossature bois", "CLT", "maison bois", "panneau bois", "RE2020"],
        knowledge: `Ossature bois / CLT : panneaux CLT, montants OSB, isolation biosourcée, RE2020. Unités : m² (surface habitable), m³ (bois massif). Documents : plan d'ossature, CCTP structure bois, attestation RE2020.`,
      },
    ],
  },

  {
    id: "electricite",
    label: "Électricité",
    emoji: "⚡",
    subTrades: [
      {
        id: "electricite_generale",
        categoryId: "electricite",
        label: "Électricité générale",
        keywords: ["électricité", "électricien", "tableau", "disjoncteur", "circuit", "prise", "NF C 15-100", "Consuel"],
        knowledge: `Électricité générale : tableau, disjoncteurs, différentiels, circuits, prises, points lumineux, gaines, NF C 15-100, Consuel, GTL, mise à la terre. Unités : u, ml (câble), forfait. Documents : devis par poste, attestation Consuel.`,
      },
      {
        id: "courants_faibles",
        categoryId: "electricite",
        label: "Courants faibles / Réseaux",
        keywords: ["courants faibles", "fibre", "réseau informatique", "VDI", "câblage", "baie de brassage", "RJ45"],
        knowledge: `Courants faibles : câblage VDI, RJ45 Cat6/6A, baies de brassage, TV, interphonie, contrôle d'accès. Unités : u (prises), ml (câble). Documents : plan VDI, certification câblage, devis courants faibles.`,
      },
      {
        id: "domotique",
        categoryId: "electricite",
        label: "Domotique / Alarme",
        keywords: ["domotique", "KNX", "Zigbee", "alarme", "détection", "intrusion", "vidéosurveillance"],
        knowledge: `Domotique/Alarme : systèmes KNX, Zigbee, alarme intrusion, vidéosurveillance, contrôle d'accès, maison connectée. Unités : u, forfait. Documents : devis domotique, plan d'implantation caméras, contrat télésurveillance.`,
      },
      {
        id: "photovoltaique",
        categoryId: "electricite",
        label: "Photovoltaïque",
        keywords: ["photovoltaïque", "PV", "panneaux solaires", "onduleur", "kWc", "autoconsommation", "injection"],
        knowledge: `Photovoltaïque : panneaux PV (kWc), onduleurs, micro-onduleurs, autoconsommation/injection, raccordement Enedis, garanties RGE. Unités : kWc, kWh/an, m² (toiture). Documents : devis PV, déclaration préalable, attestation Consuel P, contrat S21.`,
      },
      {
        id: "irve",
        categoryId: "electricite",
        label: "Bornes IRVE",
        keywords: ["IRVE", "borne recharge", "véhicule électrique", "wallbox", "P.7"],
        knowledge: `IRVE (bornes de recharge VE) : wallbox, bornes publiques, puissance (kW), gestion dynamique, qualification IRVE obligatoire. Unités : u (borne), kW. Documents : attestation IRVE, rapport de mise en service, déclaration P.7.`,
      },
    ],
  },

  {
    id: "plomberie_cvc",
    label: "Plomberie & CVC",
    emoji: "🔧",
    subTrades: [
      {
        id: "plomberie",
        categoryId: "plomberie_cvc",
        label: "Plomberie / Sanitaire",
        keywords: ["plomberie", "plombier", "sanitaire", "PER", "cuivre", "multicouche", "évacuation", "DTU 60.1"],
        knowledge: `Plomberie/Sanitaire : alimentation PER/cuivre/multicouche, évacuation PVC, collecteurs, robinetterie, sanitaires. DTU 60.1. Unités : ml, u. Documents : devis sanitaire, plan réseaux, attestation Qualigaz.`,
      },
      {
        id: "chauffage",
        categoryId: "plomberie_cvc",
        label: "Chauffage",
        keywords: ["chauffage", "chaudière", "radiateur", "plancher chauffant", "fioul", "gaz", "condensation"],
        knowledge: `Chauffage : chaudières gaz/fioul/condensation, radiateurs, plancher chauffant hydraulique (m²), circuits de distribution. Unités : kW (puissance), u, ml. Documents : devis chauffage, attestation Qualigaz, notice chaudière.`,
      },
      {
        id: "climatisation",
        categoryId: "plomberie_cvc",
        label: "Climatisation / Froid",
        keywords: ["climatisation", "split", "gainable", "réversible", "froid", "fluide frigorigène"],
        knowledge: `Climatisation : unités intérieures/extérieures split/gainable, fluides frigorigènes, attestation manipulation fluides (Cerfa). Unités : kW, u. Documents : devis clim, fiche d'intervention (fluides), attestation capacité.`,
      },
      {
        id: "ventilation",
        categoryId: "plomberie_cvc",
        label: "Ventilation / VMC",
        keywords: ["VMC", "ventilation", "double flux", "hygro", "CTA", "gaine"],
        knowledge: `Ventilation/VMC : VMC simple/double flux, hygroréglable A/B, CTA, gaines, bouches. Conformité DTU 68. Unités : u, ml (gaine), m³/h. Documents : devis VMC, plan de gaines, rapport d'équilibrage.`,
      },
      {
        id: "pac",
        categoryId: "plomberie_cvc",
        label: "Pompe à chaleur",
        keywords: ["PAC", "pompe à chaleur", "aérothermie", "géothermie", "COP", "RGE", "MaPrimeRénov"],
        knowledge: `PAC : aérothermie air/eau, géothermie, COP, qualification RGE QualiPAC, aides MaPrimeRénov'/CEE. Unités : kW (puissance), u. Documents : devis PAC, dossier CEE, attestation RGE, fiche produit.`,
      },
    ],
  },

  {
    id: "fermetures_menuiserie",
    label: "Fermetures & Menuiserie",
    emoji: "🚪",
    subTrades: [
      {
        id: "menuiserie_exterieure",
        categoryId: "fermetures_menuiserie",
        label: "Menuiserie extérieure",
        keywords: ["fenêtre", "porte", "baie vitrée", "volet", "Uw", "double vitrage", "triple vitrage"],
        knowledge: `Menuiserie extérieure : fenêtres, portes, baies vitrées, volets, Uw (W/m².K), double/triple vitrage, poses (applique, tunnel, rénovation). Unités : u, m² (vitrage). Documents : devis avec cotes, relevé d'ouvertures, fiche technique.`,
      },
      {
        id: "menuiserie_interieure",
        categoryId: "fermetures_menuiserie",
        label: "Menuiserie intérieure",
        keywords: ["porte intérieure", "placard", "dressing", "parquet", "plinthe", "escalier"],
        knowledge: `Menuiserie intérieure : portes, placards, dressings, parquet (m²), plinthes (ml), escaliers. Unités : u (portes), m² (parquet), ml (plinthes). Documents : devis menuiserie, plan d'agencement, devis sur mesure.`,
      },
      {
        id: "serrurerie",
        categoryId: "fermetures_menuiserie",
        label: "Serrurerie",
        keywords: ["serrurerie", "serrure", "cylindre", "verrou", "fermeture", "badge"],
        knowledge: `Serrurerie : serrures multipoints, cylindres, contrôle d'accès, coffres-forts, dépannage serrurerie. Unités : u. Documents : devis serrurerie, bon d'intervention, contrat de maintenance.`,
      },
      {
        id: "metallerie",
        categoryId: "fermetures_menuiserie",
        label: "Métallerie",
        keywords: ["métallerie", "garde-corps", "portail", "grille", "main courante", "acier", "alu", "soudure"],
        knowledge: `Métallerie : garde-corps, portails, grilles, mains courantes, pergolas alu/acier, soudure. Unités : ml (garde-corps), u (portails), kg (acier). Documents : devis sur mesure, plan de fabrication, suivi atelier.`,
      },
      {
        id: "veranda_pergola",
        categoryId: "fermetures_menuiserie",
        label: "Vérandas / Pergolas",
        keywords: ["véranda", "pergola", "carport", "abri", "store", "brise-soleil"],
        knowledge: `Vérandas/Pergolas : structures alu/acier, vitrages, stores intégrés, brise-soleil, permis de construire si > 20m². Unités : m². Documents : devis, plan d'implantation, déclaration préalable ou PC.`,
      },
    ],
  },

  {
    id: "isolation_cloisons",
    label: "Isolation & Cloisons",
    emoji: "🧱",
    subTrades: [
      {
        id: "platrerie",
        categoryId: "isolation_cloisons",
        label: "Plâtrerie",
        keywords: ["plâtrerie", "plaquiste", "placo", "BA13", "enduit", "staff"],
        knowledge: `Plâtrerie : plaques BA13/BA18, rails, montants, bandes, enduits, staff décoratif. Unités : m² (cloison, plafond), ml (rail). Documents : devis au m² par ouvrage, métré de surfaces.`,
      },
      {
        id: "isolation_interieure",
        categoryId: "isolation_cloisons",
        label: "Isolation intérieure (ITI)",
        keywords: ["isolation", "laine de verre", "laine de roche", "ITI", "R thermique", "doublage"],
        knowledge: `Isolation intérieure : doublage collé/sur ossature, laine minérale/biosourcée, R thermique, RE2020. Unités : m², R (m².K/W). Documents : devis doublage, DPE avant/après, attestation CEE.`,
      },
      {
        id: "faux_plafonds",
        categoryId: "isolation_cloisons",
        label: "Faux plafonds",
        keywords: ["faux plafond", "plafond suspendu", "dalle", "T24", "acoustique"],
        knowledge: `Faux plafonds : ossature T24/T15, dalles minérales/métalliques, plafond acoustique, coupe-feu. Unités : m². Documents : devis faux plafond, plan de calepinage, fiche technique acoustique.`,
      },
      {
        id: "cloisons",
        categoryId: "isolation_cloisons",
        label: "Cloisons / Doublages",
        keywords: ["cloison", "cloison de distribution", "doublage", "séparative", "phonique"],
        knowledge: `Cloisons : cloisons de distribution 72/98mm, cloisons séparatives (phonique), doublages thermiques. Affaiblissement acoustique Rw (dB). Unités : m². Documents : devis cloisons, plan de distribution.`,
      },
    ],
  },

  {
    id: "revetements_finitions",
    label: "Revêtements & Finitions",
    emoji: "🎨",
    subTrades: [
      {
        id: "carrelage_faience",
        categoryId: "revetements_finitions",
        label: "Carrelage / Faïence",
        keywords: ["carrelage", "carreleur", "faïence", "joint", "ragréage", "calepinage"],
        knowledge: `Carrelage/Faïence : sol/mur, poses droite/diagonale, ragréage, primaire, joints, plinthes. Unités : m² (pose), ml (plinthe). Documents : devis au m², plan de calepinage, calcul de chutes.`,
      },
      {
        id: "sols_souples",
        categoryId: "revetements_finitions",
        label: "Sols souples / Moquette",
        keywords: ["sol souple", "LVT", "vinyl", "moquette", "linoléum", "pose collée"],
        knowledge: `Sols souples : LVT, vinyl, lino, moquette, poses collée/flottante/clipsée, ragréage. Unités : m². Documents : devis au m² par type de sol, bon de commande fournitures.`,
      },
      {
        id: "parquet",
        categoryId: "revetements_finitions",
        label: "Parquet",
        keywords: ["parquet", "stratifié", "contrecollé", "massif", "vitrification", "ponçage"],
        knowledge: `Parquet : massif, contrecollé, stratifié, poses (cloué, collé, flottant), ponçage/vitrification, plinthes. Unités : m². Documents : devis parquet, bon de commande.`,
      },
      {
        id: "peinture",
        categoryId: "revetements_finitions",
        label: "Peinture",
        keywords: ["peinture", "peintre", "sous-couche", "finition", "mat", "satin", "ratissage", "enduit"],
        knowledge: `Peinture : sous-couche, finitions (mat/satin/velours), ratissage, enduit de rebouchage. Unités : m² (mur/plafond), nombre de couches. Documents : devis par pièce et finition, calcul de consommation.`,
      },
      {
        id: "papier_peint_decoration",
        categoryId: "revetements_finitions",
        label: "Papier peint / Décoration",
        keywords: ["papier peint", "toile de verre", "décoration", "stuc", "béton ciré"],
        knowledge: `Papier peint/Décoration : papier peint, toile de verre, stuc, béton ciré, enduits décoratifs. Unités : m² (rouleaux), lés. Documents : devis décoration, plan de pose.`,
      },
    ],
  },

  {
    id: "facades_etancheite",
    label: "Façades & Étanchéité",
    emoji: "🏗️",
    subTrades: [
      {
        id: "ravalement",
        categoryId: "facades_etancheite",
        label: "Ravalement de façade",
        keywords: ["ravalement", "façade", "crépi", "enduit", "hydrofuge", "nettoyage façade"],
        knowledge: `Ravalement : enduit monocouche/bicouche, crépi gratté/tyrolien, hydrofuge, traitement fissures. Unités : m² (façade, déduction baies). Documents : devis ravalement, diagnostic fissures, rapport échafaudage.`,
      },
      {
        id: "ite",
        categoryId: "facades_etancheite",
        label: "ITE / Isolation extérieure",
        keywords: ["ITE", "isolation thermique extérieure", "bardage", "polystyrène EPS", "laine minérale façade", "MaPrimeRénov"],
        knowledge: `ITE : polystyrène EPS/laine de roche, enduit de finition, cheville, R thermique, RGE. Aides MaPrimeRénov'/CEE. Unités : m² (ITE). Documents : devis ITE, dossier CEE, attestation RGE, audit énergétique.`,
      },
      {
        id: "etancheite",
        categoryId: "facades_etancheite",
        label: "Étanchéité",
        keywords: ["étanchéité", "membrane", "bitume", "EPDM", "toiture terrasse", "relevé"],
        knowledge: `Étanchéité : membranes bitumineuses, EPDM, TPO, relevés, toitures terrasses accessibles/végétalisées. Unités : m², ml (relevé). Documents : rapport d'étanchéité, garantie décennale, CCTP étanchéité.`,
      },
      {
        id: "bardage",
        categoryId: "facades_etancheite",
        label: "Bardage",
        keywords: ["bardage", "bardage bois", "fibrociment", "composite", "lame de façade", "ossature bardage"],
        knowledge: `Bardage : lames bois, fibrociment, composite, alu/zinc, ossature secondaire, lame d'air ventilée. Unités : m². Documents : devis bardage, plan de façade, fiche technique.`,
      },
    ],
  },

  {
    id: "amenagements_exterieurs",
    label: "Aménagements extérieurs",
    emoji: "🌿",
    subTrades: [
      {
        id: "paysagisme",
        categoryId: "amenagements_exterieurs",
        label: "Paysagisme / Espaces verts",
        keywords: ["paysagiste", "espaces verts", "pelouse", "plantation", "taille", "entretien jardin"],
        knowledge: `Paysagisme : création/entretien espaces verts, engazonnement, plantation, taille, arrosage. Unités : m² (surface), u (arbres/arbustes), h. Documents : devis paysagisme, plan de plantation, contrat d'entretien.`,
      },
      {
        id: "clotures",
        categoryId: "amenagements_exterieurs",
        label: "Clôtures / Portails",
        keywords: ["clôture", "portail", "grillage", "palissade", "haie", "panneaux rigides"],
        knowledge: `Clôtures/Portails : grillage, panneaux rigides, portails coulissants/battants, piliers, motorisation. Unités : ml (clôture), u (portail). Documents : devis clôture, plan d'implantation, déclaration préalable.`,
      },
      {
        id: "pavage_terrasses",
        categoryId: "amenagements_exterieurs",
        label: "Pavage / Terrasses",
        keywords: ["pavé", "terrasse", "dallage", "béton désactivé", "allée", "stabilisé"],
        knowledge: `Pavage/Terrasses : pavés autobloquants, dallage, béton désactivé, stabilisé, terrasses bois/composite. Unités : m², T (graviers). Documents : devis dallage, calepinage, plan d'implantation.`,
      },
      {
        id: "piscines",
        categoryId: "amenagements_exterieurs",
        label: "Piscines / Spa",
        keywords: ["piscine", "spa", "bassin", "liner", "filtration", "local technique"],
        knowledge: `Piscines/Spa : construction béton/coque, liner, margelles, local technique, filtration, traitement eau (chlore, sel). Unités : m³ (volume), m² (plage). Documents : devis piscine, permis de construire (> 10m²), DTU 60.5.`,
      },
    ],
  },

  {
    id: "maintenance_services",
    label: "Maintenance & Services",
    emoji: "🔩",
    subTrades: [
      {
        id: "depannage_sav",
        categoryId: "maintenance_services",
        label: "Dépannage / SAV",
        keywords: ["dépannage", "SAV", "urgence", "intervention", "panne", "astreinte"],
        knowledge: `Dépannage/SAV : interventions urgentes, fiches d'intervention (cause/remède/pièces), délai d'intervention, astreinte. Unités : h, forfait déplacement, u (pièces). Documents : bon d'intervention, rapport SAV, facture SAV.`,
      },
      {
        id: "maintenance_contrats",
        categoryId: "maintenance_services",
        label: "Maintenance / Contrats",
        keywords: ["maintenance", "contrat d'entretien", "visite annuelle", "carnet d'entretien", "préventif"],
        knowledge: `Maintenance préventive : contrats d'entretien annuels/pluriannuels, gammes de maintenance, suivi carnet entretien, pièces consommables. Unités : u (visites), h. Documents : contrat de maintenance, rapport de visite, carnet d'entretien.`,
      },
      {
        id: "nettoyage_chantier",
        categoryId: "maintenance_services",
        label: "Nettoyage de chantier",
        keywords: ["nettoyage chantier", "évacuation déchets", "benne", "tri sélectif", "propreté"],
        knowledge: `Nettoyage chantier : évacuation gravats (benne m³), tri sélectif, nettoyage fin de chantier. Unités : m³ (benne), m² (nettoyé), u (rotation benne). Documents : bon de commande benne, BSD déchets, attestation valorisation.`,
      },
    ],
  },

  {
    id: "entreprise_generale",
    label: "Entreprise générale",
    emoji: "🏢",
    subTrades: [
      {
        id: "tce",
        categoryId: "entreprise_generale",
        label: "Tous Corps d'État (TCE)",
        keywords: ["TCE", "tous corps d'état", "entreprise générale", "clé en main"],
        knowledge: `TCE : coordination de l'ensemble des corps de métier, devis global, sous-traitance, DPGF multi-lots. Documents : DPGF, planning d'exécution TCE, situation de travaux globale, OS (ordre de service), réception.`,
      },
      {
        id: "contractant_general",
        categoryId: "entreprise_generale",
        label: "Contractant général",
        keywords: ["contractant général", "marché global", "conception-réalisation", "CR"],
        knowledge: `Contractant général : marché unique conception-réalisation, interlocuteur unique MOA, coordination études+travaux. Documents : contrat CG, planning global, situation mensuelle, PV de réception.`,
      },
      {
        id: "renovation_globale",
        categoryId: "entreprise_generale",
        label: "Rénovation globale / BBC",
        keywords: ["rénovation globale", "BBC", "passoire thermique", "audit énergétique", "Mon Accompagnateur Rénov"],
        knowledge: `Rénovation globale BBC : audit énergétique, gestes combinés (isolation + CVC + ventilation), MaPrimeRénov' Parcours accompagné, Mon Accompagnateur Rénov. Documents : audit avant/après, dossier CEE groupé, attestation RGE, rapport final.`,
      },
    ],
  },
];

// ── Index rapide ──────────────────────────────────────────────────────────────

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const SUBTRADE_BY_ID = new Map(
  CATEGORIES.flatMap((c) => c.subTrades).map((s) => [s.id, s])
);

export function getCategory(id: string): Category | undefined {
  return CATEGORY_BY_ID.get(id);
}

export function getSubTrade(id: string): SubTrade | undefined {
  return SUBTRADE_BY_ID.get(id);
}

export function getAllSubTrades(): SubTrade[] {
  return CATEGORIES.flatMap((c) => c.subTrades);
}

// ── Types d'activité ─────────────────────────────────────────────────────────

export const ACTIVITY_TYPES: ActivityType[] = [
  {
    id: "construction_neuve",
    label: "Construction neuve",
    hint: "L'utilisateur travaille principalement en construction neuve. Privilégie les outils de suivi de chantier, DPGF, situations de travaux, planning d'exécution.",
  },
  {
    id: "renovation",
    label: "Rénovation",
    hint: "L'utilisateur travaille principalement en rénovation. Privilégie les devis de rénovation, métrés, aides (CEE/MaPrimeRénov'), suivi de travaux chez le particulier.",
  },
  {
    id: "depannage",
    label: "Dépannage / Urgences",
    hint: "L'utilisateur fait principalement du dépannage. Privilégie les fiches d'intervention rapides, bons de travaux, suivi SAV, facturation immédiate.",
  },
  {
    id: "maintenance",
    label: "Maintenance / Contrats",
    hint: "L'utilisateur gère des contrats de maintenance. Privilégie les plannings de visite, carnets d'entretien, suivi des équipements, contrats récurrents.",
  },
  {
    id: "marches_publics",
    label: "Marchés publics",
    hint: "L'utilisateur répond à des appels d'offres publics. Privilégie DPGF, CCTP, situations de travaux, retenue de garantie 5%, DGD.",
  },
  {
    id: "mixte",
    label: "Mixte / Plusieurs activités",
    hint: "L'utilisateur a des activités variées. Propose des outils polyvalents adaptables à différents types de missions.",
  },
];

const ACTIVITY_BY_ID = new Map(ACTIVITY_TYPES.map((a) => [a.id, a]));

export function getActivityType(id: string): ActivityType | undefined {
  return ACTIVITY_BY_ID.get(id);
}

// ── Assemblage du knowledge pour le system prompt ─────────────────────────────

const COMMON_BTP_CONTEXT = `## Conventions BTP communes
TVA : 20% neuf · 10% rénovation · 5,5% rénovation énergétique.
Acteurs : MOA, MOE, chef de chantier, compagnon, sous-traitant, fournisseur.
Documents transverses : devis, facture, acompte, situation de travaux, bon de livraison, décennale, URSSAF.
Adapte-toi au vocabulaire de l'utilisateur sans jamais lui demander de préciser davantage.`;

export function buildKnowledgeBlock(
  subTradeIds: string[],
  activityTypeId?: string | null,
  sectorDetail?: string | null
): string {
  const blocks: string[] = [];

  // Group by category for a readable prompt structure
  const byCategory = new Map<string, SubTrade[]>();
  for (const id of subTradeIds) {
    const st = getSubTrade(id);
    if (!st) continue;
    const list = byCategory.get(st.categoryId) ?? [];
    list.push(st);
    byCategory.set(st.categoryId, list);
  }

  if (byCategory.size > 0) {
    blocks.push("# CONNAISSANCE MÉTIER DE L'UTILISATEUR\n");
    for (const [catId, subTrades] of byCategory) {
      const cat = getCategory(catId);
      blocks.push(`## ${cat?.emoji ?? ""} ${cat?.label ?? catId}`);
      for (const st of subTrades) {
        blocks.push(`### ${st.label}\n${st.knowledge}`);
      }
    }
  } else {
    blocks.push("# CONTEXTE BTP\nEntreprise du BTP française, tous corps de métier.");
  }

  // Add common conventions
  blocks.push(COMMON_BTP_CONTEXT);

  // Add activity type context
  if (activityTypeId) {
    const activity = getActivityType(activityTypeId);
    if (activity) {
      blocks.push(`## Activité principale : ${activity.label}\n${activity.hint}`);
    }
  }

  // Précision libre saisie par l'utilisateur : rattrape la spécialité exacte que
  // la famille ne capture pas (« électricien spécialisé bornes de recharge »).
  // On la place en DERNIER pour qu'elle prime dans le ton et le vocabulaire.
  const detail = sectorDetail?.trim();
  if (detail) {
    blocks.push(`## Spécialité déclarée par l'utilisateur\n« ${detail} ». Emploie précisément ce vocabulaire et ces cas d'usage.`);
  }

  return blocks.join("\n\n");
}

// ── Mots-clés pour le routeur ─────────────────────────────────────────────────

export function getKeywordsForSubTrades(subTradeIds: string[]): string[] {
  const all: string[] = [];
  for (const id of subTradeIds) {
    const st = getSubTrade(id);
    if (st) all.push(...st.keywords);
  }
  return [...new Set(all)];
}

/**
 * Parmi les sous-métiers déclarés par l'utilisateur, retourne celui dont les
 * mots-clés matchent le mieux la demande. Retourne null si aucun match.
 *
 * Utilisé pour injecter UNIQUEMENT le vocabulaire pertinent à la demande,
 * même quand l'utilisateur a plusieurs secteurs cochés.
 */
export function detectBestSubTrade(
  prompt: string,
  subTradeIds: string[]
): string | null {
  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const text = normalize(prompt);

  let best: string | null = null;
  let bestScore = 0;

  for (const id of subTradeIds) {
    const st = getSubTrade(id);
    if (!st) continue;
    let score = 0;
    for (const kw of st.keywords) {
      if (text.includes(normalize(kw))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }

  return bestScore > 0 ? best : null;
}
