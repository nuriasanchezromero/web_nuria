# Seguridad de nuriasanchezromero.com

Estado a 25 de septiembre de 2026. Este documento tiene tres partes: lo que ya está resuelto en el código
(se despliega solo con cada push a `main`), la lista de acciones manuales pendientes en los paneles de
Cloudflare, GitHub y Supabase, y cómo informar de una vulnerabilidad.

Leyenda:

- `[x]` **Hecho en código.** Vive en el repositorio y se verifica en cada despliegue.
- `[ ]` **Pendiente, acción manual.** Hay que hacerlo en un panel externo; el código no puede hacerlo por sí solo.

## 1. Qué hay implementado en el código

### 1.1 Cabeceras de seguridad `[x]`

Dos copias del mismo conjunto, que deben coincidir (si se cambia una cabecera, hay que cambiarla en las dos):

- `public/_headers`: la capa de assets de Cloudflare lo aplica a todo lo que sirve sin ejecutar el Worker,
  que es casi toda la web: páginas prerenderizadas, `robots.txt`, sitemap, favicons, `security.txt` y
  `/_astro/*`. Para esos archivos es la única fuente de cabeceras.
- `src/security-headers.ts`: lo aplica `src/worker.ts` a las respuestas que genera el Worker (rutas bajo
  demanda, redirecciones y páginas 404).

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

- Archivos estáticos (HTML prerenderizado, XML, txt, favicons): las nueve cabeceras vía `public/_headers`, con `Cache-Control: public, max-age=0, must-revalidate`, ETag y respuestas `304` de la capa de assets.
- `/_astro/*` (CSS, JS, fuentes, imágenes optimizadas, con hash en el nombre): las nueve cabeceras vía `public/_headers` más `Cache-Control: public, max-age=31536000, immutable`. Un `/_astro/...` que no existe no recibe esa caché: lo atiende el Worker con la página 404.
- Respuestas del Worker: HTML y redirecciones (3xx), las nueve; las que no son HTML (por ejemplo, el endpoint de imágenes `/_image`), solo `Strict-Transport-Security`, `X-Content-Type-Options` y `Cross-Origin-Resource-Policy`.
- Rutas privadas (`/cuenta*`, `/login`, `/api/auth/*`, `/auth/*`): además `Cache-Control: private, no-store` (puesto por `src/middleware.ts`), para que ninguna caché intermedia ni el historial del navegador guarden páginas con sesión.

Detalle de `public/_headers` que conviene no romper: wrangler se queda solo con la **última** sección de cada
ruta y las reglas son acumulativas. Por eso hay una única sección `/_astro/*`, que declara ella misma el
`Cache-Control` inmutable (si se quita, el adaptador vuelve a inyectar la suya y wrangler la descarta) y
"desengancha" con `! Cabecera` las dos que repite para no enviar `nosniff, nosniff`.

### 1.2 HTTPS y dominio canónico (`www` → `nuriasanchezromero.com`)

- `[ ]` **Páginas y archivos estáticos (casi toda la web).** El Worker no se ejecuta para ellos, así que el
  código no puede redirigirlos. Dependen de dos ajustes de zona **obligatorios** en Cloudflare (sección 2):
  "Always Use HTTPS" y la Redirect Rule de `www`. Mientras falten, `http://nuriasanchezromero.com/sobre/`
  y `https://www.nuriasanchezromero.com/sobre/` se sirven tal cual, sin redirección (con HSTS, que solo
  protege a partir de la primera visita por HTTPS).
- `[x]` **Rutas del Worker** (`/login`, `/cuenta`, `/api/*`, `/auth/*` y los 404). `src/worker.ts` responde
  `301` hacia la URL canónica en un solo salto, con la ruta y la query intactas y las nueve cabeceras:
  `http://www.nuriasanchezromero.com/login?next=%2Fcuenta` va directamente a
  `https://nuriasanchezromero.com/login?next=%2Fcuenta`. Así el login nunca empieza en `www`, cuyas
  cookies serían otras y cuyo callback Supabase no acepta.

Orden de decisión en `src/worker.ts` (es el orden del código):

1. Si llega la cabecera `cf-visitor` (el borde de Cloudflare la pone siempre en producción y sobrescribe
   la que mande el cliente), manda ella: redirige a HTTPS si y solo si su `scheme` es `"http"`, y el host
   `www` se redirige siempre.
