'use client';
import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
  Settings, Save, User, Palette, Trash2, Monitor,
  Loader2, AlertTriangle, Check, Sparkles, ArrowLeft, ArrowRight, Rocket
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  getStoredTheme,
  setTheme,
  THEMES,
  THEME_OPTIONS,
} from "@/lib/theme/themes";

const ACCENT_COLORS = ["#58A6FF", "#3FB950", "#F778BA", "#D2A8FF", "#E3B341", "#FF7B72", "#6366f1", "#f97316"];
const ONBOARDING_STORAGE_KEY = "devhub:onboarding:settings-v1";

const ONBOARDING_STEPS = [
  {
    title: "Bienvenido al sistema visual",
    description: "Configura el look and feel completo de DevHub para esta máquina.",
  },
  {
    title: "Elige un tema base",
    description: "Puedes cambiar entre Deep Sea, Nord, Dracula y Light cuando quieras.",
  },
  {
    title: "Termina y guarda",
    description: "Tu selección queda persistida en localStorage para futuros inicios.",
  },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-12 h-6 flex items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#58A6FF]"
      style={{
        background: checked ? "var(--success)" : "color-mix(in srgb, var(--surface-muted) 80%, black)",
        border: "1px solid var(--border-strong)",
        boxShadow: "inset 0 1px 4px rgba(0,0,0,0.2)"
      }}
    >
      <span
        className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 ease-in-out ${checked ? "translate-x-[26px]" : "translate-x-[2px]"}`}
        style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
      />
    </button>
  );
}

function Section({ icon: Icon, title, color, children }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} style={{ color }} />
        <h3 className="font-mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
      </div>
      <div style={{ borderColor: "var(--border-subtle)" }} className="divide-y">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 gap-4">
      <label className="text-sm flex-shrink-0" style={{ color: "var(--text-muted)" }}>{label}</label>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function ThemeOptionCard({ option, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(option.id)}
      className="w-full rounded-lg p-3 text-left transition-all"
      style={{
        border: active ? `1px solid ${option.accent}` : "1px solid var(--border-subtle)",
        background: active ? "var(--surface-elevated)" : "var(--surface-muted)",
        boxShadow: active ? "var(--shadow-soft)" : "none",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{option.label}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{option.description}</p>
        </div>
        <span className="w-3 h-3 rounded-full" style={{ background: option.accent }} />
      </div>
    </button>
  );
}

function OnboardingWizard({ open, step, onPrev, onNext, onClose, onSkip }) {
  if (!open) return null;

  const stepData = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div
        className="w-full max-w-lg rounded-2xl p-6"
        style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-lifted)" }}
      >
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
            <p className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>Onboarding Wizard</p>
          </div>
          <button onClick={onSkip} className="text-xs" style={{ color: "var(--text-muted)" }}>Saltar</button>
        </div>

        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{stepData.title}</h3>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>{stepData.description}</p>

        <div className="flex items-center gap-1.5 mt-6">
          {ONBOARDING_STEPS.map((_, index) => (
            <span
              key={index}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: index === step ? 22 : 10,
                background: index === step ? "var(--accent-primary)" : "var(--border-subtle)",
              }}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={step === 0}
            className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg disabled:opacity-50"
            style={{ border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", background: "var(--surface-muted)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Atrás
          </button>

          <button
            type="button"
            onClick={isLast ? onClose : onNext}
            className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
            style={{ background: "var(--accent-primary)", color: "white" }}
          >
            {isLast ? <Rocket className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            {isLast ? "Terminar" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Ajustes() {
  const { project } = useOutletContext() || {};
  const supabase = createClient();
  const navigate = useNavigate();

  // Project settings
  const [name, setName]           = useState(project?.name || "");
  const [description, setDesc]    = useState(project?.description || "");
  const [color, setColor]         = useState(project?.color || "#6366f1");
  const [status, setProjectStatus]= useState(project?.status || "active");
  const [localPath, setLocalPath] = useState(project?.local_path || "");
  const [savingProject, setSaving]= useState(false);

  // Profile settings
  const [profile, setProfile]     = useState(null);
  const [fullName, setFullName]   = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // App settings (local state only for now)
  const [appConfig, setAppConfig] = useState({ autosave: true, notifications: true, confirmActions: true });

  // Theme + onboarding
  const [activeTheme, setActiveTheme] = useState(THEMES.DEEP_SEA);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting]   = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
      setFullName(data?.full_name || user.email?.split("@")[0] || "");
    });
  }, []);

  useEffect(() => {
    const storedTheme = getStoredTheme();
    setActiveTheme(storedTheme);
    setTheme(storedTheme);

    const onboardingDone = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
    if (!onboardingDone) {
      setWizardOpen(true);
    }
  }, []);

  const handleThemeChange = useCallback((themeId) => {
    const next = setTheme(themeId);
    setActiveTheme(next);
    toast.success(`Tema aplicado: ${THEME_OPTIONS.find((t) => t.id === next)?.label || next}`);
  }, []);

  const finishOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    setWizardOpen(false);
    setWizardStep(0);
    toast.success("Onboarding completado");
  }, []);

  const skipOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    setWizardOpen(false);
    setWizardStep(0);
  }, []);

  async function saveProject() {
    setSaving(true);
    const { error } = await supabase.from("projects").update({ name, description, color, status, local_path: localPath }).eq("id", project?.id);
    setSaving(false);
    if (error) { toast.error("Error al guardar"); return; }
    toast.success("Proyecto actualizado");
  }

  async function saveProfile() {
    setSavingProfile(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").upsert({ id: user.id, full_name: fullName });
    setSavingProfile(false);
    if (error) { toast.error("Error al guardar perfil"); return; }
    toast.success("Perfil actualizado");
  }

  async function deleteProject() {
    setDeleting(true);
    await supabase.from("tasks").delete().eq("project_id", project?.id);
    await supabase.from("milestones").delete().eq("project_id", project?.id);
    const { error } = await supabase.from("projects").delete().eq("id", project?.id);
    setDeleting(false);
    if (error) { toast.error("Error al eliminar"); return; }
    toast.success("Proyecto eliminado");
    navigate("/hub");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--surface-app)", color: "var(--text-primary)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-6 py-3 flex items-center justify-between"
        style={{ background: "color-mix(in srgb, var(--surface-app) 90%, transparent)", borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-3">
          <Settings className="w-4 h-4" strokeWidth={1.5} style={{ color: "var(--accent-primary)" }} />
          <h1 className="font-mono text-base font-bold" style={{ color: "var(--text-primary)" }}>Ajustes</h1>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Reabrir onboarding
          </button>
        </div>
      </div>

      <div className="px-6 py-5 w-full grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-8 items-start">

        {/* Project settings */}
        <Section icon={Palette} title="Proyecto" color="var(--accent-primary)">
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Nombre del proyecto</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
                style={{ background: "var(--surface-muted)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Ruta Local (Directorio Base)</label>
              <input
                value={localPath}
                onChange={e => setLocalPath(e.target.value)}
                placeholder="/home/usuario/proyectos/mi-app"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
                style={{ background: "var(--surface-muted)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Descripción</label>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDesc(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors resize-none"
                style={{ background: "var(--surface-muted)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-xs mb-2" style={{ color: "var(--text-muted)" }}>Color de acento</label>
              <div className="flex items-center gap-2">
                {ACCENT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full transition-all hover:scale-110 flex items-center justify-center"
                    style={{ background: c, outline: color === c ? `2px solid ${c}` : "none", outlineOffset: "2px" }}
                  >
                    {color === c && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Estado</label>
              <select
                value={status}
                onChange={e => setProjectStatus(e.target.value)}
                className="text-sm rounded-lg px-3 py-2 focus:outline-none appearance-none"
                style={{ background: "var(--surface-muted)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
              >
                <option value="active">Activo</option>
                <option value="paused">Pausado</option>
                <option value="completed">Completado</option>
                <option value="archived">Archivado</option>
              </select>
            </div>
            <button
              onClick={saveProject}
              disabled={savingProject}
              className="flex items-center gap-2 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors disabled:opacity-50"
              style={{ background: "var(--success)" }}
            >
              {savingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar cambios
            </button>
          </div>
        </Section>

        <Section icon={Palette} title="Sistema de Temas" color="var(--accent-primary)">
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Selecciona el tema global de la app. El fondo, bordes y sombras se actualizan al instante.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {THEME_OPTIONS.map((option) => (
                <ThemeOptionCard
                  key={option.id}
                  option={option}
                  active={activeTheme === option.id}
                  onClick={handleThemeChange}
                />
              ))}
            </div>
          </div>
        </Section>

        {/* Profile settings */}
        <Section icon={User} title="Perfil de Usuario" color="#D2A8FF">
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Nombre completo</label>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
                style={{ background: "var(--surface-muted)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
              />
            </div>
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="flex items-center gap-2 font-medium px-4 py-2 rounded-lg text-xs transition-all disabled:opacity-50"
              style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)" }}
            >
              {savingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar perfil
            </button>
          </div>
        </Section>

        {/* App config */}
        <Section icon={Monitor} title="Preferencias" color="#E3B341">
          <Row label="Guardar automáticamente">
            <Toggle checked={appConfig.autosave} onChange={v => setAppConfig(p => ({ ...p, autosave: v }))} />
          </Row>
          <Row label="Notificaciones">
            <Toggle checked={appConfig.notifications} onChange={v => setAppConfig(p => ({ ...p, notifications: v }))} />
          </Row>
          <Row label="Confirmar acciones destructivas">
            <Toggle checked={appConfig.confirmActions} onChange={v => setAppConfig(p => ({ ...p, confirmActions: v }))} />
          </Row>
        </Section>

        {/* Danger zone */}
        <Section icon={AlertTriangle} title="Zona de Peligro" color="#F778BA">
          <div className="px-5 py-4">
            {!deleteConfirm ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Eliminar proyecto</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Esta acción eliminará el proyecto, todas sus tareas e hitos de forma permanente.</p>
                </div>
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ml-4 flex-shrink-0"
                  style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", color: "var(--danger)" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium flex items-center gap-2" style={{ color: "var(--danger)" }}>
                  <AlertTriangle className="w-4 h-4" />
                  ¿Estás seguro? Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="flex-1 py-2 rounded-lg text-sm transition-all"
                    style={{ border: "1px solid var(--border-strong)", color: "var(--text-muted)", background: "var(--surface-muted)" }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={deleteProject}
                    disabled={deleting}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                    style={{ background: "color-mix(in srgb, var(--danger) 16%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 42%, transparent)", color: "var(--danger)" }}
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Sí, eliminar proyecto
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>

      <OnboardingWizard
        open={wizardOpen}
        step={wizardStep}
        onPrev={() => setWizardStep((s) => Math.max(0, s - 1))}
        onNext={() => setWizardStep((s) => Math.min(ONBOARDING_STEPS.length - 1, s + 1))}
        onClose={finishOnboarding}
        onSkip={skipOnboarding}
      />
    </div>
  );
}
