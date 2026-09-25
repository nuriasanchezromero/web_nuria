# Seguridad de nuriasanchezromero.com

Estado a 25 de septiembre de 2026. Este documento tiene tres partes: lo que ya está resuelto en el código
(se despliega solo con cada push a `main`), la lista de acciones manuales pendientes en los paneles de
Cloudflare, GitHub y Supabase, y cómo informar de una vulnerabilidad.

Leyenda:

- `[x]` **Hecho en código.** Vive en el repositorio y se verifica en cada despliegue.
- `[ ]` **Pendiente, acción manual.** Hay que hacerlo en un panel externo; el código no puede hacerlo por sí solo.

## 1. Qué hay implementado en el código

### 1.1 Cabeceras de seguridad `[x]`

Fuente única: `src/security-headers.ts`. Las aplica `src/worker.ts` a **todas** las respuestas, incluidas las
páginas prerenderizadas que sirve el binding `ASSETS` (que nunca pasan por el middleware de Astro).
`public/_headers` repite el mismo conjunto como defensa en profundidad para lo que sirva directamente la
capa de assets (`/_astro/*`).

| Cabecera | Valor exacto |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `X-Permitted-Cross-Domain-Policies` | `none` |

Qué recibe cada respuesta:

- HTML y redirecciones (3xx): las nueve cabeceras.
- Otras respuestas generadas por el Worker (XML, txt, imágenes): `Strict-Transport-Security`, `X-Content-Type-Options` y `Cross-Origin-Resource-Policy`.
- `/_astro/*` (CSS, JS, fuentes, imágenes optimizadas, con hash en el nombre): las nueve cabeceras vía `public/_headers` más `Cache-Control: public, max-age=31536000, immutable`.
- Rutas privadas (`/cuenta*`, `/login`, `/api/auth/*`, `/auth/*`): además `Cache-Control: private, no-store` (puesto por `src/middleware.ts`), para que ninguna caché intermedia ni el historial del navegador guarden páginas con sesión.

Detalle de `public/_headers` que conviene no romper: wrangler se queda solo con la **última** sección de cada
ruta y las reglas son acumulativas. Por eso hay una única sección `/_astro/*`, que declara ella misma el
`Cache-Control` inmutable (si se quita, el adaptador vuelve a inyectar la suya y wrangler la descarta) y
"desengancha" con `! Cabecera` las dos que repite para no enviar `nosniff, nosniff`.

### 1.2 HTTPS forzado `[x]`

`src/worker.ts` responde `301` hacia la misma URL con `https:` cuando el visitante llega por HTTP plano:

1. Nunca redirige en entornos locales: host `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`, `*.local`, o presencia de la cabecera interna `mf-original-hostname` que añade `wrangler dev`.
2. Si llega la cabecera `cf-visitor` (Cloudflare la envía siempre en producción), su `scheme` manda: redirige si y solo si es `"http"`.
3. Solo si `cf-visitor` falta o está malformada decide `url.protocol === "http:"`.

Las redirecciones llevan el conjunto completo de cabeceras. Con `Strict-Transport-Security` de un año, el
navegador que haya visitado la web una vez ya no vuelve a pedir HTTP. Aun así el interruptor de zona
"Always Use HTTPS" de Cloudflare sigue pendiente (sección 2): resuelve el caso en el borde antes de que
la petición llegue al Worker y cubre cualquier recurso que no pase por él.

### 1.3 CSP y por qué `style-src` lleva `'unsafe-inline'` `[x]`

- **Scripts:** `script-src 'self'`, sin `'unsafe-inline'`. `astro.config.mjs` fija `vite.build.assetsInlineLimit: 0` para que Astro emita todos los scripts como archivos externos `<script type="module" src="/_astro/...">` (verificado: cero `<script>` sin `src` en el HTML compilado). Un `<script is:inline>` quedaría bloqueado en producción.
- **Estilos:** `style-src 'self' 'unsafe-inline'` es necesario porque el HTML compilado contiene un `<style>` inline por página que genera el componente `<Font>` de Astro (las reglas `@font-face` de las fuentes autoalojadas), varios atributos `style=""` del diseño y un SVG `data:` como fondo de textura. Quitarlo rompería las fuentes y el diseño. El riesgo real es bajo: la inyección de CSS no ejecuta código, y los scripts sí están cerrados.
- **Imágenes** solo propias o `data:`; **fuentes** solo propias; **fetch/XHR** solo al mismo origen; **iframes, embeds y objetos** prohibidos (`frame-src 'none'`, `object-src 'none'`); la web no puede ser enmarcada por otros (`frame-ancestors 'none'` más `X-Frame-Options: DENY`); los formularios solo pueden enviarse al propio sitio (`form-action 'self'`); `base-uri 'self'` evita secuestrar rutas relativas.
- En `astro dev` (y solo ahí, la rama desaparece del bundle de producción) la CSP se envía como `Content-Security-Policy-Report-Only`, porque la barra de herramientas de Astro y el HMR de Vite inyectan scripts inline. Las violaciones siguen apareciendo en la consola del navegador.

