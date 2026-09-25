declare namespace App {
  interface Locals {
    /** Usuario de Supabase autenticado; lo rellena src/middleware.ts en /cuenta. */
    user: import("@supabase/supabase-js").User | null;
  }
}
