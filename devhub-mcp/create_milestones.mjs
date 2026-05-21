import { createRequire } from 'module';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('/home/matias/devhub', '.env.local') });

const require = createRequire(import.meta.url);
const localDb = require('../src/lib/db/localDb.js');

const db = localDb.getDb();

const USER_ID = '54fee7d7-340d-4683-b259-b61a39567f94';
const now = new Date().toISOString();

// Check if landing-pages already exists
const existing = db.prepare("SELECT id FROM projects WHERE name = 'landing-pages'").get();
let projectId;

if (existing) {
  projectId = existing.id;
  console.log('PROJECT EXISTS:', projectId);
} else {
  projectId = randomUUID();
  db.prepare(`
    INSERT INTO projects (id, name, user_id, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    'landing-pages',
    USER_ID,
    'Landing pages para PyMEs chilenas. Stack: Next.js, React 19, TypeScript, Tailwind CSS v4.1.',
    'active',
    now,
    now
  );
  console.log('PROJECT CREATED:', projectId);
}

const milestones = [
  {
    title: 'M1: Landing Page Live en Producción',
    description: 'Stack: Next.js 16.2.2, React 19, TypeScript, Tailwind CSS v4.1. Dark theme inspirado en BridgeMind.ai. Secciones: Hero, Servicios (3 tiers en CLP), About, CTA/Contacto. Criterios: carga <2s mobile, Lighthouse ≥90, 3 tiers con CTA individual, formulario funcional con notificación al owner, botón WhatsApp pre-cargado por tier, deploy automático desde main a Vercel.',
    status: 'planned',
    due_date: '2026-05-10'
  },
  {
    title: 'M2: Infraestructura Productiva',
    description: 'Dominio .cl o .dev configurado apuntando a Vercel. SSL automático activo. Pipeline CI/CD: push a main → preview deploy → production. Variables de entorno separadas (preview/production). Uptime monitor activo con alerta por email.',
    status: 'planned',
    due_date: '2026-05-24'
  },
  {
    title: 'M3: Presencia en Instagram Activa',
    description: 'Perfil de empresa configurado con bio + propuesta de valor + link-in-bio a la landing. 9 posts iniciales publicados + 2 Reels. Highlights organizados por tier. Estrategia de contenido documentada: pilares, frecuencia, hashtags chilenos (PyMEs Chile, desarrollo web, emprendimiento CL).',
    status: 'planned',
    due_date: '2026-05-31'
  },
  {
    title: 'M4: Plan de Marketing y Captación — Primer Cliente',
    description: 'Estrategia de cold DM con plantillas por tier de servicio. Calendario de contenido 30 días ejecutado. Pipeline de leads trackeado. Criterio de éxito: primer cliente pago chileno cerrado antes del día 30 desde el lanzamiento.',
    status: 'planned',
    due_date: '2026-06-21'
  }
];

const createdIds = [];
for (const m of milestones) {
  const milestoneId = randomUUID();
  db.prepare(`
    INSERT INTO milestones (id, project_id, user_id, title, description, status, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    milestoneId,
    projectId,
    USER_ID,
    m.title,
    m.description,
    m.status,
    m.due_date,
    now,
    now
  );
  console.log(`MILESTONE CREATED: ${milestoneId} | ${m.title}`);
  createdIds.push({ id: milestoneId, title: m.title });
}

console.log('\nSUMMARY:');
console.log('project_id:', projectId);
console.log('user_id:', USER_ID);
console.log('milestones:', JSON.stringify(createdIds, null, 2));
