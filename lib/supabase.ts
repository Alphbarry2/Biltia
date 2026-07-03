import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

const raw_url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const raw_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured =
  raw_url.startsWith("https://") && raw_key.length > 20;

const SUPABASE_URL = isConfigured ? raw_url : "https://demo.supabase.co";
const SUPABASE_ANON_KEY = isConfigured
  ? raw_key
  : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo";

export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
