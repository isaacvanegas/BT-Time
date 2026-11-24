import { AlertTriangle, BellRing, CheckCircle2, LogOut, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActiveTaskResponse,
  HealthResponse,
  OpenTasksResponse,
  ReminderSettings,
  TaskItem,
  TimesheetEntry,
  TimesheetMonthResponse,
  UserInfo,
} from '../shared/types';
import { CalendarView } from './components/CalendarView';
import { CompleteTaskModal, type CompleteTarget } from './components/CompleteTaskModal';
import { DashboardView } from './components/DashboardView';
import { HeaderBar } from './components/HeaderBar';
import { LoginView } from './components/LoginView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SettingsView } from './components/SettingsView';
import { SidebarNav, type NavTab } from './components/SidebarNav';
import { TimesheetView } from './components/TimesheetView';
import { api, ApiError, setCsrfToken, setUnauthorizedHandler } from './lib/apiClient';
import { getBrowserTimeZone, shouldTriggerReminder } from './lib/timeFormat';

const REMINDER_STORAGE_KEY = 'bttime_reminders_v1';

const DEFAULT_REMINDERS: ReminderSettings = {
  checkInReminder: {
    enabled: false,
    time: '09:00',
    days: [1, 2, 3, 4, 5],
  },
  submitReminder: {
    enabled: false,
    time: '18:00',
    days: [1, 2, 3, 4, 5],
  },
  browserNotificationsEnabled: false,
};

