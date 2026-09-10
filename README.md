# nuriasanchezromero.com

Web de Nuria Sánchez Romero. Astro + Cloudflare Workers + Supabase (login por enlace mágico y zona privada).

## Estructura

- `src/pages/` páginas públicas (`index`, `sobre-mi`, `contacto`), `login`, y la zona privada en `area/`.
- `src/pages/auth/` rutas técnicas del login: `callback` (procesa el enlace del correo), `logout`, `error`.
- `src/middleware.ts` comprueba la sesión en cada petición y protege todo lo que cuelga de `/area`.
- `src/lib/supabase.ts` cliente de Supabase ligado a las cookies de la petición.
- `wrangler.jsonc` configuración del Worker de Cloudflare y dominio propio.

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # y rellena las claves de Supabase
npm run dev                      # http://localhost:4321
npm run preview                  # build + runtime real de Cloudflare en local
```

## Despliegue (automático desde GitHub)

Cada push a `main` ejecuta `.github/workflows/deploy.yml`, que compila y despliega en Cloudflare Workers
y configura los secretos de Supabase en el Worker. El dominio `nuriasanchezromero.com` se vincula solo
gracias a `routes` en `wrangler.jsonc`.

Secretos necesarios en GitHub (Settings → Secrets and variables → Actions):

| Secreto | De dónde sale |
|---|---|
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → perfil → API Tokens → Create Token. Permisos: Account · Workers Scripts · Edit; Account · Account Settings · Read; Zone · Workers Routes · Edit; Zone · DNS · Edit. Zona: nuriasanchezromero.com |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → Workers & Pages → panel derecho, "Account ID" |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |

## Supabase

1. Crear proyecto en supabase.com. Las claves están en Project Settings → API.
2. Authentication → URL Configuration:
   - Site URL: `https://nuriasanchezromero.com`
   - Redirect URLs: `https://nuriasanchezromero.com/auth/callback` y `http://localhost:4321/auth/callback`
3. Authentication → Providers → Email: dejar activado. No hace falta contraseña, el acceso es por enlace mágico.

## Fases

1. **Hecha:** sitio público, login y zona privada mínima.
2. Primera función privada con demanda real (citas, materiales, documentos...).
3. El resto, una por una, cuando la anterior se use.
