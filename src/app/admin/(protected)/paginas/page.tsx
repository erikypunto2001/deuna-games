import Link from "next/link";
import {
  CheckCircle2,
  CircleSlash2,
  ExternalLink,
  Pencil,
} from "lucide-react";

import ia from "@/components/admin/AdminInformationArchitecture.module.css";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import {
  PUBLIC_PAGES_EDITORIAL_KEY,
} from "@/data/public-pages-config";
import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  getAboutConfigPublicationState,
  getPublicPagesConfigPublicationState,
} from "@/lib/admin/publication-service";
import {
  verifyAdminSession,
} from "@/lib/admin/session";

import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    estado?: string | string[];
  }>;
};

function PublicationStatus({
  pending,
}: {
  pending: boolean | null;
}) {
  if (pending === null) {
    return (
      <span className={styles.statusUnknown}>
        Estado no disponible
      </span>
    );
  }

  return pending ? (
    <span className={styles.statusPending}>
      <CircleSlash2 size={14} aria-hidden="true" />
      Cambios sin publicar
    </span>
  ) : (
    <span className={styles.statusOk}>
      <CheckCircle2 size={14} aria-hidden="true" />
      Publicada
    </span>
  );
}

function PageCard({
  title,
  route,
  editHref,
  publicHref,
  pending,
  publicationNumber,
  revision,
}: {
  title: string;
  route: string;
  editHref: string;
  publicHref: string;
  pending: boolean | null;
  publicationNumber: number | null;
  revision: number;
}) {
  return (
    <article className={ia.publicPageCard}>
      <div className={ia.publicPageCardHeader}>
        <div>
          <h2>{title}</h2>
          <code>{route}</code>
        </div>
        <PublicationStatus pending={pending} />
      </div>

      <div className={ia.publicPageMeta}>
        <span>
          Publicación {publicationNumber ? `#${publicationNumber}` : "no disponible"}
        </span>
        <span>Revisión {revision}</span>
      </div>

      <div className={ia.publicPageActions}>
        <Link href={editHref}>
          <Pencil size={14} aria-hidden="true" />
          Editar
        </Link>
        <Link href={publicHref} target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden="true" />
          Ver pública
        </Link>
      </div>
    </article>
  );
}

export default async function AdminPagesPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [aboutItem, publicItem, parameters] = await Promise.all([
    getEditorialItem("about_config", "about"),
    getEditorialItem(
      "public_pages_config",
      PUBLIC_PAGES_EDITORIAL_KEY
    ),
    searchParams,
  ]);
  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;

  let aboutPublication = null;
  let publicPublication = null;

  try {
    [aboutPublication, publicPublication] = await Promise.all([
      aboutItem
        ? getAboutConfigPublicationState()
        : Promise.resolve(null),
      publicItem
        ? getPublicPagesConfigPublicationState()
        : Promise.resolve(null),
    ]);
  } catch {
    console.error(
      "No se pudo leer el estado de publicación de una página pública."
    );
  }

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <span>CONTENIDO PÚBLICO</span>
          <h1>Páginas públicas</h1>
          <p>
            Elige directamente la página que quieres editar. La estructura técnica compartida queda oculta para que el trabajo se organice por destino público, no por implementación interna.
          </p>
        </div>
      </header>

      <EditorStateNotice state={state} />

      {!aboutItem && !publicItem ? (
        <p className={styles.emptyState}>
          Aplica las migraciones e importa el contenido editorial para habilitar las páginas.
        </p>
      ) : (
        <section className={styles.adminSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span>DESTINOS EDITABLES</span>
              <h2>Elige una página</h2>
            </div>
            <p>
              Cada tarjeta abre exactamente la sección correspondiente. La publicación sigue siendo explícita y versionada.
            </p>
          </div>

          <div className={ia.publicPagesGrid}>
            {publicItem && (
              <>
                <PageCard
                  title="Juegos"
                  route="/juegos"
                  editHref="/admin/paginas/presentacion?seccion=juegos"
                  publicHref="/juegos"
                  pending={publicPublication?.hasUnpublishedChanges ?? null}
                  publicationNumber={publicPublication?.publicationNumber ?? null}
                  revision={publicItem.revision}
                />
                <PageCard
                  title="Actualizaciones"
                  route="/actualizaciones"
                  editHref="/admin/paginas/presentacion?seccion=actualizaciones"
                  publicHref="/actualizaciones"
                  pending={publicPublication?.hasUnpublishedChanges ?? null}
                  publicationNumber={publicPublication?.publicationNumber ?? null}
                  revision={publicItem.revision}
                />
                <PageCard
                  title="¿Qué puedo jugar?"
                  route="/requisitos"
                  editHref="/admin/paginas/presentacion?seccion=compatibilidad"
                  publicHref="/requisitos"
                  pending={publicPublication?.hasUnpublishedChanges ?? null}
                  publicationNumber={publicPublication?.publicationNumber ?? null}
                  revision={publicItem.revision}
                />
              </>
            )}

            {aboutItem && (
              <PageCard
                title="Quiénes somos"
                route="/quienes-somos"
                editHref="/admin/paginas/quienes-somos"
                publicHref="/quienes-somos"
                pending={aboutPublication?.hasUnpublishedChanges ?? null}
                publicationNumber={aboutPublication?.publicationNumber ?? null}
                revision={aboutItem.revision}
              />
            )}
          </div>
        </section>
      )}
    </>
  );
}