2. Solo si `cf-visitor` falta o está malformada se aplican las excepciones locales, que no redirigen: host
   `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`, `*.local`, o la cabecera interna
   `mf-original-hostname` que añade `wrangler dev` (que además reescribe el host al dominio de producción).
3. En cualquier otro caso, `www` se redirige y `url.protocol === "http:"` decide el HTTPS.

**No mover las excepciones locales por delante de `cf-visitor`:** `mf-original-hostname` es una cabecera
normal que cualquier cliente puede enviar, y con ese orden bastaría para saltarse las redirecciones. En
`astro dev` (y solo ahí: la rama no existe en el bundle de producción) no se redirige nunca, para poder
abrir el servidor de desarrollo por la IP de la red local o de Tailscale.

### 1.3 CSP y por qué `style-src` lleva `'unsafe-inline'` `[x]`

- **Scripts:** `script-src 'self'`, sin `'unsafe-inline'`. `astro.config.mjs` fija `vite.build.assetsInlineLimit: 0` para que Astro emita todos los scripts como archivos externos `<script type="module" src="/_astro/...">` (verificado: cero `<script>` sin `src` en el HTML compilado). Un `<script is:inline>` quedaría bloqueado en producción.
- **Estilos:** `style-src 'self' 'unsafe-inline'` es necesario porque el HTML compilado contiene un `<style>` inline por página que genera el componente `<Font>` de Astro (las reglas `@font-face` de las fuentes autoalojadas), varios atributos `style=""` del diseño y un SVG `data:` como fondo de textura. Quitarlo rompería las fuentes y el diseño. El riesgo real es bajo: la inyección de CSS no ejecuta código, y los scripts sí están cerrados.
- **Imágenes** solo propias o `data:`; **fuentes** solo propias; **fetch/XHR** solo al mismo origen; **iframes, embeds y objetos** prohibidos (`frame-src 'none'`, `object-src 'none'`); la web no puede ser enmarcada por otros (`frame-ancestors 'none'` más `X-Frame-Options: DENY`); los formularios solo pueden enviarse al propio sitio (`form-action 'self'`); `base-uri 'self'` evita secuestrar rutas relativas.
- En `astro dev` (y solo ahí, la rama desaparece del bundle de producción) la CSP se envía como `Content-Security-Policy-Report-Only`, porque la barra de herramientas de Astro y el HMR de Vite inyectan scripts inline. Las violaciones siguen apareciendo en la consola del navegador.

### 1.4 Zona privada, sesión y cookies `[x]`

- `src/middleware.ts` protege `/cuenta` y todo `/cuenta/*`: sin sesión válida (`supabase.auth.getUser()`) responde `302` a `/login?next=<ruta>`. `src/pages/cuenta.astro` repite la comprobación por si acaso.
- La sesión la gestiona `@supabase/ssr` en cookies con `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/` (`src/lib/supabase.ts`). Se pasan como `cookieOptions` y, además, `setAll` fuerza `httpOnly: true`, porque la librería manda `httpOnly: false` por defecto. Lo mismo vale para las cookies del verificador PKCE. Ningún código del navegador lee estas cookies. No hay sesión de Astro ni KV (`session: false` en `astro.config.mjs`).
- Enlace mágico: PKCE con los enlaces por defecto de Supabase (`?code=`). El verificador vive en las cookies del navegador que pidió el enlace, así que **el enlace solo funciona en ese navegador, y una sola vez**: Supabase lo gasta en cuanto se abre, en cualquier navegador (también si lo abre antes un escáner de correo). Abierto en otro dispositivo o en el navegador interno de una app de correo, lleva a `/login?error=enlace` y ya no sirve, ni siquiera en el navegador correcto. El mensaje de esa página lo explica y pide uno nuevo, para abrirlo en el mismo navegador desde el que se pide. Si se repite la petición dentro del minuto de espera de Supabase, Supabase la rechaza con `429` y `/login?error=espera` pide revisar el correo y esperar en vez de reintentar. El primer enlace sigue valiendo: en producción cada enlace lleva `sb_flow_id` y el callback canjea el código solo con el verificador de esa petición, nunca con el de otra (`src/pages/api/auth/callback.ts`); al entrar se borran las cookies de ese verificador. Límite: cada petición, también las rechazadas, guarda otro verificador en el navegador y auth-js conserva como mucho cinco, así que el primer enlace aguanta hasta cuatro peticiones más desde el mismo navegador; con la quinta se descarta su verificador. Las rechazadas deberían borrar el suyo, pero `@supabase/ssr` 0.12.7 no llega a escribir ese borrado en la respuesta. Si llegan dos correos, vale el último.
- Enlaces que funcionen entre dispositivos exigirían cambiar las plantillas Magic Link y Confirm signup a `token_hash` y añadir un paso de confirmación (un GET que muestra un botón y un POST del mismo origen, ya protegido por `checkOrigin`), para no reabrir el login CSRF de la sección 1.5 ni dejar que los escáneres de correo gasten el enlace. Es una decisión pendiente de Andrés; no está implementada.
- El cliente de Supabase se crea por petición; la clave usada es la `anon`, que es pública por diseño. La protección de datos reales dependerá siempre de RLS en Supabase (sección 2).
- Limitación conocida: `/cuenta/<ruta-inexistente>` devuelve la página 404 prerenderizada sin pasar por el middleware. No filtra nada; cualquier página futura bajo `/cuenta/` sí quedará protegida al coincidir con una ruta bajo demanda.

