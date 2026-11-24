import { WifiOff } from 'lucide-react';
import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 shadow-lg"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <span>Sin conexión — algunas acciones requieren acceso a Internet.</span>
    </div>
  );
};
