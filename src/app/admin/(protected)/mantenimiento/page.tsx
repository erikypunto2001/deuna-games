import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorialMaintenancePanel from "@/components/admin/EditorialMaintenancePanel";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import {
  getEditorialHistoryMaintenanceOverview,
} from "@/lib/admin/editorial-maintenance-service";
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
  const [overview, parameters] = await Promise.all([
    getEditorialHistoryMaintenanceOverview(),
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
        description="Herramientas destructivas y auditadas para mantener limpia la base editorial sin mezclar borradores, publicaciones ni datos de cuenta."
      />

      <EditorStateNotice state={state} />

      <EditorialMaintenancePanel
        overview={overview}
      />
    </>
  );
}
