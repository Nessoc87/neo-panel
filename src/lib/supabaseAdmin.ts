import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Inicialización diferida: Next.js importa los módulos de API durante el build.
// No debemos exigir las credenciales en el momento de importar este archivo;
// se validan cuando una ruta intenta usar Supabase en tiempo de ejecución.
let clienteAdmin: SupabaseClient | null = null;

function obtenerClienteAdmin(): SupabaseClient {
  if (clienteAdmin) {
    return clienteAdmin;
  }

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

  clienteAdmin = createClient(
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

  return clienteAdmin;
}

// Proxy para conservar la interfaz existente:
// las rutas siguen usando supabaseAdmin.from(...), sin cambiar sus archivos.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, propiedad) {
    const cliente = obtenerClienteAdmin();
    const valor = Reflect.get(cliente, propiedad, cliente);

    return typeof valor === "function"
      ? valor.bind(cliente)
      : valor;
  },
});
