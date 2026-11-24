import { describe, expect, it } from 'vitest';
import type { ReminderRule, TimesheetEntry } from '../shared/types.ts';
import {
  canSubmitTimesheet,
  normalizeCustomFieldsForForm,
  parseHHMMToSeconds,
  shouldTriggerReminder,
} from '../src/lib/timeFormat.ts';

describe('HH:mm conversion and validation', () => {
  it('converts valid HH:mm strings to exact seconds', () => {
    expect(parseHHMMToSeconds('08:22')).toEqual({
      valid: true,
      seconds: 8 * 3600 + 22 * 60,
      normalized: '08:22',
    });
    expect(parseHHMMToSeconds('0:45')).toEqual({
      valid: true,
      seconds: 45 * 60,
      normalized: '00:45',
    });
  });

  it('rejects malformed or out-of-range minutes', () => {
    expect(parseHHMMToSeconds('08:65').valid).toBe(false);
    expect(parseHHMMToSeconds('abc').valid).toBe(false);
    expect(parseHHMMToSeconds('').valid).toBe(false);
  });
});

describe('Dynamic customFields normalization', () => {
  it('initializes Activity Type to Gestión, clears Commit ID, and preserves IDs', () => {
    const fields = normalizeCustomFieldsForForm([
      {
        id: '9007199254740993',
        name: 'Activity Type',
        options: ['Desarrollo', 'Gestión', 'Pruebas'],
        value: '',
      },
      {
        id: '9007199254740994',
        name: 'Commit ID',
        value: 'should-be-cleared',
      },
      {
        id: '9007199254740995',
        name: 'Ambiente',
        required: true,
        value: 'QA',
      },
    ]);

    expect(fields[0].id).toBe('9007199254740993');
    expect(fields[0].value).toBe('Gestión');
    expect(fields[0].required).toBe(true);
    expect(fields[1].value).toBe('');
    expect(fields[2].value).toBe('QA');
  });
});

describe('Timesheet Enviar gates', () => {
  const endedEntry: TimesheetEntry = {
    id: '9007199254740993',
    timeSheetStatus: 'END',
  };
  const openEntry: TimesheetEntry = {
    id: '9007199254740994',
    timeSheetStatus: 'PAUSE',
  };

  it('blocks submission if active tasks remain', () => {
    const res = canSubmitTimesheet([endedEntry], 1);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('1 tarea activa');
  });

  it('blocks submission if any entry is not END', () => {
    const res = canSubmitTimesheet([endedEntry, openEntry], 0);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Faltan 1 entrada');
  });

  it('allows submission only when no active tasks and all entries are END', () => {
    const res = canSubmitTimesheet([endedEntry], 0);
    expect(res.allowed).toBe(true);
  });
});

describe('Reminder timezone and schedule evaluation', () => {
  const rule: ReminderRule = {
    enabled: true,
    time: '09:00',
    days: [1, 2, 3, 4, 5],
  };

  it('triggers at exact local HH:mm in given IANA timezone and avoids duplicate firing', () => {
    // 2026-11-24 is Tuesday (ISO weekday 2). 09:00 in America/Guatemala (UTC-6) = 15:00 UTC.
    const utcDate = new Date('2026-11-24T15:00:00Z');
    const first = shouldTriggerReminder(rule, utcDate, 'America/Guatemala');
    expect(first.trigger).toBe(true);
    expect(first.fireKey).toBe('2026-11-24@09:00');

    const second = shouldTriggerReminder(rule, utcDate, 'America/Guatemala', first.fireKey);
    expect(second.trigger).toBe(false);
  });

  it('does not trigger on inactive weekend days', () => {
    // 2026-11-28 is Saturday (ISO weekday 6)
    const satUtc = new Date('2026-11-28T15:00:00Z');
    const res = shouldTriggerReminder(rule, satUtc, 'America/Guatemala');
    expect(res.trigger).toBe(false);
  });
});
