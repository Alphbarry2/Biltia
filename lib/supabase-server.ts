import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

const raw_url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const raw_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const SUPABASE_URL = raw_url.startsWith("https://") ? raw_url : "https://demo.supabase.co";
const SUPABASE_ANON_KEY =
  raw_key.length > 20 ? raw_key : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — safe to ignore
        }
      },
    },
  });
}
