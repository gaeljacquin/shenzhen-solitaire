import React from 'react'
import { useStore } from '@tanstack/react-store'
import { gameStore, collectDragons } from '../lib/store'
import { DragonColor } from '../lib/types'
import { Cloud, Flame, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'

interface DragonButtonProps {
  color: DragonColor
}

export function DragonButton({ color }: DragonButtonProps) {
  const dragons = useStore(gameStore, (state) => state.dragons[color])
  const columns = useStore(gameStore, (state) => state.columns)
  const freeCells = useStore(gameStore, (state) => state.freeCells)
  const status = useStore(gameStore, (state) => state.status)
  const devMode = useStore(gameStore, (state) => state.devMode)

  const isCollected = dragons > 0

  const canCollect = React.useMemo(() => {
    if (isCollected) return false
    if (status !== 'playing' && !devMode) return false

    const dragonIds = [0, 1, 2, 3].map(i => `dragon-${color}-${i}`)
    const locations: ({ type: 'col', index: number } | { type: 'free', index: number })[] = []

    for (const id of dragonIds) {
      const freeIdx = freeCells.findIndex(c => c?.id === id)
      if (freeIdx !== -1) {
        locations.push({ type: 'free', index: freeIdx })
        continue
      }
      let foundInCol = false
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        if (col.length > 0 && col[col.length - 1].id === id) {
          locations.push({ type: 'col', index: i })
          foundInCol = true
          break
        }
      }
      if (!foundInCol) return false
    }

    if (locations.length !== 4) return false

    // Check for free cell availability
    let targetFreeIndex = -1
    for (const loc of locations) {
      if (loc.type === 'free') {
        targetFreeIndex = loc.index
        break
      }
    }
    if (targetFreeIndex === -1) {
      targetFreeIndex = freeCells.findIndex(c => c === null)
    }

    return targetFreeIndex !== -1
  }, [columns, freeCells, status, isCollected, color, devMode])

  const getIcon = () => {
    switch (color) {
      case 'green': return <Cloud className="size-5" />
      case 'red': return <Flame className="size-5" />
      case 'white': return <Sparkles className="size-5" />
    }
  }

  const getStyles = () => {
    const base = "w-16 h-12 rounded-md border-2 flex items-center justify-center transition-all duration-100 active:scale-95 active:brightness-90"

    if (isCollected) {
      return cn(base, "bg-slate-800 border-slate-700 text-slate-600 opacity-50 cursor-not-allowed")
    }

    if (!canCollect) {
      // Dimmed version of the color
      if (color === 'green') return cn(base, "bg-sky-900/30 border-sky-900/50 text-sky-700 cursor-not-allowed")
      if (color === 'red') return cn(base, "bg-red-900/30 border-red-900/50 text-red-700 cursor-not-allowed")
      if (color === 'white') return cn(base, "bg-orange-900/30 border-orange-900/50 text-orange-700 cursor-not-allowed")
    }

    // Active state
    if (color === 'green') return cn(base, "bg-sky-500 border-sky-600 text-white shadow-[0_0_15px_rgba(14,165,233,0.6)] cursor-pointer hover:bg-sky-400")
    if (color === 'red') return cn(base, "bg-red-600 border-red-700 text-white shadow-[0_0_15px_rgba(220,38,38,0.6)] cursor-pointer hover:bg-red-500")
    if (color === 'white') return cn(base, "bg-orange-500 border-orange-600 text-white shadow-[0_0_15px_rgba(249,115,22,0.6)] cursor-pointer hover:bg-orange-400")

    return base
  }

  return (
    <button
      className={getStyles()}
      disabled={isCollected || !canCollect}
      onClick={() => collectDragons(color)}
      title={isCollected ? 'Collected' : canCollect ? 'Collect Dragons' : 'Dragons not ready'}
    >
      {getIcon()}
    </button>
  )
}
