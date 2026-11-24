import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { CustomField } from '../../shared/types';
import { api, ApiError } from '../lib/apiClient';
import { formatSecondsHMS, normalizeCustomFieldsForForm } from '../lib/timeFormat';

export interface CompleteTarget {
  mode: 'task' | 'timesheet';
  type?: string;
  taskId?: string;
  timesheetId?: string;
  projectName?: string;
  taskKey?: string;
  taskName?: string;
  runningSeconds?: number;
  accumulatedSeconds?: number;
  remainingSeconds?: number;
}

interface CompleteTaskModalProps {
  target: CompleteTarget | null;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}

function getFieldOptionValue(opt: string | { id?: string; value?: string; label?: string; name?: string }): string {
  if (typeof opt === 'string') return opt;
  return String(opt.value ?? opt.label ?? opt.name ?? opt.id ?? '');
}

function getFieldOptionLabel(opt: string | { id?: string; value?: string; label?: string; name?: string }): string {
  if (typeof opt === 'string') return opt;
  return String(opt.label ?? opt.name ?? opt.value ?? opt.id ?? '');
}

export const CompleteTaskModal: React.FC<CompleteTaskModalProps> = ({
  target,
  onClose,
  onCompleted,
}) => {
  const [loadingFields, setLoadingFields] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uncertainOutcome, setUncertainOutcome] = useState(false);
  const [confirmRetryAfterUncertain, setConfirmRetryAfterUncertain] = useState(false);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;

    setNote('');
    setErrorMsg(null);
    setUncertainOutcome(false);
    setConfirmRetryAfterUncertain(false);
    setCustomFields([]);

    const loadFields = async () => {
      if (!target.timesheetId) {
        // Fallback default dynamic fields structure when timesheetId is unavailable
        setCustomFields(
          normalizeCustomFieldsForForm([
            { name: 'Activity Type', label: 'Activity Type', required: true, value: 'Gestión' },
            { name: 'Commit ID', label: 'Commit ID', required: false, value: '' },
          ])
        );
        return;
      }

      setLoadingFields(true);
      try {
        const detail = await api.getTimesheetDetail(target.timesheetId);
        if (cancelled) return;
        const fields =
          detail.customFields ??
          detail.timesheet?.customFields ??
          [];
        setCustomFields(normalizeCustomFieldsForForm(fields));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('No se pudieron cargar los campos de la entrada.');
        }
      } finally {
        if (!cancelled) setLoadingFields(false);
      }
    };

    void loadFields();
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target) return null;

  const updateFieldValue = (index: number, value: string) => {
    setCustomFields((prev) =>
      prev.map((field, idx) => (idx === index ? { ...field, value } : field))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (uncertainOutcome && !confirmRetryAfterUncertain) {
      setErrorMsg('Confirma primero que verificaste el estado actual antes de reintentar.');
      return;
    }

    const cleanNote = note.trim();
    if (!cleanNote) {
      setErrorMsg('El comentario (Nota) es obligatorio para finalizar.');
      return;
    }

    for (const field of customFields) {
      const label = String(field.label || field.name || 'Campo');
      const nameLower = label.toLowerCase();
      const val = String(field.value ?? '').trim();
      const isActivityType = nameLower.includes('activity') && nameLower.includes('type');
      const isRequired = Boolean(field.required || field.isRequired || isActivityType);
      if (isRequired && !val) {
        setErrorMsg(`El campo obligatorio "${label}" no puede estar vacío.`);
        return;
      }
    }

    setErrorMsg(null);
    setSubmitting(true);

    const payload = {
      note: cleanNote,
      percentComplete: 0, // Strictly 0 per BT-Time rule
      customFields,
    };

    try {
      if (target.mode === 'timesheet' && target.timesheetId) {
        await api.endTimesheetEntry(target.timesheetId, payload);
      } else if (target.type && target.taskId) {
        await api.endTask(target.type, target.taskId, payload);
      } else if (target.timesheetId) {
        await api.endTimesheetEntry(target.timesheetId, payload);
      } else {
        throw new Error('Identificador de tarea o entrada faltante.');
      }

      await onCompleted();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.uncertainOutcome) {
        setUncertainOutcome(true);
        setConfirmRetryAfterUncertain(false);
        setErrorMsg(err.message);
        await onCompleted();
      } else if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Error al finalizar la tarea.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-task-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="complete-task-title" className="font-display text-lg font-bold text-slate-900 truncate">
              Finalizar Tarea
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 truncate">
              {[target.projectName, target.taskKey, target.taskName].filter(Boolean).join(' · ') || 'Registro de actividad'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar modal"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          {(target.runningSeconds !== undefined || target.accumulatedSeconds !== undefined) && (
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center">
              <div>
                <p className="text-[11px] font-medium text-slate-500">En Ejecución</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {formatSecondsHMS(target.runningSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Acumulada</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {formatSecondsHMS(target.accumulatedSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Restante</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {formatSecondsHMS(target.remainingSeconds)}
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-2"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
              {uncertainOutcome && (
                <label className="flex items-center gap-2 pt-1 text-xs font-medium text-red-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmRetryAfterUncertain}
                    onChange={(e) => setConfirmRetryAfterUncertain(e.target.checked)}
                    className="h-4 w-4 rounded border-red-300 text-[#1565C0]"
                  />
                  <span>Ya verifiqué el estado actual y deseo reintentar finalizar</span>
                </label>
              )}
            </div>
          )}

          {loadingFields ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#1565C0]" />
              <span>Cargando campos de la entrada...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {customFields.map((field, index) => {
                const label = String(field.label || field.name || `Campo ${index + 1}`);
                const nameLower = label.toLowerCase();
                const isActivityType = nameLower.includes('activity') && nameLower.includes('type');
                const isCommitId = nameLower.includes('commit');
                const isRequired = Boolean(field.required || field.isRequired || isActivityType);
                const rawOptions = Array.isArray(field.options)
                  ? field.options
                  : Array.isArray(field.values)
                    ? field.values
                    : [];
                const fieldId = `cf-${field.id ?? field.fieldId ?? index}`;

                return (
                  <div key={fieldId}>
                    <label htmlFor={fieldId} className="block text-xs font-medium text-slate-700">
                      {label}
                      {isRequired && <span className="ml-1 text-red-600">*</span>}
                    </label>
                    {rawOptions.length > 0 ? (
                      <select
                        id={fieldId}
                        value={String(field.value ?? '')}
                        onChange={(e) => updateFieldValue(index, e.target.value)}
                        required={isRequired}
                        className="mt-1.5 block w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
                      >
                        {!isActivityType && <option value="">Seleccionar...</option>}
                        {rawOptions.map((opt, optIdx) => {
                          const optVal = getFieldOptionValue(opt);
                          const optLabel = getFieldOptionLabel(opt);
                          return (
                            <option key={`${optVal}-${optIdx}`} value={optVal}>
                              {optLabel}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <input
                        id={fieldId}
                        type="text"
                        value={String(field.value ?? '')}
                        onChange={(e) => updateFieldValue(index, e.target.value)}
                        required={isRequired}
                        placeholder={isCommitId ? 'Opcional (vacío por defecto)' : ''}
                        className="mt-1.5 block w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
                      />
                    )}
                  </div>
                );
              })}

              <div>
                <label htmlFor="complete-avance" className="block text-xs font-medium text-slate-700">
                  Avance
                </label>
                <div
                  id="complete-avance"
                  className="mt-1.5 flex min-h-[44px] items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-mono font-medium text-slate-700 tabular-nums"
                >
                  <span>0%</span>
                  <span className="text-[11px] font-sans text-slate-500">Fijo en 0 por política BT-Time</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="complete-note" className="block text-xs font-medium text-slate-700">
              Nota / Comentario <span className="text-red-600">*</span>
            </label>
            <textarea
              id="complete-note"
              rows={4}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe el trabajo realizado en esta tarea..."
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
            />
          </div>

          <div className="flex flex-col-reverse gap-2.5 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || loadingFields || (uncertainOutcome && !confirmRetryAfterUncertain)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Finalizando...</span>
                </>
              ) : uncertainOutcome ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span>Reintentar Finalización</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Finalizar Tarea</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
