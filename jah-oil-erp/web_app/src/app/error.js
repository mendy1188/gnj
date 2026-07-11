"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import AppErrorState from "@/components/feedback/AppErrorState";
import { resolveErrorCopy, resolveRouteMeta } from "@/features/errors/copy";

export default function AppError({ error, reset }) {
  const pathname = usePathname();
  const routeMeta = resolveRouteMeta(pathname);
  const copy = resolveErrorCopy(error, routeMeta);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#FAFAFB] px-4 py-10 md:px-8">
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
    </main>
  );
}
