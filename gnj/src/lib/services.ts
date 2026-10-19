import type { Category } from './types';

export type Service = {
  slug: string;
  category: Category;
  title: string;
  summary: string;
  introduction: string;
  work: { title: string; description: string }[];
  preparation: string;
  questions: { question: string; answer: string }[];
};

// Describe established services only. Project examples come from the published portfolio.
export const services: Service[] = [
  {
    slug: 'garden-landscaping-patios', category: 'Garden & Outdoor Improvements',
    title: 'Garden landscaping, patios & paving',
    summary: 'Garden improvements, patio paving, terraces, garden steps and turf for outdoor spaces in Huntingdon and Huntingdonshire.',
    introduction: 'A garden improvement can make an awkward outdoor space easier to use, create somewhere to sit, or connect the house to the rest of the garden. GNJ works on patios, terraces, garden steps and turf, helping you plan the practical details as well as the finish.',
    work: [
      { title: 'Patios, paving & terraces', description: 'Discuss the size, layout and finish of a new paved area, or improvements to an existing patio. Access, the condition of the ground, levels and drainage all need consideration before the work is quoted.' },
      { title: 'Garden paths & steps', description: 'Create a more useful route through the garden or between different levels. Photographs of the existing area help us understand the route, surrounding surfaces and any access constraints.' },
      { title: 'Turf & outdoor improvements', description: 'Refresh a garden with turf and complementary outdoor work. Share how you want to use the space and the areas you would like to change so the proposal reflects your priorities.' },
    ],
    preparation: 'Send an overview photograph, approximate measurements and a description of the ground or existing paving. Mention side access, changes in level and anything you want to retain. Material choices and preparation requirements can then be discussed as part of the quote.',
    questions: [
      { question: 'Can you quote for a small patio or garden improvement?', answer: 'Yes. Tell us about the area you want to improve and the work you have in mind. The consultation can cover a specific change as well as a larger garden project.' },
      { question: 'Can I see examples of completed paving and garden work?', answer: 'The published garden projects below include photographs and descriptions supplied for completed GNJ work. Each project opens on its own page so you can look more closely at the details.' },
    ],
  },
  {
    slug: 'flooring-installation', category: 'Flooring', title: 'Tile & laminate flooring installation',
    summary: 'Tile and laminate flooring installation, with floor soundproofing options, for home improvement projects around Huntingdon.',
    introduction: 'New flooring changes both the appearance and everyday use of a room. GNJ carries out tile and laminate installation and can discuss soundproofing as part of a flooring project. The existing floor, adjoining rooms and intended use help determine the work needed.',
    work: [
      { title: 'Laminate flooring', description: 'Discuss the rooms to be fitted, your preferred finish and how the new floor will meet doorways and neighbouring surfaces. Existing flooring and the condition of the base should be considered before installation.' },
      { title: 'Tile installation', description: 'Plan a tiled floor around the room layout and selected materials. Share the tile dimensions and photographs of the existing surface so preparation, layout and finishing details can be included in the discussion.' },
      { title: 'Floor soundproofing', description: 'If noise transfer is a concern, mention it when requesting a quote. Suitable approaches depend on the floor construction and the room; performance requirements and any building-management rules need to be checked for the particular property.' },
    ],
    preparation: 'Provide approximate room measurements, photographs of the existing floor and details of the flooring you are considering. Let us know about uneven areas, door clearances, existing underfloor heating or soundproofing requirements.',
    questions: [
      { question: 'Should I choose the flooring before requesting a quote?', answer: 'You can enquire before making a final choice. Tell us whether you are considering tile or laminate and share any product details you already have, as these can affect preparation and installation.' },
      { question: 'Can soundproofing be discussed with a flooring installation?', answer: 'Yes. Describe the noise concern and the property when you enquire. The existing construction and any required performance standards need to be understood before a solution is agreed.' },
    ],
  },
  {
    slug: 'bathroom-renovations', category: 'Bathroom Renovations', title: 'Bathroom & toilet renovations',
    summary: 'Practical bathroom and toilet improvements in Huntingdon and Huntingdonshire, planned around your existing room and priorities.',
    introduction: 'A bathroom renovation may involve refreshing existing fittings or improving how the room works day to day. GNJ helps with practical bathroom and toilet improvements, starting with the condition of the room, the changes you want and the work needed to achieve them.',
    work: [
      { title: 'Bathroom improvements', description: 'Discuss what you would like to keep, replace or improve. Photographs of the current layout help identify the scope of work and the details that need checking before a quote is prepared.' },
      { title: 'Toilet improvements', description: 'Enquire about changes to a toilet or cloakroom as a separate project or alongside wider bathroom work. Include the current fittings and any limitations in the available space.' },
      { title: 'Related plumbing & flooring', description: 'Bathroom work can involve sinks, taps, plumbing and floor finishes. Mention these together when enquiring so the proposed work and any specialist requirements can be considered as a whole.' },
    ],
    preparation: 'Share photographs of the whole room and the fittings you want to change. Include approximate dimensions, your preferred products and whether the layout is staying the same. Tell us if the room is the only bathroom in the property so practical arrangements can be discussed.',
    questions: [
      { question: 'Can I request individual bathroom improvements rather than a full renovation?', answer: 'Yes. Describe the specific fittings or areas you want to improve. The work can be discussed around your priorities rather than assuming the entire room needs replacing.' },
      { question: 'How long will my bathroom project take?', answer: 'Timing depends on the agreed scope, the existing room and availability of materials. Discuss your preferred dates during the consultation; a project-specific schedule can be considered once the work is understood.' },
    ],
  },
  {
    slug: 'plumbing', category: 'Plumbing', title: 'Home plumbing & radiator replacement',
    summary: 'Kitchen and bathroom plumbing, sinks, taps and radiator replacement for planned home improvements around Huntingdon.',
    introduction: 'The smaller details of a home need to work reliably as well as look right. GNJ offers kitchen and bathroom plumbing work, including sinks, taps and radiator replacement, as standalone improvements or alongside a wider home project.',
    work: [
      { title: 'Sinks & taps', description: 'Discuss replacing or improving kitchen and bathroom sinks and taps. Photographs of the existing fittings, connections and intended replacement products help establish what is involved.' },
      { title: 'Kitchen & bathroom plumbing', description: 'Include plumbing requirements when planning changes to these rooms. The existing layout and the position of proposed fittings are useful starting points for a consultation.' },
      { title: 'Radiator replacement', description: 'Enquire about replacing a radiator and share the existing size, location and proposed replacement. The connections and compatibility with the existing system need to be checked before work is agreed.' },
    ],
    preparation: 'Send a description of the planned work, photographs of the fittings and product information where available. Mention access restrictions and whether the plumbing work is part of another renovation. Please use the contact details to discuss availability for your particular job.',
    questions: [
      { question: 'Can plumbing work be included in a bathroom renovation?', answer: 'Yes. Mention the sinks, taps and other plumbing changes you are considering when discussing the bathroom, so the scope can be assessed together.' },
      { question: 'What information helps with a radiator replacement enquiry?', answer: 'Share the radiator’s approximate dimensions, photographs of its connections and details of any replacement you have selected. These help us understand the proposed change before discussing a quote.' },
    ],
  },
];

export function serviceForCategory(category: Category) {
  return services.find(service => service.category === category)!;
}
