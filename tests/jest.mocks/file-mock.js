/**
 * Jest stub for static asset imports (images, fonts, etc.).
 *
 * Next.js resolves `import img from './photo.jpg'` to a *static image object*
 * — `{ src, width, height, blurDataURL }` — where `src` is the bundled media
 * URL (/_next/static/media/...). We mirror that shape so code under test sees
 * the same structure it gets at build time; callers read `.src` for the URL.
 */
module.exports = {
  src: 'test-file-stub',
  width: 1920,
  height: 1080,
  blurDataURL: 'data:image/jpeg;base64,test',
};
