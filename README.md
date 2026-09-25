# nuriasanchezromero.com

Web de Núria Sánchez Romero, ilustradora: la cara B de la historia del arte, contada en rosa pastel. Sitio
público con sus historias (vídeos de TikTok e Instagram) y una zona privada con acceso por enlace mágico (sin contraseñas).

Repositorio: `github.com/nuriasanchezromero/web_nuria`. Rama por defecto: `main`. Producción: https://nuriasanchezromero.com.

## Stack

| Pieza | Qué hace |
|---|---|
| [Astro](https://docs.astro.build) 7 | Genera las páginas públicas en tiempo de compilación y sirve `/login`, `/cuenta` y las rutas de auth bajo demanda. |
| [@astrojs/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) | Adaptador: convierte la parte bajo demanda en un Worker de Cloudflare. |
| Cloudflare Workers + assets estáticos | Hospedaje. La capa de assets sirve los archivos estáticos (páginas prerenderizadas incluidas) sin ejecutar código; el Worker `nuriasanchezromero` solo atiende las rutas bajo demanda y las URLs que no existen. Dominios `nuriasanchezromero.com` y `www` vinculados desde `wrangler.jsonc`; `www` redirige al principal (en las rutas del Worker lo hace el código; en las estáticas, una Redirect Rule de zona, ver [SECURITY.md](SECURITY.md)). |
| [Supabase Auth](https://supabase.com/docs/guides/auth) (`@supabase/ssr`) | Login por enlace mágico; la sesión vive en cookies. |
| GitHub Actions | Cada push a `main` compila y despliega (`.github/workflows/deploy.yml`). |

Node 22 o superior y npm. Sin frameworks de UI: solo componentes `.astro`, CSS propio y fuentes
autoalojadas (Bricolage Grotesque, DM Sans y Rubik, configuradas en `astro.config.mjs`).

## Estructura

### Páginas

| Ruta | Archivo | Tipo |
|---|---|---|
| `/` | `src/pages/index.astro` | Pública, prerenderizada |
| `/sobre` | `src/pages/sobre.astro` | Pública, prerenderizada |
| `/contacto` | `src/pages/contacto.astro` | Pública, prerenderizada |
| `/historias` | `src/pages/historias/` | Pública, prerenderizada. Índice de historias |
| `/historias/<slug>` | `src/pages/historias/` | Pública, prerenderizada. Una por archivo en `src/content/historias/` |
| `/404` | `src/pages/404.astro` | Página de error, prerenderizada |
| `/login` | `src/pages/login.astro` | Bajo demanda. Formulario de email; acepta `?next=/ruta` para volver a donde se iba |
| `/cuenta` | `src/pages/cuenta.astro` | Bajo demanda. Zona privada: por ahora solo confirma el acceso y permite cerrar sesión |

### Rutas técnicas del login

| Método y ruta | Archivo | Qué hace |
|---|---|---|
| `POST /api/auth/login` | `src/pages/api/auth/login.ts` | Recibe `email` y `next`, pide a Supabase el enlace mágico y vuelve a `/login?enviado=1` (o `?error=email\|envio\|espera\|config`; `espera` cuando Supabase responde `429`) |
| `GET /api/auth/callback` | `src/pages/api/auth/callback.ts` | Procesa el enlace del correo (`code` PKCE), crea la sesión y redirige a `next` (validado). Si falla, vuelve a `/login?error=enlace` |
| `GET /auth/callback` | `src/pages/auth/callback.ts` | Alias exacto del anterior (por listas antiguas de Redirect URLs) |
| `POST /api/auth/logout` | `src/pages/api/auth/logout.ts` | Cierra sesión y redirige a `/` |

### Archivos clave

- `src/worker.ts`: entrada del Worker (`main` en `wrangler.jsonc`). Envuelve el entrypoint del adaptador de Astro para redirigir con 301 a la URL canónica (`www` al dominio principal y HTTP a HTTPS, en un solo salto) y añadir las cabeceras de seguridad a las respuestas del Worker. Solo se ejecuta para las rutas bajo demanda y los 404: los archivos estáticos no pasan por él.
- `src/security-headers.ts` y `public/_headers`: las dos copias de las cabeceras de seguridad (HSTS, CSP, etc.), que deben coincidir. La primera la aplica el Worker a sus respuestas; la segunda, la capa de assets a todos los archivos estáticos. Detalle en [SECURITY.md](SECURITY.md).
- `src/middleware.ts`: solo se ejecuta en rutas bajo demanda. Protege `/cuenta` y todo lo que cuelgue de `/cuenta/` (sin sesión redirige a `/login?next=...`), rellena `Astro.locals.user` y marca como `Cache-Control: private, no-store` las respuestas de `/cuenta*`, `/login`, `/api/auth/*` y `/auth/*`.
- `src/lib/supabase.ts`: cliente de Supabase ligado a las cookies de cada petición (siempre `HttpOnly`), lectura de la configuración (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) y `safeNext()`, que valida el destino `next` para evitar redirecciones abiertas.
- `src/content.config.ts` y `src/content/historias/*.md`: colección de contenido `historias` (ver más abajo). Las portadas viven en `src/assets/tt/`.
- `src/layouts/Base.astro`: layout común, paleta y clases globales (`.wrap`, `.page`, `.card`, `.button`, `.sticker`...). Cualquier página nueva debe reutilizarlas en lugar de inventar estilos.
- `public/_headers`, `public/robots.txt`, `public/.well-known/security.txt`: archivos estáticos que se suben tal cual (`_headers` no se sirve: son las reglas de cabeceras de la capa de assets).
- `wrangler.jsonc`: configuración del Worker. `astro.config.mjs`: configuración de Astro (adaptador, sitemap, fuentes, sin scripts inline).

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # rellena SUPABASE_URL y SUPABASE_ANON_KEY (Supabase > Project Settings > API)
npm run dev                      # http://localhost:4321
```

- `.dev.vars` no se sube a git (`.gitignore` excluye `.dev.vars*` y `.env*`, salvo los `.example`). Lo leen tanto `astro dev` como `wrangler dev`. Sin él la web funciona igual, pero `/login` no muestra el formulario, solo "La zona privada estará disponible muy pronto." ("El acceso todavía no está activado" es el aviso de `/login?error=config`).
- `npm run check`: `astro check` (tipos y plantillas). Es lo primero que ejecuta la CI; conviene pasarlo antes de subir.
- `npm run build && npm run preview`: compila y arranca el runtime real de Cloudflare en local, útil para ver las cabeceras. Las redirecciones (`www` al dominio principal y HTTP a HTTPS) no se pueden observar en local: sin la cabecera `cf-visitor` que pone Cloudflare, el Worker trata la petición como local y no redirige (y `wrangler dev`, además, reescribe el host de la petición y la cabecera `Location`). Se comprueban en producción con los `curl` de la sección 2 de [SECURITY.md](SECURITY.md). En `astro dev` nunca se redirige (así se puede abrir por la IP de la red local) y la CSP va en modo informe (no bloquea nada, solo avisa en la consola del navegador) para que la barra de herramientas de Astro y el HMR sigan funcionando.
- Los agentes de IA arrancan el servidor con `astro dev --background` (ver `AGENTS.md`).
- Regla de la CSP que afecta al código: no puede haber `<script>` inline (ni `is:inline`); Astro emite todos los scripts como archivos externos. Los atributos `style=""` y los `<style>` sí están permitidos. Las imágenes tienen que ser propias (`src/assets` o `public/`) o `data:`; no se pueden incrustar iframes ni vídeos de terceros, por eso las historias enlazan a TikTok e Instagram en lugar de embeberlos.

## Añadir una historia

Cada historia es un archivo Markdown en `src/content/historias/`. El nombre del archivo (sin `.md`) es el
slug de la URL: `src/content/historias/el-beso-de-klimt.md` se publica en `/historias/el-beso-de-klimt/`.

1. Guarda la portada (vertical, en 9:16 o en 3:4, un fotograma del vídeo) en `src/assets/tt/<id>.jpg`, donde `<id>` es el identificador numérico del vídeo de TikTok (el número final de su URL). La página de la historia la muestra entera; el índice `/historias/` la recorta a 9:16 y pone el título encima de la parte de abajo.
2. Crea el archivo con este frontmatter (todos los campos son obligatorios salvo `instagram`):

```md
---
title: "Título corto de la historia"
description: "Una sola frase que la resume."   # máximo 160 caracteres
tag: "Historia del arte"          # exactamente uno de: "Historia del arte" | "Taller" | "Ilustración"
date: 2023-01-26                  # AAAA-MM-DD: fecha de publicación del vídeo
cover: ../../assets/tt/7192895892561743110.jpg
coverAlt: "Qué se ve en la portada. Texto de la portada: «…»"   # para lectores de pantalla; copia el texto que lleve la imagen, si lleva
tiktok: https://www.tiktok.com/@usuario/video/7192895892561743110
instagram: https://www.instagram.com/reel/XXXXXXXXX/   # opcional
caption: "Texto original del vídeo, tal cual se publicó."
---
```

   Debajo del frontmatter va el texto de la historia. Habla en primera persona, como Núria, así que solo puede
   contar lo que dicen el vídeo, su portada y su pie (más datos de historia del arte comprobados): nada de
   opiniones, consejos ni anécdotas inventadas. Mejor corto y fiel que largo e inventado.

3. `npm run dev` muestra la historia nueva en `/historias/`. La compilación (`npm run build`, también en la CI) valida el esquema: un `tag` mal escrito, una `description` de más de 160 caracteres o una portada que no existe hacen fallar el build.

La fecha se puede derivar del id de TikTok (sus 32 bits altos son un timestamp Unix):

```bash
node -e 'const id=BigInt(process.argv[1]); console.log(new Date(Number(id>>32n)*1000).toISOString().slice(0,10))' 7192895892561743110
# 2023-01-26
```

## Despliegue

Automático: cada push a `main` ejecuta `.github/workflows/deploy.yml`, que instala dependencias, pasa
`astro check`, hace una auditoría de dependencias (informativa), compila y despliega con `wrangler deploy`
en el Worker `nuriasanchezromero`. Por último crea los secretos de Supabase en el Worker; si faltan en
GitHub, avisa y termina sin error (el login queda desactivado hasta que se añadan).

Los pull requests hacia `main` y los pushes a otras ramas ejecutan `.github/workflows/ci.yml` (check + build,
sin desplegar). Dependabot (`.github/dependabot.yml`) abre PRs semanales con actualizaciones de npm y de las
acciones.

Despliegue manual desde el portátil: `npm run deploy` (necesita `wrangler login` o `CLOUDFLARE_API_TOKEN`
y `CLOUDFLARE_ACCOUNT_ID` en el entorno).

### Secretos en GitHub (Settings → Secrets and variables → Actions)

| Secreto | Estado (25/09/2026) | De dónde sale |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Configurado | dash.cloudflare.com → perfil → API Tokens → Create Token. Permisos: Account · Workers Scripts · Edit; Account · Account Settings · Read; Zone · Workers Routes · Edit; Zone · DNS · Edit. Zona: nuriasanchezromero.com |
| `CLOUDFLARE_ACCOUNT_ID` | Configurado | dash.cloudflare.com → Workers & Pages → panel derecho, "Account ID" |
| `SUPABASE_URL` | **Pendiente de añadir** | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | **Pendiente de añadir** | Supabase → Project Settings → API → anon public key |

Tras añadir los dos de Supabase hay que volver a lanzar el despliegue (Actions → Deploy → Run workflow) o hacer
un push a `main`.

### Notas sobre `wrangler.jsonc`

- `main: src/worker.ts`. La compilación escribe `dist/server/wrangler.json` (con `main: entry.mjs`), que es el archivo que usa `wrangler deploy`.
- Sin `assets.run_worker_first`, a propósito. Todo archivo que existe en `dist/client` (páginas prerenderizadas, `robots.txt`, sitemap, favicons, `/_astro/*`) lo sirve la capa de assets sin ejecutar el Worker, con las cabeceras de `public/_headers`, ETag y `304`. Es gratis, no cuenta en la cuota de Workers y sigue funcionando aunque la cuota diaria del plan Free se agote. El Worker solo recibe las rutas bajo demanda (`/login`, `/cuenta`, `/api/*`, `/auth/*`) y las URLs que no existen (404). No volver a poner `run_worker_first: ["/*"]`: con él, al agotarse la cuota de Workers Free toda la web respondería `429`.
- Consecuencia: la redirección a HTTPS y de `www` al dominio principal de las páginas estáticas no la hace el código. La hacen dos ajustes de zona obligatorios en Cloudflare ("Always Use HTTPS" y una Redirect Rule de `www`), descritos en la sección 2 de [SECURITY.md](SECURITY.md). El Worker aplica las mismas redirecciones a las rutas que sí atiende.
- `routes` con `custom_domain: true` para `nuriasanchezromero.com` y `www.nuriasanchezromero.com`: el dominio se vincula solo al desplegar, sin tocar DNS a mano. `www` se mantiene vinculado para poder servir su redirección al dominio principal.
- No hay bloque `vars`: la configuración de Supabase entra como secretos del Worker. `session: false` en `astro.config.mjs` evita que el adaptador aprovisione un KV `SESSION` que no se usa.
- `worker-configuration.d.ts` se regenera con `npm run generate-types`.

## Supabase

1. Proyecto en supabase.com. Las claves están en Project Settings → API.
2. Authentication → URL Configuration:
   - Site URL: `https://nuriasanchezromero.com`
   - Redirect URLs: `https://nuriasanchezromero.com/api/auth/callback`, `https://nuriasanchezromero.com/auth/callback` y `http://localhost:4321/api/auth/callback`.
   - En producción Supabase acepta cualquier URL con el mismo origen que la Site URL (mismo esquema y mismo host exacto, `www` no cuenta), así que `?next=...` y `?sb_flow_id=...` funcionan sin más entradas. `www` no llega a pedir enlaces porque redirige al dominio principal. En local, para que `?next=` funcione, añade el comodín `http://localhost:4321/**`.
3. Authentication → Providers → Email: activado. No hace falta contraseña; el acceso es por enlace mágico.
   - Las plantillas de email (Magic Link y Confirm signup) se dejan **como vienen**: el enlace lleva un código PKCE (`?code=`) y solo funciona en el navegador donde se pidió, porque el verificador vive en sus cookies. Además vale una sola vez: Supabase lo gasta en cuanto se abre, sea en el navegador que sea (o si lo abre antes un escáner de correo). Abrirlo en otro dispositivo o en el navegador interno de Gmail u Outlook lleva a `/login?error=enlace`, y ese enlace ya no sirve ni siquiera en el navegador correcto: la única salida es pedir otro. La página lo explica y pide abrir el nuevo en el mismo navegador desde el que se pide. A cambio, nadie puede iniciar la sesión de otra persona con un enlace fabricado.
   - Si alguien vuelve a pedir el enlace dentro del minuto de espera de Supabase, la petición se rechaza con `429` y no sale otro correo. `/login?error=espera` lo explica y pide revisar el correo y esperar unos minutos, en vez de reintentar. El enlace del primer correo sigue funcionando: en producción cada enlace lleva `sb_flow_id` y el callback canjea el código solo con el verificador de esa petición concreta, nunca con el de otra. Tiene un límite: cada petición, también las rechazadas, guarda otro verificador en el navegador, y auth-js conserva como mucho cinco. El primer enlace aguanta hasta cuatro peticiones más desde el mismo navegador; con la quinta se descarta su verificador y el enlace lleva a `/login?error=enlace`. Si llegan dos correos, vale el último (Supabase invalida el anterior).
   - Enlaces que funcionen en cualquier dispositivo exigirían cambiar esas dos plantillas a `token_hash` y añadir un paso de confirmación (una página con un botón que haga un POST) para no reabrir el login CSRF ni dejar que los escáneres de correo gasten el enlace. Es una decisión pendiente de Andrés, no está implementada.
4. **SMTP pendiente**: el servicio de correo incluido en Supabase está muy limitado (pocos envíos por hora y, en los proyectos actuales, solo a direcciones del propio equipo). Para que usuarios externos reciban el enlace hay que configurar un SMTP propio en Authentication → Emails → SMTP Settings. Hasta entonces el login solo sirve para probar.

## Seguridad

Cabeceras, HTTPS forzado, CSP, protección de la zona privada, gestión de secretos y la lista de acciones
manuales pendientes en Cloudflare, GitHub y Supabase están en [SECURITY.md](SECURITY.md).
