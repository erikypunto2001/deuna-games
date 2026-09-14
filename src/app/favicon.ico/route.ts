import {
  createSiteAppIcon,
} from "@/lib/site-app-icon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const response = await createSiteAppIcon(32);
  response.headers.set(
    "Cache-Control",
    "public, max-age=0, must-revalidate"
  );
  response.headers.set("X-Content-Type-Options", "nosniff");

  return response;
}
