import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    const fields = Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]));
    return json({ error: error.issues[0]?.message || 'Please check the form.', fields }, 400);
  }
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error('GNJ request failed', error instanceof Error ? error.message : 'Database request failed');
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Send the form as JSON.');
  if (Number(request.headers.get('content-length') || 0) > 128_000) throw new HttpError(413, 'This request is too large.');
  const text = await request.text();
  if (text.length > 128_000) throw new HttpError(413, 'This request is too large.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'The request could not be read.'); }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return; // Non-browser clients still require authentication and RLS.
  const url = new URL(request.url);
  const allowed = new Set([url.origin]);
  // Next's internal request URL may contain the listen address (0.0.0.0).
  // Host is the browser's actual destination and cannot be overridden by browser JavaScript.
  const host = request.headers.get('host');
  if (host) allowed.add(new URL(`${url.protocol}//${host}`).origin);
  if (process.env.NEXT_PUBLIC_SITE_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
  if (!allowed.has(origin)) throw new HttpError(403, 'This request is not allowed.');
}
