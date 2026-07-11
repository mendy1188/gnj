import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  buildReportDataset,
  buildReportPreviewPayload,
} from "@/features/reports/export";

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
    const dataset = await buildReportDataset(
      reportKey,
      session,
      getFiltersFromSearchParams(searchParams),
    );

    return NextResponse.json(buildReportPreviewPayload(dataset));
  } catch (error) {
    return NextResponse.json(
      {
        message: getUserFacingErrorMessage(error, {
          moduleName: "Reports",
          genericLabel: "load this report preview",
          fallbackMessage: "Failed to load report preview.",
        }),
      },
      { status: 400 },
    );
  }
}
