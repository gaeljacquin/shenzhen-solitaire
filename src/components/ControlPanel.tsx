import { useEffect, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { gameStore, undo, restartGame, pauseGame, resumeGame, newGame, toggleDevMode, updateTimer, toggleTimerVisibility, syncTimerVisibility } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TimerIcon, TimerOffIcon } from 'lucide-react'

export function ControlPanel() {
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

  useEffect(() => {
    syncTimerVisibility()
  }, [])

  useEffect(() => {
    const totalSeconds = Math.floor(elapsedTime / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    setDisplayTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
  }, [elapsedTime])

  const isDevEnv = import.meta.env.DEV

  return (
    <div className="flex flex-col items-center w-full max-w-7xl px-4 gap-2 mt-4">

      <div className="flex justify-center transition-opacity duration-300">
        <div className={cn(
          "text-3xl font-mono font-bold text-white tracking-wider drop-shadow-md flex gap-2 h-9",
          status === 'paused' || status === 'won' ? "opacity-100" : (isTimerVisible ? "opacity-100" : "opacity-0")
        )}>
          {status === 'paused' ? 'PAUSED' : status === 'won' ? `VICTORY - ${displayTime}` : displayTime}
        </div>
      </div>

      <div className="flex gap-4 justify-center flex-wrap items-center">
        <Button
          variant="outline"
          className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer"
          onClick={undo}
          disabled={history.length === 0 || status !== 'playing'}
        >
          Undo
        </Button>

        <Button
          variant="outline"
          className={cn(
            "border-slate-300 transition-colors cursor-pointer",
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
            "border-slate-300 transition-colors cursor-pointer",
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
            <Button
              variant="outline"
              className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer"
              disabled={status === 'won'}
            >
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
                <Button variant="outline" className="border-slate-400 text-slate-900 cursor-pointer">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => restartGame()} className="bg-slate-800 hover:bg-slate-900 text-white cursor-pointer">Restart</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {status === 'won' ? (
          <Button
            variant="outline"
            className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer"
            onClick={() => newGame()}
          >
            New Game
          </Button>
        ) : (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer">
                New Game
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#FDF6E3] text-slate-900 border-slate-400">
              <DialogHeader>
                <DialogTitle>Start New Game?</DialogTitle>
                <DialogDescription className="text-slate-700">
                  Are you sure you want to start a new game? All progress will be lost.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="border-slate-400 text-slate-900 cursor-pointer">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={() => newGame()} className="bg-slate-800 hover:bg-slate-900 text-white cursor-pointer">New Game</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer">
              Instructions
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#FDF6E3] text-slate-900 border-slate-400 max-w-2xl">
            <DialogHeader>
              <DialogTitle>How to Play Shenzhen Solitaire</DialogTitle>
              <DialogDescription className="text-slate-700 hidden">
                N/A
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p>To win, stack the three suits from 1 to 9 in the foundation (top-right).</p>
              <p>Stack cards in the tableau (center) in descending order, alternating colors.</p>
              <p>The free cells in the top-left can store one card of any type.</p>
              <p>When four matching dragon cards (circle, square, diamond) are exposed, they can be moved to a free cell by pushing their corresponding button.</p>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer">
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
            <Button
              variant="outline"
              className={cn(devMode ? "bg-slate-900/50 border-slate-500 text-white shadow-[0_0_10px_rgba(220,38,38,0.2)]" : "bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200")}
              onClick={toggleDevMode}
            >
              Move Any
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
