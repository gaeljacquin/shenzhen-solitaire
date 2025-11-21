import { useEffect, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { gameStore, undo, restartGame, pauseGame, resumeGame, newGame, toggleDevMode, updateTimer, toggleTimerVisibility } from '../lib/store'
import { cn } from '../lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from './ui/dialog'
import { Button } from './ui/button'
import { TimerIcon, TimerOffIcon } from 'lucide-react'

interface ControlPanelProps {
  onToggleGlow?: () => void
  isGlowEnabled?: boolean
}

export function ControlPanel({ onToggleGlow, isGlowEnabled }: ControlPanelProps) {
  const status = useStore(gameStore, (state) => state.status)
  const history = useStore(gameStore, (state) => state.history)
  const devMode = useStore(gameStore, (state) => state.devMode)
  const startTime = useStore(gameStore, (state) => state.startTime)
  const timerRunning = useStore(gameStore, (state) => state.timerRunning)
  const elapsedTime = useStore(gameStore, (state) => state.elapsedTime)
  const isTimerVisible = useStore(gameStore, (state) => state.isTimerVisible)

  const [displayTime, setDisplayTime] = useState("00:00")

  useEffect(() => {
    let interval: NodeJS.Timeout

    if (timerRunning && startTime !== null) {
      interval = setInterval(() => {
        const now = Date.now()
        const elapsed = now - startTime
        updateTimer(elapsed)
      }, 1000)
    }

    return () => clearInterval(interval)
  }, [timerRunning, startTime])

  // Format time from store's elapsedTime
  useEffect(() => {
    const totalSeconds = Math.floor(elapsedTime / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    setDisplayTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
  }, [elapsedTime])

  const isDevEnv = import.meta.env.DEV

  return (
    <div className="flex flex-col items-center w-full max-w-7xl px-4 gap-2 mt-4">

      {/* 1. Timer / Status (Visible to all) */}
      <div className={cn("flex justify-center transition-opacity duration-300", isTimerVisible ? "opacity-100" : "opacity-0")}>
        <div className="text-3xl font-mono font-bold text-white tracking-wider drop-shadow-md flex gap-2 h-9">
          {status === 'paused' ? 'PAUSED' : status === 'won' ? `VICTORY - ${displayTime}` : displayTime}
        </div>
      </div>

      {/* 2. Main Controls */}
      <div className="flex gap-4 justify-center flex-wrap items-center">
        <Button
          variant="outline"
          className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200"
          onClick={undo}
          disabled={history.length === 0 || status !== 'playing'}
        >
          Undo
        </Button>

        <Button
          variant="outline"
          className={cn(
            "border-slate-300 transition-colors",
            status === 'paused'
              ? "bg-amber-500 text-white hover:bg-amber-600 border-amber-600"
              : "bg-slate-100 text-slate-900 hover:bg-slate-200"
          )}
          onClick={status === 'paused' ? resumeGame : pauseGame}
          disabled={status === 'idle' || status === 'won'}
        >
          Pause
        </Button>

        <Button
          variant="outline"
          size="icon"
          className={cn(
            "border-slate-300 transition-colors",
            !isTimerVisible
              ? "bg-slate-300 text-slate-600 hover:bg-slate-400"
              : "bg-slate-100 text-slate-900 hover:bg-slate-200"
          )}
          onClick={toggleTimerVisibility}
          title={isTimerVisible ? "Hide Timer" : "Show Timer"}
        >
          {isTimerVisible ? <TimerIcon className="size-4" /> : <TimerOffIcon className="size-4" />}
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200">
              Restart
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#FDF6E3] text-slate-900 border-slate-400">
            <DialogHeader>
              <DialogTitle>Restart Game?</DialogTitle>
              <DialogDescription className="text-slate-700">
                Are you sure you want to restart the current game? All progress will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" className="border-slate-400 text-slate-900">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => restartGame()} className="bg-slate-800 hover:bg-slate-900 text-white">Restart</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200">
              New Game
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#FDF6E3] text-slate-900 border-slate-400">
            <DialogHeader>
              <DialogTitle>Start New Game?</DialogTitle>
              <DialogDescription className="text-slate-700">
                Are you sure you want to start a new game? Current progress will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" className="border-slate-400 text-slate-900">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => newGame()} className="bg-slate-800 hover:bg-slate-900 text-white">New Game</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200">
              Instructions
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#FDF6E3] text-slate-900 border-slate-400 max-w-2xl">
            <DialogHeader>
              <DialogTitle>How to Play Shenzhen Solitaire</DialogTitle>
              <DialogDescription className="text-slate-700">
                A variant of Solitaire inspired by Shenzhen I/O.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p><strong>Goal:</strong> Move all cards to the foundations (top right) and collect all dragons.</p>

              <h3 className="font-bold">The Board</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Tableau (Center):</strong> Build down stacks of alternating colors. You can move partial stacks if they are ordered.</li>
                <li><strong>Free Cells (Top Left):</strong> Can hold one card each.</li>
                <li><strong>Foundations (Top Right):</strong> Build up from 1 to 9 for each color (Green, Red, Black).</li>
                <li><strong>Flower:</strong> Has its own foundation slot.</li>
              </ul>

              <h3 className="font-bold">Dragons</h3>
              <p>There are 4 dragons of each color (Green, Red, Yellow). You cannot move them to foundations. Instead, if you have all 4 dragons of a color exposed (top of a column or in a free cell), you can collect them to a free cell, locking it.</p>

              <h3 className="font-bold">Controls</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Drag & Drop:</strong> Move cards.</li>
                <li><strong>Double Click:</strong> Auto-move to foundation or free cell.</li>
                <li><strong>Dragon Buttons:</strong> Click to collect dragons when available.</li>
              </ul>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200">
              About
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#FDF6E3] text-slate-900 border-slate-400">
            <DialogHeader>
              <DialogTitle>About</DialogTitle>
            </DialogHeader>
            <div className="text-sm space-y-2">
              <p><a href="http://store.steampowered.com/app/504210/" target="_blank" rel="noopener noreferrer" className="underline text-slate-800 hover:text-slate-600">SHENZHEN SOLITAIRE</a> originally created by Zachtronics.</p>
              <p>Adapted by <a href="https://linktr.ee/gaeljacquin" target="_blank" rel="noopener noreferrer" className="underline text-slate-800 hover:text-slate-600">Gaël Jacquin</a>. GitHub repo <a href="https://github.com/gaeljacquin/shenzhen-solitaire" target="_blank" rel="noopener noreferrer" className="underline text-slate-800 hover:text-slate-600">here</a>.</p>
              <p>This is not affiliated with Zachtronics or SHENZHEN I/O.</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 3. Dev Section (Visible only in Dev Environment) */}
      {isDevEnv && (
        <div className="flex flex-col items-center gap-2 p-4 border-t border-white/10 w-full mt-4">
          <div className="text-xs uppercase tracking-widest text-white/50 font-semibold">Dev Toggles</div>
          <div className="flex gap-2">
            <button
              onClick={onToggleGlow}
              className={cn(
                "flex items-center gap-2 px-4 py-2 border rounded transition-colors font-semibold shadow-sm h-9 text-sm",
                isGlowEnabled
                  ? "bg-emerald-600 border-emerald-500 text-white shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                  : "bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200"
              )}
            >
              <span>Glow</span>
            </button>

            <button
              onClick={toggleDevMode}
              className={cn(
                "flex items-center gap-2 px-4 py-2 border rounded transition-colors font-semibold shadow-sm h-9 text-sm",
                devMode
                  ? "bg-red-900/50 border-red-500 text-red-200 shadow-[0_0_10px_rgba(220,38,38,0.2)]"
                  : "bg-emerald-800 border-emerald-600 text-emerald-500 hover:bg-emerald-700"
              )}
            >
              <span>Move Any</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
