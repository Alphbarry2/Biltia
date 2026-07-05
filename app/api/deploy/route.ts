import { createClient } from "@/lib/supabase-server";
import { getEntitlements, canDeployLive } from "@/lib/entitlements";

const VERCEL_API = "https://api.vercel.com";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function vercelFetch(path: string, options: RequestInit) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN non configuré.");

  const teamId = process.env.VERCEL_TEAM_ID;
  const url = new URL(`${VERCEL_API}${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Vercel API error ${res.status}`);
  }
  return json;
}

async function ensureProject(projectName: string): Promise<string> {
  try {
    const data = await vercelFetch(`/v9/projects/${projectName}`, {
      method: "GET",
    });
    return data.id;
  } catch {
    // Project doesn't exist — create it
    const data = await vercelFetch("/v10/projects", {
      method: "POST",
      body: JSON.stringify({ name: projectName, framework: null }),
    });
    return data.id;
  }
}

async function deployHtml(projectName: string, html: string): Promise<string> {
  // Upload file and get sha
  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);
  const hashBuffer = await crypto.subtle.digest("SHA-1", bytes);
  const sha = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Upload file
  await vercelFetch("/v2/files", {
    method: "POST",
    headers: {
      "x-vercel-digest": sha,
      "Content-Type": "text/html; charset=utf-8",
    },
    body: html,
  });

  // Create deployment
  const deployment = await vercelFetch("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      files: [{ file: "index.html", sha, size: bytes.length }],
      target: "production",
      projectSettings: {
        framework: null,
        buildCommand: null,
        outputDirectory: null,
        installCommand: null,
        rootDirectory: null,
      },
    }),
  });

  // Return production URL
  const alias = deployment.alias?.[0] ?? deployment.url;
  return `https://${alias}`;
}

export async function POST(req: Request) {
  try {
    if (!process.env.VERCEL_TOKEN) {
      return Response.json(
        { error: "Déploiement Vercel non configuré (VERCEL_TOKEN manquant)." },
        { status: 503 }
      );
    }

    // Auth
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }

    // Gating plan : le déploiement Live est réservé aux plans payants.
    const ent = await getEntitlements(supabase, user.id);
    if (!canDeployLive(ent)) {
      return Response.json(
        {
          error:
            "Le déploiement Live nécessite un plan Pro. Passez à un plan payant depuis vos paramètres.",
          upgrade: true,
        },
        { status: 403 }
      );
    }

    // Parse body
    let body: { appId?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const { appId } = body;
    if (!appId) {
      return Response.json({ error: "appId requis." }, { status: 400 });
    }

    // Fetch app — RLS ensures ownership
    const { data: app, error: appError } = await supabase
      .from("modules")
      .select("id, name, html_content, vercel_project_id, status")
      .eq("id", appId)
      .neq("status", "archived")
      .single();

    if (appError || !app) {
      return Response.json({ error: "Application introuvable ou accès refusé." }, { status: 404 });
    }

    // Les applications CONNECTÉES (SDK window.biltia → /api/data) exigent une
    // session Biltia same-origin : déployées sur Vercel (autre domaine), leurs
    // appels de données échoueraient pour tout le monde. On refuse honnêtement
    // plutôt que de livrer une app cassée.
    if (app.html_content.includes("window.biltia")) {
      return Response.json(
        {
          error:
            "Cette application est connectée aux données de votre workspace : elle fonctionne dans Biltia (votre équipe y accède via la Bibliothèque, connectée). Le déploiement externe est réservé aux applications autonomes.",
        },
        { status: 400 }
      );
    }

    // Determine project name (reuse if already deployed)
    const projectName =
      app.vercel_project_id ?? `biltia-${slugify(app.name)}-${app.id.slice(0, 8)}`;

    // Ensure Vercel project exists
    await ensureProject(projectName);

    // Deploy the HTML
    const deploymentUrl = await deployHtml(projectName, app.html_content);

    // Persist URL + project name
    await supabase
      .from("modules")
      .update({ deployment_url: deploymentUrl, vercel_project_id: projectName })
      .eq("id", app.id);

    return Response.json({ url: deploymentUrl });
  } catch (err) {
    console.error("Deploy error:", err);
    const msg = err instanceof Error ? err.message : "Erreur de déploiement.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
