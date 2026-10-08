import type { Project } from './types';

export const business = {
  name: 'GNJ Home & Garden Improvement',
  email: 'Gabor.orban1974@gmail.com',
  phone: '+44 7878079245',
  phoneHref: 'tel:+447878079245',
  serviceArea: process.env.NEXT_PUBLIC_SERVICE_AREA || '',
  headline: 'Beautiful improvements. Inside and out.',
  introduction: 'From garden transformations and new flooring to bathroom renovations and plumbing, GNJ helps you create a home you’ll love.',
  about: 'A home is made for living. We help make yours work beautifully, with practical improvements inside and out. From the first conversation to the finishing details, we take a thoughtful approach to your space and the way you use it.',
};

// Genuine completed-work photographs extracted from the supplied GNJ flyer.
// These are not before-and-after pairs. Supabase replaces this starter content
// once configured; scripts/import-starter-projects.ts can import it for the owner.
const supplied = [
  { id: 'garden', title: 'A greener garden', slug: 'a-greener-garden', image: '/images/garden.webp', alt: 'GNJ garden with shaped green turf, pale decorative gravel and a planted rockery', description: 'Shaped turf, pale gravel and a planted rockery bring a fresh, considered feel to this outdoor space. A combination of textures creates distinct areas within the garden.' },
  { id: 'courtyard', title: 'Room to unwind', slug: 'room-to-unwind', image: '/images/courtyard.webp', alt: 'Pale paving slabs bordered by decorative gravel in a courtyard', description: 'Pale paving and decorative gravel give this courtyard a simple, balanced finish. The mix of stone sizes adds a natural rhythm to the space.' },
  { id: 'patio', title: 'A natural finish', slug: 'a-natural-finish', image: '/images/patio.webp', alt: 'Close-up of completed textured stone-effect patio paving', description: 'Textured paving brings warmth and character outdoors. The detail of the surface and the pattern of the joints give this patio its distinctive finish.' },
  { id: 'path', title: 'Every step considered', slug: 'every-step-considered', image: '/images/path.webp', alt: 'A finished stone-effect garden path beside a red brick house', description: 'A neat paved pathway alongside the house creates a defined route through the outdoor space, with a textured finish that complements the surrounding brickwork.' },
];

export const seedProjects: Project[] = supplied.map((item, i) => ({
  id: item.id, slug: item.slug, title: item.title, category: 'Garden & Outdoor Improvements',
  description: item.description, location: '', published: true, featured: i === 0, sort_order: i,
  cover_image_id: `${item.id}-photo`,
  images: [{ id: `${item.id}-photo`, path: item.image, url: item.image, alt: item.alt, caption: '', sort_order: 0 }],
  comparisons: [],
}));
