import { useStore } from '@tanstack/react-store'
import { gameStore, undo, restartGame, pauseGame, resumeGame, newGame, toggleDevMode } from '../lib/store'
import { cn } from '../lib/utils'

interface ControlPanelProps {
  cardStyle?: 'filled' | 'outlined'
  onToggleStyle?: () => void
  onToggleGlow?: () => void
  isGlowEnabled?: boolean
}

export function ControlPanel({ cardStyle = 'filled', onToggleStyle, onToggleGlow, isGlowEnabled }: ControlPanelProps) {
  const status = useStore(gameStore, (state) => state.status)
  const history = useStore(gameStore, (state) => state.history)
  const devMode = useStore(gameStore, (state) => state.devMode)

  const handleRestart = () => {
    if (status === 'playing' || status === 'paused') {
      if (window.confirm('Are you sure you want to restart the game?')) {
        restartGame()
      }
    } else {
      restartGame()
    }
  }

  const handleNewGame = () => {
    if (status === 'playing' || status === 'paused') {
      if (window.confirm('Are you sure you want to start a new game?')) {
        newGame()
      }
    } else {
      newGame()
    }
  }

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

        <button
          onClick={toggleDevMode}
          className={cn(
            "flex items-center gap-2 px-4 py-2 border rounded transition-colors font-semibold shadow-sm",
            devMode
              ? "bg-red-900/50 border-red-500 text-red-200 shadow-[0_0_10px_rgba(220,38,38,0.2)]"
              : "bg-slate-800 border-slate-600 text-slate-500 hover:bg-slate-700"
          )}
        >
          <span>Dev: Move Any</span>
        </button>
      </div>

      {/* Center: Timer (Placeholder for now) */}
      <div className="flex justify-center">
        <div className="text-2xl font-mono font-bold text-slate-400 tracking-wider">
          {status === 'paused' ? 'PAUSED' : status === 'won' ? 'VICTORY' : '00:00'}
        </div>
      </div>

      {/* Right Group: Game Actions */}
      <div className="flex gap-2 justify-end">
        <ControlButton
          label="Undo"
          onClick={undo}
          disabled={history.length === 0 || status !== 'playing'}
        />
        <ControlButton
          label="Restart"
          onClick={handleRestart}
          disabled={status === 'idle'}
        />
        <ControlButton
          label={status === 'paused' ? 'Resume' : 'Pause'}
          onClick={status === 'paused' ? resumeGame : pauseGame}
          disabled={status === 'idle' || status === 'won'}
        />
        <ControlButton
          label="New Game"
          onClick={handleNewGame}
        />
      </div>
    </div>
  )
}

function ControlButton({ label, onClick, disabled }: { label: string, onClick?: () => void, disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-6 py-2 border rounded font-semibold transition-all shadow-sm",
        disabled
          ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
          : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 active:bg-slate-950 active:border-slate-800 active:translate-y-0.5 active:shadow-inner"
      )}
    >
      {label}
    </button>
  )
}
