import { useEffect, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { gameStore, newGame, newGameNoAutoMoveFirstMove, pauseGame, restartGame, resumeGame, setNoAutoMoveFirstMove, setTimerVisibility, setUndoEnabled, syncNoAutoMoveFirstMove, syncTimerVisibility, syncUndoEnabled, toggleDevMode, undo, updateTimer } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type ControlPanelProps = {
  onUndo?: () => void
  isInputLocked?: boolean
}

function getTimerLabel(status: string, isTimerVisible: boolean, displayTime: string) {
  if (status === 'paused') return 'PAUSED'
  if (status === 'won') return isTimerVisible ? `VICTORY - ${displayTime}` : 'VICTORY'
  return displayTime
}

export function ControlPanel({ onUndo, isInputLocked = false }: ControlPanelProps = {}) {
  const status = useStore(gameStore, (state) => state.status)
  const history = useStore(gameStore, (state) => state.history)
  const devMode = useStore(gameStore, (state) => state.devMode)
  const startTime = useStore(gameStore, (state) => state.startTime)
  const timerRunning = useStore(gameStore, (state) => state.timerRunning)
  const elapsedTime = useStore(gameStore, (state) => state.elapsedTime)
  const isTimerVisible = useStore(gameStore, (state) => state.isTimerVisible)
  const isUndoEnabled = useStore(gameStore, (state) => state.isUndoEnabled)
  const isNoAutoMoveFirstMove = useStore(gameStore, (state) => state.isNoAutoMoveFirstMove)

  const [displayTime, setDisplayTime] = useState("00:00")
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [draftTimerVisible, setDraftTimerVisible] = useState(isTimerVisible)
  const [initialTimerVisible, setInitialTimerVisible] = useState(isTimerVisible)
  const [draftUndoEnabled, setDraftUndoEnabled] = useState(isUndoEnabled)
  const [initialUndoEnabled, setInitialUndoEnabled] = useState(isUndoEnabled)
  const [draftNoAutoMoveFirstMove, setDraftNoAutoMoveFirstMove] = useState(isNoAutoMoveFirstMove)
  const [initialNoAutoMoveFirstMove, setInitialNoAutoMoveFirstMove] = useState(isNoAutoMoveFirstMove)

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
    syncUndoEnabled()
    syncNoAutoMoveFirstMove()
  }, [])

  useEffect(() => {
    const totalSeconds = Math.floor(elapsedTime / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    setDisplayTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
  }, [elapsedTime])

  useEffect(() => {
    if (!optionsOpen) return
    setDraftTimerVisible(isTimerVisible)
    setInitialTimerVisible(isTimerVisible)
    setDraftUndoEnabled(isUndoEnabled)
    setInitialUndoEnabled(isUndoEnabled)
    setDraftNoAutoMoveFirstMove(isNoAutoMoveFirstMove)
    setInitialNoAutoMoveFirstMove(isNoAutoMoveFirstMove)
  }, [optionsOpen, isTimerVisible, isUndoEnabled, isNoAutoMoveFirstMove])

  const isDevEnv = import.meta.env.DEV
  const optionsRequiringRestart = new Set(['undo-moves'])
  const isGameInProgress = status === 'playing' || status === 'paused'
  const timerChanged = draftTimerVisible !== initialTimerVisible
  const undoChanged = draftUndoEnabled !== initialUndoEnabled
  const noAutoMoveChanged = draftNoAutoMoveFirstMove !== initialNoAutoMoveFirstMove
  const hasOptionChanges = timerChanged || undoChanged || noAutoMoveChanged
  const needsRestart = isGameInProgress && undoChanged && optionsRequiringRestart.has('undo-moves')
  const saveLabel = needsRestart ? 'Save (with restart)' : 'Save'
  const hasManualMoves = history.some(entry => !entry.isAuto)
  const areYouSureText = 'Are you sure? All progress made will be lost.'
  const timerOpacityClass =
    status === 'paused' || status === 'won' || isTimerVisible ? 'opacity-100' : 'opacity-0'
  const timerLabel = getTimerLabel(status, isTimerVisible, displayTime)

  const renderOptionLabel = (label: string, optionId: string, isChanged: boolean) => (
    <span className={cn(isChanged ? 'italic' : 'not-italic')}>
      {label}
      {optionsRequiringRestart.has(optionId) && <span className="font-bold">*</span>}
    </span>
  )

  const handleOptionsOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOptionsOpen(true)
      return
    }

    if (hasOptionChanges) {
      setConfirmOpen(true)
      return
    }

    setOptionsOpen(false)
  }

  const handleCancelOptions = () => {
    if (hasOptionChanges) {
      setConfirmOpen(true)
      return
    }

    setOptionsOpen(false)
  }

  const handleSaveOptions = () => {
    if (hasOptionChanges) {
      if (timerChanged) {
        setTimerVisibility(draftTimerVisible)
      }
      if (undoChanged) {
        setUndoEnabled(draftUndoEnabled)
      }
      if (noAutoMoveChanged) {
        setNoAutoMoveFirstMove(draftNoAutoMoveFirstMove)
      }
    }

    setConfirmOpen(false)
    setOptionsOpen(false)

    if (needsRestart) {
      restartGame()
    }
  }

  const handleDiscardChanges = () => {
    setConfirmOpen(false)
    setOptionsOpen(false)
  }

  return (
    <div className="flex flex-col items-center w-full max-w-7xl px-4 gap-2 mt-4">

      <div className="flex justify-center transition-opacity duration-300">
        <div className={cn(
          "text-3xl font-mono font-bold text-white tracking-wider drop-shadow-md flex gap-2 h-9",
          timerOpacityClass,
        )}>
          {timerLabel}
        </div>
      </div>

      <div className="flex gap-4 justify-center flex-wrap items-center">
        <Button
          variant="outline"
          className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer"
          onClick={onUndo ?? undo}
          disabled={isInputLocked || history.length === 0 || status !== 'playing' || !isUndoEnabled}
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
          disabled={isInputLocked || status === 'idle' || status === 'won'}
        >
          Pause
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer"
              disabled={isInputLocked || status === 'won' || !hasManualMoves}
            >
              Restart
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#FDF6E3] text-slate-900 border-slate-400">
            <DialogHeader>
              <DialogTitle>Restart</DialogTitle>
              <DialogDescription className="text-slate-700">
                {areYouSureText}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" className="border-slate-400 text-slate-900 cursor-pointer">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => restartGame()} className="bg-slate-800 hover:bg-slate-900 text-white cursor-pointer" disabled={isInputLocked}>Restart</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {status === 'won' ? (
          <Button
            variant="outline"
            className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer"
            onClick={() => newGame()}
            disabled={isInputLocked}
          >
            New Game
          </Button>
        ) : (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer" disabled={isInputLocked}>
                New Game
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#FDF6E3] text-slate-900 border-slate-400">
              <DialogHeader>
                <DialogTitle>New Game</DialogTitle>
                <DialogDescription className="text-slate-700">
                  {areYouSureText}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                <Button variant="outline" className="border-slate-400 text-slate-900 cursor-pointer">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => newGame()} className="bg-slate-800 hover:bg-slate-900 text-white cursor-pointer" disabled={isInputLocked}>New Game</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer" disabled={isInputLocked}>
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

        <Dialog open={optionsOpen} onOpenChange={handleOptionsOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer" disabled={isInputLocked}>
              Options
            </Button>
          </DialogTrigger>
          <DialogContent
            className="bg-[#FDF6E3] text-slate-900 border-slate-400 max-w-2xl p-8 flex flex-col gap-12"
            showCloseButton={false}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="text-2xl">Options</DialogTitle>
              <DialogDescription className="text-slate-700 text-sm">
                <span>Changes marked with <span className="font-bold">*</span> require restarting an ongoing game.</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <label
                htmlFor="timer-visibility"
                className="flex w-full cursor-pointer items-center justify-between gap-6 rounded-lg border border-slate-300 bg-white/80 p-4 text-lg font-semibold"
              >
                {renderOptionLabel('Timer', 'timer', timerChanged)}
                <input
                  id="timer-visibility"
                  type="checkbox"
                  className="h-7 w-7 accent-slate-900"
                  checked={draftTimerVisible}
                  disabled={isInputLocked}
                  onChange={(event) => setDraftTimerVisible(event.target.checked)}
                />
              </label>
              <label
                htmlFor="undo-enabled"
                className="flex w-full cursor-pointer items-center justify-between gap-6 rounded-lg border border-slate-300 bg-white/80 p-4 text-lg font-semibold"
              >
                {renderOptionLabel('Undo moves', 'undo-moves', undoChanged)}
                <input
                  id="undo-enabled"
                  type="checkbox"
                  className="h-7 w-7 accent-slate-900"
                  checked={draftUndoEnabled}
                  disabled={isInputLocked}
                  onChange={(event) => setDraftUndoEnabled(event.target.checked)}
                />
              </label>
              <label
                htmlFor="no-auto-move-first-move"
                className="flex w-full cursor-pointer items-center justify-between gap-6 rounded-lg border border-slate-300 bg-white/80 p-4 text-lg font-semibold"
              >
                {renderOptionLabel('No 1s or Flower Card on deal', 'no-auto-move-first-move', noAutoMoveChanged)}
                <input
                  id="no-auto-move-first-move"
                  type="checkbox"
                  className="h-7 w-7 accent-slate-900"
                  checked={draftNoAutoMoveFirstMove}
                  disabled={isInputLocked}
                  onChange={(event) => setDraftNoAutoMoveFirstMove(event.target.checked)}
                />
              </label>
            </div>
            <DialogFooter className="gap-3 w-full sm:justify-between">
              <Button
                variant="outline"
                className="h-12 border-slate-400 px-6 text-base text-slate-900 cursor-pointer"
                onClick={handleCancelOptions}
                disabled={isInputLocked}
              >
                Cancel
              </Button>
              <Button
                className="h-12 bg-slate-800 px-6 text-base text-white hover:bg-slate-900 cursor-pointer"
                onClick={handleSaveOptions}
                disabled={isInputLocked || !hasOptionChanges}
              >
                {saveLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent
            className="bg-[#FDF6E3] text-slate-900 border-slate-400 max-w-xl p-8"
            showCloseButton={false}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="text-xl">Discard changes?</DialogTitle>
              <DialogDescription className="text-base text-slate-700">
                You have unsaved changes. Discard them or keep editing.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3">
              <Button
                variant="outline"
                className="h-12 border-slate-400 px-6 text-base text-slate-900 cursor-pointer"
                onClick={() => setConfirmOpen(false)}
                disabled={isInputLocked}
              >
                Keep Editing
              </Button>
              <Button
                className="h-12 bg-slate-800 px-6 text-base text-white hover:bg-slate-900 cursor-pointer"
                onClick={handleDiscardChanges}
                disabled={isInputLocked}
              >
                Discard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer" disabled={isInputLocked}>
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
          <div className="text-xs uppercase tracking-widest text-white/50 font-semibold">Dev Tools</div>
          <div className="flex gap-4">
            <Button
              variant="outline"
              className={
                cn(devMode
                  ? "bg-slate-900/50 border-slate-500 text-white shadow-[0_0_10px_rgba(220,38,38,0.2)] hover:bg-slate-900 hover:border-slate-600 hover:text-white"
                  : "bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200",
                  "cursor-pointer",
                )
              }
              onClick={toggleDevMode}
              disabled={isInputLocked}
            >
              All tableau moves are valid
            </Button>
            <Button
              variant="outline"
              className="bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200 cursor-pointer"
              onClick={newGameNoAutoMoveFirstMove}
              disabled={isInputLocked}
            >
              New game w/o first move auto-moves
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
