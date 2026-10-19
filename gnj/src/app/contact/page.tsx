import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { EnquiryForm } from '@/components/enquiry-form';
import { business } from '@/lib/content';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Contact & Free Consultation in Huntingdon', description: 'Discuss garden, patio, flooring, bathroom and plumbing improvements with GNJ. Based around Huntingdon, serving Huntingdonshire and locations within 50 miles.', path: '/contact' });

export default function ContactPage() {
  return <><Header /><main id="main" className="container seo-page"><Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }]} />
    <div className="contact-grid"><div className="seo-intro"><p className="eyebrow">LET’S DISCUSS YOUR PROJECT</p><h1>Contact GNJ <em>in Huntingdon.</em></h1><p>Tell us what you would like to improve, your location and any preferred dates. We can discuss the work and the information needed for a quote.</p><p>Serving {business.serviceArea}.</p><p><a href={business.phoneHref}>{business.phone}</a><br /><a href={`mailto:${business.email}`}>{business.email}</a></p><h2>What to include</h2><p>Describe the existing space, the changes you have in mind and your town or postcode. Approximate measurements and product choices can help with the initial discussion.</p></div><EnquiryForm /></div>
  </main><Footer /></>;
}
