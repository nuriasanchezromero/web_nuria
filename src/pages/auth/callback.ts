export const prerender = false;

// Alias de /api/auth/callback: algunas listas de Redirect URLs en Supabase
// se configuraron con /auth/callback. Misma lógica, misma respuesta.
export { GET } from "../api/auth/callback";
