import { LogIn, LogOut, Pause, Timer } from 'lucide-react';
import React from 'react';
import type { UserInfo, UserStatusCode } from '../../shared/types';
import { formatSecondsHMS } from '../lib/timeFormat';
import { BrandLogo } from './BrandLogo';

interface HeaderBarProps {
  user: UserInfo | null;
  userStatus: UserStatusCode;
  shiftSeconds: number;
  actionBusy: boolean;
  onOnlineOrPause: () => void;
  onRequestCheckOut: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  user,
  userStatus,
  shiftSeconds,
  actionBusy,
  onOnlineOrPause,
  onRequestCheckOut,
}) => {
  const statusUpper = String(userStatus || 'OFFLINE').toUpperCase();
  const isOnline = statusUpper === 'ONLINE';
  const isPause = statusUpper === 'PAUSE';

  const displayName =
    user?.fullName ||
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.username ||
    'Usuario';
  const displayEmail = user?.email || user?.username || '';

  const statusLabel = isOnline ? 'Online' : isPause ? 'En Pausa' : 'Offline';
  const statusColorClass = isOnline
    ? 'bg-[#16A34A] text-white'
    : isPause
      ? 'bg-amber-500 text-white'
      : 'bg-[#EA580C] text-white';

  return (
    <>
      {/* Mobile Compact Sticky Header (< lg) - strictly <= 56px */}
      <header className="lg:hidden sticky top-0 z-30 h-14 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md flex items-center justify-between gap-2">
        <BrandLogo compact />

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-xs font-bold text-slate-800 tabular-nums">
            {formatSecondsHMS(shiftSeconds)}
          </span>
          <button
            type="button"
            disabled={actionBusy}
            onClick={onOnlineOrPause}
            className={`min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
              isOnline ? 'bg-amber-400 text-slate-950' : 'bg-[#16A34A] text-white'
            }`}
          >
            {isOnline ? 'Pausar' : 'Check In'}
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={onRequestCheckOut}
            aria-label="Check Out"
            className="min-h-[36px] rounded-lg bg-[#EA580C] px-2.5 py-1 text-xs font-semibold text-white whitespace-nowrap"
          >
            Out
          </button>
        </div>
      </header>

      {/* Desktop Header Cards (>= lg) */}
      <header className="hidden lg:grid lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 border-b-2 border-b-[#1565C0] bg-white px-6 py-4 flex flex-col justify-center">
          <p className="font-display text-xl font-bold text-slate-900 truncate text-right">
            {displayName}
          </p>
          {displayEmail && (
            <p className="mt-0.5 text-sm text-slate-500 truncate text-right">
              {displayEmail}
            </p>
          )}
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-slate-200 border-b-2 border-b-[#1565C0] bg-white px-6 py-4 flex items-center justify-between gap-4">
          <div className="space-y-2.5">
            <p className="text-sm font-medium text-slate-500">Estado Actual:</p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={actionBusy}
                onClick={onOnlineOrPause}
                className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-5 py-2 text-xs font-bold transition-colors disabled:opacity-60 whitespace-nowrap ${
                  isOnline
                    ? 'bg-amber-400 text-slate-950 hover:bg-amber-500'
                    : 'bg-[#16A34A] text-white hover:bg-emerald-700'
                }`}
              >
                {isOnline ? (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Pausar</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Check In</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={actionBusy}
                onClick={onRequestCheckOut}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#EA580C] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-orange-700 disabled:opacity-60 whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Check Out</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col items-end justify-between gap-2.5 shrink-0">
            <span
              className={`inline-flex min-w-[140px] items-center justify-center rounded-lg px-4 py-1.5 text-xs font-bold ${statusColorClass}`}
            >
              {statusLabel}
            </span>
            <div className="flex items-center gap-2 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              <Timer className="h-5 w-5 text-[#1565C0]" aria-hidden="true" />
              <span>{formatSecondsHMS(shiftSeconds)}</span>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
