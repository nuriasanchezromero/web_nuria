/**
 * Entrada del Worker de Cloudflare (wrangler.jsonc -> "main").
 * Envuelve el entrypoint del adaptador de Astro para:
 *  1. redirigir con 301 a la URL canónica: www -> dominio principal y
 *     HTTP plano -> HTTPS, en un solo salto,
 *  2. añadir las cabeceras de seguridad a todas las respuestas del Worker.
 *
 * El Worker solo se ejecuta para las rutas bajo demanda (/login, /cuenta,
 * /api/*, /auth/*) y para las URLs que no existen como archivo (404). Los
 * archivos estáticos, páginas prerenderizadas incluidas, los sirve la capa de
 * assets sin pasar por aquí: sus cabeceras vienen de public/_headers, y su
 * redirección a HTTPS y de www al dominio principal, de los ajustes de zona de
 * SECURITY.md (sección 2).
 *
 * Los tipos globales (Env, ExecutionContext, ExportedHandler) vienen de
 * worker-configuration.d.ts (generado con `wrangler types`).
 */
import server from "@astrojs/cloudflare/entrypoints/server";
import { applySecurityHeaders } from "./security-headers";

/** Dominio principal (el `site` de astro.config.mjs) y su variante www. */
const CANONICAL_HOST = "nuriasanchezromero.com";
const WWW_HOST = `www.${CANONICAL_HOST}`;

/** Hosts de desarrollo local: nunca se redirige (wrangler dev, astro preview). */
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
 * true si la petición viene de un entorno local y no del borde de Cloudflare.
 * En producción `cf-visitor` la pone siempre el borde (sobrescribe cualquier
 * valor del cliente) y manda: las excepciones locales solo se consultan
 * cuando falta, para que nadie pueda evitar las redirecciones enviando
 * cabeceras de desarrollo como `mf-original-hostname`. No cambiar este orden.
 */
function isLocalRequest(request: Request, url: URL): boolean {
  if (cfVisitorScheme(request)) return false;
  return isLocalRuntime(request, url);
}

/** true si el visitante llegó por HTTP plano (mismo orden que isLocalRequest). */
function isPlainHttp(request: Request, url: URL): boolean {
  const scheme = cfVisitorScheme(request);
  if (scheme) return scheme === "http";
  if (isLocalRuntime(request, url)) return false;
  return url.protocol === "http:";
}

/**
 * URL canónica a la que redirigir, o null si la petición ya lo es.
 * http://www.dominio/x?y va directamente a https://dominio/x?y (un salto).
 * La ruta y la query se copian tal cual sobre una URL con host fijo, así que
 * una ruta como //otro.example sigue siendo una ruta de este dominio.
 */
function canonicalRedirect(request: Request, url: URL): string | null {
  // Solo en `astro dev`: nunca se redirige, para poder abrir el servidor de
  // desarrollo por IP de la red local o de Tailscale (su puerto no habla
  // HTTPS). En producción import.meta.env.DEV es false y la rama desaparece.
  if (import.meta.env.DEV) return null;

  const toCanonicalHost = url.hostname === WWW_HOST && !isLocalRequest(request, url);
  if (!toCanonicalHost && !isPlainHttp(request, url)) return null;

  const target = new URL(url);
  target.protocol = "https:";
  if (toCanonicalHost) {
    target.hostname = CANONICAL_HOST;
    target.port = "";
  }
  return target.toString();
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

    const location = canonicalRedirect(request, url);
    if (location) return applySecurityHeaders(Response.redirect(location, 301));

    const response = await server.fetch(request, env, ctx);
    return reportOnlyInDev(applySecurityHeaders(response));
  },
} satisfies ExportedHandler<Env>;
