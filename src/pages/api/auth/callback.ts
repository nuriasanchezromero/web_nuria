export const prerender = false;

import type { APIRoute } from "astro";
import { createSupabase, safeNext } from "../../../lib/supabase";

/**
 * Procesa el enlace mágico del email (flujo PKCE: `?code=`) y redirige a
 * `next`, validado con safeNext() para evitar open redirects.
 * También se expone como /auth/callback (src/pages/auth/callback.ts).
 *
 * El enlace solo funciona en el navegador que lo pidió: el verificador PKCE
 * vive en sus cookies. Así nadie puede iniciar la sesión de otra persona con
 * un enlace fabricado (por eso ya no se aceptan enlaces `token_hash`).
 *
 * En producción cada enlace lleva `sb_flow_id` (ver src/lib/supabase.ts), que
 * identifica el verificador de su petición. El código se canjea solo con ese:
 * nunca se envía el verificador de otra petición pendiente, porque según
 * auth-js eso podría gastar el código, que es de un solo uso. Por eso el
 * enlace sigue valiendo aunque después se hayan pedido otros en el mismo
 * navegador (rechazados por el minuto de espera de Supabase, o para otra
 * dirección), y al entrar se borran las cookies de ese verificador.
 *
 * Límite: auth-js guarda como mucho cinco verificadores por navegador y cada
 * petición añade uno, también las rechazadas (auth-js intenta borrar el suyo,
 * pero @supabase/ssr 0.12.7 no llega a escribir ese borrado en la respuesta).
 * El enlace aguanta hasta cuatro peticiones posteriores desde el mismo
 * navegador; con la quinta se descarta su verificador y acaba en
 * /login?error=enlace. Por eso un 429 no invita a reintentar (ver
 * src/pages/api/auth/login.ts).
 *
 * Sin `sb_flow_id` (en local) se usa el último verificador guardado.
 */
export const GET: APIRoute = async (context) => {
  const { url, redirect } = context;
  const next = safeNext(url.searchParams.get("next"));

  const supabase = createSupabase(context);
  if (!supabase) return redirect("/login?error=config");

  const code = url.searchParams.get("code");
  if (code) {
    const flowId = url.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) return redirect(next);
    console.error("exchangeCodeForSession", error.message);
  }

  return redirect("/login?error=enlace");
};
