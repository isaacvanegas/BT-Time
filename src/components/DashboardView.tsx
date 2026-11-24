import {
  AlertTriangle,
  Bug,
  CalendarClock,
  CheckSquare,
  Clock,
  FolderKanban,
  Pause,
  Play,
  RefreshCw,
  Search,
  Timer,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type {
  ActiveTaskResponse,
  OpenTasksResponse,
  TaskItem,
  TimesheetEntry,
  UserStatusCode,
} from '../../shared/types';
import { formatSecondsHM, formatSecondsHMS } from '../lib/timeFormat';
import type { CompleteTarget } from './CompleteTaskModal';

interface DashboardViewProps {
  userStatus: UserStatusCode;
  openTasks: OpenTasksResponse | null;
  activeTask: ActiveTaskResponse | null;
  expiredTimesheets: TimesheetEntry[];
  liveTaskSeconds: number;
  selectedTask: TaskItem | null;
  loading: boolean;
  actionBusy: boolean;
  onSelectTask: (task: TaskItem) => void;
  onRefresh: () => void;
  onCheckIn: () => Promise<boolean>;
  onStartTask: (task: TaskItem) => Promise<void>;
  onPauseTask: (type: string, taskId: string) => Promise<void>;
  onOpenComplete: (target: CompleteTarget) => void;
  onGoToExpired: () => void;
}

type GroupKey = 'dueTasks' | 'currentTasks' | 'weekTasks' | 'bugs';

const GROUP_META: Array<{ key: GroupKey; label: string; emptyText: string }> = [
  { key: 'dueTasks', label: 'Vencidas', emptyText: 'Sin tareas vencidas.' },
  { key: 'currentTasks', label: 'Hoy', emptyText: 'Sin tareas asignadas para hoy.' },
  { key: 'weekTasks', label: 'Resto de la Semana', emptyText: 'Sin tareas pendientes esta semana.' },
  { key: 'bugs', label: 'Incidencias', emptyText: 'Sin incidencias abiertas.' },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  userStatus,
  openTasks,
  activeTask,
  expiredTimesheets,
  liveTaskSeconds,
  selectedTask,
  loading,
  actionBusy,
  onSelectTask,
  onRefresh,
  onCheckIn,
  onStartTask,
  onPauseTask,
  onOpenComplete,
  onGoToExpired,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<GroupKey | 'all'>('all');
  const [checkInGateTask, setCheckInGateTask] = useState<TaskItem | null>(null);
  const [expiredGateVisible, setExpiredGateVisible] = useState(false);

  const normalizedStatus = String(userStatus || 'OFFLINE').toUpperCase();
  const isUserOnline = normalizedStatus === 'ONLINE';

  const activeTaskId = String(activeTask?.task?.id || activeTask?.taskId || activeTask?.id || '');
  const activeTaskType = String(activeTask?.task?.type || activeTask?.type || '');
  const activeTaskStatus = String(
    activeTask?.taskStatus || activeTask?.task?.taskStatus || ''
  ).toUpperCase();
  const hasActiveTask = Boolean(activeTaskId) && (activeTask?.active !== false && activeTask?.hasActiveTask !== false);
  const isActiveRunning = hasActiveTask && (activeTaskStatus === 'RUNNING' || activeTaskStatus === 'EXEC' || activeTaskStatus === 'ONLINE' || activeTaskStatus === 'IN_PROGRESS' || activeTaskStatus === 'ACTIVE');

  const pendingExpiredCount = useMemo(
    () =>
      expiredTimesheets.filter((item) => {
        const sync = String(item.synchronizeStatus || item.syncStatus || '').toUpperCase();
        return item.synchronized !== true && sync !== 'SYNCHRONIZED' && sync !== 'SYNC' && sync !== 'SENT';
      }).length,
    [expiredTimesheets]
  );

  const displayedTask: TaskItem | null = useMemo(() => {
    if (selectedTask) return selectedTask;
    if (hasActiveTask) {
      return {
        id: activeTaskId,
        type: activeTaskType,
        key: activeTask?.key || activeTask?.task?.key,
        name: activeTask?.name || activeTask?.task?.name,
        description: activeTask?.description || activeTask?.task?.description,
        projectName: activeTask?.projectName || activeTask?.task?.projectName || activeTask?.task?.project?.name,
        taskStatus: activeTask?.taskStatus || activeTask?.task?.taskStatus,
        percentComplete: activeTask?.percentComplete ?? activeTask?.task?.percentComplete,
        currentTimeTaskSeconds: activeTask?.currentTimeTaskSeconds,
        logTimeTaskSeconds: activeTask?.logTimeTaskSeconds,
        durationTimeTaskSeconds: activeTask?.durationTimeTaskSeconds,
      };
    }
    return null;
  }, [selectedTask, hasActiveTask, activeTask, activeTaskId, activeTaskType]);

  const isDisplayedTaskActive = Boolean(displayedTask && activeTaskId && displayedTask.id === activeTaskId);

  const handleStartWithGates = async (task: TaskItem) => {
    if (pendingExpiredCount > 0) {
      setExpiredGateVisible(true);
      return;
    }
    if (!isUserOnline) {
      setCheckInGateTask(task);
      return;
    }
    await onStartTask(task);
  };

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return GROUP_META.filter((g) => activeGroup === 'all' || activeGroup === g.key).map((group) => {
      const rawList = Array.isArray(openTasks?.[group.key]) ? (openTasks?.[group.key] as TaskItem[]) : [];
      const items = q
        ? rawList.filter((t) => {
            const hay = `${t.key || ''} ${t.name || t.title || ''} ${t.projectName || t.project?.name || ''}`.toLowerCase();
            return hay.includes(q);
          })
        : rawList;
      return { ...group, items };
    });
  }, [openTasks, searchQuery, activeGroup]);

  return (
    <div className="space-y-6">
      {pendingExpiredCount > 0 && (
        <div
          role="region"
          aria-label="Hojas expiradas pendientes"
          className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                Tienes {pendingExpiredCount} hoja{pendingExpiredCount > 1 ? 's' : ''} pendiente{pendingExpiredCount > 1 ? 's' : ''} / expirada{pendingExpiredCount > 1 ? 's' : ''}
              </p>
              <p className="mt-0.5 text-xs text-amber-900">
                Resuelve y finaliza tus hojas pendientes antes de iniciar otra tarea o hacer Check Out.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToExpired}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 whitespace-nowrap shrink-0"
          >
            Resolver Pendientes
          </button>
        </div>
      )}

      {/* Active / Selected Task Workspace Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 sm:text-lg">
              {isDisplayedTaskActive ? 'Tarea en Curso' : displayedTask ? 'Detalle de Tarea' : 'Dashboard de Actividad'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              El tiempo mostrado es sincronizado con el servidor BT-Time.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
        </div>

        {displayedTask ? (
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">Proyecto</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {displayedTask.projectName || displayedTask.project?.name || 'Sin proyecto'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Tarea</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {[displayedTask.key, displayedTask.name || displayedTask.title].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500">Descripción</p>
                <div className="mt-1.5 min-h-[96px] rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-700 whitespace-pre-wrap">
                  {displayedTask.description?.trim() || 'Sin descripción registrada para esta tarea.'}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col justify-between gap-4 border-t border-slate-100 pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">Estado</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {isDisplayedTaskActive
                      ? isActiveRunning
                        ? 'Ejecutando'
                        : 'En Pausa'
                      : displayedTask.taskStatus || displayedTask.status || 'Disponible'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-500">Avance</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {displayedTask.percentComplete ?? 0}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 border-y border-slate-100 py-3.5">
                <div>
                  <p className="text-[11px] font-medium text-slate-500">En Ejecución</p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-sm font-bold text-[#1565C0] tabular-nums">
                    <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {formatSecondsHMS(
                        isDisplayedTaskActive ? liveTaskSeconds : displayedTask.currentTimeTaskSeconds ?? 0
                      )}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Acumulada</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {formatSecondsHMS(
                      isDisplayedTaskActive
                        ? activeTask?.logTimeTaskSeconds ?? displayedTask.logTimeTaskSeconds
                        : displayedTask.logTimeTaskSeconds
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Restante</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {formatSecondsHMS(
                      isDisplayedTaskActive
                        ? activeTask?.durationTimeTaskSeconds ?? displayedTask.durationTimeTaskSeconds
                        : displayedTask.durationTimeTaskSeconds ?? displayedTask.estimatedTimeSeconds
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {isDisplayedTaskActive && isActiveRunning ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void onPauseTask(displayedTask.type, displayedTask.id)}
                    className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60 whitespace-nowrap"
                  >
                    <Pause className="h-4 w-4" aria-hidden="true" />
                    <span>Pausar</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleStartWithGates(displayedTask)}
                    className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#1565C0] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0D47A1] disabled:opacity-60 whitespace-nowrap"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    <span>Iniciar</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() =>
                    onOpenComplete({
                      mode: 'task',
                      type: displayedTask.type,
                      taskId: displayedTask.id,
                      timesheetId: activeTask?.timesheetId,
                      projectName: displayedTask.projectName || displayedTask.project?.name,
                      taskKey: displayedTask.key,
                      taskName: displayedTask.name || displayedTask.title,
                      runningSeconds: isDisplayedTaskActive
                        ? liveTaskSeconds
                        : displayedTask.currentTimeTaskSeconds,
                      accumulatedSeconds: displayedTask.logTimeTaskSeconds,
                      remainingSeconds: displayedTask.durationTimeTaskSeconds,
                    })
                  }
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#EA580C] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <CheckSquare className="h-4 w-4" aria-hidden="true" />
                  <span>Finalizar</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
            <Clock className="h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-2.5 text-sm font-semibold text-slate-800">
              No tienes ninguna tarea ejecutándose en este momento
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Selecciona una asignación de tus listas abajo para ver su detalle o iniciar el cronómetro.
            </p>
          </div>
        )}
      </section>

      {/* Assignments Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 sm:text-lg">
              Asignaciones
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tareas agrupadas por prioridad e incidencias abiertas.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar clave o tarea..."
                aria-label="Buscar asignaciones"
                className="w-full sm:w-56 min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveGroup('all')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeGroup === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas
              </button>
              {GROUP_META.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setActiveGroup(g.key)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeGroup === g.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-6">
          {filteredGroups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                  {group.key === 'bugs' ? (
                    <Bug className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                  ) : group.key === 'dueTasks' ? (
                    <CalendarClock className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                  ) : (
                    <FolderKanban className="h-3.5 w-3.5 text-[#1565C0]" aria-hidden="true" />
                  )}
                  <span>{group.label}</span>
                  <span className="font-mono text-slate-400 font-normal">({group.items.length})</span>
                </h3>
              </div>

              {group.items.length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
                  {group.emptyText}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                  {group.items.map((task) => {
                    const isRunningThis = activeTaskId === task.id && isActiveRunning;
                    const projectLabel = task.projectName || task.project?.name || 'Proyecto';
                    const taskHours = formatSecondsHM(task.logTimeTaskSeconds ?? task.currentTimeTaskSeconds ?? 0);

                    return (
                      <div
                        key={`${task.type}-${task.id}`}
                        className={`flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors ${
                          selectedTask?.id === task.id ? 'bg-sky-50/60' : 'bg-white hover:bg-slate-50/80'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectTask(task)}
                          className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-sky-600 rounded-md"
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                            <span className="font-mono font-semibold text-[#1565C0]">
                              {task.key || task.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{projectLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{taskHours} h</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-900 truncate">
                            {task.name || task.title || 'Tarea sin título'}
                          </p>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-medium text-slate-600 mr-1">
                            {isRunningThis ? 'Ejecutando' : task.taskStatus || task.status || 'Abierta'}
                          </span>
                          {isRunningThis ? (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void onPauseTask(task.type, task.id)}
                              aria-label={`Pausar ${task.key || task.name}`}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60 whitespace-nowrap"
                            >
                              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Pausar</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleStartWithGates(task)}
                              aria-label={`Iniciar ${task.key || task.name}`}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1565C0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0D47A1] disabled:opacity-60 whitespace-nowrap"
                            >
                              <Play className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Iniciar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Check-In Required Gate Dialog */}
      {checkInGateTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkin-gate-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="checkin-gate-title" className="font-display text-base font-bold text-slate-900">
              Debes hacer Check In primero
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Tu estado actual es <strong>{normalizedStatus}</strong>. Para iniciar el cronómetro de{' '}
              <strong>{checkInGateTask.key || checkInGateTask.name}</strong>, necesitas cambiar tu estado a{' '}
              <strong>ONLINE</strong>.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCheckInGateTask(null)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={async () => {
                  const targetTask = checkInGateTask;
                  const ok = await onCheckIn();
                  if (ok && targetTask) {
                    setCheckInGateTask(null);
                    await onStartTask(targetTask);
                  }
                }}
                className="min-h-[44px] rounded-lg bg-[#16A34A] px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Hacer Check In e Iniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Expired Timesheet Gate Dialog */}
      {expiredGateVisible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expired-gate-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="expired-gate-title" className="font-display text-base font-bold text-slate-900">
              Resuelve tus hojas expiradas primero
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Tienes <strong>{pendingExpiredCount}</strong> entrada(s) en hojas expiradas pendientes. Por flujo de BT-Time debes revisarlas y finalizarlas antes de iniciar una nueva tarea.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setExpiredGateVisible(false)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setExpiredGateVisible(false);
                  onGoToExpired();
                }}
                className="min-h-[44px] rounded-lg bg-[#1565C0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0D47A1]"
              >
                Ir a Hojas Pendientes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
