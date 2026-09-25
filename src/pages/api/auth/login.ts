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
  const form = await request.formData();
  const email = form.get("email")?.toString().trim().toLowerCase();
  const next = safeNext(form.get("next")?.toString());

  if (!email || !email.includes("@")) {
    return redirect(loginUrl({ error: "email" }, next));
  }

  const supabase = createSupabase(context);
  if (!supabase) return redirect(loginUrl({ error: "config" }, next));

  // El enlace del email vuelve a /api/auth/callback; `next` viaja dentro del
  // redirect y se vuelve a validar allí. Sin `next` se mantiene la URL exacta
  // que ya está en la lista de Redirect URLs de Supabase.
  const callback = new URL("/api/auth/callback", url.origin);
  if (next !== DEFAULT_NEXT) callback.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString() },
  });

  if (error) {
    console.error("signInWithOtp", error.message);
    return redirect(loginUrl({ error: "envio" }, next));
  }
  return redirect(loginUrl({ enviado: "1" }, next));
};
