import { NextResponse } from "next/server";

import { buildReportExport } from "@/features/reports/export";
import { getCurrentSession } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";

export const dynamic = "force-dynamic";

function getFiltersFromSearchParams(searchParams) {
  return {
    rangePreset: searchParams.get("rangePreset") || "",
    fromDate: searchParams.get("fromDate") || "",
    toDate: searchParams.get("toDate") || "",
    station: searchParams.get("station") || "",
    category: searchParams.get("category") || "",
    item: searchParams.get("item") || "",
    cashier: searchParams.get("cashier") || "",
    status: searchParams.get("status") || "",
    product: searchParams.get("product") || "",
    recordedBy: searchParams.get("recordedBy") || "",
    paymentMethod: searchParams.get("paymentMethod") || "",
    company: searchParams.get("company") || "",
    client: searchParams.get("client") || "",
    direction: searchParams.get("direction") || "",
    actor: searchParams.get("actor") || "",
  };
}

export async function GET(request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.mustChangePassword) {
    return NextResponse.json(
      { message: "Password change required" },
      { status: 403 },
    );
  }

  if (!session.modules?.includes("reports")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const reportKey = `${searchParams.get("report") || ""}`.trim();
    const format = `${searchParams.get("format") || "csv"}`.trim().toLowerCase();
    const exportPayload = await buildReportExport(reportKey, session, {
      format,
      filters: getFiltersFromSearchParams(searchParams),
    });

    return new NextResponse(exportPayload.body, {
      status: 200,
      headers: {
        "Content-Type": exportPayload.mimeType,
        "Content-Disposition": `attachment; filename="${exportPayload.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: getUserFacingErrorMessage(error, {
          moduleName: "Reports",
          genericLabel: "generate this report",
          fallbackMessage: "Failed to generate report.",
        }),
      },
      { status: 400 },
    );
  }
}
