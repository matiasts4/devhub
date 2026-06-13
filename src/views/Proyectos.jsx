import { useState } from 'react';
import { FolderKanban, Plus, Star, GitBranch, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { UiHeader } from '@/components/ui/system';

const proyectos = [
  {
    id: 1,
    nombre: 'E-commerce V2',
    descripcion: 'Plataforma de comercio electrónico con pagos integrados y gestión de inventario.',
    stack: ['React', 'FastAPI', 'MongoDB', 'Stripe'],
    estado: 'Activo',
    progreso: 62,
    estrellas: 4,
    ultimaActividad: 'Hace 5 min',
    color: '#00F0FF',
  },
  {
    id: 2,
    nombre: 'Admin Dashboard',
    descripcion: 'Panel administrativo con analítica en tiempo real y gestión de usuarios.',
    stack: ['Next.js', 'Node.js', 'PostgreSQL'],
    estado: 'En pausa',
    progreso: 88,
    estrellas: 5,
    ultimaActividad: 'Hace 2h',
    color: '#39FF14',
  },
  {
    id: 3,
    nombre: 'Mobile App',
    descripcion: 'Aplicación móvil para clientes finales con notificaciones push y modo offline.',
    stack: ['React Native', 'Expo', 'GraphQL'],
    estado: 'Planificando',
    progreso: 15,
    estrellas: 3,
    ultimaActividad: 'Ayer',
    color: '#FF007F',
  },
  {
    id: 4,
    nombre: 'API Gateway',
    descripcion: 'Gateway centralizado con autenticación, rate limiting y logging.',
    stack: ['FastAPI', 'Redis', 'Docker'],
    estado: 'Activo',
    progreso: 45,
    estrellas: 4,
    ultimaActividad: 'Hace 1h',
    color: '#FFE600',
  },
  {
    id: 5,
    nombre: 'CMS Headless',
    descripcion: 'Sistema de gestión de contenido desacoplado con soporte multiidioma.',
    stack: ['Strapi', 'PostgreSQL', 'S3'],
    estado: 'Completado',
    progreso: 100,
    estrellas: 5,
    ultimaActividad: 'Hace 3 días',
    color: '#39FF14',
  },
  {
    id: 6,
    nombre: 'Microservicios Auth',
    descripcion: 'Servicio de autenticación y autorización con OAuth2 y JWT.',
    stack: ['FastAPI', 'Redis', 'MongoDB'],
    estado: 'En pausa',
    progreso: 70,
    estrellas: 4,
    ultimaActividad: 'Hace 1 día',
    color: '#FF007F',
  },
];

const estadoConfig = {
  Activo: 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/25',
  'En pausa': 'bg-[#FFE600]/10 text-[#FFE600] border-[#FFE600]/25',
  Planificando: 'bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/25',
  Completado: 'bg-white/10 text-white border-white/20',
};

export default function Proyectos() {
  const [filtro, setFiltro] = useState('Todos');
  const filtros = ['Todos', 'Activo', 'En pausa', 'Planificando', 'Completado'];

  const filtered = filtro === 'Todos' ? proyectos : proyectos.filter((p) => p.estado === filtro);

  return (
    <div className="h-full bg-surface-app dot-grid flex flex-col">
      <UiHeader sticky data-testid="ui-header">
        <UiHeader.Title>Proyectos</UiHeader.Title>
        <UiHeader.Actions>
          <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
            {proyectos.length} total
          </span>
          <button
            data-testid="nuevo-proyecto-btn"
            onClick={() =>
              toast.success('Nuevo proyecto iniciado', {
                description: 'NEXUS-7 generará el scaffolding automáticamente.',
              })
            }
            className="flex items-center gap-2 bg-[var(--proyectos-accent-cyan)] text-[#0d1117] font-semibold px-4 py-2 rounded-lg text-xs hover:bg-[var(--proyectos-accent-cyan)]/85 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Nuevo Proyecto
          </button>
        </UiHeader.Actions>
      </UiHeader>

      <div className="px-6 py-5 flex-1">
        {/* Filtros */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {filtros.map((f) => (
            <button
              key={f}
              data-testid={`filtro-${f.toLowerCase().replace(' ', '-')}`}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtro === f
                  ? 'bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25'
                  : 'text-slate-400 border border-white/8 hover:border-white/15 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p, i) => (
            <div
              key={p.id}
              data-testid={`proyecto-card-${p.id}`}
              className="fade-in-up bg-surface-card/60 border border-white/8 rounded-xl p-5 hover:border-white/15 hover:bg-surface-card/80 transition-all duration-300 group cursor-pointer"
              style={{
                animationDelay: `${i * 70}ms`,
                borderLeftColor: p.color,
                borderLeftWidth: '2px',
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-mono font-semibold text-white text-sm">{p.nombre}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    {Array.from({ length: p.estrellas }).map((_, si) => (
                      <Star key={si} className="w-3 h-3 text-[#FFE600] fill-[#FFE600]" />
                    ))}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${estadoConfig[p.estado]}`}
                >
                  {p.estado}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-4">{p.descripcion}</p>

              <div className="flex flex-wrap gap-1 mb-4">
                {p.stack.map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2 py-0.5 bg-white/5 border border-white/8 rounded-md text-slate-300 font-mono"
                  >
                    {s}
                  </span>
                ))}
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Progreso</span>
                  <span className="font-mono" style={{ color: p.color }}>
                    {p.progreso}%
                  </span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${p.progreso}%`,
                      background: `linear-gradient(90deg, ${p.color}60, ${p.color})`,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" strokeWidth={1.5} />
                  {p.ultimaActividad}
                </div>
                <ExternalLink
                  className="w-3.5 h-3.5 text-slate-600 group-hover:text-[#00F0FF] transition-colors cursor-pointer"
                  strokeWidth={1.5}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
