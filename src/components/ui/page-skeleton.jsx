'use client';

/**
 * PageSkeleton — placeholders con la forma real de cada página mientras cargan
 * los datos. Sustituye los spinners full-page: la estructura pinta al instante
 * y el contenido real la reemplaza de una sola vez, evitando el efecto de
 * "relleno" de arriba hacia abajo (chrome visible con ceros mientras llegan
 * los datos).
 *
 * Uso típico en una vista:
 *   if (loading) return <PageSkeleton tiles={4} rows={6} />;
 */

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function Bone({ className, style }) {
  return (
    <Skeleton aria-hidden="true" className={cn('bg-primary/10', className)} style={style} />
  );
}

/** Fila de tarjetas de estadísticas (tiles) con valores y etiquetas. */
export function StatTilesSkeleton({ count = 4, className }) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-card)' }}
        >
          <Bone className="h-3 w-16 mb-3" />
          <Bone className="h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Lista de filas tipo tabla/timeline. */
export function RowsSkeleton({ rows = 6, className }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Bone className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex-1 flex flex-col gap-2">
            <Bone className="h-3.5" style={{ width: `${72 - (i % 4) * 10}%` }} />
            <Bone className="h-2.5" style={{ width: `${45 - (i % 3) * 8}%` }} />
          </div>
          <Bone className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Cabecera de página: título + acciones. */
export function PageHeaderSkeleton({ className }) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)} aria-hidden="true">
      <div className="flex flex-col gap-2">
        <Bone className="h-6 w-48" />
        <Bone className="h-3 w-32" />
      </div>
      <Bone className="h-9 w-28 rounded-lg" />
    </div>
  );
}

/**
 * Página completa: header + tiles opcionales + filas.
 * Respeta el shell visual de las vistas (`core-page-shell` pinta su propio fondo).
 */
export function PageSkeleton({ tiles = 0, rows = 6, showHeader = true, className, ...props }) {
  return (
    <div
      className={cn('min-h-screen core-page-shell', className)}
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
      role="status"
      aria-label="Cargando"
      {...props}
    >
      <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col gap-8">
        {showHeader && <PageHeaderSkeleton />}
        {tiles > 0 && <StatTilesSkeleton count={tiles} />}
        <RowsSkeleton rows={rows} />
      </div>
    </div>
  );
}

/**
 * Shell de arranque del workspace (gate global de App.js): pinta la estructura
 * sidebar + header + contenido al instante en lugar de un spinner centrado.
 */
export function WorkspaceSkeleton() {
  return (
    <div
      className="relative flex h-screen overflow-hidden bg-surface-app text-text-primary"
      role="status"
      aria-label="Cargando workspace"
      style={{ borderRadius: '22px' }}
    >
      {/* Sidebar */}
      <div
        className="hidden md:flex w-60 shrink-0 flex-col gap-3 border-r p-4"
        style={{ borderColor: 'var(--border-subtle)' }}
        aria-hidden="true"
      >
        <Bone className="h-8 w-32 mb-2" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Bone key={i} className="h-8 w-full rounded-lg" style={{ opacity: 1 - i * 0.1 }} />
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="h-14 border-b flex items-center px-6"
          style={{ borderColor: 'var(--border-subtle)' }}
          aria-hidden="true"
        >
          <Bone className="h-4 w-40" />
        </div>
        <div className="mx-auto w-full max-w-6xl px-6 py-8 flex flex-col gap-8">
          <PageHeaderSkeleton />
          <StatTilesSkeleton count={4} />
          <RowsSkeleton rows={5} />
        </div>
      </div>
    </div>
  );
}

export default PageSkeleton;
