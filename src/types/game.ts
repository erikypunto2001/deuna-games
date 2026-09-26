export type GameHardwareRequirements = {
  ram?: string;
  graphics?: string;
  processor?: string;
  storage?: string;
  system?: string;
};

export type GameRequirements =
  GameHardwareRequirements & {
    /*
     * Compatibilidad hacia atrás: la Home actual todavía usa requirements.ram,
     * requirements.graphics, etc. Las páginas internas podrán migrar
     * gradualmente a requirements.minimum / requirements.recommended.
     */
    minimum?: GameHardwareRequirements;
    recommended?: GameHardwareRequirements;
  };

export type GameCompatibilityVerificationStatus =
  | "declared"
  | "reviewed"
  | "tested";

export type GameCompatibilityVerificationSource =
  | "developer"
  | "publisher"
  | "internal"
  | "community"
  | "external";

export type GameCompatibilityMetadata = {
  status?: GameCompatibilityVerificationStatus;
  source?: GameCompatibilityVerificationSource;
  verifiedAt?: string;
};

export type GameAgeRatingSystem =
  | "ESRB"
  | "PEGI"
  | "IARC"
  | "CLASSIND"
  | "USK"
  | "ACB"
  | "GRAC"
  | "CERO"
  | "OTHER";

export type GameAgeRating = {
  system: GameAgeRatingSystem;
  rating: string;
  descriptors?: string[];
};

export type GamePerformanceCalibration = {
  /* FPS observados o calibrados sobre el equipo de referencia a 1080p/media. */
  referenceFps: number;
  ramGb: number;
  fpsCap?: number;
};

export type GamePerformanceBenchmarkSource =
  | "internal"
  | "developer"
  | "publisher"
  | "community"
  | "external";

export type GamePerformanceBenchmarkConfidence =
  | "low"
  | "medium"
  | "high";

export type GamePerformanceMetadata = {
  /* Procedencia editorial del dato usado como punto de referencia. */
  source?: GamePerformanceBenchmarkSource;
  sourceLabel?: string;
  measuredAt?: string;
  confidence?: GamePerformanceBenchmarkConfidence;
};

export type GamePlatform =
  | "PC"
  | "PlayStation"
  | "Xbox"
  | "Nintendo Switch";

export type GameDownloadSourceStatus =
  | "available"
  | "down"
  | "maintenance";

export type GameDownloadSource = {
  id: string;
  name: string;
  href: string;
  label?: string;
  enabled?: boolean;
  status?: GameDownloadSourceStatus;
};

export type GameDownload = {
  href?: string;
  label?: string;
  sources?: GameDownloadSource[];
  sizeGb?: number;
  fileCount?: number;
  platform?: string;
};

export type GameDistributionChannel =
  | "stable"
  | "beta"
  | "testing";

export type GameDistributionMetadata = {
  /* Canal editorial del paquete actual; no se infiere desde la URL o la versión. */
  channel?: GameDistributionChannel;
  /* SHA-256 declarado para verificar que todos los mirrors entreguen el mismo paquete. */
  checksumSha256?: string;
};

export type DistributionPackageKind =
  | "installer"
  | "archive"
  | "portable"
  | "iso"
  | "chd"
  | "cso"
  | "rvz"
  | "gdi"
  | "pkg"
  | "patch"
  | "other";

export type DistributionPackage = {
  id: string;
  kind: DistributionPackageKind;
  label?: string;
  sizeGb?: number;
  fileCount?: number;
  channel?: GameDistributionChannel;
  checksumSha256?: string;
  enabled?: boolean;
  sources?: GameDownloadSource[];
};

export type GameRelease = {
  id: string;
  platformId: string;
  label?: string;
  region?: string;
  releaseDate?: string;
  version?: string;
  requirements?: GameRequirements;
  performance?: GamePerformanceCalibration;
  performanceMetadata?: GamePerformanceMetadata;
  packages?: DistributionPackage[];
  recommendedSoftwareSlugs?: string[];
};

export type GameCoverArtworkSource = "card" | "custom";

