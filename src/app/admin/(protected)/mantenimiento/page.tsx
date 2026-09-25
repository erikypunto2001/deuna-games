import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import SiteMaintenancePanel from "@/components/admin/SiteMaintenancePanel";
import {
  inspectSiteMaintenance,
} from "@/lib/admin/site-maintenance-service";
import {
  verifyAdminOwnerSession,
} from "@/lib/admin/session";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    estado?: string | string[];
  }>;
};

export default async function AdminMaintenancePage({
  searchParams,
}: PageProps) {
  await verifyAdminOwnerSession();
  const [siteOverview, parameters] = await Promise.all([
    inspectSiteMaintenance(),
    searchParams,
  ]);
  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;

  return (
    <>
      <AdminPageHeader
        eyebrow={<>ADMINISTRACIÓN · PROPIETARIO</>}
        title="Mantenimiento"
        description="Diagnóstico y limpieza segura de PostgreSQL, multimedia y residuos operativos. El contenido editorial conserva únicamente su borrador y publicación vigentes."
      />

      <EditorStateNotice state={state} />

      <SiteMaintenancePanel overview={siteOverview} />
    </>
  );
}