### 1.4 Zona privada, sesión y cookies `[x]`

- `src/middleware.ts` protege `/cuenta` y todo `/cuenta/*`: sin sesión válida (`supabase.auth.getUser()`) responde `302` a `/login?next=<ruta>`. `src/pages/cuenta.astro` repite la comprobación por si acaso.
- La sesión la gestiona `@supabase/ssr` en cookies con `httpOnly`, `secure`, `sameSite=lax` y `path=/` (`src/lib/supabase.ts`). No hay sesión de Astro ni KV (`session: false` en `astro.config.mjs`).
- El cliente de Supabase se crea por petición; la clave usada es la `anon`, que es pública por diseño. La protección de datos reales dependerá siempre de RLS en Supabase (sección 2).
- Limitación conocida: `/cuenta/<ruta-inexistente>` devuelve la página 404 prerenderizada sin pasar por el middleware. No filtra nada; cualquier página futura bajo `/cuenta/` sí quedará protegida al coincidir con una ruta bajo demanda.

### 1.5 CSRF `[x]`

Astro trae `security.checkOrigin` activado por defecto: en rutas bajo demanda rechaza con `403` cualquier
`POST`/`PUT`/`PATCH`/`DELETE` con cuerpo de formulario cuya cabecera `Origin` no coincida con el sitio.
Verificado en local: `POST /api/auth/login` desde `Origin: https://evil.example` devuelve `403`. Sumado a
`form-action 'self'` y a las cookies `sameSite=lax`, el login y el logout no pueden dispararse desde otra web.

### 1.6 Redirecciones abiertas (`next`) `[x]`

El parámetro `next` (a dónde volver tras el login) pasa siempre por `safeNext()` en `src/lib/supabase.ts`:
tiene que empezar por `/`, no puede empezar por `//` ni `/\`, y no puede contener `:` ni espacios. Todo lo
demás cae a `/cuenta`. Se valida en los tres puntos por los que viaja: `/login` (campo oculto),
`POST /api/auth/login` (se mete dentro de `emailRedirectTo`) y `GET /api/auth/callback` (destino final).
Verificado: `?next=//evil.example` y `?next=https://evil.example` se descartan.

### 1.7 Secretos `[x]`

- Ningún secreto en el repositorio. `.dev.vars` (local) está en `.gitignore`; `.dev.vars.example` solo tiene valores de ejemplo. No hay bloque `vars` en `wrangler.jsonc` ni archivo `.env.example`.
- En producción `SUPABASE_URL` y `SUPABASE_ANON_KEY` son secretos del Worker: `.github/workflows/deploy.yml` los crea con `wrangler secret bulk` a partir de los secretos del repositorio de GitHub. Si faltan, el workflow avisa y termina sin error; la web sigue funcionando y `/login` muestra "El acceso todavía no está activado".
- El código los lee del entorno del Worker (`cloudflare:workers`) y, como alternativa, de `import.meta.env`. Nunca llegan al HTML.
- Los workflows tienen `permissions: contents: read`; el `GITHUB_TOKEN` no puede escribir en el repo.

### 1.8 Rastreo, indexación y contacto `[x]`

- `public/robots.txt`: `Allow: /` y `Disallow` para `/cuenta`, `/api/`, `/auth/` y `/login`. Apunta al sitemap.
- Sitemap (`@astrojs/sitemap`): `/sitemap-index.xml` y `/sitemap-0.xml` solo con páginas públicas prerenderizadas; `/login`, `/cuenta`, `/api/*` y `/auth/*` quedan fuera por filtro en `astro.config.mjs`.
- `public/.well-known/security.txt` (RFC 9116): `Contact: mailto:hello@nuriasanchezromero.com`, `Expires: 2027-09-25T00:00:00.000Z` (renovar antes), `Preferred-Languages: es, en`, `Canonical`.

