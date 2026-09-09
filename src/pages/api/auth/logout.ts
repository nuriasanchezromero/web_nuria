export const prerender = false;

import type { APIRoute } from "astro";
import { createSupabase } from "../../../lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createSupabase(context);
  if (supabase) await supabase.auth.signOut();
  return context.redirect("/");
};
