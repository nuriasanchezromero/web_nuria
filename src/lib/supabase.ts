import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";

type Ctx = {
  request: Request;
  cookies: AstroCookies;
  locals: App.Locals;
};

type PublicEnv = { PUBLIC_SUPABASE_URL?: string; PUBLIC_SUPABASE_ANON_KEY?: string };

/** Reads the public Supabase settings from the Cloudflare runtime, falling back to build-time env in dev. */
export function getSupabaseConfig(locals: App.Locals) {
  const runtimeEnv = (locals as { runtime?: { env?: PublicEnv } }).runtime?.env ?? {};
  const url = runtimeEnv.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || "";
  const anonKey = runtimeEnv.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

/** One Supabase client per request, with the session stored in cookies. */
export function createSupabase({ request, cookies, locals }: Ctx) {
  const { url, anonKey, configured } = getSupabaseConfig(locals);
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
