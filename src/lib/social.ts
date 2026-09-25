/**
 * Redes de Núria. Cada vídeo se ofrece siempre en las dos: TikTok e Instagram.
 * Si no tenemos el enlace a la publicación concreta de Instagram, se usa su
 * perfil, para que el botón "Ver en Instagram" no falte nunca.
 */
export const HANDLE = "@sinuosa.sanchez";
export const TIKTOK_PROFILE = "https://www.tiktok.com/@sinuosa.sanchez";
export const INSTAGRAM_PROFILE = "https://www.instagram.com/sinuosa.sanchez/";
export const EMAIL = "hello@nuriasanchezromero.com";

export const tiktokVideo = (id: string) => `${TIKTOK_PROFILE}/video/${id}`;
export const instagramOr = (url?: string | null) => url || INSTAGRAM_PROFILE;
