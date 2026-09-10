import { defineMiddleware } from "astro:middleware";
import { createSupabase } from "./lib/supabase";

const PRIVATE_PREFIXES = ["/area"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const isPrivate = PRIVATE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  context.locals.user = null;

  // Consultamos la sesión en todas las páginas (la cabecera muestra si el
  // usuario está dentro), pero no en las rutas de auth ni en archivos estáticos.
  const skip = pathname.startsWith("/auth/") || /\.[a-z0-9]+$/i.test(pathname);
  if (!skip) {
    const supabase = createSupabase(context.request, context.cookies);
    const { data } = await supabase.auth.getUser();
    context.locals.user = data.user ?? null;
  }

  if (isPrivate && !context.locals.user) {
    return context.redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  const response = await next();
  if (isPrivate) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
});
