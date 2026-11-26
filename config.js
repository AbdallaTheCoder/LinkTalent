import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://nyexmqbtdlpthjqasabq.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_kPDRwrzUrCcJdHo116iJcg_oUfVPDvc";

export function isSupabaseConfigured() {
  return (
    typeof SUPABASE_URL === "string" &&
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_PUBLIC_KEY")
  );
}

let clientInstance = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return clientInstance;
}
