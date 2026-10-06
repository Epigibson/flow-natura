/** Production web app; same value the product screens already used for API calls. */
export const SITE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://flow-natura.vercel.app').replace(/\/+$/, '');
