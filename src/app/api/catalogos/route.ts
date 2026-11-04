
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireNeoPermission } from "@/lib/neo-auth";

export async function GET(request: NextRequest) {
  const denied = await requireNeoPermission(request, "catalogs.view");
  if (denied) return denied;


  try {
    const [clientesResult, conceptosResult] = await Promise.all([
      supabaseAdmin
        .from("neo_clientes")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre", { ascending: true }),

      supabaseAdmin
        .from("neo_conceptos")
        .select(
          "id, nombre, precio_unitario, precio_manual, iva_porcentaje, retencion_porcentaje, retencion_aplica, orden"
        )
        .eq("activo", true)
        .order("orden", { ascending: true })
        .order("nombre", { ascending: true }),
    ]);

    if (clientesResult.error || conceptosResult.error) {
      console.error("Error consultando catálogos Neo:", {
        clientes: clientesResult.error?.code,
        conceptos: conceptosResult.error?.code,
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible cargar los clientes y conceptos. Verifica que el catálogo esté creado en Supabase.",
        },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        clientes: clientesResult.data ?? [],
        conceptos: conceptosResult.data ?? [],
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Ocurrió un error al cargar los catálogos.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
