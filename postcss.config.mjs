/**
 * Tailwind v4 runs as a PostCSS plugin — no runtime, no JS config file.
 *
 * The design tokens and component layers live in globals.css under `@theme`
 * and `@layer`, which is where Tailwind v4 wants them. This file only wires the
 * compiler into Next's build.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
