export const prerender = false;

import type { APIRoute } from "astro";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabase, safeNext } from "../../../lib/supabase";

/**
 * Procesa el enlace mágico del email (flujo PKCE con `code`, o `token_hash`
 * + `type` si la plantilla usa {{ .TokenHash }}) y redirige a `next`,
 * validado con safeNext() para evitar open redirects.
 * También se expone como /auth/callback (src/pages/auth/callback.ts).
 */
export const GET: APIRoute = async (context) => {
  const { url, redirect } = context;
  const next = safeNext(url.searchParams.get("next"));

  const supabase = createSupabase(context);
  if (!supabase) return redirect("/login?error=config");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect(next);
    console.error("exchangeCodeForSession", error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return redirect(next);
    console.error("verifyOtp", error.message);
  }

  return redirect("/login?error=enlace");
};
