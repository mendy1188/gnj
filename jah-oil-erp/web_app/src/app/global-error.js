"use client";

import { useEffect } from "react";

import AppErrorState from "@/components/feedback/AppErrorState";
import { resolveErrorCopy } from "@/features/errors/copy";

export default function GlobalError({ error, reset }) {
  const copy = resolveErrorCopy(error, {
    moduleName: "the application",
    genericLabel: "load the application",
  });

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#FAFAFB] px-4 py-10 font-[Inter] text-sm text-[#56565C] md:px-8">
        <div className="mx-auto max-w-3xl">
          <AppErrorState
            title={copy.title}
            message={copy.message}
            guidance={copy.guidance}
            technicalDetails={copy.technicalDetails}
            digest={copy.digest}
            onRetry={reset}
          />
        </div>
      </body>
    </html>
  );
}
