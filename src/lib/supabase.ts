import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { env } from "cloudflare:workers";

type Ctx = {
  request: Request;
  cookies: AstroCookies;
};

/**
 * Configuración de Supabase. Orden de búsqueda:
 *  1. entorno del Worker (`wrangler secret` en producción, .dev.vars en local):
 *     SUPABASE_URL / SUPABASE_ANON_KEY, con PUBLIC_* como alternativa;
 *  2. import.meta.env (archivo .env de Astro), mismos nombres.
 */
export function getSupabaseConfig() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const url =
    runtimeEnv.SUPABASE_URL ||
    runtimeEnv.PUBLIC_SUPABASE_URL ||
    import.meta.env.SUPABASE_URL ||
    import.meta.env.PUBLIC_SUPABASE_URL ||
    "";
  const anonKey =
    runtimeEnv.SUPABASE_ANON_KEY ||
    runtimeEnv.PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.SUPABASE_ANON_KEY ||
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

/** One Supabase client per request, with the session stored in cookies. */
export function createSupabase({ request, cookies }: Ctx) {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, {
            ...options,
            path: options.path ?? "/",
            sameSite: (options.sameSite as "lax" | "strict" | "none" | undefined) ?? "lax",
            httpOnly: options.httpOnly ?? true,
            secure: options.secure ?? true,
          });
        }
      },
    },
  });
}

/** Destino por defecto tras iniciar sesión. */
export const DEFAULT_NEXT = "/cuenta";

/**
 * Valida un destino `next` para evitar open redirects: solo rutas
 * relativas al propio sitio ("/algo"). Cualquier otra cosa -> /cuenta.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_NEXT;
  if (!value.startsWith("/")) return DEFAULT_NEXT;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_NEXT;
  if (value.includes(":") || /\s/.test(value)) return DEFAULT_NEXT;
  return value;
}
