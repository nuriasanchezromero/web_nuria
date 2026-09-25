import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Una historia por vídeo. El nombre del archivo es el slug de la URL.
const historias = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/historias" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().max(160),
      tag: z.enum(["Historia del arte", "Taller", "Ilustración"]),
      date: z.coerce.date(),
      cover: image(),
      coverAlt: z.string(),
      tiktok: z.url(),
      instagram: z.url().optional(),
      caption: z.string(),
    }),
});

export const collections = { historias };
