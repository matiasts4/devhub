'use client';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

/**
 * PizarraContextMenu — right-click menu for the pizarra canvas.
 *
 * Reuses the shadcn/Radix ContextMenu wrapper
 * (src/components/ui/context-menu.jsx). The trigger is the canvas
 * container (asChild); Radix opens the menu at the pointer and suppresses
 * the native browser menu. The mode is resolved upstream from the Konva
 * right-click target (shape id vs empty canvas) and passed in, so this
 * component is purely presentational.
 *
 * Phase 3 covers shapes + empty canvas. Composite (terminal/browser)
 * context items arrive in Phase 4.
 */

/**
 * @param {object} props
 * @param {React.ReactNode} props.children - the trigger area (canvas container)
 * @param {'element'|'canvas'} props.mode
 * @param {boolean} [props.locked] - element mode: target locked?
 * @param {boolean} [props.canPaste] - canvas mode: clipboard non-empty?
 * @param {object} props.actions
 * @param {(open:boolean)=>void} [props.onOpenChange]
 */
export default function PizarraContextMenu({
  children,
  mode = 'canvas',
  locked = false,
  canPaste = false,
  actions = {},
  onOpenChange,
}) {
  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {mode === 'element' ? (
          <>
            <ContextMenuItem onSelect={() => actions.duplicate?.()}>Duplicar</ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.copy?.()}>Copiar</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => actions.bringToFront?.()}>
              Traer al frente
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.forward?.()}>Adelante</ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.backward?.()}>Atrás</ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.sendToBack?.()}>
              Enviar al fondo
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => actions.toggleLock?.()}>
              {locked ? 'Desbloquear' : 'Bloquear'}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => actions.delete?.()}
              className="text-destructive focus:text-destructive"
            >
              Eliminar
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem
              disabled={!canPaste}
              onSelect={() => {
                if (canPaste) actions.pasteHere?.();
              }}
            >
              Pegar aquí
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.selectAll?.()}>
              Seleccionar todo
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.fitAll?.()}>Ajustar todo</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => actions.clear?.()}
              className="text-destructive focus:text-destructive"
            >
              Limpiar pizarra
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
