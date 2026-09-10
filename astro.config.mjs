// @ts-check
import { defineConfig, envField } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://nuriasanchezromero.com",
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  // No usamos las sesiones de Astro (Supabase gestiona la sesión con cookies),
  // así evitamos que Cloudflare tenga que aprovisionar un KV.
  session: false,
  env: {
    schema: {
      // Se leen en tiempo de ejecución desde las variables del Worker en Cloudflare
      // (o desde .dev.vars en local). No hacen falta para compilar.
      SUPABASE_URL: envField.string({ context: "server", access: "secret" }),
      SUPABASE_ANON_KEY: envField.string({ context: "server", access: "secret" }),
    },
  },
});
