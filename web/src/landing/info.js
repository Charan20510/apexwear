// Static content for the footer's info pages. Cheaper than a CMS for ten pages that
// change rarely — add real backend-driven content only if that stops being true.
export const INFO_PAGES = {
  'track-order': {
    title: 'Track order',
    blocks: [
      "Order tracking arrives with the order system, which isn't built yet — see the " +
        'project roadmap for the checkout milestone.',
      'Already have an account? Sign in and your orders will show up there once checkout ships.',
    ],
    cta: { label: 'Sign in', to: '/login' },
  },
  returns: {
    title: 'Returns',
    blocks: [
      "Returns and refunds ship alongside the order system, which isn't built yet.",
      'When it lands, any order will be returnable from your account within the stated window.',
    ],
    cta: { label: 'Sign in', to: '/login' },
  },
  'size-guide': {
    title: 'Size guide',
    blocks: [
      'All APEXWEAR hoodies are cut relaxed/oversized. If you\'re between sizes, size down for a ' +
        'true-to-body fit.',
    ],
    table: {
      headers: ['Size', 'Chest (in)', 'Length (in)'],
      rows: [
        ['S', '40', '27'],
        ['M', '42', '28'],
        ['L', '44', '29'],
        ['XL', '46', '30'],
        ['XXL', '48', '31'],
      ],
    },
  },
  contact: {
    title: 'Contact',
    blocks: [
      'support@apexwear.example — we reply within one business day.',
      'For order issues, include your order number once checkout is live.',
    ],
  },
  about: {
    title: 'About',
    blocks: [
      'APEXWEAR makes heavyweight hoodies built to outlast trends — ring-spun cotton face, ' +
        'brushed fleece back, no cracking, no peel.',
      'Hoodies only. No noise, no filler drops — just the one category, done right.',
    ],
  },
  careers: {
    title: 'Careers',
    blocks: [
      "We're not hiring publicly yet. Check back once the storefront is live.",
    ],
  },
  stores: {
    title: 'Stores',
    blocks: ['Online only for now — no physical stores yet.'],
  },
  privacy: {
    title: 'Privacy',
    blocks: [
      'We collect only what running the store requires: your account email, addresses you ' +
        'save, and order history once orders exist.',
      "We don't sell your data. Payment details are handled by Razorpay and never touch our " +
        'servers directly.',
    ],
  },
  terms: {
    title: 'Terms',
    blocks: [
      'By using APEXWEAR you agree to standard sale terms: prices in INR, orders confirmed on ' +
        'payment, and stock subject to availability at checkout.',
    ],
  },
  security: {
    title: 'Security',
    blocks: [
      'Passwords are hashed, never stored in plain text. Sessions use short-lived JWTs with an ' +
        'HttpOnly refresh cookie.',
      'Found a security issue? Email support@apexwear.example.',
    ],
  },
};