export type GameImageViewportAspect =
  | "16:9"
  | "3:1"
  | "3:2"
  | "1:1"
  | "4:5"
  | "9:16"
  | "free";

export type GameImageViewport = {
  /* Punto de interés normalizado dentro de la imagen. */
  x: number;
  y: number;
  /* 1 = encuadre base; 3 = zoom máximo 300 %. */
  zoom: number;
  /*
   * Los destinos rígidos pueden persistir la relación que fue confirmada para
   * detectar recortes obsoletos si el diseño cambia. Galería conserva además
   * relaciones elegibles y Libre. Ausente mantiene compatibilidad histórica.
   */
  aspect?: GameImageViewportAspect;
  /* Relación ancho/alto exacta cuando aspect="free". */
  aspectRatio?: number;
  /*
   * Recurso que estaba activo cuando se confirmó el recorte. Es opcional para
   * poder leer snapshots históricos, pero los guardados nuevos lo escriben
   * desde el servidor y permiten detectar crops obsoletos tras reemplazar media.
   */
  source?: string;
  /* Sólo true significa que el editor confirmó explícitamente este recorte. */
  confirmed?: true;
};

export type GameImageMedia = {
  /* Cada destino conserva su encuadre sin duplicar ni modificar la imagen. */
  cover?: GameImageViewport;
  hero?: GameImageViewport;
  card?: GameImageViewport;
  /* Contenedor de la ficha: posición/zoom propios sobre una caja adaptable. */
  detail?: GameImageViewport;
  /* Fondo adaptable: el mismo foco/zoom se interpreta según cada viewport público. */
  background?: GameImageViewport;
  /* La galería guarda un encuadre y relación editorial por recurso asignado. */
  gallery?: Record<string, GameImageViewport>;
};

export type GameVideoViewportAspect =
  | "source"
  | "16:9"
  | "3:1"
  | "3:2"
  | "1:1"
  | "4:5"
  | "9:16";

export type GameVideoViewport = {
  /* Posición normalizada dentro del área desplazable del encuadre. */
  x: number;
  y: number;
  /* 1 = fotograma completo; 3 = zoom máximo 300 %. */
  zoom: number;
  aspect: GameVideoViewportAspect;
  /* Ausente = asignado pero todavía pendiente de confirmar en el editor. */
  confirmed?: true;
};

export type GameGalleryImageItem = {
  kind: "image";
  src: string;
};

export type GameGalleryVideoItem = {
  kind: "video";
  src: string;
  /* El video conserva encuadre propio; nunca hereda el de Hero/Card. */
  viewport: GameVideoViewport;
};

export type GameGalleryItem =
  | GameGalleryImageItem
  | GameGalleryVideoItem;

export type GameGalleryAccessibilityItem = {
  kind: "image" | "video";
  src: string;
  label: string;
};

export type GameMediaAccessibility = {
  /* Textos por contexto: un mismo recurso puede comunicar cosas distintas según destino. */
  cover?: string;
  hero?: string;
  card?: string;
  detail?: string;
  gallery?: GameGalleryAccessibilityItem[];
};

export type GameDestinationMediaMode =
  | "image"
  | "video"
  | "hover-video";

export type GameMediaModes = {
  /* Portada es siempre imagen; los modos sólo aplican a destinos multimedia. */
  hero?: GameDestinationMediaMode;
  card?: GameDestinationMediaMode;
  detail?: GameDestinationMediaMode;
  /* Ausente significa que la ficha conserva el fondo global de Juegos. */
  background?: GameDestinationMediaMode;
};

export type GameVideoPlayback = "always" | "hover";
export type GameHeroVideoPlayback = GameVideoPlayback;

export type GameDestinationVideo = {
  clip: string;
  viewport: GameVideoViewport;
  /* Ausente conserva compatibilidad histórica: video siempre activo. */
  playback?: GameVideoPlayback;
};

export type GameHeroVideo = GameDestinationVideo;
export type GameDetailVideo = GameDestinationVideo;
export type GameBackgroundVideo = GameDestinationVideo;

