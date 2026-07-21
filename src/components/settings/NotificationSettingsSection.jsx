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
import { playNotificationSound, previewSoundPreset } from '@/lib/notifications/soundEffects';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="space-y-6 text-sm">
      {/* Quiet Hours Banner */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-borders-subtle bg-gray-900/40">
        <div className="flex items-center gap-3">
          {prefs.quietHours ? (
            <BellOff className="w-6 h-6 text-amber-400 shrink-0" />
          ) : (
            <Bell className="w-6 h-6 text-blue-400 shrink-0" />
          )}
          <div>
            <h4 className="font-semibold text-gray-100">Modo No Molestar (Quiet Hours)</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Silencia Toasts emergentes y alertas auditivas sin perder el registro de notificaciones.
            </p>
          </div>
        </div>
        <input
          type="checkbox"
          checked={prefs.quietHours}
          onChange={() => handleToggle('quietHours')}
          className="w-5 h-5 accent-blue-500 rounded cursor-pointer"
        />
      </div>

      {/* Channels Config */}
      <div className="p-4 rounded-xl border border-borders-subtle bg-gray-900/30 space-y-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <h4 className="font-semibold text-gray-200">Canales de Notificación</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center justify-between p-3 rounded-lg border border-borders-subtle bg-gray-900/50">
            <div className="flex items-center gap-2.5">
              <Monitor className="w-4 h-4 text-gray-400" />
              <div>
                <p className="font-medium text-xs text-gray-200">Toasts In-App</p>
                <p className="text-[10px] text-gray-500">Alertas flotantes</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.enableToasts}
              onChange={() => handleToggle('enableToasts')}
              className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-borders-subtle bg-gray-900/50">
            <div className="flex items-center gap-2.5">
              {prefs.enableSound ? <Volume2 className="w-4 h-4 text-gray-400" /> : <VolumeX className="w-4 h-4 text-gray-500" />}
              <div>
                <p className="font-medium text-xs text-gray-200">Sonido Sintético</p>
                <p className="text-[10px] text-gray-500">Web Audio API / MP3</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.enableSound}
              onChange={() => handleToggle('enableSound')}
              className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-borders-subtle bg-gray-900/50">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-gray-400" />
              <div>
                <p className="font-medium text-xs text-gray-200">SO Nativo</p>
                <p className="text-[10px] text-gray-500">Electron / Tauri</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.enableNativeOS}
              onChange={() => handleToggle('enableNativeOS')}
              className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Sound Customization Section */}
      {prefs.enableSound && (
        <div className="p-4 rounded-xl border border-borders-subtle bg-gray-900/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-purple-400" />
              <h4 className="font-semibold text-gray-200">Personalización de Sonidos y Tonos</h4>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">Volumen General: {Math.round((prefs.soundVolume ?? 0.5) * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={prefs.soundVolume ?? 0.5}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {[
              { id: 'info', name: 'Informativa (Info)', icon: Info, iconColor: 'text-blue-400' },
              { id: 'warning', name: 'Advertencia (Warning / Stalled)', icon: AlertTriangle, iconColor: 'text-amber-400' },
              { id: 'critical', name: 'Fallo Crítico (Critical)', icon: AlertCircle, iconColor: 'text-rose-400' },
              { id: 'success', name: 'Éxito (Success / Completed)', icon: CheckCircle2, iconColor: 'text-emerald-400' },
            ].map(({ id, name, icon: Icon, iconColor }) => {
              const currentConfig = prefs.soundPresets?.[id] || { preset: 'chime', customUrl: '' };

              return (
                <div key={id} className="p-3 rounded-lg border border-borders-subtle bg-gray-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                      <span className="font-medium text-xs text-gray-200">{name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={currentConfig.preset}
                        onChange={(e) => handlePresetChange(id, e.target.value)}
                        className="bg-gray-950 border border-borders-subtle text-gray-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-purple-500"
                      >
                        {Object.entries(SOUND_PRESETS).map(([key, item]) => (
                          <option key={key} value={key}>
                            {item.label}
                          </option>
                        ))}
                      </select>

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          previewSoundPreset(currentConfig.preset, currentConfig.customUrl, prefs.soundVolume ?? 0.5)
                        }
                        className="text-[11px] h-7 px-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200"
                        title="Escuchar vista previa"
                      >
                        <Play className="w-3 h-3 mr-1 text-purple-400 fill-purple-400" />
                        Escuchar
                      </Button>
                    </div>
                  </div>

                  {currentConfig.preset === 'custom' && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={currentConfig.customUrl || ''}
                        onChange={(e) => handleCustomUrlChange(id, e.target.value)}
                        placeholder="Ruta local, URL mp3/wav o Data URI..."
                        className="flex-1 bg-gray-950 border border-borders-subtle text-gray-300 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-purple-500 font-mono"
                      />
                      <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded border border-borders-subtle flex items-center gap-1.5 transition-colors">
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Subir Audio</span>
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
      <div className="p-4 rounded-xl border border-borders-subtle bg-gray-900/30 space-y-3">
        <h4 className="font-semibold text-gray-200">Filtro de Severidad Mínima</h4>
        <p className="text-xs text-gray-400">
          Determina el nivel mínimo de importancia que activará avisos sonoros y emergentes.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'info', label: 'Informativa (Todas)' },
            { id: 'warning', label: 'Advertencias & Errores' },
            { id: 'critical', label: 'Solo Críticas' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => handleSeverityChange(item.id)}
              className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                prefs.minSeverity === item.id
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-semibold'
                  : 'border-borders-subtle bg-gray-900/40 text-gray-400 hover:text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Test Bench */}
      <div className="p-4 rounded-xl border border-borders-subtle bg-gray-900/30 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            <h4 className="font-semibold text-gray-200">Probador en Vivo (Live Test Bench)</h4>
          </div>
          <span className="text-xs text-gray-400 font-mono">
            {eventsCount} evento(s) en almacén
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Button
            onClick={() => triggerTestNotification('stalled')}
            variant="outline"
            size="sm"
            className="text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Probar Warning
          </Button>

          <Button
            onClick={() => triggerTestNotification('critical')}
            variant="outline"
            size="sm"
            className="text-xs border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
          >
            <AlertCircle className="w-3.5 h-3.5 mr-1" />
            Probar Critical
          </Button>

          <Button
            onClick={() => triggerTestNotification('completed')}
            variant="outline"
            size="sm"
            className="text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Probar Success
          </Button>

          <Button
            onClick={() => triggerTestNotification('native')}
            variant="outline"
            size="sm"
            className="text-xs border-blue-500/40 text-blue-300 hover:bg-blue-500/10"
          >
            <ShieldAlert className="w-3.5 h-3.5 mr-1" />
            Probar Nativa SO
          </Button>
        </div>

        {testLog && (
          <div className="p-2.5 rounded bg-gray-950 border border-gray-800 text-[11px] font-mono text-gray-300 flex items-center justify-between">
            <span>{testLog}</span>
          </div>
        )}

        <div className="pt-2 border-t border-borders-subtle flex justify-end">
          <Button
            onClick={handleClearHistory}
            variant="destructive"
            size="sm"
            className="text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Limpiar Historial de Alertas
          </Button>
        </div>
      </div>
    </div>
  );
}
