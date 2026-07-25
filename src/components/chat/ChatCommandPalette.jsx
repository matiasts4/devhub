import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquarePlus,
  Clock,
  Zap,
  Settings,
  FolderOpen,
  Brain,
  TerminalSquare,
  Search,
  ListTodo,
  PenTool,
  CheckSquare,
  Code,
  ShieldCheck,
  Archive,
  FileText,
  GitPullRequest,
  Bug,
  Scale,
  TestTube,
  Wrench,
  Palette,
  Monitor,
  Database,
  Server,
} from 'lucide-react';
import { slashCommands } from '@/lib/slashSkills';

// Map icon names to lucide-react components
const iconMap = {
  Search,
  FileText,
  ListTodo,
  ListChecks: ListTodo,
  PenTool,
  CheckSquare,
  Code,
  ShieldCheck,
  Archive,
  Brain,
  GitPullRequest,
  Bug,
  Scale,
  TestTube,
  Wrench,
  Palette,
  Zap,
  Monitor,
  TerminalSquare,
  MessageSquarePlus,
  Clock,
  Settings,
  FolderOpen,
  Database,
  Server,
};

export default function ChatCommandPalette({
  open,
  onOpenChange,
  sessions = [],
  onSelectSession,
  onCreateSession,
  onInsertCommand,
  onNavigate,
}) {
  const navigate = useNavigate();

  const handleSelectSession = useCallback(
    (sessionId) => {
      onOpenChange(false);
      onSelectSession?.(sessionId);
    },
    [onOpenChange, onSelectSession]
  );

  const handleCreateSession = useCallback(() => {
    onOpenChange(false);
    onCreateSession?.();
  }, [onOpenChange, onCreateSession]);

  const handleInsertCommand = useCallback(
    (cmd) => {
      onOpenChange(false);
      onInsertCommand?.(cmd);
    },
    [onOpenChange, onInsertCommand]
  );

  const handleNavigate = useCallback(
    (path) => {
      onOpenChange(false);
      if (onNavigate) {
        onNavigate(path);
      } else {
        navigate(path);
      }
    },
    [onOpenChange, onNavigate, navigate]
  );

  // Ctrl+K keyboard shortcut
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar sesiones, comandos, acciones..." />
      <CommandList>
        <CommandEmpty>No se encontraron resultados.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="Acciones rápidas">
          <CommandItem onSelect={handleCreateSession}>
            <MessageSquarePlus className="w-4 h-4" />
            <span>Nueva conversación</span>
            <span className="ml-auto text-xs text-muted-foreground">Ctrl+N</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Slash Commands */}
        <CommandGroup heading="Comandos">
          {slashCommands.map((cmd) => {
            const Icon = iconMap[cmd.icon] || TerminalSquare;
            return (
              <CommandItem
                key={cmd.cmd}
                onSelect={() => handleInsertCommand(cmd.cmd)}
                value={`${cmd.cmd} ${cmd.label} ${cmd.description}`}
              >
                <Icon className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="font-mono text-xs">{cmd.cmd}</span>
                  <span className="text-xs text-muted-foreground">{cmd.label}</span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <>
            <CommandGroup heading="Sesiones recientes">
              {sessions.slice(0, 8).map((session) => (
                <CommandItem
                  key={session.id}
                  onSelect={() => handleSelectSession(session.id)}
                  value={`${session.title || 'Sin título'} ${session.id}`}
                >
                  <Clock className="w-4 h-4" />
                  <span className="truncate">{session.title || 'Sin título'}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navegación">
          <CommandItem onSelect={() => handleNavigate('/dashboard')}>
            <FolderOpen className="w-4 h-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate('/swarm')}>
            <Brain className="w-4 h-4" />
            <span>Swarm Control</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate('/tareas')}>
            <ListTodo className="w-4 h-4" />
            <span>Tareas</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate('/ajustes')}>
            <Settings className="w-4 h-4" />
            <span>Ajustes</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
