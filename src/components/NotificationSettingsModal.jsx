'use client';

import { useState } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Monitor, Sliders, X, ShieldAlert, Play, Music } from 'lucide-react';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  SOUND_PRESETS,
} from '@/lib/notifications/notificationPreferences';
import { previewSoundPreset } from '@/lib/notifications/soundEffects';
import { Button } from '@/components/ui/button';

export default function NotificationSettingsModal({ isOpen, onClose }) {
  const [prefs, setPrefs] = useState(() => getNotificationPreferences());

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0D1117] border border-borders-default rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-borders-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#58A6FF]" />
            <h3 className="font-semibold text-sm text-gray-100">Ajustes de Notificaciones</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 p-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Body */}
        <div className="p-4 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Quiet Hours */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-borders-subtle bg-gray-900/50">
            <div className="flex items-center gap-3">
              {prefs.quietHours ? (
                <BellOff className="w-5 h-5 text-amber-400 shrink-0" />
              ) : (
                <Bell className="w-5 h-5 text-blue-400 shrink-0" />
              )}
              <div>
                <p className="font-medium text-gray-200">Modo No Molestar (Quiet Hours)</p>
                <p className="text-[11px] text-gray-400">Silenciar avisos emergentes y sonidos</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.quietHours}
              onChange={() => handleToggle('quietHours')}
              className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
            />
          </div>

          {/* Channels */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Canales de Entrega</label>

            <div className="flex items-center justify-between p-2.5 rounded-lg border border-borders-subtle bg-gray-900/30">
              <div className="flex items-center gap-2.5">
                <Monitor className="w-4 h-4 text-gray-400" />
                <span className="text-gray-200">Toasts Flotantes In-App</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.enableToasts}
                onChange={() => handleToggle('enableToasts')}
                className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg border border-borders-subtle bg-gray-900/30">
              <div className="flex items-center gap-2.5">
                {prefs.enableSound ? <Volume2 className="w-4 h-4 text-gray-400" /> : <VolumeX className="w-4 h-4 text-gray-500" />}
                <span className="text-gray-200">Efectos Sonoros Sintéticos</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.enableSound}
                onChange={() => handleToggle('enableSound')}
                className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg border border-borders-subtle bg-gray-900/30">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-gray-400" />
                <span className="text-gray-200">Notificaciones Nativas del SO (Tauri/OS)</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.enableNativeOS}
                onChange={() => handleToggle('enableNativeOS')}
                className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Sound Preset Selector */}
          {prefs.enableSound && (
            <div className="space-y-2.5 p-3 rounded-lg border border-borders-subtle bg-gray-900/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-gray-200">Personalización de Tonos</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono">{Math.round((prefs.soundVolume ?? 0.5) * 100)}%</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={prefs.soundVolume ?? 0.5}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-16 h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {[
                  { id: 'info', name: 'Info' },
                  { id: 'warning', name: 'Warning' },
                  { id: 'critical', name: 'Critical' },
                  { id: 'success', name: 'Success' },
                ].map(({ id, name }) => {
                  const currentConfig = prefs.soundPresets?.[id] || { preset: 'chime' };

                  return (
                    <div key={id} className="flex items-center justify-between gap-2 p-2 rounded bg-gray-950/60 border border-borders-subtle">
                      <span className="text-[11px] font-medium text-gray-300 w-16">{name}</span>
                      <select
                        value={currentConfig.preset}
                        onChange={(e) => handlePresetChange(id, e.target.value)}
                        className="bg-gray-900 border border-borders-subtle text-gray-200 text-[11px] rounded px-2 py-0.5 focus:outline-none flex-1"
                      >
                        {Object.entries(SOUND_PRESETS).map(([key, item]) => (
                          <option key={key} value={key}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => previewSoundPreset(currentConfig.preset, currentConfig.customUrl, prefs.soundVolume ?? 0.5)}
                        className="p-1 text-purple-400 hover:text-purple-300 hover:bg-gray-800 rounded transition-colors"
                        title="Escuchar"
                      >
                        <Play className="w-3.5 h-3.5 fill-purple-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Severity Filter */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Severidad Mínima</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'info', label: 'Info (Todas)' },
                { id: 'warning', label: 'Warning' },
                { id: 'critical', label: 'Solo Críticas' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSeverityChange(item.id)}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border transition-colors ${
                    prefs.minSeverity === item.id
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-semibold'
                      : 'border-borders-subtle bg-gray-900/20 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-borders-subtle bg-gray-900/40 flex justify-end">
          <Button onClick={onClose} variant="secondary" size="sm">
            Guardar y Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
