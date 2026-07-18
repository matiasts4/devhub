import catppuccinIcons from '@iconify-json/catppuccin/icons.json';

const cat = catppuccinIcons;
const CAT_W = cat.width ?? 16;
const CAT_H = cat.height ?? 16;
const dataUrlCache = new Map();

const DEFAULT_FILE = 'file';
const DEFAULT_FOLDER = 'folder';
const DEFAULT_FOLDER_OPEN = 'folder-open';

// Compact maps — enough for DevHub's common stack.
const FILE_NAMES = {
  'package.json': 'nodejs',
  'package-lock.json': 'nodejs',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'cargo.toml': 'rust',
  'cargo.lock': 'rust',
  'go.mod': 'go',
  'go.sum': 'go',
  'tsconfig.json': 'typescript',
  'jsconfig.json': 'javascript',
  'next.config.js': 'next',
  'next.config.mjs': 'next',
  'next.config.ts': 'next',
  'vite.config.js': 'vite',
  'vite.config.ts': 'vite',
  'tailwind.config.js': 'tailwind',
  'tailwind.config.ts': 'tailwind',
  dockerfile: 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  makefile: 'makefile',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.env': 'dotenv',
  '.env.local': 'dotenv',
  '.env.development': 'dotenv',
  '.env.production': 'dotenv',
  'readme.md': 'markdown',
  'agents.md': 'markdown',
};

const FILE_EXTENSIONS = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'react',
  ts: 'typescript',
  tsx: 'react',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'sass',
  less: 'less',
  html: 'html',
  htm: 'html',
  svg: 'svg',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  rs: 'rust',
  go: 'go',
  py: 'python',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  sql: 'database',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
  tex: 'tex',
  latex: 'tex',
  pdf: 'pdf',
  zip: 'zip',
  gz: 'zip',
  tgz: 'zip',
  lock: 'lock',
};

const FOLDER_NAMES = {
  src: 'folder-src',
  lib: 'folder-lib',
  components: 'folder-components',
  pages: 'folder-pages',
  app: 'folder-app',
  api: 'folder-api',
  public: 'folder-public',
  assets: 'folder-images',
  images: 'folder-images',
  styles: 'folder-css',
  css: 'folder-css',
  test: 'folder-test',
  tests: 'folder-test',
  __tests__: 'folder-test',
  docs: 'folder-docs',
  scripts: 'folder-scripts',
  config: 'folder-config',
  '.github': 'folder-github',
  '.vscode': 'folder-vscode',
  '.git': 'folder-git',
  node_modules: 'folder-node',
  dist: 'folder-dist',
  build: 'folder-dist',
  target: 'folder-dist',
};

function toIconifySlug(name) {
  return String(name || '').replace(/_/g, '-');
}

function catBody(iconName) {
  const slug = toIconifySlug(iconName);
  const direct = cat.icons?.[slug];
  if (direct) return direct.body;
  const alias = cat.aliases?.[slug];
  if (alias) {
    const parent = cat.icons?.[alias.parent];
    if (parent) return parent.body;
  }
  return null;
}

function buildDataUrl(iconName) {
  const cached = dataUrlCache.get(iconName);
  if (cached !== undefined) return cached || null;
  const body = catBody(iconName);
  if (!body) {
    dataUrlCache.set(iconName, '');
    return null;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CAT_W} ${CAT_H}">${body}</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  dataUrlCache.set(iconName, url);
  return url;
}

function extOf(name) {
  const lower = name.toLowerCase();
  const dot = lower.indexOf('.');
  if (dot === -1 || dot === lower.length - 1) return '';
  return lower.slice(dot + 1);
}

export function fileIconUrl(name) {
  const lower = String(name || '').toLowerCase();
  const byName = FILE_NAMES[lower];
  if (byName) {
    const url = buildDataUrl(byName);
    if (url) return url;
  }

  let ext = extOf(lower);
  while (ext) {
    const iconName = FILE_EXTENSIONS[ext];
    if (iconName) {
      const url = buildDataUrl(iconName);
      if (url) return url;
    }
    const nextDot = ext.indexOf('.');
    if (nextDot === -1) break;
    ext = ext.slice(nextDot + 1);
  }

  return buildDataUrl(DEFAULT_FILE) ?? '';
}

export function folderIconUrl(name, expanded) {
  const lower = String(name || '').toLowerCase();
  const mapped = FOLDER_NAMES[lower];
  if (mapped) {
    const target = expanded ? `${mapped}-open` : mapped;
    const url = buildDataUrl(target) || buildDataUrl(mapped);
    if (url) return url;
  }
  return buildDataUrl(expanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER) ?? '';
}
