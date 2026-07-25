'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  FolderOpen,
  Info,
  Monitor,
  Music,
  Play,
  ShieldAlert,
  Sliders,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  SOUND_PRESETS,
} from '@/lib/notifications/notificationPreferences';
import { clearOperationalEvents, readOperationalEvents } from '@/lib/operations/events';
import { dispatchOperationalNotification } from '@/lib/operations/notify';
import { previewSoundPreset } from '@/lib/notifications/soundEffects';
import {
  panelStyle,
  btnSecondaryStyle,
  btnDangerStyle,
  pillStyle,
  inputStyle,
  selectStyle,
  codeBlockStyle,
} from '@/chrome/morphology';

/* ─── Shared toggle switch (same pattern as TerminalSettingsSection) ─────── */

function ToggleSwitch({ checked, onChange, testId, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={onChange}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
      style={{ background: checked ? 'var(--accent-primary)' : 'var(--surface-muted)' }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

/* ─── Main section ───────────────────────────────────────────────────────── */

export default function NotificationSettingsSection() {
  const [prefs, setPrefs] = useState(() => getNotificationPreferences());
  const [eventsCount, setEventsCount] = useState(() => readOperationalEvents().length);
  const [testLog, setTestLog] = useState('');

  const handleToggle = (key) => {
    const updated = saveNotificationPreferences({ [key]: !prefs[key] });
    setPrefs(updated);
  };

  const handleSeverityChange = (minSeverity) => {
    const updated = saveNotificationPreferences({ minSeverity });
    setPrefs(updated);
  };

  const handleVolumeChange = (volume) => {
    const updated = saveNotificationPreferences({ soundVolume: volume });
    setPrefs(updated);
  };

  const handlePresetChange = (severity, presetName) => {
    const updatedPresets = {
      ...prefs.soundPresets,
      [severity]: {
        ...prefs.soundPresets[severity],
        preset: presetName,
      },
    };
    const updated = saveNotificationPreferences({ soundPresets: updatedPresets });
    setPrefs(updated);
  };

  const handleCustomUrlChange = (severity, customUrl) => {
    const updatedPresets = {
      ...prefs.soundPresets,
      [severity]: {
        ...prefs.soundPresets[severity],
        customUrl,
      },
    };
    const updated = saveNotificationPreferences({ soundPresets: updatedPresets });
    setPrefs(updated);
  };

  const handleFileUpload = (severity, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        handlePresetChange(severity, 'custom');
        handleCustomUrlChange(severity, String(dataUrl));
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerTestNotification = async (type) => {
    let payload = {};

    if (type === 'stalled') {
      payload = {
        title: 'Prueba: Agente Sin Respuesta',
        body: 'El agente agent-01 (Swarm) no ha enviado latidos en >30s.',
        category: 'agents',
        severity: 'warning',
        source: 'presence',
        entity_id: 'agent-01',
        dedupe_key: `test:stalled:${Date.now()}`,
        actions: [{ label: 'Ver Traza', action_type: 'navigate', target: '/control-room' }],
      };
    } else if (type === 'critical') {
      payload = {
        title: 'Prueba: Fallo Crítico de Agente',
        body: 'Proceso de agente interrumpido inesperadamente con código exit 1.',
        category: 'agents',
        severity: 'critical',
        source: 'presence',
        entity_id: 'agent-02',
        dedupe_key: `test:critical:${Date.now()}`,
        actions: [{ label: 'Inspeccionar Logs', action_type: 'navigate', target: '/control-room' }],
      };
    } else if (type === 'completed') {
      payload = {
        title: 'Prueba: Tarea Completada',
        body: 'El agente ha finalizado exitosamente la compilación.',
        category: 'agents',
        severity: 'success',
        source: 'presence',
        entity_id: 'agent-03',
        dedupe_key: `test:completed:${Date.now()}`,
      };
    } else if (type === 'native') {
      payload = {
        title: 'Prueba: Notificación Nativa de SO',
        body: 'Esta es una prueba de notificación enviada a través de Electron/Tauri OS API.',
        category: 'system',
        severity: 'info',
        source: 'system',
        dedupe_key: `test:native:${Date.now()}`,
        delivery: { desktop: true, in_app: true },
      };
    }

    const result = await dispatchOperationalNotification(payload);
    setEventsCount(readOperationalEvents().length);

    setTestLog(
      `[${new Date().toLocaleTimeString()}] Notificación de prueba disparada (${payload.severity.toUpperCase()}). Entrega: Desktop=${result.desktop.status}, InApp=${result.in_app.status}`
    );
  };

  const handleClearHistory = () => {
    clearOperationalEvents();
    setEventsCount(0);
    setTestLog('Historial de notificaciones limpiado exitosamente.');
  };

  const CHANNELS = [
    {
      key: 'enableToasts',
      icon: Monitor,
      label: 'Toasts In-App',
      description: 'Alertas flotantes dentro de la aplicación',
    },
    {
      key: 'enableSound',
      icon: prefs.enableSound ? Volume2 : VolumeX,
      label: 'Sonido Sintético',
      description: 'Web Audio API / MP3 personalizado',
    },
    {
      key: 'enableNativeOS',
      icon: ShieldAlert,
      label: 'SO Nativo',
      description: 'Notificaciones de Electron / Tauri',
    },
  ];

  const SEVERITY_ROWS = [
    { id: 'info', name: 'Informativa (Info)', icon: Info, tone: 'accent' },
    { id: 'warning', name: 'Advertencia (Stalled)', icon: AlertTriangle, tone: 'warning' },
    { id: 'critical', name: 'Fallo Crítico (Critical)', icon: AlertCircle, tone: 'danger' },
    { id: 'success', name: 'Éxito (Completed)', icon: CheckCircle2, tone: 'success' },
  ];

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div>
        <h4 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Notificaciones del workspace
        </h4>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Controla cómo se entregan las alertas operativas: toasts in-app, sonido sintético y
          notificaciones nativas del sistema operativo. Los cambios se guardan al instante.
        </p>
      </div>

      {/* Quiet Hours */}
      <div
        className="flex items-center justify-between gap-4 p-4"
        style={panelStyle({ emphasized: false })}
      >
        <div className="flex items-center gap-3">
          {prefs.quietHours ? (
            <BellOff className="w-5 h-5 shrink-0" style={{ color: 'var(--warning, #e3b341)' }} />
          ) : (
            <Bell className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
          )}
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Modo No Molestar (Quiet Hours)
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Silencia toasts emergentes y alertas auditivas sin perder el registro de
              notificaciones.
            </p>
          </div>
        </div>
        <ToggleSwitch
          checked={prefs.quietHours}
          onChange={() => handleToggle('quietHours')}
          testId="notification-quiet-hours-toggle"
          label="Modo No Molestar"
        />
      </div>

      {/* Channels */}
      <div style={panelStyle({ emphasized: false })}>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)' }}
        >
          <Sliders className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          <h4 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Canales de Notificación
          </h4>
        </div>
        <div>
          {CHANNELS.map(({ key, icon: Icon, label, description }, idx) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 px-4 py-3"
              style={
                idx > 0
                  ? { borderTop: 'var(--chrome-border-width) solid var(--chrome-border-color)' }
                  : undefined
              }
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {label}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {description}
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={prefs[key]}
                onChange={() => handleToggle(key)}
                testId={`notification-channel-toggle-${key}`}
                label={label}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Sound Customization */}
      {prefs.enableSound && (
        <div style={panelStyle({ emphasized: false })}>
          <div
            className="flex items-center justify-between gap-4 px-4 py-3"
            style={{ borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)' }}
          >
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              <h4
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Personalización de Sonidos
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                Volumen: {Math.round((prefs.soundVolume ?? 0.5) * 100)}%
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={prefs.soundVolume ?? 0.5}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                aria-label="Volumen general"
                className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
                style={{ background: 'var(--surface-muted)', accentColor: 'var(--accent-primary)' }}
              />
            </div>
          </div>

          <div className="space-y-3 p-4">
            {SEVERITY_ROWS.map(({ id, name, icon: Icon, tone }) => {
              const currentConfig = prefs.soundPresets?.[id] || { preset: 'chime', customUrl: '' };

              return (
                <div key={id} className="p-3 space-y-2" style={panelStyle({ emphasized: true })}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex items-center justify-center w-7 h-7"
                        style={pillStyle({ tone })}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span
                        className="text-xs font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={currentConfig.preset}
                        onChange={(e) => handlePresetChange(id, e.target.value)}
                        aria-label={`Sonido para ${name}`}
                        className="text-xs"
                        style={selectStyle()}
                      >
                        {Object.entries(SOUND_PRESETS).map(([key, item]) => (
                          <option key={key} value={key}>
                            {item.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          previewSoundPreset(
                            currentConfig.preset,
                            currentConfig.customUrl,
                            prefs.soundVolume ?? 0.5
                          )
                        }
                        style={btnSecondaryStyle({ size: 'xs' })}
                        title="Escuchar vista previa"
                      >
                        <Play className="w-3 h-3" />
                        Escuchar
                      </button>
                    </div>
                  </div>

                  {currentConfig.preset === 'custom' && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={currentConfig.customUrl || ''}
                        onChange={(e) => handleCustomUrlChange(id, e.target.value)}
                        placeholder="Ruta local, URL mp3/wav o Data URI…"
                        className="flex-1 font-mono text-xs"
                        style={inputStyle()}
                      />
                      <label
                        className="cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                        style={btnSecondaryStyle({ size: 'xs' })}
                      >
                        <FolderOpen className="w-3 h-3" />
                        Subir Audio
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => handleFileUpload(id, e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Severity Filter */}
      <div style={panelStyle({ emphasized: false })}>
        <div className="px-4 pt-4 pb-2">
          <h4 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Filtro de Severidad Mínima
          </h4>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Determina el nivel mínimo de importancia que activará avisos sonoros y emergentes.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4 pt-2">
          {[
            { id: 'info', label: 'Informativa (Todas)' },
            { id: 'warning', label: 'Advertencias & Errores' },
            { id: 'critical', label: 'Solo Críticas' },
          ].map((item) => {
            const isActive = prefs.minSeverity === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSeverityChange(item.id)}
                className="py-2 px-3 text-xs font-medium transition-colors duration-100"
                style={{
                  ...panelStyle({ emphasized: isActive, tone: isActive ? 'accent' : 'neutral' }),
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Test Bench */}
      <div style={panelStyle({ emphasized: false })}>
        <div
          className="flex items-center justify-between gap-4 px-4 py-3"
          style={{ borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)' }}
        >
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4" style={{ color: 'var(--success)' }} />
            <h4
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Probador en Vivo
            </h4>
          </div>
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {eventsCount} evento(s) en almacén
          </span>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { type: 'stalled', label: 'Probar Warning', icon: AlertTriangle, tone: 'warning' },
              { type: 'critical', label: 'Probar Critical', icon: AlertCircle, tone: 'danger' },
              { type: 'completed', label: 'Probar Success', icon: CheckCircle2, tone: 'success' },
              { type: 'native', label: 'Probar Nativa SO', icon: ShieldAlert, tone: 'accent' },
            ].map(({ type, label, icon: Icon, tone }) => (
              <button
                key={type}
                type="button"
                onClick={() => triggerTestNotification(type)}
                className="transition-colors duration-100"
                style={{
                  ...btnSecondaryStyle({ size: 'sm' }),
                  borderColor: `color-mix(in srgb, ${
                    tone === 'warning'
                      ? 'var(--warning, #e3b341)'
                      : tone === 'danger'
                        ? 'var(--danger)'
                        : tone === 'success'
                          ? 'var(--success)'
                          : 'var(--accent-primary)'
                  } 40%, var(--chrome-border-color))`,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {testLog && (
            <div className="text-[11px]" style={codeBlockStyle()}>
              <span style={{ color: 'var(--text-secondary)' }}>{testLog}</span>
            </div>
          )}

          <div
            className="flex justify-end pt-1"
            style={{ borderTop: 'var(--chrome-border-width) solid var(--chrome-border-color)' }}
          >
            <button
              type="button"
              onClick={handleClearHistory}
              className="mt-3 transition-colors duration-100"
              style={btnDangerStyle({ size: 'sm' })}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar Historial de Alertas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
