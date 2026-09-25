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

/** Host de producción (el `site` de astro.config.mjs, que es también la Site URL de Supabase). */
const SITE_HOSTNAME = import.meta.env.SITE ? new URL(import.meta.env.SITE).hostname : null;

/**
 * Atributos de todas las cookies de Supabase (sesión y verificadores PKCE).
 * httpOnly: ningún código del navegador las lee (no hay cliente de Supabase en
 * el navegador y la CSP solo permite connect-src 'self'), así que un script
 * inyectado no puede robar el token de refresco.
 */
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;

/** One Supabase client per request, with the session stored in cookies. */
export function createSupabase({ request, cookies }: Ctx) {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;

  return createServerClient(url, anonKey, {
    auth: {
      experimental: {
        // Cada enlace mágico lleva `sb_flow_id`, que identifica el verificador
        // PKCE de esa petición concreta (ver src/pages/api/auth/callback.ts).
        // Solo en el host de producción: Supabase acepta siempre las URLs del
        // mismo origen que la Site URL, pero en local (localhost:4321) el
        // parámetro extra dejaría de coincidir con la entrada exacta de
        // Redirect URLs y el enlace acabaría en producción.
        appendPkceFlowIdToRedirects: new URL(request.url).hostname === SITE_HOSTNAME,
      },
    },
    cookieOptions: COOKIE_OPTIONS,
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
            path: options.path ?? COOKIE_OPTIONS.path,
            sameSite: (options.sameSite as "lax" | "strict" | "none" | undefined) ?? COOKIE_OPTIONS.sameSite,
            // Siempre, sin mirar options: @supabase/ssr manda httpOnly: false
            // por defecto y un `?? true` nunca llegaría a aplicarse.
            httpOnly: true,
            secure: options.secure ?? COOKIE_OPTIONS.secure,
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
 * Solo se admite ASCII imprimible sin espacios (0x21-0x7E): un carácter de
 * control (%00) o no ASCII rompería la cabecera Location y la respuesta
 * acabaría en un 500. Las rutas legítimas llegan siempre codificadas con %.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_NEXT;
  if (!value.startsWith("/")) return DEFAULT_NEXT;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_NEXT;
  if (value.includes(":") || /[^\x21-\x7e]/.test(value)) return DEFAULT_NEXT;
  return value;
}
