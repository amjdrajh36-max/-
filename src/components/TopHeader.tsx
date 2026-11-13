import { Volume2, VolumeX, LogOut } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface TopHeaderProps {
  inSession: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenRules: () => void;
  onScrollToRoles?: () => void;
  onLeaveSession?: () => void;
}

export function TopHeader({
  inSession,
  muted,
  onToggleMute,
  onOpenRules,
  onScrollToRoles,
  onLeaveSession,
}: TopHeaderProps) {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <span className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-amber-400 whitespace-nowrap shrink-0">
          لعبة المافيا
        </span>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="flex items-center gap-5 sm:gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={onOpenRules}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 min-h-[44px] flex items-center"
          >
            القواعد
          </button>
          {!inSession && onScrollToRoles && (
            <button
              type="button"
              onClick={onScrollToRoles}
              className="hidden sm:flex hover:text-white transition-colors whitespace-nowrap shrink-0 min-h-[44px] items-center"
            >
              الأدوار (15)
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMute}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 min-h-[44px] flex items-center gap-1.5"
            aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          >
            {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            <span className="hidden sm:inline">{muted ? 'صامت' : 'الصوت'}</span>
          </button>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="shrink-0">
          {inSession && onLeaveSession ? (
            <button
              type="button"
              onClick={onLeaveSession}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-white/5 hover:bg-red-500/15 hover:text-red-300 border border-white/10 text-xs font-bold text-slate-200 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" />
              <span>خروج</span>
            </button>
          ) : (
            <PWAInstallButton variant="header" />
          )}
        </div>
      </div>
    </header>
  );
}
