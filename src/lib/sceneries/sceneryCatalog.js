/**
 * Scenery Catalog — built-in full-space wallpaper definitions for DevHub.
 *
 * Each scenery is a multi-layer CSS gradient stack that renders as an
 * immersive full-screen background (pizarra canvas, terminal workspace,
 * or both). Pure CSS = zero network cost, instant switching, works offline.
 *
 * Structure per scenery:
 *  - id: unique slug
 *  - name: display name
 *  - subtitle: short poetic descriptor (shown in picker UI)
 *  - category: 'sky' | 'nature' | 'night' | 'abstract' | 'minimal' | 'photo'
 *  - accent: representative color for selection indicators
 *  - base: background-color beneath the layers (also the fallback while an
 *          image scenery loads)
 *
 *  Two rendering modes:
 *  - Gradient mode: `layers` array of CSS background-image values (first = topmost)
 *  - Image mode: `src` URL of a bundled wallpaper. Wallpapers are imported as
 *    static assets so Next.js emits them into /_next/static/media with a
 *    content hash — they resolve identically in dev, prod, standalone,
 *    Tauri and Electron (no reliance on the server serving /public).
 *    When `src` is present it wins over `layers` and is rendered with
 *    background-size: cover.
 */

import auroraWallpaper from '@/assets/wallpapers/aurora.jpg';
import nebulaWallpaper from '@/assets/wallpapers/nebula.jpg';
import forestMistWallpaper from '@/assets/wallpapers/forest-mist.jpg';
import desertDuskWallpaper from '@/assets/wallpapers/desert-dusk.jpg';
import oceanTwilightWallpaper from '@/assets/wallpapers/ocean-twilight.jpg';
import silkAbstractWallpaper from '@/assets/wallpapers/silk-abstract.jpg';

/**
 * Next.js static image imports resolve to a static image object
 * (`{ src, width, height, blurDataURL }`) rather than a bare URL string.
 * Normalize to the URL so `src` is always a string usable in `url(...)`.
 */
function wallpaperUrl(asset) {
  return typeof asset === 'string' ? asset : asset?.src;
}

export const SCENERY_CATEGORIES = {
  SKY: 'sky',
  NATURE: 'nature',
  NIGHT: 'night',
  ABSTRACT: 'abstract',
  MINIMAL: 'minimal',
  PHOTO: 'photo',
};

