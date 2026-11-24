import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Lock, RefreshCw } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { TimesheetMonthDay, TimesheetMonthResponse } from '../../shared/types';
import { formatMinutesHM, formatSecondsHM } from '../lib/timeFormat';

interface CalendarViewProps {
  year: number;
  month: number; // 1..12
  data: TimesheetMonthResponse | null;
  loading: boolean;
  onChangeMonth: (year: number, month: number) => void;
  onRefresh: () => void;
}

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

export const CalendarView: React.FC<CalendarViewProps> = ({
  year,
  month,
  data,
  loading,
  onChangeMonth,
  onRefresh,
}) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dayMap = useMemo(() => {
    const map = new Map<string, TimesheetMonthDay>();
    for (const day of data?.timesheetDays || []) {
      if (day.date) {
        map.set(day.date.slice(0, 10), day);
      }
    }
    return map;
  }, [data]);

  const totalMinutesMonth = useMemo(() => {
    if (typeof data?.totalMinutesMonth === 'number') return data.totalMinutesMonth;
    return (data?.timesheetDays || []).reduce((acc, d) => acc + (Number(d.totalMinutesDay) || 0), 0);
  }, [data]);

  const gridCells = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    // Monday = 0 .. Sunday = 6
    const jsStart = firstDay.getDay();
    const startOffset = jsStart === 0 ? 6 : jsStart - 1;

    const cells: Array<{
      dateKey: string;
      dayNum: number;
      inMonth: boolean;
      dayData?: TimesheetMonthDay;
    }> = [];

    const prevMonthDays = new Date(year, month - 1, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      const dateKey = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateKey, dayNum: d, inMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateKey,
        dayNum: d,
        inMonth: true,
        dayData: dayMap.get(dateKey),
      });
    }

    while (cells.length % 7 !== 0) {
      const nextDayNum = cells.length - (startOffset + daysInMonth) + 1;
      const nextM = month === 12 ? 1 : month + 1;
      const nextY = month === 12 ? year + 1 : year;
      const dateKey = `${nextY}-${String(nextM).padStart(2, '0')}-${String(nextDayNum).padStart(2, '0')}`;
      cells.push({ dateKey, dayNum: nextDayNum, inMonth: false });
    }

    return cells;
  }, [year, month, dayMap]);

  const selectedDayData = selectedDate ? dayMap.get(selectedDate) : undefined;

  const handlePrev = () => {
    setSelectedDate(null);
    if (month === 1) onChangeMonth(year - 1, 12);
    else onChangeMonth(year, month - 1);
  };

  const handleNext = () => {
    setSelectedDate(null);
    if (month === 12) onChangeMonth(year + 1, 1);
    else onChangeMonth(year, month + 1);
  };

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 sm:text-lg">
              Calendario Mensual
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Consulta el acumulado diario y el estado de sincronización por fecha.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm text-slate-600">
              Total de Horas:{' '}
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatMinutesHM(totalMinutesMonth)}
              </span>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Actualizar calendario"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Mes anterior"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h3 className="font-display text-base font-bold text-slate-800 sm:text-lg">
                {MONTH_NAMES[month - 1]} - {year}
              </h3>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Mes siguiente"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold mb-2">
              {WEEKDAYS.map((day, idx) => (
                <div
                  key={day}
                  className={
                    idx === 6
                      ? 'text-red-600 py-1.5'
                      : idx === 0
                        ? 'text-amber-600 py-1.5'
                        : 'text-slate-600 py-1.5'
                  }
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {gridCells.map((cell) => {
                const isSelected = selectedDate === cell.dateKey;
                const isToday = cell.dateKey === todayKey;
                const mins = cell.dayData?.totalMinutesDay ?? 0;

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    disabled={!cell.inMonth}
                    onClick={() => cell.inMonth && setSelectedDate(cell.dateKey)}
                    className={`min-h-[64px] rounded-xl border p-1.5 flex flex-col items-center justify-between transition-colors ${
                      !cell.inMonth
                        ? 'border-transparent bg-slate-50/50 text-slate-300 cursor-default'
                        : isSelected
                          ? 'border-[#1565C0] bg-sky-50 text-slate-900'
                          : isToday
                            ? 'border-sky-300 bg-[#1565C0] text-white'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-sky-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-semibold tabular-nums">{cell.dayNum}</span>
                    {cell.inMonth && mins > 0 ? (
                      <span
                        className={`font-mono text-[11px] font-semibold tabular-nums ${
                          isToday && !isSelected ? 'text-sky-100' : 'text-slate-600'
                        }`}
                      >
                        {formatMinutesHM(mins)}
                      </span>
                    ) : (
                      <span className="text-[11px] opacity-0">00:00</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4 border-t border-slate-100 pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <h4 className="font-display text-sm font-bold text-slate-900">
              {selectedDate ? `Detalle del ${selectedDate}` : 'Detalle del día'}
            </h4>

            {!selectedDate ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
                <CalendarIcon className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="mt-2 text-xs text-slate-500">
                  Selecciona un día en el calendario para consultar sus registros de hoja de horas.
                </p>
              </div>
            ) : !selectedDayData || !selectedDayData.timesheets?.length ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-5 text-xs text-slate-600">
                No hay registros de tiempo reportados para el {selectedDate}.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600 border-b border-slate-100 pb-2">
                  <span>Total del día</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatMinutesHM(selectedDayData.totalMinutesDay)}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {selectedDayData.timesheets.map((item, idx) => {
                    const durationText =
                      typeof item.totalMinutes === 'number'
                        ? formatMinutesHM(item.totalMinutes)
                        : formatSecondsHM(item.timeRealInSeconds ?? item.durationTimeTaskSeconds ?? 0);
                    return (
                      <div
                        key={item.id || item.timesheetId || idx}
                        className="rounded-xl border border-slate-200 bg-white p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-semibold text-[#1565C0]">
                            {item.key || item.timesheetType || 'Registro'}
                          </span>
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            {durationText}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-800">
                          {item.name || item.taskName || 'Actividad'}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span>Tipo: {item.timesheetType || 'N/A'}</span>
                          <span aria-hidden="true">·</span>
                          <span>Estado: {item.synchronizeStatus || 'N/A'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Explicit Backdating API Limitation Notice */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <span>Registro con fecha manual (No disponible)</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                El API BT-Time actual solo permite consultar el calendario mensual (GET) y editar el tiempo real de entradas existentes. No existe contrato del servidor para crear registros en fechas pasadas o modificar <code className="font-mono">createdDate</code>.
              </p>
              <button
                type="button"
                disabled
                className="mt-3 w-full min-h-[40px] rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-400 cursor-not-allowed"
              >
                Registrar horas en fecha anterior (Deshabilitado por API)
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
