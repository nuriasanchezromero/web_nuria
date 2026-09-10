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

## Despliegue (Cloudflare Workers desde GitHub)

1. Cloudflare Dashboard → Workers & Pages → Create → Import a repository → elegir `nuriasanchezromero/web_nuria`.
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`.
3. En el Worker → Settings → Variables and Secrets, añadir como **secretos**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Cada push a la rama de producción despliega solo. El dominio `nuriasanchezromero.com` se vincula automáticamente gracias a `routes` en `wrangler.jsonc`.

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
