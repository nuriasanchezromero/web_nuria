import type { APIRoute } from "astro";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabase } from "../../lib/supabase";

/** Solo permitimos volver a rutas internas, nunca a otro dominio. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/area";
  return value;
}

export const GET: APIRoute = async ({ url, request, cookies, redirect }) => {
  const supabase = createSupabase(request, cookies);
  const next = safeNext(url.searchParams.get("next"));

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let errorMessage: string | null = null;

  if (code) {
    // Flujo PKCE: el enlace del correo trae ?code=...
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    // Flujo alternativo si la plantilla de correo usa token_hash
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "Enlace incompleto.";
  }

  if (errorMessage) {
    console.error("auth/callback:", errorMessage);
    return redirect("/auth/error");
  }
  return redirect(next);
};
