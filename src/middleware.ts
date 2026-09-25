import { defineMiddleware } from "astro:middleware";
import { createSupabase } from "./lib/supabase";

/**
 * Solo se ejecuta en rutas bajo demanda (login, cuenta, api/auth, auth).
 * Las páginas prerenderizadas las sirve el binding ASSETS antes de llegar
 * aquí; sus cabeceras de seguridad las pone src/worker.ts.
 */

const PROTECTED = (pathname: string) => pathname === "/cuenta" || pathname.startsWith("/cuenta/");

const PRIVATE = (pathname: string) =>
  PROTECTED(pathname) ||
  pathname === "/login" ||
  pathname === "/login/" ||
  pathname.startsWith("/api/auth/") ||
  pathname.startsWith("/auth/");

function noStore(response: Response): Response {
  try {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set("Cache-Control", "private, no-store");
    return copy;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  context.locals.user = null;

  if (PROTECTED(pathname)) {
    const supabase = createSupabase(context);
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (!data.user) {
      const next = encodeURIComponent(pathname + context.url.search);
      return noStore(context.redirect(`/login?next=${next}`));
    }
    context.locals.user = data.user;
  }

  const response = await next();
  return PRIVATE(pathname) ? noStore(response) : response;
});
