import type { APIRoute } from "astro";
import { createSupabase } from "../../lib/supabase";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabase(request, cookies);
  await supabase.auth.signOut();
  return redirect("/");
};
