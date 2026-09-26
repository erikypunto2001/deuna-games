export type GameCollection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  gameSlugs: string[];
  coverImage?: string;
  imageAlt: string;
  featured?: boolean;
};
