/**
 * Única fuente de verdad para las cabeceras de seguridad de la web.
 * Las aplica el Worker (src/worker.ts) a todas las respuestas y, como
 * defensa en profundidad, public/_headers repite el mismo conjunto para
 * lo que sirva directamente la capa de assets.
 */

export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
} as const;

/** Subconjunto para respuestas que no son HTML (CSS, JS, imágenes, fuentes, XML, txt). */
export const NON_HTML_HEADER_NAMES = [
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "Cross-Origin-Resource-Policy",
] as const satisfies readonly (keyof typeof SECURITY_HEADERS)[];

function isHtml(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return /^\s*text\/html\b/i.test(type);
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

/**
 * Añade las cabeceras de seguridad a una respuesta.
 * HTML y redirecciones reciben el conjunto completo; el resto solo HSTS,
 * nosniff y CORP. Si las cabeceras son inmutables (respuesta de fetch /
 * del binding ASSETS) se clona la respuesta antes de tocarlas.
 */
export function applySecurityHeaders(response: Response): Response {
  const names: readonly string[] =
    isHtml(response) || isRedirect(response)
      ? Object.keys(SECURITY_HEADERS)
      : NON_HTML_HEADER_NAMES;

  const apply = (target: Response) => {
    for (const name of names) {
      target.headers.set(name, SECURITY_HEADERS[name as keyof typeof SECURITY_HEADERS]);
    }
  };

  try {
    apply(response);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    apply(copy);
    return copy;
  }
}
