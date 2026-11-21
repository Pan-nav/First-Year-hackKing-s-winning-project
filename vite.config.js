// Relative base so the build works on GitHub Pages, Vercel or any static host.
import tailwindcss from '@tailwindcss/vite';

export default {
  base: './',
  server: { host: true },
  plugins: [tailwindcss()],
};