### 1.5 CSRF `[x]`

Astro trae `security.checkOrigin` activado por defecto: en rutas bajo demanda rechaza con `403` cualquier
`POST`/`PUT`/`PATCH`/`DELETE` con cuerpo de formulario cuya cabecera `Origin` no coincida con el sitio.
Verificado en local: `POST /api/auth/login` desde `Origin: https://evil.example` devuelve `403`. Sumado a
`form-action 'self'` y a las cookies `sameSite=lax`, el login y el logout no pueden dispararse desde otra web.

Login CSRF: el callback del enlace mágico solo acepta códigos PKCE (`?code=`), que únicamente se pueden
canjear con el verificador guardado en el navegador que pidió el enlace. Los enlaces `token_hash` ya no se
aceptan: permitían que alguien enviara un enlace fabricado con el token de su propia cuenta y dejara a la
víctima dentro de la cuenta del atacante.

### 1.6 Redirecciones abiertas (`next`) `[x]`

El parámetro `next` (a dónde volver tras el login) pasa siempre por `safeNext()` en `src/lib/supabase.ts`:
tiene que empezar por `/`, no puede empezar por `//` ni `/\`, no puede contener `:` y solo admite ASCII
imprimible (nada de espacios, caracteres de control como `%00` ni caracteres no ASCII, que además romperían
la cabecera `Location` con un error 500). Todo lo demás cae a `/cuenta`. Se valida en los tres puntos por
los que viaja: `/login` (campo oculto), `POST /api/auth/login` (se mete dentro de `emailRedirectTo`) y
`GET /api/auth/callback` (destino final).
Verificado: `?next=//evil.example`, `?next=https://evil.example` y `?next=%2F%00` se descartan.

### 1.7 Secretos `[x]`

- Ningún secreto en el repositorio. `.gitignore` excluye `.dev.vars*` y `.env*` en cualquier variante (`.env.local`, `.dev.vars.staging`...), salvo los `.example`; `.dev.vars.example` solo tiene valores de ejemplo. No hay bloque `vars` en `wrangler.jsonc` ni archivo `.env.example`.
- En producción `SUPABASE_URL` y `SUPABASE_ANON_KEY` son secretos del Worker: `.github/workflows/deploy.yml` los crea con `wrangler secret bulk` a partir de los secretos del repositorio de GitHub. Si faltan, el workflow avisa y termina sin error; la web sigue funcionando y `/login` oculta el formulario y muestra "La zona privada estará disponible muy pronto." ("El acceso todavía no está activado" es el aviso de `/login?error=config`).
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
- Estado de `npm audit` a 25/09/2026: 0 vulnerabilidades. Los 4 avisos altos anteriores (cadena `wrangler 4.130 → miniflare → sharp < 0.35.4`, libheif) se corrigieron con `npm audit fix` sin `--force`, que solo cambió `package-lock.json` dentro de los rangos de `package.json`: wrangler 4.140.0, @cloudflare/vite-plugin 1.60.1, miniflare 5.20260923.0-alpha, workerd 1.20260923.1 y una sola copia de sharp, 0.35.4.

