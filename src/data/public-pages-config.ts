export const PUBLIC_PAGES_EDITORIAL_KEY = "public-pages";

export type PublicPagesConfig = {
  games: {
    eyebrow: string;
    title: string;
    description: string;
    platformLabel: string;
  };
  updates: {
    eyebrow: string;
    title: string;
    highlight: string;
    description: string;
    infoCards: [
      { title: string; text: string },
      { title: string; text: string },
      { title: string; text: string },
    ];
  };
  finder: {
    eyebrow: string;
    title: string;
    highlight: string;
    description: string;
    flow: [string, string, string];
    trustText: string;
  };
};

export const sourcePublicPagesConfig: PublicPagesConfig = {
  games: {
    eyebrow: "CATÁLOGO DE JUEGOS",
    title: "Juegos",
    description:
      "Explora nuestro catálogo, filtra por clasificación, puntuación, requisitos o popularidad y encuentra exactamente lo que quieres jugar.",
    platformLabel: "PC y consolas",
  },
  updates: {
    eyebrow: "VERSIONES Y MEJORAS",
    title: "Actualizaciones",
    highlight: "recientes",
    description:
      "Sigue las nuevas versiones de los juegos disponibles. Encuentra qué se actualizó y accede siempre a la versión vigente.",
    infoCards: [
      {
        title: "Versiones ordenadas",
        text:
          "Cada publicación queda asociada a su juego y a una versión concreta.",
      },
      {
        title: "Un acceso por juego",
        text:
          "El mismo botón de descarga puede ofrecer siempre la versión vigente.",
      },
      {
        title: "Mirrors independientes",
        text:
          "Cambiar un enlace no genera una actualización; publicar una versión nueva sí.",
      },
    ],
  },
  finder: {
    eyebrow: "COMPATIBILIDAD ORIENTATIVA",
    title: "Descubre los juegos que",
    highlight: "tu PC puede correr",
    description:
      "Detectamos lo que el navegador permite, comparamos CPU, GPU y RAM con cada juego y calculamos FPS orientativos según resolución y calidad.",
    flow: ["Detectamos", "Comparamos", "Estimamos FPS"],
    trustText:
      "Todo se procesa en tu navegador. No leemos archivos ni instalamos nada.",
  },
};
