import { resetGame } from '../lib/store'
import { cn } from '../lib/utils'

interface ControlPanelProps {
  cardStyle?: 'filled' | 'outlined'
  onToggleStyle?: () => void
  onToggleGlow?: () => void
  isGlowEnabled?: boolean
}

export function ControlPanel({ cardStyle = 'filled', onToggleStyle, onToggleGlow, isGlowEnabled }: ControlPanelProps) {
  return (
    <div className="grid grid-cols-3 items-center w-full max-w-7xl px-4">
      {/* Left Group: Settings */}
      <div className="flex gap-2 justify-start">
        <button
          onClick={onToggleStyle}
          className={cn(
            "flex items-center gap-2 px-4 py-2 border rounded transition-colors font-semibold shadow-sm",
            cardStyle === 'filled'
              ? "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
              : "bg-slate-100 border-slate-300 text-slate-800 hover:bg-white"
          )}
        >
          <span>About</span>
        </button>

        <button
          onClick={onToggleStyle}
          className={cn(
            "flex items-center gap-2 px-4 py-2 border rounded transition-colors font-semibold shadow-sm",
            cardStyle === 'filled'
              ? "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
              : "bg-slate-100 border-slate-300 text-slate-800 hover:bg-white"
          )}
        >
          <span>Card Style: {cardStyle === 'filled' ? 'Filled' : 'Outlined'}</span>
        </button>

        <button
          onClick={onToggleGlow}
          className={cn(
            "flex items-center gap-2 px-4 py-2 border rounded transition-colors font-semibold shadow-sm",
            isGlowEnabled
              ? "bg-slate-700 border-slate-500 text-white shadow-[0_0_10px_rgba(255,255,255,0.2)]"
              : "bg-slate-800 border-slate-600 text-slate-500 hover:bg-slate-700"
          )}
        >
          <span>Dev: Glow</span>
        </button>
      </div>

      {/* Center: Timer */}
      <div className="flex justify-center">
        <div className="text-2xl font-mono font-bold text-slate-400 tracking-wider">
          00:00
        </div>
      </div>

      {/* Right Group: Game Actions */}
      <div className="flex gap-2 justify-end">
        <ControlButton label="Undo" />
        <ControlButton label="Restart" />
        <ControlButton label="Pause" />
        <ControlButton label="New Game" onClick={resetGame} />
      </div>
    </div>
  )
}

function ControlButton({ label, onClick }: { label: string, onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-6 py-2 bg-slate-800 border border-slate-600 rounded text-slate-300 font-semibold
      hover:bg-slate-700
      active:bg-slate-950 active:border-slate-800 active:translate-y-0.5 active:shadow-inner
      transition-all shadow-sm">
      {label}
    </button>
  )
}
