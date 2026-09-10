import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "astro:env/server";
import type { AstroCookies } from "astro";

/**
 * Crea un cliente de Supabase ligado a la petición actual.
 * La sesión del usuario viaja en cookies; hay que crear un cliente nuevo
 * en cada petición (nunca reutilizarlo entre peticiones).
 */
export function createSupabase(request: Request, cookies: AstroCookies) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, { path: "/", ...options });
        }
      },
    },
  });
}
