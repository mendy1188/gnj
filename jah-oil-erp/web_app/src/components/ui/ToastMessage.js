"use client";

import { useEffect, useState } from "react";

const TOAST_STYLES = {
  success: {
    container: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: "bg-emerald-500",
  },
  error: {
    container: "border-rose-200 bg-rose-50 text-rose-800",
    icon: "bg-rose-500",
  },
  warning: {
    container: "border-amber-200 bg-amber-50 text-amber-800",
    icon: "bg-amber-500",
  },
  info: {
    container: "border-sky-200 bg-sky-50 text-sky-800",
    icon: "bg-sky-500",
  },
};

function normalizeTone(tone) {
  return ["success", "error", "warning", "info"].includes(tone)
    ? tone
    : "info";
}

export default function ToastMessage({
  message,
  tone = "info",
  onClose,
  autoDismissMs,
  className = "",
}) {
  const normalizedTone = normalizeTone(tone);
  const [isVisible, setIsVisible] = useState(Boolean(message));
  const dismissMs =
    typeof autoDismissMs === "number"
      ? autoDismissMs
      : normalizedTone === "success"
        ? 2000
        : 0;

  useEffect(() => {
    setIsVisible(Boolean(message));
  }, [message]);

  useEffect(() => {
    if (!message || !dismissMs) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, dismissMs);

    return () => window.clearTimeout(timeoutId);
  }, [dismissMs, message, onClose]);

  if (!message || !isVisible) {
    return null;
  }

  const styles = TOAST_STYLES[normalizedTone];

  return (
    <div
      role="status"
      aria-live={normalizedTone === "success" ? "polite" : "assertive"}
      className={`fixed right-4 top-5 z-[90] w-[calc(100vw-2rem)] max-w-md rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl shadow-slate-900/10 ${styles.container} ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${styles.icon}`}
        />
        <p className="min-w-0 flex-1 leading-5">{message}</p>
        <button
          type="button"
          onClick={() => {
            setIsVisible(false);
            onClose?.();
          }}
          className="ml-2 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-current/70 transition hover:bg-white/70 hover:text-current"
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}
