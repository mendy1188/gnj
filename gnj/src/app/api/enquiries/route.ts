import { createHmac } from 'node:crypto';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http';
import { enquirySchema, validateEnquiryTiming } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = enquirySchema.parse(await readJson(request));
    if (input.website || !validateEnquiryTiming(input.startedAt)) throw new HttpError(400, 'Please refresh this page and try submitting your enquiry again.');
    if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503, 'The enquiry form is temporarily unavailable. Please call +44 7878079245 or email Gabor.orban1974@gmail.com.');
    const client = createServiceSupabaseClient();
    // Only trust an IP header that your hosting proxy overwrites. A shared fallback is deliberately conservative.
    const ipHeader = process.env.TRUSTED_PROXY_IP_HEADER || 'x-vercel-forwarded-for';
    const ip = request.headers.get(ipHeader)?.split(',')[0]?.trim() || 'shared';
    const hash = (value: string) => createHmac('sha256', process.env.ENQUIRY_RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY!).update(value).digest('hex');
    const keys = [hash(`ip:${ip}`), hash(`contact:${input.email.toLowerCase() || input.phone.replace(/\D/g, '')}`)];
    for (const [index, key] of keys.entries()) {
      const { data: allowed, error } = await client.rpc('consume_rate_limit', { p_key: key, p_limit: index === 0 ? 5 : 3, p_window_seconds: 3600 });
      if (error) throw new HttpError(503, 'The enquiry form is temporarily unavailable. Please contact us by phone or email.');
      if (!allowed) throw new HttpError(429, 'You have sent several enquiries recently. Please try again in an hour, or contact us by phone.');
    }
    const { name, email, phone, service, message } = input;
    const { error } = await client.from('enquiries').insert({ name, email, phone, service, message });
    if (error) throw new HttpError(503, 'Your enquiry could not be saved. Please try again, or contact us by phone or email.');
    // An optional notification failure never loses or invalidates a successfully saved enquiry.
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(5000),
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL,
            to: [process.env.RESEND_NOTIFICATION_TO || 'Gabor.orban1974@gmail.com'],
            ...(email ? { reply_to: email } : {}),
            subject: `GNJ website enquiry: ${service}`,
            text: `Name: ${name}\nEmail: ${email || 'Not supplied'}\nPhone: ${phone || 'Not supplied'}\nService: ${service}\n\n${message}\n\nThis enquiry is saved in your GNJ owner dashboard.`,
          }),
        });
        if (!response.ok) console.error('Enquiry saved; notification provider returned status', response.status);
      } catch { console.error('Enquiry saved; email notification could not be sent.'); }
    }
    return json({ ok: true }, 201);
  } catch (error) { return errorResponse(error); }
}
