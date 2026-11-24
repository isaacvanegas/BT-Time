import type { CustomField, ReminderRule, TimesheetEntry } from '../../shared/types';

export function formatSecondsHMS(totalSeconds: number | undefined | null): string {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatSecondsHM(totalSeconds: number | undefined | null): string {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatMinutesHM(totalMinutes: number | undefined | null): string {
  const safe = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseHHMMToSeconds(input: string): {
  valid: boolean;
  seconds: number;
  normalized: string;
  error?: string;
} {
  const trimmed = input.trim();
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (!match) {
    return {
      valid: false,
      seconds: 0,
      normalized: trimmed,
      error: 'Usa el formato HH:mm (por ejemplo 08:00 o 00:45).',
    };
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || hours < 0 || hours > 240) {
    return {
      valid: false,
      seconds: 0,
      normalized: trimmed,
      error: 'Las horas deben estar entre 00 y 240.',
    };
  }
  const seconds = hours * 3600 + minutes * 60;
  return {
    valid: true,
    seconds,
    normalized: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  };
}

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function normalizeCustomFieldsForForm(rawFields: CustomField[] | undefined | null): CustomField[] {
  if (!Array.isArray(rawFields)) return [];
  return rawFields.map((raw) => {
    const field: CustomField = { ...raw };
    const nameLower = String(field.name || field.label || '').trim().toLowerCase();

    if (nameLower.includes('activity') && nameLower.includes('type')) {
      // Rule: Activity Type starts as "Gestión" and is required
      const currentVal = String(field.value ?? '').trim();
      const options = Array.isArray(field.options)
        ? field.options
        : Array.isArray(field.values)
          ? field.values
          : [];
      let defaultGestion = 'Gestión';
      for (const opt of options) {
        const label = typeof opt === 'string' ? opt : String(opt.value ?? opt.label ?? opt.name ?? '');
        if (label.toLowerCase() === 'gestión' || label.toLowerCase() === 'gestion') {
          defaultGestion = label;
          break;
        }
      }
      field.value = currentVal || defaultGestion;
      field.required = true;
    } else if (nameLower.includes('commit')) {
      // Rule: Commit ID stays empty; never invent a commit
      field.value = '';
    }

    return field;
  });
}

export function isTimesheetEntryEnded(entry: TimesheetEntry): boolean {
  return String(entry.timeSheetStatus || '').toUpperCase() === 'END';
}

export function getTimesheetSyncBadge(entry: {
  synchronizeStatus?: string;
  syncStatus?: string;
  synchronized?: boolean;
  timeSheetStatus?: string;
}): { isSynced: boolean; label: string } {
  const raw = String(entry.synchronizeStatus || entry.syncStatus || '').toUpperCase();
  if (
    entry.synchronized === true ||
    raw === 'SYNCHRONIZED' ||
    raw === 'SYNC' ||
    raw === 'SENT' ||
    raw === 'COMPLETED' ||
    raw === 'APPROVED'
  ) {
    return { isSynced: true, label: raw || 'Sincronizada' };
  }
  if (raw) {
    return { isSynced: false, label: raw };
  }
  return {
    isSynced: false,
    label: isTimesheetEntryEnded(entry as TimesheetEntry) ? 'Finalizada (pendiente de envío)' : 'Abierta / Pendiente',
  };
}

export function canSubmitTimesheet(
  entries: TimesheetEntry[],
  activeTaskCount: number
): { allowed: boolean; reason?: string } {
  if (activeTaskCount > 0) {
    return {
      allowed: false,
      reason: `Tienes ${activeTaskCount} tarea${activeTaskCount > 1 ? 's' : ''} activa${activeTaskCount > 1 ? 's' : ''}. Finalízala${activeTaskCount > 1 ? 's' : ''} antes de enviar la hoja.`,
    };
  }
  if (entries.length === 0) {
    return {
      allowed: false,
      reason: 'No hay entradas en la hoja actual para enviar.',
    };
  }
  const notEnded = entries.filter((e) => !isTimesheetEntryEnded(e));
  if (notEnded.length > 0) {
    return {
      allowed: false,
      reason: `Faltan ${notEnded.length} entrada${notEnded.length > 1 ? 's' : ''} por finalizar (estado END) antes de poder enviar.`,
    };
  }
  return { allowed: true };
}

export function getZonedParts(date: Date, timeZone: string): {
  dateKey: string;
  hhmm: string;
  isoWeekday: number; // 1=Mon .. 7=Sun
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    const hour = map.hour === '24' ? '00' : map.hour;
    const weekdayMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    return {
      dateKey: `${map.year}-${map.month}-${map.day}`,
      hhmm: `${hour}:${map.minute}`,
      isoWeekday: weekdayMap[map.weekday] ?? 1,
    };
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const jsDay = date.getDay();
    return {
      dateKey: `${y}-${m}-${d}`,
      hhmm: `${hh}:${mm}`,
      isoWeekday: jsDay === 0 ? 7 : jsDay,
    };
  }
}

export function shouldTriggerReminder(
  rule: ReminderRule,
  now: Date,
  timeZone: string,
  lastFiredKey?: string
): { trigger: boolean; fireKey: string } {
  if (!rule.enabled) return { trigger: false, fireKey: '' };
  const zoned = getZonedParts(now, timeZone);
  const fireKey = `${zoned.dateKey}@${zoned.hhmm}`;
  if (lastFiredKey === fireKey) {
    return { trigger: false, fireKey };
  }
  const dayMatch = rule.days.includes(zoned.isoWeekday);
  const timeMatch = zoned.hhmm === rule.time;
  return {
    trigger: dayMatch && timeMatch,
    fireKey,
  };
}