### 1.9 Cadena de suministro y CI `[x]`

- `.github/workflows/ci.yml`: en cada pull request hacia `main` y en cada push a otras ramas ejecuta `npm ci`, `astro check` y `astro build`.
- `.github/workflows/deploy.yml`: además de compilar y desplegar, ejecuta `npm audit --audit-level=high` como paso informativo (`continue-on-error: true`): no bloquea el despliegue, pero deja el aviso visible en el log.
- `.github/dependabot.yml`: PRs semanales (lunes, hora de Madrid) con actualizaciones de npm (minor y patch agrupadas; major por separado) y de las acciones de GitHub. Las alertas de seguridad de Dependabot se activan en el panel (sección 2).
- Estado actual de `npm audit --audit-level=high`: 4 avisos altos, todos por la misma cadena `wrangler 4.130 → miniflare → sharp < 0.35.4` (libheif). Sin corrección hasta que salga un wrangler más nuevo; `sharp` es una herramienta de compilación local, no forma parte del Worker desplegado.

## 2. Lista de comprobación manual

Los nombres de menú son los del panel en septiembre de 2026; Cloudflare y Supabase los renombran de vez en
cuando, así que si alguno no aparece, usar el buscador del panel con el nombre del ajuste.

### Cloudflare (dash.cloudflare.com → dominio `nuriasanchezromero.com`)

- [ ] **SSL/TLS → Overview → modo de cifrado: Full (strict).** El Worker ya sirve HTTPS con certificado válido; con cualquier modo inferior Cloudflare aceptaría conexiones no verificadas al origen.
- [ ] **SSL/TLS → Edge Certificates → Always Use HTTPS: ON.** Hoy `http://nuriasanchezromero.com` responde `200` en el borde y solo el Worker redirige. Con esto activado la redirección ocurre antes de ejecutar nada.
- [ ] **SSL/TLS → Edge Certificates → Minimum TLS Version: TLS 1.2.**
- [ ] **SSL/TLS → Edge Certificates → Automatic HTTPS Rewrites: ON.**
- [ ] *(Opcional)* **SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS): Enable HSTS**, Max Age 12 meses, Apply HSTS policy to subdomains ON, Preload OFF. Duplica lo que ya envía el Worker (mismo valor, sin conflicto) y cubre cualquier respuesta que no pase por él. No marcar Preload: es difícil de revertir.
- [ ] **Security → Bots (en el panel nuevo: Security → Settings → Bot traffic) → Bot Fight Mode: ON.** Plan Free incluido.
- [ ] **Security → WAF → Rate limiting rules (panel nuevo: Security → Security rules → Create rule → Rate limiting rule).** Una regla "login": *When incoming requests match* `URI Path equals /api/auth/login` **and** `Request Method equals POST`; *With the same characteristics* `IP`; *Rate* 5 peticiones cada 10 segundos (en el plan Free el único periodo disponible es 10 s; con plan Pro se puede poner 5 por minuto); *Action* Block; *Duration* 10 segundos (Free) o 1 minuto. Frena el envío masivo de enlaces mágicos a una dirección.
- [ ] **Security → WAF → Managed rules.** En el plan Free ya está activo automáticamente el "Cloudflare Free Managed Ruleset" (no hay nada que hacer). Con plan Pro o superior, desplegar "Cloudflare Managed Ruleset" y "Cloudflare OWASP Core Ruleset".
- [ ] **Workers & Pages (panel nuevo: Compute (Workers) → Workers & Pages):** si existe un Worker llamado `web-nuria` (resto de un despliegue antiguo), abrirlo → Settings → Delete. Comprobar que el Worker `nuriasanchezromero` es el que tiene los dominios `nuriasanchezromero.com` y `www.nuriasanchezromero.com` en Settings → Domains & Routes.
- [ ] **Tras el primer despliegue con el Worker nuevo, comprobar desde una terminal:**
  ```bash
  curl -sI http://nuriasanchezromero.com/  | head -5     # esperado: 301 y Location: https://nuriasanchezromero.com/
  curl -sI https://nuriasanchezromero.com/ | grep -i -E 'strict-transport|content-security|x-frame'   # esperado: las tres cabeceras
  curl -sI https://nuriasanchezromero.com/cuenta | head -3   # esperado: 302 a /login?next=%2Fcuenta
  ```

