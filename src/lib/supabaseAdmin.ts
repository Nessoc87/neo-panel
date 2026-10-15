import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("Falta configurar SUPABASE_URL en el servidor.");
}

if (!supabaseSecretKey) {
  throw new Error(
    "Falta configurar SUPABASE_SECRET_KEY en el servidor."
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);