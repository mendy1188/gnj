import Link from 'next/link';
import { breadcrumbs } from '@/lib/seo';
import { StructuredData } from './structured-data';

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return <><nav className="breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={item.path}>{index === items.length - 1 ? <span aria-current="page">{item.name}</span> : <Link href={item.path}>{item.name}</Link>}</li>)}</ol></nav><StructuredData data={breadcrumbs(items)} /></>;
}
