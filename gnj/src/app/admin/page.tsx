import { getAdminSession } from '@/lib/server/auth';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminLogin } from '@/components/admin/AdminLogin';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { configured, user } = await getAdminSession();
  return user ? <AdminDashboard email={user.email ?? ''} /> : <AdminLogin configured={configured} />;
}
