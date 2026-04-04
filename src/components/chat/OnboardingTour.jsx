import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  MessageSquare,
  Terminal,
  Command,
  History,
  Cpu,
  Zap,
} from 'lucide-react';

const STORAGE_KEY = 'devhub-onboarding-completed';

const steps = [
  {
    id: 'welcome',
    title: '¡Bienvenido a DevHub!',
    description:
      'Tu orquestador de IA para desarrollo profesional. Empecemos con un tour rápido por las funciones principales.',
    icon: MessageSquare,
    highlight: '#chat-input-area',
  },
  {
    id: 'chat-input',
    title: 'Input de Chat',
    description:
      'Escribí tu consulta o problema técnico aquí. El orquestador analizará tu pedido y delegará a los sub-agentes apropiados.',
    icon: Terminal,
    highlight: '#chat-input-area',
  },
  {
    id: 'slash-commands',
    title: 'Comandos Slash',
    description:
      'Escribí "/" para ver comandos disponibles: SDD, MCP, Skills, y más. Son atajos para flujos de trabajo predefinidos.',
    icon: Terminal,
    highlight: '#chat-input-area',
  },
  {
    id: 'command-palette',
    title: 'Command Palette',
    description:
      'Presioná Ctrl+K para abrir la paleta de comandos. Buscá sesiones, navegá entre vistas, y ejecutá acciones rápidamente.',
    icon: Command,
    highlight: '#command-palette-trigger',
  },
  {
    id: 'session-history',
    title: 'Historial de Sesiones',
    description:
      'Accedé a todas tus conversaciones pasadas desde el botón "Sesiones" en el header. Podés buscar, reanudar o eliminar sesiones.',
    icon: History,
    highlight: '#session-history-btn',
  },
  {
    id: 'swarm-control',
    title: 'Swarm Control',
    description:
      'Monitoreá todos los sub-agentes en tiempo real. Ve trazas, uso de tokens, y estado de cada sesión activa.',
    icon: Cpu,
    highlight: null,
  },
];

export default function OnboardingTour({ isActive, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const overlayRef = useRef(null);

  const step = steps[currentStep];
  const Icon = step?.icon || MessageSquare;
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleComplete = useCallback(() => {
    setIsExiting(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    setTimeout(() => {
      setIsExiting(false);
      setCurrentStep(0);
      onComplete?.();
    }, 300);
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, handleComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        handleNext();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      }
      if (e.key === 'Escape') {
        handleSkip();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isActive, handleNext, handleBack, handleSkip]);

  if (!isActive) return null;

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isExiting ? 'opacity-0' : 'opacity-100'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSkip();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Tour de bienvenida"
    >
      <div
        className={`w-full max-w-md mx-3 sm:mx-4 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
        style={{
          background: 'var(--surface-muted)',
          border: '1px solid var(--border-strong)',
        }}
      >
        {/* Progress bar */}
        <div className="h-1" style={{ background: 'var(--surface-hover)' }}>
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: 'var(--accent-primary)',
            }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <span
              className="text-[10px] font-mono uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Paso {currentStep + 1} de {steps.length}
            </span>
          </div>
          <button
            onClick={handleSkip}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.background = 'var(--surface-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
            aria-label="Saltar tour"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Saltar</span>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            {step.title}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {step.description}
          </p>

          {/* Step indicators */}
          <div className="flex items-center gap-1.5 mt-4">
            {steps.map((_, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === currentStep ? '24px' : '8px',
                  background:
                    i === currentStep
                      ? 'var(--accent-primary)'
                      : i < currentStep
                        ? 'color-mix(in srgb, var(--accent-primary) 40%, transparent)'
                        : 'var(--surface-hover)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              color: currentStep === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              background: currentStep === 0 ? 'transparent' : 'var(--surface-card)',
              border:
                currentStep === 0 ? '1px solid transparent' : '1px solid var(--border-strong)',
            }}
            aria-label="Paso anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Atrás
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background:
                currentStep === steps.length - 1
                  ? 'var(--success, #22c55e)'
                  : 'var(--accent-primary)',
              color: 'white',
            }}
            aria-label={currentStep === steps.length - 1 ? 'Completar tour' : 'Siguiente paso'}
          >
            {currentStep === steps.length - 1 ? (
              <>
                <Check className="w-3.5 h-3.5" />
                ¡Listo!
              </>
            ) : (
              <>
                Siguiente
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
