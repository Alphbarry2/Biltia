/**
 * Stub de `@supabase/realtime-js`.
 *
 * POURQUOI : Biltia n'utilise NULLE PART les abonnements temps réel de Supabase
 * (aucun `.channel()`, `.subscribe()`, presence ni broadcast — vérifié). Or
 * `@supabase/supabase-js` importe et réexporte `realtime-js` inconditionnellement
 * (`export * from "@supabase/realtime-js"`), ce qui :
 *   1. tirait ~35 Ko de code mort (WebSocket + Worker + presence) dans CHAQUE
 *      bundle qui touche le client Supabase (toutes les pages de l'app) ;
 *   2. faisait émettre à Turbopack, à chaque compilation, l'avertissement
 *      « error TP1001 new Worker(???) is not statically analyse-able » (le worker
 *      de heartbeat de realtime-js — un chemin de code jamais exécuté ici, car
 *      supabase-js ne passe jamais `worker: true`).
 *
 * Ce module est aliasé sur `@supabase/realtime-js` dans next.config.ts (Turbopack
 * ET webpack) pour dev et prod. Il réexporte les 9 symboles attendus par le
 * `export *` de supabase-js et implémente en no-op sûr les seules méthodes que
 * supabase-js appelle sur le client (`setAuth`, `channel`, `getChannels`,
 * `removeChannel`, `removeAllChannels`).
 *
 * ⚠️ SI un jour vous ajoutez du temps réel Supabase (`.channel(...).subscribe()`),
 * retirez cet alias dans next.config.ts — sinon les abonnements seront des no-op
 * silencieux.
 */

// ── Enums réexportés (valeurs fidèles à realtime-js, défensif : non utilisés ici)
export const REALTIME_LISTEN_TYPES = {
  BROADCAST: "broadcast",
  PRESENCE: "presence",
  POSTGRES_CHANGES: "postgres_changes",
  SYSTEM: "system",
} as const;

export const REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {
  ALL: "*",
  INSERT: "INSERT",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
} as const;

export const REALTIME_PRESENCE_LISTEN_EVENTS = {
  SYNC: "sync",
  JOIN: "join",
  LEAVE: "leave",
} as const;

export const REALTIME_SUBSCRIBE_STATES = {
  SUBSCRIBED: "SUBSCRIBED",
  TIMED_OUT: "TIMED_OUT",
  CLOSED: "CLOSED",
  CHANNEL_ERROR: "CHANNEL_ERROR",
} as const;

export const REALTIME_CHANNEL_STATES = {
  closed: "closed",
  errored: "errored",
  joined: "joined",
  joining: "joining",
  leaving: "leaving",
} as const;

// ── Classes réexportées (no-op : jamais instanciées via un usage temps réel)
export class RealtimePresence {
  state: Record<string, unknown> = {};
  onJoin(): void {}
  onLeave(): void {}
  onSync(): void {}
}

export class RealtimeChannel {
  constructor(public topic = "", public params: unknown = {}) {}
  on(): this {
    return this;
  }
  subscribe(): this {
    return this;
  }
  async unsubscribe(): Promise<"ok"> {
    return "ok";
  }
  send(): Promise<"ok"> {
    return Promise.resolve("ok");
  }
  async track(): Promise<"ok"> {
    return "ok";
  }
  async untrack(): Promise<"ok"> {
    return "ok";
  }
  presenceState(): Record<string, unknown> {
    return {};
  }
}

/**
 * Remplaçant minimal de `RealtimeClient`. supabase-js l'instancie toujours mais,
 * sans abonnement, seules ces méthodes sont appelées — toutes inoffensives.
 */
export class RealtimeClient {
  channels: RealtimeChannel[] = [];
  accessTokenValue: string | null = null;

  constructor(public endPoint = "", public options: unknown = {}) {}

  setAuth(token: string | null = null): void {
    this.accessTokenValue = token;
  }
  connect(): void {}
  disconnect(): void {}
  channel(topic: string, params: unknown = {}): RealtimeChannel {
    const ch = new RealtimeChannel(topic, params);
    this.channels.push(ch);
    return ch;
  }
  getChannels(): RealtimeChannel[] {
    return this.channels;
  }
  async removeChannel(channel: RealtimeChannel): Promise<"ok"> {
    this.channels = this.channels.filter((c) => c !== channel);
    return "ok";
  }
  async removeAllChannels(): Promise<"ok"[]> {
    this.channels = [];
    return [];
  }
}

/** realtime-js exporte aussi une fabrique WebSocket — non utilisée ici. */
export class WebSocketFactory {}

export default RealtimeClient;
