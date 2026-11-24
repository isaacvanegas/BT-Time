import { Bell, BellRing, CheckCircle2, Globe, Info, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import type { ReminderRule, ReminderSettings } from '../../shared/types';
import { getBrowserTimeZone } from '../lib/timeFormat';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: ReminderSettings;
  onChange: (next: ReminderSettings) => void;
  onTestReminder: (kind: 'checkin' | 'submit') => void;
}

const DAYS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: 'L' },
  { iso: 2, label: 'M' },
  { iso: 3, label: 'X' },
  { iso: 4, label: 'J' },
  { iso: 5, label: 'V' },
  { iso: 6, label: 'S' },
  { iso: 7, label: 'D' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onChange,
  onTestReminder,
}) => {
  const timeZone = getBrowserTimeZone();
  const [permissionState, setPermissionState] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      setPermissionState('unsupported');
      return;
    }
    const result = await Notification.requestPermission();
    setPermissionState(result);
    if (result === 'granted') {
      onChange({ ...settings, browserNotificationsEnabled: true });
    }
  };

  const updateRule = (key: 'checkInReminder' | 'submitReminder', patch: Partial<ReminderRule>) => {
    onChange({
      ...settings,
      [key]: {
        ...settings[key],
        ...patch,
      },
    });
  };

  const toggleDay = (key: 'checkInReminder' | 'submitReminder', isoDay: number) => {
    const current = settings[key].days;
    const nextDays = current.includes(isoDay)
      ? current.filter((d) => d !== isoDay)
      : [...current, isoDay].sort((a, b) => a - b);
    updateRule(key, { days: nextDays });
  };

  const renderRuleCard = (
    key: 'checkInReminder' | 'submitReminder',
    title: string,
    description: string,
    testKind: 'checkin' | 'submit'
  ) => {
    const rule = settings[key];
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => updateRule(key, { enabled: e.target.checked })}
              className="h-5 w-5 rounded border-slate-300 text-[#1565C0]"
            />
            <span className="text-xs font-medium text-slate-700">Activo</span>
          </label>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Hora ({timeZone})
            </label>
            <input
              type="time"
              value={rule.time}
              onChange={(e) => updateRule(key, { time: e.target.value })}
              className="mt-1.5 min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm text-slate-900 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700 mb-1.5">Días activos</p>
            <div className="flex items-center gap-1.5">
              {DAYS.map((d) => {
                const active = rule.days.includes(d.iso);
                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => toggleDay(key, d.iso)}
                    aria-pressed={active}
                    className={`min-h-[38px] min-w-[38px] rounded-lg text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-[#1565C0] text-white'
                        : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onTestReminder(testKind)}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <BellRing className="h-3.5 w-3.5 text-[#1565C0]" aria-hidden="true" />
            <span>Probar alerta</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 sm:text-lg">
              Recordatorios de Jornada y Horas
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Al tocar una notificación se abre la pantalla correspondiente; nunca ejecuta acciones automáticas.
            </p>
          </div>
          <PWAInstallButton compact />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0]" aria-hidden="true" />
            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">
                Notificaciones del navegador ({permissionState === 'granted' ? 'Permitidas' : permissionState === 'denied' ? 'Bloqueadas' : permissionState === 'unsupported' ? 'No soportadas' : 'Pendientes de permiso'})
              </p>
              <p>
                Los recordatorios en primer plano funcionan con la aplicación abierta. Para recibir alertas con la pestaña cerrada se requiere Service Worker con suscripción Web Push (VAPID) y un worker persistente en un plan de Render que no entre en reposo.
              </p>
            </div>
          </div>

          {permissionState !== 'granted' && permissionState !== 'unsupported' && (
            <button
              type="button"
              onClick={() => void requestNotificationPermission()}
              className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-[#1565C0] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0D47A1] whitespace-nowrap shrink-0"
            >
              Activar Permiso
            </button>
          )}
          {permissionState === 'granted' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Habilitadas</span>
            </span>
          )}
        </div>

        <div className="space-y-4">
          {renderRuleCard(
            'checkInReminder',
            'Recordatorio de Check In e inicio de cronómetro',
            'Te avisa para entrar en línea e iniciar tu primera tarea del día.',
            'checkin'
          )}
          {renderRuleCard(
            'submitReminder',
            'Recordatorio de revisión y envío de hoja de horas',
            'Te lleva a Hoja de Horas para ajustar tiempos reales y presionar Enviar.',
            'submit'
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-3">
        <h3 className="font-display text-sm font-bold text-slate-900">
          Información de Sesión y Seguridad
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs text-slate-600">
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1565C0]" aria-hidden="true" />
            <div>
              <p className="font-semibold text-slate-800">Sesión aislada en el servidor</p>
              <p className="mt-0.5">
                Las cookies del API BT-Time nunca llegan al navegador. Si el servidor se reinicia sin disco persistente, deberás iniciar sesión nuevamente.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[#1565C0]" aria-hidden="true" />
            <div>
              <p className="font-semibold text-slate-800">Zona horaria IANA activa</p>
              <p className="mt-0.5 font-mono text-slate-800">{timeZone}</p>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 pt-1 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Las configuraciones de recordatorios se guardan localmente en este dispositivo.</span>
        </div>
      </section>
    </div>
  );
};