## 2. Lista de comprobación manual

Los nombres de menú son los del panel en septiembre de 2026; Cloudflare y Supabase los renombran de vez en
cuando, así que si alguno no aparece, usar el buscador del panel con el nombre del ajuste.

### Cloudflare (dash.cloudflare.com → dominio `nuriasanchezromero.com`)

- [ ] **SSL/TLS → Overview → modo de cifrado: Full (strict).** El Worker ya sirve HTTPS con certificado válido; con cualquier modo inferior Cloudflare aceptaría conexiones no verificadas al origen.
- [ ] **Obligatorio. SSL/TLS → Edge Certificates → Always Use HTTPS: ON.** Las páginas estáticas no pasan por el Worker (sección 1.2), así que sin este ajuste `http://nuriasanchezromero.com/` y cualquier otra página pública se sirven por HTTP plano, sin redirección. El Worker solo redirige sus propias rutas.
- [ ] **Obligatorio. Redirect Rule de `www` al dominio principal.** Rules → Redirect Rules (panel nuevo: Rules → Overview → Create rule → Redirect Rule; hay una plantilla "Redirect from WWW to root"). *When incoming requests match* `Hostname equals www.nuriasanchezromero.com`; *Then* URL redirect de tipo Dynamic, expresión `concat("https://nuriasanchezromero.com", http.request.uri.path)`, código `301` y *Preserve query string* activado. Sin esta regla, las páginas estáticas se sirven también en `www` como una copia de la web (con sesión aparte), porque el Worker solo redirige sus propias rutas. `www.nuriasanchezromero.com` debe seguir vinculado al Worker (`wrangler.jsonc`) para que el dominio resuelva.
- [ ] **SSL/TLS → Edge Certificates → Minimum TLS Version: TLS 1.2.**
- [ ] **SSL/TLS → Edge Certificates → Automatic HTTPS Rewrites: ON.**
- [ ] *(Opcional)* **SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS): Enable HSTS**, Max Age 12 meses, Apply HSTS policy to subdomains ON, Preload OFF. Duplica lo que ya envían `public/_headers` y el Worker (mismo valor, sin conflicto) y cubre también las redirecciones que hace el propio borde. No marcar Preload: es difícil de revertir.
- [ ] **Security → Bots (en el panel nuevo: Security → Settings → Bot traffic) → Bot Fight Mode: ON.** Plan Free incluido.
- [ ] **Security → WAF → Rate limiting rules (panel nuevo: Security → Security rules → Create rule → Rate limiting rule).** Una regla "login" (el plan Free admite una sola): *When incoming requests match* `URI Path equals /api/auth/login`; *With the same characteristics* `IP`; *Rate* 5 peticiones cada 10 segundos (en el plan Free el único periodo disponible es 10 s; con plan Pro se puede poner 5 por minuto); *Action* Block; *Duration* 10 segundos (Free) o 1 minuto. En el plan Free la condición solo admite la ruta (`URI Path`) y los bots verificados; el método (`Request Method`) no está disponible hasta el plan Business. Basta con la ruta: solo acepta `POST`, y contar también otros métodos no afecta a quien usa el formulario. Con Business o superior se puede añadir **and** `Request Method equals POST`. Frena el envío masivo de enlaces mágicos a una dirección.
- [ ] **Security → WAF → Managed rules.** En el plan Free ya está activo automáticamente el "Cloudflare Free Managed Ruleset" (no hay nada que hacer). Con plan Pro o superior, desplegar "Cloudflare Managed Ruleset" y "Cloudflare OWASP Core Ruleset".
- [ ] **Workers & Pages (panel nuevo: Compute (Workers) → Workers & Pages):** si existe un Worker llamado `web-nuria` (resto de un despliegue antiguo), abrirlo → Settings → Delete. Comprobar que el Worker `nuriasanchezromero` es el que tiene los dominios `nuriasanchezromero.com` y `www.nuriasanchezromero.com` en Settings → Domains & Routes.
- [ ] **Tras el primer despliegue con el Worker nuevo, comprobar desde una terminal:**
  ```bash
  curl -sI http://nuriasanchezromero.com/  | head -5     # esperado: 301 y Location: https://nuriasanchezromero.com/ (Always Use HTTPS)
  curl -sI https://www.nuriasanchezromero.com/sobre/ | head -5   # esperado: 301 y Location: https://nuriasanchezromero.com/sobre/ (Redirect Rule)
  curl -sI 'http://www.nuriasanchezromero.com/login?next=%2Fcuenta' | grep -i location   # esperado: https://nuriasanchezromero.com/login?next=%2Fcuenta
  curl -sI https://nuriasanchezromero.com/ | grep -i -E 'strict-transport|content-security|x-frame'   # esperado: las tres cabeceras
  curl -sI https://nuriasanchezromero.com/login | grep -i cache-control   # esperado: private, no-store
  curl -sI https://nuriasanchezromero.com/cuenta | head -3   # esperado: 302 a /login?next=%2Fcuenta
  ```

