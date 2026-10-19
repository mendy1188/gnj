import { serveProjectImage } from '@/lib/server/public-images';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; imageId: string; filename: string }> }) {
  return serveProjectImage(request, await params);
}