function loadReminders(): ReminderSettings {
  try {
    const raw = window.localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return DEFAULT_REMINDERS;
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
    return {
      checkInReminder: parsed.checkInReminder ?? DEFAULT_REMINDERS.checkInReminder,
      submitReminder: parsed.submitReminder ?? DEFAULT_REMINDERS.submitReminder,
      browserNotificationsEnabled: Boolean(parsed.browserNotificationsEnabled),
    };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const [user, setUser] = useState<UserInfo | null>(null);
  const [openTasks, setOpenTasks] = useState<OpenTasksResponse | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveTaskResponse | null>(null);
  const [timesheetEntries, setTimesheetEntries] = useState<TimesheetEntry[]>([]);
  const [expiredEntries, setExpiredEntries] = useState<TimesheetEntry[]>([]);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [monthData, setMonthData] = useState<TimesheetMonthResponse | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [timesheetSubTab, setTimesheetSubTab] = useState<'current' | 'expired'>('current');
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [completeTarget, setCompleteTarget] = useState<CompleteTarget | null>(null);
  const [confirmCheckOutOpen, setConfirmCheckOutOpen] = useState(false);

  const [loadingData, setLoadingData] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [shiftSeconds, setShiftSeconds] = useState(0);
  const [taskSeconds, setTaskSeconds] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [reminders, setReminders] = useState<ReminderSettings>(loadReminders);
  const lastFiredRef = useRef<{ checkin?: string; submit?: string }>({});

  const notify = useCallback(
    (
      text: string,
      tone: 'info' | 'success' | 'error' = 'info',
      action?: { label: string; handler: () => void }
    ) => {
      setToast({
        id: Date.now(),
        text,
        tone,
        actionLabel: action?.label,
        onAction: action?.handler,
      });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setUnauthorizedHandler((msg) => {
      setAuthenticated(false);
      setUser(null);
      setOpenTasks(null);
      setActiveTask(null);
      setTimesheetEntries([]);
      setExpiredEntries([]);
      setMonthData(null);
      setSessionMessage(msg);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const userStatus = String(user?.userStatus || user?.status || 'OFFLINE').toUpperCase();
  const isUserOnline = userStatus === 'ONLINE';

  const activeTaskId = String(activeTask?.task?.id || activeTask?.taskId || activeTask?.id || '');
  const activeTaskType = String(activeTask?.task?.type || activeTask?.type || '');
  const activeTaskStatus = String(activeTask?.taskStatus || activeTask?.task?.taskStatus || '').toUpperCase();
  const hasActiveTask =
    Boolean(activeTaskId) && activeTask?.active !== false && activeTask?.hasActiveTask !== false;
  const isActiveTaskRunning =
    hasActiveTask &&
    (activeTaskStatus === 'RUNNING' ||
      activeTaskStatus === 'EXEC' ||
      activeTaskStatus === 'ONLINE' ||
      activeTaskStatus === 'IN_PROGRESS' ||
      activeTaskStatus === 'ACTIVE');

  const pendingExpiredCount = useMemo(
    () =>
      expiredEntries.filter((item) => {
        const sync = String(item.synchronizeStatus || item.syncStatus || '').toUpperCase();
        return item.synchronized !== true && sync !== 'SYNCHRONIZED' && sync !== 'SYNC' && sync !== 'SENT';
      }).length,
    [expiredEntries]
  );

  const loadMonthCalendar = useCallback(async (y: number, m: number) => {
    setLoadingCalendar(true);
    try {
      const data = await api.getTimesheetMonth(y, m);
      setMonthData(data);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        notify(err.message, 'error');
      }
    } finally {
      setLoadingCalendar(false);
    }
  }, [notify]);

  const refreshWorkspace = useCallback(async () => {
    setLoadingData(true);
    try {
      const [infoRes, openRes, activeRes, tsRes, expiredRes] = await Promise.all([
        api.getUserInfo(),
        api.getOpenTasks(),
        api.getActiveTask().catch(() => null),
        api.getTimesheet().catch(() => [] as TimesheetEntry[]),
        api.getExpiredTimesheets().catch(() => [] as TimesheetEntry[]),
      ]);

      setUser(infoRes);
      setShiftSeconds(Number(infoRes?.currentTimeSeconds ?? infoRes?.logTimeSeconds ?? 0) || 0);
      setOpenTasks(openRes);
      setActiveTask(activeRes);

      if (activeRes) {
        const aType = String(activeRes.task?.type || activeRes.type || '');
        const aId = String(activeRes.task?.id || activeRes.taskId || activeRes.id || '');
        let initialTaskSecs = Number(activeRes.currentTimeTaskSeconds ?? 0) || 0;
        if (aType && aId) {
          try {
            const timeInfo = await api.getTaskTime(aType, aId);
            initialTaskSecs = Number(timeInfo.currentTimeTaskSeconds ?? initialTaskSecs) || 0;
            setActiveTask((prev) => (prev ? { ...prev, ...timeInfo } : prev));
          } catch {
            // Keep /tasks/active values if .../time is unavailable
          }
        }
        setTaskSeconds(initialTaskSecs);
      } else {
        setTaskSeconds(0);
      }

      setTimesheetEntries(tsRes);
      setExpiredEntries(expiredRes);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        notify(err.message, 'error');
      }
    } finally {
      setLoadingData(false);
    }
  }, [notify]);

  // Initial boot: check health + existing HttpOnly session
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const [h, sess] = await Promise.all([
          api.health().catch(() => null),
          api.getSession().catch(() => null),
        ]);
        if (cancelled) return;
        setHealth(h);

        if (sess?.authenticated && sess.user) {
          setCsrfToken(sess.csrfToken);
          setUser(sess.user);
          setAuthenticated(true);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load workspace & current calendar once authenticated
  useEffect(() => {
    if (!authenticated) return;
    void refreshWorkspace();
    void loadMonthCalendar(calYear, calMonth);
  }, [authenticated, refreshWorkspace, loadMonthCalendar, calYear, calMonth]);

  // Visual 1-second timer tick (server remains authoritative)
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      if (isUserOnline) {
        setShiftSeconds((prev) => prev + 1);
      }
      if (isActiveTaskRunning) {
        setTaskSeconds((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [authenticated, isUserOnline, isActiveTaskRunning]);

  // Rehydrate from server when returning to tab
  useEffect(() => {
    if (!authenticated) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshWorkspace();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [authenticated, refreshWorkspace]);

  // Foreground reminder scheduler (never auto-executes actions!)
  const triggerReminderNotification = useCallback(
    (kind: 'checkin' | 'submit') => {
      const isCheckIn = kind === 'checkin';
      const title = isCheckIn
        ? 'Recordatorio BT-Time: Check In'
        : 'Recordatorio BT-Time: Hoja de Horas';
      const body = isCheckIn
        ? 'Es hora de hacer Check In e iniciar tu cronómetro.'
        : 'Revisa tus tiempos reales (HH:mm) y envía tu hoja de horas.';

      const navigateTarget = () => {
        window.focus();
        if (isCheckIn) {
          setActiveTab('dashboard');
        } else {
          setTimesheetSubTab('current');
          setActiveTab('timesheet');
        }
      };

      notify(body, 'info', {
        label: isCheckIn ? 'Ir a Dashboard' : 'Ir a Hoja de Horas',
        handler: navigateTarget,
      });

      if (
        reminders.browserNotificationsEnabled &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          const notif = new Notification(title, {
            body,
            icon: '/pwa-192x192.png',
            tag: `bt-time-${kind}`,
          });
          notif.onclick = () => {
            navigateTarget();
            notif.close();
          };
        } catch {
          // Ignore browser notification failure; in-app toast already displayed
        }
      }
    },
    [notify, reminders.browserNotificationsEnabled]
  );

  useEffect(() => {
    if (!authenticated) return;
    const tz = getBrowserTimeZone();
    const checkReminders = () => {
      const current = new Date();
      const ci = shouldTriggerReminder(
        reminders.checkInReminder,
        current,
        tz,
        lastFiredRef.current.checkin
      );
      if (ci.trigger) {
        lastFiredRef.current.checkin = ci.fireKey;
        triggerReminderNotification('checkin');
      }

      const sub = shouldTriggerReminder(
        reminders.submitReminder,
        current,
        tz,
        lastFiredRef.current.submit
      );
      if (sub.trigger) {
        lastFiredRef.current.submit = sub.fireKey;
        triggerReminderNotification('submit');
      }
    };

    const timer = setInterval(checkReminders, 15000);
    return () => clearInterval(timer);
  }, [authenticated, reminders, triggerReminderNotification]);

  const handleSaveReminders = (next: ReminderSettings) => {
    setReminders(next);
    try {
      window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  };

  const handleCheckIn = async (): Promise<boolean> => {
    if (actionBusy) return false;
    setActionBusy(true);
    try {
      await api.setUserOnline();
      notify('Estado actualizado a Online (Check In).', 'success');
      await refreshWorkspace();
      return true;
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo cambiar a Online.', 'error');
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const handleOnlineOrPause = async () => {
    if (actionBusy) return;
    if (isUserOnline) {
      setActionBusy(true);
      try {
        await api.setUserPause();
        notify('Estado cambiado a En Pausa.', 'info');
        await refreshWorkspace();
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'No se pudo pausar el estado.', 'error');
      } finally {
        setActionBusy(false);
      }
    } else {
      await handleCheckIn();
    }
  };

  const handleRequestCheckOut = () => {
    if (pendingExpiredCount > 0) {
      notify(
        `Tienes ${pendingExpiredCount} hoja(s) expirada(s) pendiente(s). Resuélvelas antes de hacer Check Out.`,
        'error',
        {
          label: 'Ver Pendientes',
          handler: () => {
            setTimesheetSubTab('expired');
            setActiveTab('timesheet');
          },
        }
      );
      return;
    }
    setConfirmCheckOutOpen(true);
  };

  const handleConfirmCheckOut = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await api.setUserOffline();
      setConfirmCheckOutOpen(false);
      notify(
        'Check Out registrado. Revisa tu hoja de horas y presiona Enviar cuando esté lista.',
        'success'
      );
      await refreshWorkspace();
      setTimesheetSubTab('current');
      setActiveTab('timesheet');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo hacer Check Out.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStartTask = async (task: TaskItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await api.startTask(task.type, task.id);
      setSelectedTask(task);
      notify(`Cronómetro iniciado en ${task.key || task.name || 'tarea'}.`, 'success');
      await refreshWorkspace();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo iniciar la tarea.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePauseTask = async (type: string, taskId: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await api.pauseTask(type, taskId);
      notify('Cronómetro de tarea pausado.', 'info');
      await refreshWorkspace();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo pausar la tarea.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await api.signOut();
    } finally {
      setActionBusy(false);
      setAuthenticated(false);
      setUser(null);
      setOpenTasks(null);
      setActiveTask(null);
      setTimesheetEntries([]);
      setExpiredEntries([]);
      setMonthData(null);
      setSelectedTask(null);
      setSessionMessage(null);
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center p-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-xs">
          Verificando sesión BT-Time...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <>
        <LoginView
          health={health}
          sessionMessage={sessionMessage}
          onSuccess={(loggedUser) => {
            setSessionMessage(null);
            setUser(loggedUser);
            setAuthenticated(true);
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  const activeTaskCount = hasActiveTask && isActiveTaskRunning ? 1 : 0;

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col lg:flex-row">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        openTasks={openTasks}
        selectedTaskId={selectedTask?.id}
        activeTaskId={hasActiveTask ? activeTaskId : undefined}
        pendingExpiredCount={pendingExpiredCount}
        loadingTasks={loadingData}
        onRefreshTasks={() => void refreshWorkspace()}
        onSelectTask={(t) => setSelectedTask(t)}
        onSignOut={() => void handleSignOut()}
      />

      <div className="flex-1 min-w-0 flex flex-col pb-20 lg:pb-8">
        <div className="lg:px-6 lg:pt-5">
          <HeaderBar
            user={user}
            userStatus={userStatus}
            shiftSeconds={shiftSeconds}
            actionBusy={actionBusy}
            onOnlineOrPause={() => void handleOnlineOrPause()}
            onRequestCheckOut={handleRequestCheckOut}
          />
        </div>

        {/* Mobile Sign Out shortcut when in Settings or quick access */}
        <main className="flex-1 px-4 pt-5 sm:px-6 space-y-5 max-w-7xl w-full mx-auto">
          {toast && (
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs sm:text-sm shadow-sm ${
                toast.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : toast.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-sky-200 bg-sky-50 text-sky-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {toast.tone === 'error' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                ) : toast.tone === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <BellRing className="h-4 w-4 shrink-0 text-[#1565C0]" aria-hidden="true" />
                )}
                <span className="font-medium">{toast.text}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.onAction?.();
                      setToast(null);
                    }}
                    className="rounded-md bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-900 border border-slate-200 hover:bg-white"
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  aria-label="Cerrar aviso"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              userStatus={userStatus}
              openTasks={openTasks}
              activeTask={activeTask}
              expiredTimesheets={expiredEntries}
              liveTaskSeconds={taskSeconds}
              selectedTask={selectedTask}
              loading={loadingData}
              actionBusy={actionBusy}
              onSelectTask={(t) => setSelectedTask(t)}
              onRefresh={() => void refreshWorkspace()}
              onCheckIn={handleCheckIn}
              onStartTask={handleStartTask}
              onPauseTask={handlePauseTask}
              onOpenComplete={(target) => setCompleteTarget(target)}
              onGoToExpired={() => {
                setTimesheetSubTab('expired');
                setActiveTab('timesheet');
              }}
            />
          )}

          {activeTab === 'timesheet' && (
            <TimesheetView
              entries={timesheetEntries}
              expiredEntries={expiredEntries}
              activeTaskCount={activeTaskCount}
              loading={loadingData}
              initialSubTab={timesheetSubTab}
              onRefreshAll={async () => {
                await refreshWorkspace();
                await loadMonthCalendar(calYear, calMonth);
              }}
              onOpenComplete={(target) => setCompleteTarget(target)}
              onNotify={(msg, tone) => notify(msg, tone)}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              year={calYear}
              month={calMonth}
              data={monthData}
              loading={loadingCalendar}
              onChangeMonth={(y, m) => {
                setCalYear(y);
                setCalMonth(m);
              }}
              onRefresh={() => void loadMonthCalendar(calYear, calMonth)}
            />
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <SettingsView
                settings={reminders}
                onChange={handleSaveReminders}
                onTestReminder={(kind) => triggerReminderNotification(kind)}
              />
              <div className="lg:hidden">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <CompleteTaskModal
        target={completeTarget}
        onClose={() => setCompleteTarget(null)}
        onCompleted={async () => {
          notify('Tarea finalizada correctamente.', 'success');
          await refreshWorkspace();
          await loadMonthCalendar(calYear, calMonth);
        }}
      />

      {confirmCheckOutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="checkout-confirm-title" className="font-display text-base font-bold text-slate-900">
              Confirmar Check Out
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Tu estado cambiará a <strong>Offline</strong> y se abrirá tu Hoja de Horas para que revises los tiempos reales y presiones <strong>Enviar</strong> cuando todas las entradas estén finalizadas.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setConfirmCheckOutOpen(false)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleConfirmCheckOut()}
                className="min-h-[44px] rounded-lg bg-[#EA580C] px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
              >
                Confirmar Check Out
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
