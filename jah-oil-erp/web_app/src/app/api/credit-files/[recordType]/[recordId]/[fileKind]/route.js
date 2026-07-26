import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import {
  getCreditAccountRecord,
  getCreditFileDescriptor,
} from "@/features/credit-management/server";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

export const dynamic = "force-dynamic";
const CREDIT_DOCUMENTS_BUCKET_ID =
  process.env.APPWRITE_CREDIT_DOCUMENTS_BUCKET_ID || "credit-documents";

export async function GET(_request, { params }) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (!session.modules?.includes("balance-management")) {
    return NextResponse.json(
      { message: "You do not have access to credit documents." },
      { status: 403 },
    );
  }

  if (!hasServerAppwriteConfig()) {
    return NextResponse.json(
      { message: "Server configuration is missing." },
      { status: 500 },
    );
  }

  try {
    const { recordType, recordId, fileKind } = await params;
    const descriptor = await getCreditFileDescriptor(
      recordType,
      recordId,
      fileKind,
    );

    if (
      descriptor.bucketId !== CREDIT_DOCUMENTS_BUCKET_ID ||
      !descriptor.accountId
    ) {
      throw new Error("The requested file is not a valid credit document.");
    }

    await getCreditAccountRecord(descriptor.accountId);

    const config = getServerAppwriteConfig();
    const downloadUrl = `${config.apiBaseUrl}/storage/buckets/${encodeURIComponent(
      descriptor.bucketId,
    )}/files/${encodeURIComponent(descriptor.fileId)}/download`;
    const response = await fetch(downloadUrl, {
      headers: {
        "X-Appwrite-Project": config.projectId,
        "X-Appwrite-Key": config.apiKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("The requested file could not be downloaded.");
    }

    const safeContent = resolveSafeFileResponse(descriptor.fileName);
    const responseHeaders = {
      "Content-Type": safeContent.contentType,
      "Content-Disposition": `${safeContent.disposition}; filename="credit-file"; filename*=UTF-8''${encodeURIComponent(
        sanitizeFileName(descriptor.fileName),
      )}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
    };
    const contentLength = response.headers.get("content-length");

    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { message: "The requested credit file was not found." },
      { status: 404 },
    );
  }
}

function sanitizeFileName(value) {
  return `${value || "credit-file"}`.replace(/[\r\n"]/g, "_");
}

function resolveSafeFileResponse(fileName) {
  const extension = `${fileName || ""}`.split(".").pop()?.toLowerCase();
  const definitions = {
    png: { contentType: "image/png", disposition: "inline" },
    jpg: { contentType: "image/jpeg", disposition: "inline" },
    jpeg: { contentType: "image/jpeg", disposition: "inline" },
    webp: { contentType: "image/webp", disposition: "inline" },
    pdf: { contentType: "application/pdf", disposition: "inline" },
    doc: { contentType: "application/msword", disposition: "attachment" },
    docx: {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      disposition: "attachment",
    },
  };

  return (
    definitions[extension] || {
      contentType: "application/octet-stream",
      disposition: "attachment",
    }
  );
}
