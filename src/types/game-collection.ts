export type GameCollection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  gameSlugs: string[];
  /* Compatibilidad con payloads previos; la UI actual no publica portada propia. */
  coverImage?: string;
  imageAlt?: string;
  featured?: boolean;
};
