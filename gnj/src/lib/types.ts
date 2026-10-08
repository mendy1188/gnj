export const categories = ['Garden & Outdoor Improvements', 'Flooring', 'Bathroom Renovations', 'Plumbing'] as const;
export type Category = (typeof categories)[number];
export type ProjectImage = {
  id: string;
  path: string;
  url: string;
  alt: string;
  caption: string;
  sort_order: number;
};
export type ComparisonPair = {
  id: string;
  before_id: string;
  after_id: string;
  label: string;
  aligned: boolean;
};
export type Project = {
  id: string;
  slug: string;
  title: string;
  category: Category;
  description: string;
  location: string;
  published: boolean;
  featured: boolean;
  sort_order: number;
  cover_image_id: string | null;
  images: ProjectImage[];
  comparisons: ComparisonPair[];
  created_at?: string;
  updated_at?: string;
};
export type Enquiry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  created_at: string;
};
