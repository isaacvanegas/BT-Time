import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { TimesheetEntry } from '../../shared/types';
import { api, ApiError } from '../lib/apiClient';
import {
  canSubmitTimesheet,
  formatSecondsHM,
  getTimesheetSyncBadge,
  isTimesheetEntryEnded,
  parseHHMMToSeconds,
} from '../lib/timeFormat';
import type { CompleteTarget } from './CompleteTaskModal';

interface TimesheetViewProps {
  entries: TimesheetEntry[];
  expiredEntries: TimesheetEntry[];
  activeTaskCount: number;
  loading: boolean;
  initialSubTab?: 'current' | 'expired';
  onRefreshAll: () => Promise<void>;
  onOpenComplete: (target: CompleteTarget) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

export const TimesheetView: React.FC<TimesheetViewProps> = ({
  entries,
  expiredEntries,
  activeTaskCount,
  loading,
  initialSubTab = 'current',
  onRefreshAll,
  onOpenComplete,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'current' | 'expired'>(initialSubTab);
  const [realInputs, setRealInputs] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [submittingAll, setSubmittingAll] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [uncertainSubmit, setUncertainSubmit] = useState(false);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of [...entries, ...expiredEntries]) {
      const id = String(item.id || item.timesheetId || '');
      if (!id) continue;
      const secs =
        item.timeRealInSeconds ??
        item.realTimeSeconds ??
        item.durationTimeTaskSeconds ??
        item.logTimeTaskSeconds ??
        0;
      next[id] = formatSecondsHM(secs);
    }
    setRealInputs(next);
    setFieldErrors({});
  }, [entries, expiredEntries]);

  const submitGate = useMemo(
    () => canSubmitTimesheet(entries, activeTaskCount),
    [entries, activeTaskCount]
  );

  const groupedExpired = useMemo(() => {
    const groups = new Map<string, TimesheetEntry[]>();
    for (const entry of expiredEntries) {
      const rawDate = String(entry.createdDate || entry.date || entry.startDate || 'Sin fecha');
      const dateKey = rawDate.slice(0, 10) || 'Sin fecha';
      const list = groups.get(dateKey) || [];
      list.push(entry);
      groups.set(dateKey, list);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [expiredEntries]);

  const handleRealChange = (entryId: string, val: string) => {
    setRealInputs((prev) => ({ ...prev, [entryId]: val }));
    const parsed = parseHHMMToSeconds(val);
    setFieldErrors((prev) => {
      const copy = { ...prev };
      if (parsed.valid) {
        delete copy[entryId];
      } else {
        copy[entryId] = parsed.error || 'Formato inválido';
      }
      return copy;
    });
  };

  const handleSaveEntryTime = async (targetEntry: TimesheetEntry, listSource: TimesheetEntry[]) => {
    const id = String(targetEntry.id || targetEntry.timesheetId || '');
    if (!id || savingId) return;

    const rawVal = realInputs[id] ?? '';
    const parsed = parseHHMMToSeconds(rawVal);
    if (!parsed.valid) {
      setFieldErrors((prev) => ({ ...prev, [id]: parsed.error || 'Formato HH:mm inválido' }));
      return;
    }

    setSavingId(id);
    try {
      // Preserve ALL fields returned by GET /tasks/timesheet; modify only chosen entry's timeRealInSeconds
      const updatedList = listSource.map((item) => {
        const itemId = String(item.id || item.timesheetId || '');
        if (itemId !== id) return item;
        return {
          ...item,
          timeRealInSeconds: parsed.seconds,
        };
      });

      await api.submitTimesheet(updatedList);
      onNotify(`Tiempo real actualizado a ${parsed.normalized}.`, 'success');
      await onRefreshAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo guardar el tiempo real.';
      onNotify(msg, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleSubmitFinalTimesheet = async () => {
    if (submittingAll || !submitGate.allowed) return;

    // Validate all inputs before sending
    const updatedTimesheet: TimesheetEntry[] = [];
    for (const entry of entries) {
      const id = String(entry.id || entry.timesheetId || '');
      const raw = realInputs[id] ?? formatSecondsHM(entry.timeRealInSeconds ?? entry.durationTimeTaskSeconds ?? 0);
      const parsed = parseHHMMToSeconds(raw);
      if (!parsed.valid) {
        setFieldErrors((prev) => ({ ...prev, [id]: parsed.error || 'Formato inválido' }));
        onNotify('Corrige los valores de tiempo Real (HH:mm) antes de enviar.', 'error');
        setConfirmSubmitOpen(false);
        return;
      }
      updatedTimesheet.push({
        ...entry,
        timeRealInSeconds: parsed.seconds,
      });
    }

    setSubmittingAll(true);
    setUncertainSubmit(false);
    try {
      await api.submitTimesheet(updatedTimesheet);
      setConfirmSubmitOpen(false);
      onNotify('Hoja de horas sincronizada y enviada correctamente.', 'success');
      await onRefreshAll();
    } catch (err) {
      if (err instanceof ApiError && err.uncertainOutcome) {
        setUncertainSubmit(true);
        onNotify(err.message, 'error');
        await onRefreshAll();
      } else {
        const msg = err instanceof ApiError ? err.message : 'No se pudo enviar la hoja de horas.';
        onNotify(msg, 'error');
      }
    } finally {
      setSubmittingAll(false);
    }
  };

  const renderEntryRow = (entry: TimesheetEntry, listSource: TimesheetEntry[], isExpiredTab: boolean) => {
    const id = String(entry.id || entry.timesheetId || '');
    const ended = isTimesheetEntryEnded(entry);
    const syncInfo = getTimesheetSyncBadge(entry);
    const autoSecs = entry.durationTimeTaskSeconds ?? entry.logTimeTaskSeconds ?? 0;
    const inputVal = realInputs[id] ?? formatSecondsHM(entry.timeRealInSeconds ?? autoSecs);
    const errText = fieldErrors[id];

    return (
      <tr key={id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-[#1565C0] whitespace-nowrap">
          {entry.key || entry.taskKey || id}
        </td>
        <td className="py-3.5 px-4 text-sm text-slate-900 min-w-[200px]">
          <p className="font-medium">{entry.name || entry.taskName || 'Actividad'}</p>
          {entry.projectName && (
            <p className="text-xs text-slate-500">{entry.projectName}</p>
          )}
        </td>
        <td className="py-3.5 px-4 whitespace-nowrap">
          <div className="flex flex-col gap-0.5">
            <span
              className={`text-xs font-semibold ${
                ended ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {ended ? 'Finalizada (END)' : entry.timeSheetStatus || entry.taskStatus || 'En Pausa'}
            </span>
            {isExpiredTab && (
              <span className={`text-[11px] ${syncInfo.isSynced ? 'text-emerald-600' : 'text-slate-500'}`}>
                {syncInfo.label}
              </span>
            )}
          </div>
        </td>
        <td className="py-3.5 px-4 font-mono text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap">
          {formatSecondsHM(autoSecs)}
        </td>
        <td className="py-3.5 px-4 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              aria-label={`Tiempo real HH:mm para ${entry.key || entry.name || id}`}
              value={inputVal}
              disabled={savingId === id || submittingAll}
              onChange={(e) => handleRealChange(id, e.target.value)}
              placeholder="HH:mm"
              className={`w-20 min-h-[38px] rounded-lg border px-2.5 py-1 text-center font-mono text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 ${
                errText
                  ? 'border-red-400 text-red-700 focus:ring-red-200'
                  : 'border-slate-300 text-slate-900 focus:border-[#1565C0] focus:ring-[#1565C0]/20'
              }`}
            />
            <button
              type="button"
              disabled={Boolean(errText) || savingId === id || submittingAll}
              onClick={() => void handleSaveEntryTime(entry, listSource)}
              title="Guardar tiempo real"
              aria-label="Guardar tiempo real"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {savingId === id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {errText && <p className="mt-1 text-[11px] text-red-600">{errText}</p>}
        </td>
        <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums text-center whitespace-nowrap">
          {entry.percentComplete ?? 0}%
        </td>
        <td className="py-3.5 px-4 text-right whitespace-nowrap">
          {!ended ? (
            <button
              type="button"
              onClick={() =>
                onOpenComplete({
                  mode: 'timesheet',
                  timesheetId: id,
                  taskId: entry.taskId,
                  type: entry.type,
                  projectName: entry.projectName,
                  taskKey: entry.key || entry.taskKey,
                  taskName: entry.name || entry.taskName,
                  runningSeconds: entry.currentTimeTaskSeconds,
                  accumulatedSeconds: entry.logTimeTaskSeconds,
                  remainingSeconds: entry.durationTimeTaskSeconds,
                })
              }
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#1565C0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0D47A1]"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Finalizar</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Lista</span>
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 sm:text-lg">
              Resumen de Tareas y Hoja de Horas
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Ajusta el tiempo real en HH:mm, finaliza las entradas abiertas y sincroniza con Enviar.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setSubTab('current')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  subTab === 'current' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hoja Actual ({entries.length})
              </button>
              <button
                type="button"
                onClick={() => setSubTab('expired')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  subTab === 'expired' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pendientes / Expiradas ({expiredEntries.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => void onRefreshAll()}
              disabled={loading}
              aria-label="Actualizar hoja de horas"
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {subTab === 'current' ? (
          <div className="mt-5 space-y-5">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-12 text-center">
                <Clock className="h-8 w-8 text-slate-400" aria-hidden="true" />
                <p className="mt-2.5 text-sm font-semibold text-slate-800">
                  No hay entradas en tu hoja actual
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Cuando inicies o pauses una tarea en el Dashboard, aparecerá aquí para revisar y enviar.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                        <th className="py-3 px-4">Key</th>
                        <th className="py-3 px-4">Nombre</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4">Horas</th>
                        <th className="py-3 px-4">Real (HH:mm)</th>
                        <th className="py-3 px-4 text-center">Avance</th>
                        <th className="py-3 px-4 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {entries.map((entry) => renderEntryRow(entry, entries, false))}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Enviar Bar */}
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-slate-600">
                    {submitGate.allowed ? (
                      <span className="font-medium text-emerald-800">
                        Todas las entradas están finalizadas (END) y listas para sincronizar.
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 font-medium text-amber-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                        <span>{submitGate.reason}</span>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!submitGate.allowed || submittingAll}
                    onClick={() => setConfirmSubmitOpen(true)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap shrink-0"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>{submittingAll ? 'Enviando...' : 'Enviar'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {groupedExpired.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-12 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
                <p className="mt-2.5 text-sm font-semibold text-slate-800">
                  No tienes hojas pendientes o expiradas
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Todas tus jornadas anteriores se encuentran al día.
                </p>
              </div>
            ) : (
              groupedExpired.map(([dateKey, items]) => (
                <div key={dateKey} className="space-y-2.5">
                  <h3 className="font-mono text-xs font-bold text-slate-600">
                    Fecha: {dateKey} · {items.length} entrada{items.length > 1 ? 's' : ''}
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                          <th className="py-3 px-4">Key</th>
                          <th className="py-3 px-4">Nombre</th>
                          <th className="py-3 px-4">Estado / Sync</th>
                          <th className="py-3 px-4">Horas</th>
                          <th className="py-3 px-4">Real (HH:mm)</th>
                          <th className="py-3 px-4 text-center">Avance</th>
                          <th className="py-3 px-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {items.map((entry) => renderEntryRow(entry, expiredEntries, true))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {confirmSubmitOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-submit-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="confirm-submit-title" className="font-display text-base font-bold text-slate-900">
              {uncertainSubmit ? 'Resultado incierto al enviar' : 'Confirmar envío de hoja de horas'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {uncertainSubmit
                ? 'La petición anterior superó el tiempo de espera. Verifica en la tabla si tus horas ya cambiaron de estado antes de reintentar el envío.'
                : `Se sincronizarán ${entries.length} entrada(s) finalizada(s) con el tiempo real capturado. Esta acción es independiente del Check Out.`}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={submittingAll}
                onClick={() => setConfirmSubmitOpen(false)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submittingAll}
                onClick={() => void handleSubmitFinalTimesheet()}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submittingAll && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{uncertainSubmit ? 'Reintentar Envío' : 'Confirmar y Enviar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
