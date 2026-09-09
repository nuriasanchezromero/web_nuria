import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { env } from "cloudflare:workers";

type Ctx = {
  request: Request;
  cookies: AstroCookies;
};

/** Public Supabase settings, read from the Cloudflare runtime (wrangler.jsonc vars / .dev.vars). */
export function getSupabaseConfig() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const url = runtimeEnv.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || "";
  const anonKey = runtimeEnv.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || "";
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
