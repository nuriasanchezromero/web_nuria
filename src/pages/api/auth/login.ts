export const prerender = false;

import type { APIRoute } from "astro";
import { createSupabase, DEFAULT_NEXT, safeNext } from "../../../lib/supabase";

/** Construye /login?...&next=... conservando el destino si no es el de por defecto. */
function loginUrl(params: Record<string, string>, next: string): string {
  const search = new URLSearchParams(params);
  if (next !== DEFAULT_NEXT) search.set("next", next);
  return `/login?${search.toString()}`;
}

export const POST: APIRoute = async (context) => {
  const { request, redirect, url } = context;

  // Un cuerpo que no es de formulario (p. ej. JSON) no llega del formulario de
  // /login: se trata como email no válido en vez de acabar en un 500.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(loginUrl({ error: "email" }, DEFAULT_NEXT));
  }

  const email = form.get("email")?.toString().trim().toLowerCase();
  const next = safeNext(form.get("next")?.toString());

  if (!email || !email.includes("@")) {
    return redirect(loginUrl({ error: "email" }, next));
  }

  const supabase = createSupabase(context);
  if (!supabase) return redirect(loginUrl({ error: "config" }, next));

  // El enlace del email vuelve a /api/auth/callback; `next` viaja dentro del
  // redirect y se vuelve a validar allí. Sin `next` se mantiene la URL exacta
  // que ya está en la lista de Redirect URLs de Supabase (en producción,
  // además, auth-js añade `sb_flow_id`; ver src/lib/supabase.ts).
  const callback = new URL("/api/auth/callback", url.origin);
  if (next !== DEFAULT_NEXT) callback.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString() },
  });

  if (error) {
    console.error("signInWithOtp", error.status, error.code, error.message);
    // 429: Supabase no ha enviado ningún correo. Pasa si ya se pidió un enlace
    // para esta dirección hace menos de un minuto (over_email_send_rate_limit)
    // o si se ha agotado un límite de envíos del proyecto. No se invita a
    // reintentar: cada intento, aunque se rechace, guarda otro verificador
    // PKCE en este navegador y, al quinto, auth-js descarta el del enlace que
    // sí salió (ver src/pages/api/auth/callback.ts).
    return redirect(loginUrl({ error: error.status === 429 ? "espera" : "envio" }, next));
  }
  return redirect(loginUrl({ enviado: "1" }, next));
};
