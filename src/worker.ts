/**
 * Entrada del Worker de Cloudflare (wrangler.jsonc -> "main").
 * Envuelve el entrypoint del adaptador de Astro para:
 *  1. redirigir HTTP plano a HTTPS (301),
 *  2. añadir las cabeceras de seguridad a TODAS las respuestas,
 *     incluidas las páginas prerenderizadas que sirve el binding ASSETS
 *     y que nunca pasan por el middleware de Astro.
 * Los tipos globales (Env, ExecutionContext, ExportedHandler) vienen de
 * worker-configuration.d.ts (generado con `wrangler types`).
 */
import server from "@astrojs/cloudflare/entrypoints/server";
import { applySecurityHeaders } from "./security-headers";

/** Hosts de desarrollo local: nunca se fuerza HTTPS (astro dev / wrangler dev). */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  );
}

/**
 * Entorno local aunque el host no lo parezca: `wrangler dev` (miniflare)
 * reescribe el host de la petición al custom_domain de wrangler.jsonc y
 * añade la cabecera interna `mf-original-hostname`. Sin esta excepción el
 * servidor local entraría en un bucle de redirecciones.
 */
function isLocalRuntime(request: Request, url: URL): boolean {
  return isLocalHost(url.hostname) || request.headers.has("mf-original-hostname");
}

/** Esquema con el que el visitante llegó al borde de Cloudflare; null fuera de Cloudflare. */
function cfVisitorScheme(request: Request): "http" | "https" | null {
  const visitor = request.headers.get("cf-visitor");
  if (!visitor) return null;
  try {
    const parsed: unknown = JSON.parse(visitor);
    if (parsed && typeof parsed === "object" && "scheme" in parsed) {
      const scheme = (parsed as { scheme: unknown }).scheme;
      if (scheme === "http" || scheme === "https") return scheme;
    }
  } catch {
    // cabecera malformada: se ignora
  }
  return null;
}

/**
 * true si hay que redirigir a HTTPS. En producción `cf-visitor` la pone
 * siempre el borde de Cloudflare (sobrescribe cualquier valor del cliente)
 * y manda; las excepciones locales solo se consultan cuando falta, para que
 * nadie pueda evitar la redirección enviando cabeceras de desarrollo.
 */
function isPlainHttp(request: Request, url: URL): boolean {
  const scheme = cfVisitorScheme(request);
  if (scheme) return scheme === "http";
  if (isLocalRuntime(request, url)) return false;
  return url.protocol === "http:";
}

/**
 * Solo en `astro dev`: la CSP pasa a modo informe (Content-Security-Policy-
 * Report-Only). La barra de herramientas de Astro y el HMR de Vite inyectan
 * scripts inline que `script-src 'self'` bloquearía; las violaciones siguen
 * viéndose en la consola. En producción esta rama no existe (import.meta.env.DEV
 * es false y se elimina al compilar).
 */
function reportOnlyInDev(response: Response): Response {
  if (!import.meta.env.DEV) return response;
  const csp = response.headers.get("Content-Security-Policy");
  if (csp) {
    response.headers.delete("Content-Security-Policy");
    response.headers.set("Content-Security-Policy-Report-Only", csp);
  }
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (isPlainHttp(request, url)) {
      url.protocol = "https:";
      return applySecurityHeaders(Response.redirect(url.toString(), 301));
    }

    const response = await server.fetch(request, env, ctx);
    return reportOnlyInDev(applySecurityHeaders(response));
  },
} satisfies ExportedHandler<Env>;
