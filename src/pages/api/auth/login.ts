export const prerender = false;

import type { APIRoute } from "astro";
import { createSupabase } from "../../../lib/supabase";

export const POST: APIRoute = async (context) => {
  const { request, redirect, url } = context;
  const form = await request.formData();
  const email = form.get("email")?.toString().trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return redirect("/login?error=email");
  }

  const supabase = createSupabase(context);
  if (!supabase) return redirect("/login?error=config");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${url.origin}/api/auth/callback` },
  });

  if (error) {
    console.error("signInWithOtp", error.message);
    return redirect("/login?error=envio");
  }
  return redirect("/login?enviado=1");
};