### GitHub (github.com/nuriasanchezromero/web_nuria)

- [ ] **Settings → Secrets and variables → Actions → New repository secret:** añadir `SUPABASE_URL` y `SUPABASE_ANON_KEY` (Supabase → Project Settings → API). Después, Actions → Deploy → Run workflow (o un push a `main`) para que el Worker reciba los secretos. `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` ya existen.
- [ ] **Settings → Code security (antes "Code security and analysis"):** Dependabot alerts ON, Dependabot security updates ON, Secret scanning ON y Push protection ON (gratuitos en repositorios públicos). Dependabot version updates lo activa solo el archivo `.github/dependabot.yml`.
- [ ] *(Recomendado)* **Settings → Rules → Rulesets (o Settings → Branches):** regla para `main` que exija que el check "CI" pase antes de fusionar un pull request.

### Supabase (supabase.com → proyecto)

- [ ] **Authentication → Emails → SMTP Settings (en paneles antiguos: Project Settings → Authentication → SMTP Settings): configurar un SMTP propio** (Resend, Postmark, Brevo, Amazon SES...). El servicio de correo incluido está pensado solo para pruebas: muy pocos envíos por hora y, en los proyectos actuales, solo entrega a direcciones del propio equipo. Sin esto los usuarios externos no reciben el enlace mágico.
- [ ] **Authentication → URL Configuration:** Site URL `https://nuriasanchezromero.com`. Redirect URLs: `https://nuriasanchezromero.com/api/auth/callback`, `https://nuriasanchezromero.com/auth/callback` y `http://localhost:4321/api/auth/callback` (para que `?next=` funcione en local, añadir también el comodín `http://localhost:4321/**`). Quitar cualquier otra URL que no sea de estas dos máquinas.
- [ ] **Authentication → Rate Limits:** revisar el límite de envío de emails (por defecto es bajo y protege contra abuso; subirlo solo si hace falta con SMTP propio).
- [ ] **Cualquier tabla futura: RLS activado y con políticas.** Database → Tables → (tabla) → "Enable Row Level Security", y las políticas en Authentication → Policies. La clave `anon` es pública: sin RLS, todo lo que haya en una tabla sería legible desde cualquier navegador.

## 3. Cómo informar de una vulnerabilidad

- Escribe a **hello@nuriasanchezromero.com**. Es el contacto publicado en
  `https://nuriasanchezromero.com/.well-known/security.txt` (formato RFC 9116, válido hasta el 25 de
  septiembre de 2027; hay que renovar la fecha `Expires` antes).
- Incluye: qué has encontrado, en qué URL, cómo reproducirlo y, si puedes, qué impacto tiene. No hace falta
  prueba de concepto destructiva; una descripción clara basta.
- Por favor, no abras un issue público en GitHub con los detalles hasta que esté corregido, y no accedas a
  datos de otras personas más allá de lo mínimo para demostrar el problema.
- Es un proyecto personal sin equipo de seguridad ni programa de recompensas; se responde lo antes posible
  y se agradece públicamente si quien informa lo desea.

## 4. Limitaciones conocidas

- `Strict-Transport-Security` con `includeSubDomains` afecta a todos los subdominios de `nuriasanchezromero.com` una vez que un navegador lo ha visto: cualquier subdominio futuro tendrá que servirse por HTTPS. No se ha añadido `preload`.
- Los archivos estáticos que no son HTML (robots.txt, sitemap, favicon, `/_astro/*`) llevan el conjunto completo de cabeceras porque `public/_headers` aplica `/*` a todo lo que sirve la capa de assets. Es inofensivo, aunque algún escáner lo señale como redundante.
- `run_worker_first: ["/*", "!/_astro/*"]` hace que cada petición que no sea `/_astro/*` ejecute el Worker. Con el tráfico de esta web es despreciable.
- La lógica de `cf-visitor` y `run_worker_first` está verificada bajo `wrangler dev` (miniflare), no todavía contra el Cloudflare real. Las comprobaciones con `curl` de la sección 2 son el cierre de esa verificación.
- `worker-configuration.d.ts` (generado) aún declara `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY`; es solo tipado y se refresca con `npm run generate-types`.
