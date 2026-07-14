"use client";

import { useFormStatus } from "react-dom";

export default function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full cursor-pointer rounded-lg bg-sky-600 py-2 font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-500"
    >
      {pending ? "Signing..." : "Sign In"}
    </button>
  );
}