export type GameCardVideo =
  | {
      /* Compatibilidad histórica: puede referenciar los mismos bytes que Hero. */
      source: "hero";
      viewport: GameVideoViewport;
      playback?: GameVideoPlayback;
    }
  | {
      /* Modo editorial actual: la Card selecciona explícitamente su recurso. */
      source: "independent";
      clip: string;
      viewport: GameVideoViewport;
      playback?: GameVideoPlayback;
    };

export type GameVideoMedia = {
  hero?: GameHeroVideo;
  card?: GameCardVideo;
  detail?: GameDetailVideo;
  background?: GameBackgroundVideo;
};

export type Game = {
  id: string;
  slug: string;

  title: string;
  shortTitle?: string;
  highlightedTitle?: string;

  description: string;

  /* category se conserva para no romper la Home; genres permite más de uno. */
  category: string;
  genres?: string[];
  tags?: string[];
  ageRating?: GameAgeRating;
  platforms?: GamePlatform[];
  /*
   * Modelo multiplataforma actual. Los campos legacy siguen siendo legibles
   * durante la migración, pero los releases son la fuente estructurada para
   * plataformas, paquetes, requisitos y software relacionado.
   */
  releases?: GameRelease[];
  compatibilityMetadata?: GameCompatibilityMetadata;

  badge?: string;

  rating?: number;
  reviews?: string;

  version?: string;
  addedAt?: string;
  releaseDate?: string;

  developer?: string;
  publisher?: string;

  /* Portada pública/editorial: siempre una imagen con viewport 4:5 propio. */
  coverImage?: string;
  /*
   * Intención editorial explícita. Ausente sólo existe en snapshots históricos
   * y se resuelve por compatibilidad sin reescribirlos.
   */
  coverArtworkSource?: GameCoverArtworkSource;
  heroImage?: string;
  /* La Card tiene recurso base propio; nunca depende de cambios posteriores de Portada. */
  cardImage?: string;
  /* Fondo multimedia del contenedor principal de la ficha; independiente del Hero. */
  detailImage?: string;
  /* Override opcional del fondo global de Juegos para esta ficha. */
  backgroundImage?: string;
  /* Legado compatible: sigue reflejando las imágenes de la Galería. */
  screenshots?: string[];
  /*
   * Orden editorial canónico de Galería. Si está ausente, screenshots se migra
   * en lectura como una lista de imágenes. Permite mezclar imágenes y WebM sin
   * convertir screenshots en un contenedor de tipos incompatibles.
   */
  galleryMedia?: GameGalleryItem[];

  /*
   * imageMedia guarda sólo instrucciones de presentación. Portada, Hero,
   * Card, Contenedor, Fondo y cada imagen de Galería pueden reutilizar el
   * mismo archivo físico con encuadres/focos distintos.
   */
  imageMedia?: GameImageMedia;

  /* Textos accesibles por destino/recurso sin duplicar los masters multimedia. */
  mediaAccessibility?: GameMediaAccessibility;

  /*
   * mediaModes expresa el modo de los destinos que sí pueden alternar entre
   * imagen y video. Portada no participa: su contrato es siempre imagen 4:5.
   */
  mediaModes?: GameMediaModes;

  /*
   * videoMedia conserva masters editoriales sólo para destinos que admiten
   * video. Portada queda fuera del contrato activo y se conserva únicamente
   * al interpretar snapshots históricos en la capa de compatibilidad.
   */
  videoMedia?: GameVideoMedia;

  /*
   * Puente de compatibilidad para Card: conserva el WebM independiente usado
   * por snapshots/runtimes anteriores a videoMedia.card. Los writers actuales
   * lo mantienen sincronizado, pero no selecciona proveedor ni modo.
   */
  previewClip?: string;

  imageAlt: string;

  requirements?: GameRequirements;
  performance?: GamePerformanceCalibration;
  performanceMetadata?: GamePerformanceMetadata;
  download?: GameDownload;
  distributionMetadata?: GameDistributionMetadata;
};