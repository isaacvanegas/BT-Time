import { Download, Share, X } from 'lucide-react';
import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#1565C0] font-medium text-white transition-colors hover:bg-[#0D47A1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap shrink-0 ${
          compact ? 'min-h-[40px] px-3 py-2 text-xs' : 'min-h-[44px] px-4 py-2.5 text-sm'
        }`}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        <span>Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap shrink-0 ${
            compact ? 'min-h-[40px] px-3 py-2 text-xs' : 'min-h-[44px] px-4 py-2.5 text-sm'
          }`}
        >
          <Share className="h-4 w-4 text-[#1565C0]" aria-hidden="true" />
          <span>Instalar en iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <h3 id="ios-install-title" className="text-base font-semibold text-slate-900">
                  Instalar en iPhone o iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Cerrar guía"
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-slate-600">
                <li>1. Toca el botón <strong>Compartir</strong> en la barra de Safari.</li>
                <li>2. Desliza hacia abajo y elige <strong>Agregar a inicio</strong>.</li>
                <li>3. Confirma tocando <strong>Agregar</strong> en la esquina superior.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-lg bg-[#0F2544] px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