### GitHub (github.com/nuriasanchezromero/web_nuria)

- [ ] **Settings → Secrets and variables → Actions → New repository secret:** añadir `SUPABASE_URL` y `SUPABASE_ANON_KEY` (Supabase → Project Settings → API). Después, Actions → Deploy → Run workflow (o un push a `main`) para que el Worker reciba los secretos. `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` ya existen.
- [ ] **Settings → Code security (antes "Code security and analysis"):** Dependabot alerts ON, Dependabot security updates ON, Secret scanning ON y Push protection ON (gratuitos en repositorios públicos). Dependabot version updates lo activa solo el archivo `.github/dependabot.yml`.
- [ ] *(Recomendado)* **Settings → Rules → Rulesets (o Settings → Branches):** regla para `main` que exija el status check `check` antes de fusionar un pull request. Es el nombre del job de `.github/workflows/ci.yml` (en la lista de checks de un PR aparece como `CI / check (pull_request)`); buscar "CI" en el selector no lo encuentra.

### Supabase (supabase.com → proyecto)

- [ ] **Authentication → Emails → SMTP Settings (en paneles antiguos: Project Settings → Authentication → SMTP Settings): configurar un SMTP propio** (Resend, Postmark, Brevo, Amazon SES...). El servicio de correo incluido está pensado solo para pruebas: muy pocos envíos por hora y, en los proyectos actuales, solo entrega a direcciones del propio equipo. Sin esto los usuarios externos no reciben el enlace mágico.
- [ ] **Authentication → URL Configuration:** Site URL `https://nuriasanchezromero.com`. Redirect URLs: `https://nuriasanchezromero.com/api/auth/callback`, `https://nuriasanchezromero.com/auth/callback` y `http://localhost:4321/api/auth/callback` (para que `?next=` funcione en local, añadir también el comodín `http://localhost:4321/**`). Quitar cualquier otra URL que no sea de estas dos máquinas. En producción los enlaces llevan además `?sb_flow_id=...`; no hace falta ninguna entrada para eso, porque Supabase acepta siempre las URLs del mismo origen que la Site URL. No cambiar las plantillas de email (ver 1.4).
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
- El Worker solo se ejecuta para las rutas bajo demanda y los 404. En el plan Workers Free (100.000 peticiones al día por cuenta; se reinicia a las 00:00 UTC), si la cuota se agota esas rutas responden `429` hasta el reinicio, mientras que las páginas estáticas siguen funcionando porque las sirve la capa de assets. No volver a poner `run_worker_first: ["/*"]` en `wrangler.jsonc`: con él, agotar la cuota tumbaría toda la web.
- El enrutado (archivos estáticos sin Worker), las cabeceras, las redirecciones del Worker y las cookies `HttpOnly` están verificados bajo `wrangler dev` (miniflare) y contra una imitación local de Supabase Auth, no todavía contra Cloudflare y Supabase reales. Las comprobaciones con `curl` de la sección 2 son el cierre de esa verificación.
- Los enlaces mágicos valen una sola vez y solo en el navegador que los pidió (sección 1.4). Abrir uno en cualquier otro sitio (otro dispositivo, el navegador interno de una app de correo, un escáner de correo) lo gasta, así que la única salida es pedir otro.
- `worker-configuration.d.ts` (generado) aún declara `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY`; es solo tipado y se refresca con `npm run generate-types`.
