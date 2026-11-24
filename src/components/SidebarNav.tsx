import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
} from 'lucide-react';
import React, { useState } from 'react';
import type { OpenTasksResponse, TaskItem } from '../../shared/types';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

export type NavTab = 'dashboard' | 'timesheet' | 'calendar' | 'settings';

interface SidebarNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  openTasks: OpenTasksResponse | null;
  selectedTaskId?: string;
  activeTaskId?: string;
  pendingExpiredCount: number;
  loadingTasks: boolean;
  onRefreshTasks: () => void;
  onSelectTask: (task: TaskItem) => void;
  onSignOut: () => void;
}

const SIDEBAR_GROUPS: Array<{
  key: 'dueTasks' | 'currentTasks' | 'weekTasks' | 'bugs';
  label: string;
}> = [
  { key: 'dueTasks', label: 'Vencidas' },
  { key: 'currentTasks', label: 'Hoy' },
  { key: 'weekTasks', label: 'Resto de la Semana' },
  { key: 'bugs', label: 'Incidencias' },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  openTasks,
  selectedTaskId,
  activeTaskId,
  pendingExpiredCount,
  loadingTasks,
  onRefreshTasks,
  onSelectTask,
  onSignOut,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    dueTasks: true,
    currentTasks: true,
    weekTasks: true,
    bugs: false,
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> },
    {
      id: 'timesheet',
      label: 'Hoja de Horas',
      icon: <Clock className="h-4 w-4" aria-hidden="true" />,
      badge: pendingExpiredCount > 0 ? pendingExpiredCount : undefined,
    },
    { id: 'calendar', label: 'Calendario', icon: <Calendar className="h-4 w-4" aria-hidden="true" /> },
    { id: 'settings', label: 'Ajustes', icon: <Settings className="h-4 w-4" aria-hidden="true" /> },
  ];

  return (
    <>
      {/* Desktop Sidebar (>= lg) */}
      <aside className="hidden lg:flex lg:w-72 lg:shrink-0 lg:flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5 border-b border-slate-100">
          <BrandLogo />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-7">
          <div>
            <p className="px-2 text-[11px] font-bold tracking-wider uppercase text-slate-400">
              Menú
            </p>
            <nav className="mt-2 space-y-1" aria-label="Navegación principal">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={`w-full min-h-[42px] flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-sky-50 text-[#1565C0] font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && (
                      <span className="font-mono text-xs font-bold text-amber-700">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={onSignOut}
                className="w-full min-h-[42px] flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors whitespace-nowrap"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Cerrar Sesión</span>
              </button>
            </nav>
          </div>

          <div>
            <div className="flex items-center justify-between px-2">
              <p className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                Asignaciones
              </p>
              <button
                type="button"
                onClick={onRefreshTasks}
                disabled={loadingTasks}
                aria-label="Refrescar asignaciones"
                className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-[#1565C0] hover:bg-sky-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loadingTasks ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="mt-2 space-y-2">
              {SIDEBAR_GROUPS.map((group) => {
                const list = Array.isArray(openTasks?.[group.key])
                  ? (openTasks?.[group.key] as TaskItem[])
                  : [];
                const isExpanded = Boolean(expandedGroups[group.key]);

                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="w-full min-h-[36px] flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-[#1565C0]" aria-hidden="true" />
                        <span className="truncate">{group.label}</span>
                        <span className="font-mono text-[11px] font-normal text-slate-400">
                          {list.length}
                        </span>
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                    </button>

                    {isExpanded && list.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-4">
                        {list.map((task) => {
                          const isSelected = selectedTaskId === task.id;
                          const isRunning = activeTaskId === task.id;
                          return (
                            <li key={`${group.key}-${task.type}-${task.id}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectTask(task);
                                  onSelectTab('dashboard');
                                }}
                                className={`w-full min-h-[34px] flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                                  isSelected
                                    ? 'bg-sky-50 font-semibold text-[#1565C0]'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                    isRunning
                                      ? 'bg-[#16A34A]'
                                      : isSelected
                                        ? 'bg-[#1565C0]'
                                        : 'bg-slate-300'
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="truncate">
                                  {task.key ? `${task.key} · ` : ''}
                                  {task.name || task.title}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 p-4">
          <PWAInstallButton compact />
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar (< lg) - strictly 56px height + safe area */}
      <nav
        aria-label="Navegación móvil"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-4 h-14">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-[#1565C0] font-semibold' : 'text-slate-500'
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {item.badge !== undefined && (
                    <span className="absolute -right-2.5 -top-1 font-mono text-[10px] font-bold text-amber-700">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-[72px]">{item.label === 'Hoja de Horas' ? 'Horas' : item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
