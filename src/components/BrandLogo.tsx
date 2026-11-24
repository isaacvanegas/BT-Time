import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false }) => {
  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width={compact ? 28 : 34}
        height={compact ? 28 : 34}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
        <rect width="64" height="64" rx="14" fill="#0F2544" />
        <path
          d="M32 12C20.954 12 12 20.954 12 32C12 43.046 20.954 52 32 52C39.08 52 45.302 48.321 48.861 42.774C44.514 45.61 39.074 46.75 33.5 45.75C23.578 43.968 16.98 34.484 18.762 24.561C19.927 18.078 24.485 13.32 30.55 12.06C31.03 12.02 31.512 12 32 12Z"
          fill="#0284C7"
        />
        <circle cx="34.5" cy="32" r="11" stroke="#FFFFFF" strokeWidth="3" />
        <path
          d="M34.5 25.5V32L39.25 34.75"
          stroke="#38BDF8"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-display text-lg font-extrabold tracking-tight text-[#0F2544]">
        BT-Time
      </span>
    </div>
  );
};