export const SCENERY_CATALOG = [
  // ─── Sky ────────────────────────────────────────────────────────────────
  {
    id: 'halcyon',
    name: 'Halcyon',
    subtitle: 'gilded temple · parchment glass',
    category: SCENERY_CATEGORIES.SKY,
    accent: '#E8A94C',
    base: '#1c1410',
    layers: [
      'radial-gradient(ellipse 120% 55% at 50% 100%, rgba(232,169,76,0.28) 0%, transparent 60%)',
      'radial-gradient(ellipse 80% 40% at 70% 20%, rgba(255,183,120,0.18) 0%, transparent 55%)',
      'radial-gradient(ellipse 60% 30% at 25% 35%, rgba(214,130,80,0.10) 0%, transparent 50%)',
      'linear-gradient(180deg, #2a1d12 0%, #3d2a16 30%, #5c3d1e 55%, #8a5c2e 75%, #c98a3f 92%, #e8a94c 100%)',
    ],
  },
  {
    id: 'meadow',
    name: 'Meadow',
    subtitle: 'pixel meadow · slow drift',
    category: SCENERY_CATEGORIES.SKY,
    accent: '#7EC8E3',
    base: '#0d1b24',
    layers: [
      'radial-gradient(ellipse 90% 35% at 50% 105%, rgba(94,170,110,0.35) 0%, transparent 60%)',
      'radial-gradient(circle 60px at 78% 18%, rgba(255,244,200,0.85) 0%, rgba(255,244,200,0.15) 45%, transparent 60%)',
      'radial-gradient(ellipse 50% 22% at 30% 28%, rgba(255,255,255,0.12) 0%, transparent 55%)',
      'radial-gradient(ellipse 40% 18% at 65% 40%, rgba(255,255,255,0.08) 0%, transparent 50%)',
      'linear-gradient(180deg, #4a90c2 0%, #7ec8e3 35%, #a8dce8 60%, #c8e8c0 80%, #5eaa6e 100%)',
    ],
  },
  {
    id: 'lakeside',
    name: 'Lakeside',
    subtitle: 'mediterranean lake · dawn mist',
    category: SCENERY_CATEGORIES.NATURE,
    accent: '#4E9B7E',
    base: '#0a1a14',
    layers: [
      'radial-gradient(ellipse 100% 30% at 50% 108%, rgba(40,90,120,0.45) 0%, transparent 55%)',
      'radial-gradient(ellipse 70% 25% at 20% 85%, rgba(78,155,126,0.30) 0%, transparent 50%)',
      'radial-gradient(ellipse 55% 20% at 80% 75%, rgba(78,155,126,0.20) 0%, transparent 45%)',
      'radial-gradient(ellipse 45% 18% at 40% 22%, rgba(255,255,255,0.07) 0%, transparent 50%)',
      'linear-gradient(180deg, #87b5a0 0%, #a8cdb8 25%, #c2ddd0 45%, #6ba88e 65%, #3d7a62 82%, #285a48 100%)',
    ],
  },
  {
    id: 'dawn-ridge',
    name: 'Dawn Ridge',
    subtitle: 'mountain silhouette · first light',
    category: SCENERY_CATEGORIES.NATURE,
    accent: '#D4838F',
    base: '#120d18',
    layers: [
      'linear-gradient(165deg, transparent 42%, rgba(30,20,45,0.9) 43%, rgba(25,16,38,0.95) 100%)',
      'linear-gradient(195deg, transparent 55%, rgba(45,28,60,0.7) 56%, rgba(35,22,48,0.85) 100%)',
      'radial-gradient(ellipse 80% 35% at 50% 60%, rgba(255,140,120,0.25) 0%, transparent 55%)',
      'radial-gradient(circle 50px at 50% 58%, rgba(255,200,150,0.7) 0%, rgba(255,160,120,0.2) 50%, transparent 65%)',
      'linear-gradient(180deg, #1a1028 0%, #3d2050 30%, #7a3860 50%, #c45a6a 65%, #e88a70 78%, #f0b080 100%)',
    ],
  },
  {
    id: 'cirrus',
    name: 'Cirrus',
    subtitle: 'high clouds · endless blue',
    category: SCENERY_CATEGORIES.SKY,
    accent: '#89B4D8',
    base: '#0a1520',
    layers: [
      'radial-gradient(ellipse 70% 12% at 35% 25%, rgba(255,255,255,0.14) 0%, transparent 60%)',
      'radial-gradient(ellipse 55% 10% at 60% 38%, rgba(255,255,255,0.10) 0%, transparent 55%)',
      'radial-gradient(ellipse 80% 14% at 45% 55%, rgba(255,255,255,0.08) 0%, transparent 50%)',
      'radial-gradient(ellipse 45% 8% at 70% 70%, rgba(255,255,255,0.06) 0%, transparent 50%)',
      'linear-gradient(180deg, #1a3a5c 0%, #2a5a8a 30%, #4a80b0 55%, #6a9ec8 75%, #89b4d8 100%)',
    ],
  },

  // ─── Night ──────────────────────────────────────────────────────────────
  {
    id: 'night-meadow',
    name: 'Night Meadow',
    subtitle: 'moonlit meadow · still air',
    category: SCENERY_CATEGORIES.NIGHT,
    accent: '#6B8CC7',
    base: '#060a14',
    layers: [
      'radial-gradient(circle 2px at 15% 12%, rgba(255,255,255,0.8) 0%, transparent 100%)',
      'radial-gradient(circle 1.5px at 40% 8%, rgba(255,255,255,0.6) 0%, transparent 100%)',
      'radial-gradient(circle 2px at 65% 15%, rgba(255,255,255,0.7) 0%, transparent 100%)',
      'radial-gradient(circle 1px at 85% 10%, rgba(255,255,255,0.5) 0%, transparent 100%)',
      'radial-gradient(circle 1.5px at 25% 30%, rgba(255,255,255,0.4) 0%, transparent 100%)',
      'radial-gradient(circle 1px at 55% 25%, rgba(255,255,255,0.5) 0%, transparent 100%)',
      'radial-gradient(circle 1.5px at 75% 32%, rgba(255,255,255,0.35) 0%, transparent 100%)',
      'radial-gradient(circle 1px at 90% 28%, rgba(255,255,255,0.45) 0%, transparent 100%)',
      'radial-gradient(circle 34px at 80% 16%, rgba(220,230,255,0.9) 0%, rgba(180,200,240,0.25) 40%, transparent 60%)',
      'radial-gradient(ellipse 90% 30% at 50% 108%, rgba(30,50,80,0.5) 0%, transparent 55%)',
      'linear-gradient(180deg, #060a14 0%, #0c1424 35%, #142038 60%, #1c2c4c 80%, #243858 100%)',
    ],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    subtitle: 'boreal curtain · ion green',
    category: SCENERY_CATEGORIES.NIGHT,
    accent: '#4ADE80',
    base: '#040810',
    layers: [
      'radial-gradient(circle 1.5px at 20% 15%, rgba(255,255,255,0.6) 0%, transparent 100%)',
      'radial-gradient(circle 1px at 50% 10%, rgba(255,255,255,0.5) 0%, transparent 100%)',
      'radial-gradient(circle 1.5px at 75% 20%, rgba(255,255,255,0.4) 0%, transparent 100%)',
      'linear-gradient(160deg, transparent 20%, rgba(74,222,128,0.12) 35%, rgba(56,189,248,0.08) 45%, transparent 60%)',
      'linear-gradient(200deg, transparent 30%, rgba(74,222,128,0.18) 42%, rgba(134,239,172,0.06) 55%, transparent 70%)',
      'linear-gradient(175deg, transparent 10%, rgba(45,212,191,0.10) 28%, rgba(74,222,128,0.14) 40%, transparent 58%)',
      'linear-gradient(180deg, #040810 0%, #081018 40%, #0c1820 70%, #101c28 100%)',
    ],
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    subtitle: 'void field · stellar dust',
    category: SCENERY_CATEGORIES.NIGHT,
    accent: '#A78BFA',
    base: '#030308',
    layers: [
      'radial-gradient(circle 1px at 10% 20%, rgba(255,255,255,0.7) 0%, transparent 100%)',
      'radial-gradient(circle 1.5px at 30% 60%, rgba(200,180,255,0.6) 0%, transparent 100%)',
      'radial-gradient(circle 1px at 45% 35%, rgba(255,255,255,0.5) 0%, transparent 100%)',
      'radial-gradient(circle 2px at 60% 75%, rgba(167,139,250,0.6) 0%, transparent 100%)',
      'radial-gradient(circle 1px at 72% 15%, rgba(255,255,255,0.6) 0%, transparent 100%)',
      'radial-gradient(circle 1.5px at 88% 45%, rgba(255,255,255,0.4) 0%, transparent 100%)',
      'radial-gradient(circle 1px at 55% 90%, rgba(200,200,255,0.5) 0%, transparent 100%)',
      'radial-gradient(ellipse 60% 45% at 70% 65%, rgba(88,60,160,0.12) 0%, transparent 55%)',
      'radial-gradient(ellipse 50% 40% at 25% 30%, rgba(40,60,140,0.10) 0%, transparent 50%)',
      'linear-gradient(180deg, #030308 0%, #08081a 50%, #0c0c22 100%)',
    ],
  },
  {
    id: 'midnight-city',
    name: 'Midnight City',
    subtitle: 'neon haze · rooftop view',
    category: SCENERY_CATEGORIES.NIGHT,
    accent: '#F472B6',
    base: '#0a0812',
    layers: [
      'radial-gradient(ellipse 50% 25% at 80% 90%, rgba(244,114,182,0.14) 0%, transparent 55%)',
      'radial-gradient(ellipse 45% 22% at 20% 95%, rgba(96,165,250,0.12) 0%, transparent 50%)',
      'radial-gradient(ellipse 60% 30% at 50% 105%, rgba(168,85,247,0.10) 0%, transparent 55%)',
      'radial-gradient(ellipse 35% 15% at 65% 30%, rgba(244,114,182,0.05) 0%, transparent 45%)',
      'linear-gradient(180deg, #0a0812 0%, #120e1e 35%, #1a1228 60%, #221832 80%, #2a1e3c 100%)',
    ],
  },

  // ─── Abstract ───────────────────────────────────────────────────────────
  {
    id: 'ember-flow',
    name: 'Ember Flow',
    subtitle: 'molten amber · slow burn',
    category: SCENERY_CATEGORIES.ABSTRACT,
    accent: '#F97316',
    base: '#100804',
    layers: [
      'radial-gradient(ellipse 70% 50% at 75% 80%, rgba(249,115,22,0.16) 0%, transparent 55%)',
      'radial-gradient(ellipse 55% 40% at 25% 70%, rgba(234,88,12,0.12) 0%, transparent 50%)',
      'radial-gradient(ellipse 40% 30% at 60% 30%, rgba(251,146,60,0.07) 0%, transparent 45%)',
      'linear-gradient(135deg, transparent 40%, rgba(249,115,22,0.06) 55%, transparent 70%)',
      'linear-gradient(180deg, #100804 0%, #1c0e06 40%, #281408 70%, #341a0a 100%)',
    ],
  },
  {
    id: 'violet-drift',
    name: 'Violet Drift',
    subtitle: 'ultraviolet fog · weightless',
    category: SCENERY_CATEGORIES.ABSTRACT,
    accent: '#8B5CF6',
    base: '#0c0814',
    layers: [
      'radial-gradient(ellipse 65% 45% at 30% 25%, rgba(139,92,246,0.14) 0%, transparent 55%)',
      'radial-gradient(ellipse 55% 40% at 75% 65%, rgba(168,85,247,0.10) 0%, transparent 50%)',
      'radial-gradient(ellipse 45% 35% at 55% 45%, rgba(124,58,237,0.07) 0%, transparent 45%)',
      'linear-gradient(225deg, transparent 30%, rgba(139,92,246,0.05) 50%, transparent 65%)',
      'linear-gradient(180deg, #0c0814 0%, #140e20 40%, #1a1228 70%, #201630 100%)',
    ],
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    subtitle: 'cherry blossom · soft focus',
    category: SCENERY_CATEGORIES.ABSTRACT,
    accent: '#F9A8D4',
    base: '#140c10',
    layers: [
      'radial-gradient(ellipse 60% 40% at 70% 25%, rgba(249,168,212,0.13) 0%, transparent 55%)',
      'radial-gradient(ellipse 50% 35% at 25% 60%, rgba(244,114,182,0.10) 0%, transparent 50%)',
      'radial-gradient(ellipse 40% 30% at 50% 85%, rgba(251,207,232,0.07) 0%, transparent 45%)',
      'radial-gradient(ellipse 30% 20% at 40% 15%, rgba(255,255,255,0.04) 0%, transparent 40%)',
      'linear-gradient(180deg, #140c10 0%, #1e1218 40%, #28181f 70%, #301e26 100%)',
    ],
  },
  {
    id: 'teal-abyss',
    name: 'Teal Abyss',
    subtitle: 'deep current · bioluminescence',
    category: SCENERY_CATEGORIES.ABSTRACT,
    accent: '#2DD4BF',
    base: '#04100e',
    layers: [
      'radial-gradient(ellipse 55% 40% at 65% 70%, rgba(45,212,191,0.12) 0%, transparent 55%)',
      'radial-gradient(ellipse 45% 35% at 30% 35%, rgba(20,184,166,0.09) 0%, transparent 50%)',
      'radial-gradient(circle 3px at 45% 55%, rgba(94,234,212,0.5) 0%, transparent 100%)',
      'radial-gradient(circle 2px at 70% 40%, rgba(94,234,212,0.35) 0%, transparent 100%)',
      'radial-gradient(circle 2.5px at 25% 70%, rgba(94,234,212,0.4) 0%, transparent 100%)',
      'linear-gradient(180deg, #04100e 0%, #081a16 40%, #0c221e 70%, #102a24 100%)',
    ],
  },

  // ─── Minimal ────────────────────────────────────────────────────────────
  {
    id: 'graphite',
    name: 'Graphite',
    subtitle: 'matte carbon · zero noise',
    category: SCENERY_CATEGORIES.MINIMAL,
    accent: '#6B7280',
    base: '#0e1117',
    layers: [
      'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.018) 0%, transparent 60%)',
      'linear-gradient(180deg, #0e1117 0%, #12161e 50%, #161b24 100%)',
    ],
  },
  {
    id: 'parchment',
    name: 'Parchment',
    subtitle: 'warm paper · reading light',
    category: SCENERY_CATEGORIES.MINIMAL,
    accent: '#D4C5A0',
    base: '#1a1610',
    layers: [
      'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(212,197,160,0.06) 0%, transparent 55%)',
      'radial-gradient(ellipse 50% 40% at 70% 70%, rgba(212,197,160,0.04) 0%, transparent 50%)',
      'linear-gradient(180deg, #1a1610 0%, #201b14 50%, #262018 100%)',
    ],
  },

  // ─── Bundled wallpapers (image mode) ───────────────────────────────────
  // Real images shipped inside the package under src/assets/wallpapers and
  // imported above as static assets (bundled into /_next/static/media).
  // Rendered with background-size: cover.
  {
    id: 'photo-aurora',
    name: 'Aurora Boreal',
    subtitle: 'luces del norte · montaña nevada',
    category: SCENERY_CATEGORIES.PHOTO,
    accent: '#4ADE80',
    base: '#071018',
    src: wallpaperUrl(auroraWallpaper),
  },
  {
    id: 'photo-nebula',
    name: 'Nebulosa',
    subtitle: 'polvo estelar · violeta profundo',
    category: SCENERY_CATEGORIES.PHOTO,
    accent: '#A78BFA',
    base: '#050510',
    src: wallpaperUrl(nebulaWallpaper),
  },
  {
    id: 'photo-forest',
    name: 'Bosque Brumoso',
    subtitle: 'pinos al amanecer · niebla verde',
    category: SCENERY_CATEGORIES.PHOTO,
    accent: '#6B9080',
    base: '#0c1512',
    src: wallpaperUrl(forestMistWallpaper),
  },
  {
    id: 'photo-desert',
    name: 'Dunas al Atardecer',
    subtitle: 'arena dorada · luz ámbar',
    category: SCENERY_CATEGORIES.PHOTO,
    accent: '#E8A94C',
    base: '#160e06',
    src: wallpaperUrl(desertDuskWallpaper),
  },
  {
    id: 'photo-ocean',
    name: 'Acantilados',
    subtitle: 'costa al crepúsculo · azul profundo',
    category: SCENERY_CATEGORIES.PHOTO,
    accent: '#60A5FA',
    base: '#0a1220',
    src: wallpaperUrl(oceanTwilightWallpaper),
  },
  {
    id: 'photo-silk',
    name: 'Seda Abstracta',
    subtitle: 'ondas oscuras · flujo minimal',
    category: SCENERY_CATEGORIES.PHOTO,
    accent: '#8B5CF6',
    base: '#0c0a12',
    src: wallpaperUrl(silkAbstractWallpaper),
  },
];

/** Lookup a scenery definition by id. Returns null if not found. */
export function getSceneryById(id) {
  if (!id) return null;
  return SCENERY_CATALOG.find((s) => s.id === id) || null;
}

/** All sceneries in a given category. */
export function getSceneriesByCategory(category) {
  return SCENERY_CATALOG.filter((s) => s.category === category);
}

/** Whether a scenery renders from a bundled image (vs. CSS gradient layers). */
export function isImageScenery(scenery) {
  return Boolean(scenery && typeof scenery.src === 'string' && scenery.src);
}

/** Category display metadata. */
export const SCENERY_CATEGORY_META = {
  [SCENERY_CATEGORIES.SKY]: { label: 'Cielo', order: 0 },
  [SCENERY_CATEGORIES.NATURE]: { label: 'Naturaleza', order: 1 },
  [SCENERY_CATEGORIES.NIGHT]: { label: 'Nocturno', order: 2 },
  [SCENERY_CATEGORIES.ABSTRACT]: { label: 'Abstracto', order: 3 },
  [SCENERY_CATEGORIES.MINIMAL]: { label: 'Minimal', order: 4 },
  [SCENERY_CATEGORIES.PHOTO]: { label: 'Imágenes incluidas', order: 5 },
};
