import React from 'react'
import { useStore } from '@tanstack/react-store'
import { Circle, Diamond, Square } from 'lucide-react'
import type { DragonColor } from '@/lib/types'
import { collectDragons, gameStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface DragonButtonProps {
  color: DragonColor
  onCollect?: () => void
  disabled?: boolean
}

export function DragonButton({ color, onCollect, disabled }: Readonly<DragonButtonProps>) {
  const dragons = useStore(gameStore, (state) => state.dragons[color])
  const columns = useStore(gameStore, (state) => state.columns)
  const freeCells = useStore(gameStore, (state) => state.freeCells)
  const status = useStore(gameStore, (state) => state.status)
  const devMode = useStore(gameStore, (state) => state.devMode)

  const isCollected = dragons === 1

  const canCollect = React.useMemo(() => {
    if (isCollected) return false
    if (status !== 'playing' && !devMode) return false

    const dragonIds = [0, 1, 2, 3].map(i => `dragon-${color}-${i}`)
    const locations: Array<{ type: 'col', index: number } | { type: 'free', index: number }> = []

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
      if (!foundInCol && !devMode) return false
    }

    if (locations.length !== 4 && !devMode) return false

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
      case 'green': return <Circle className="size-5 fill-current" />
      case 'red': return <Square className="size-5 fill-current" />
      case 'black': return <Diamond className="size-5 fill-current" />
    }
  }

  const getStyles = () => {
    const base = "w-16 h-12 rounded-md border-2 flex items-center justify-center transition-all duration-200 ease-out active:scale-95 active:brightness-90 disabled:pointer-events-auto disabled:cursor-not-allowed"

    if (disabled || isCollected || !canCollect) {
      return cn(base, "opacity-50")
    }

    if (color === 'green') return cn(base, "bg-emerald-500 border-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.6)] cursor-pointer hover:bg-emerald-400")
    if (color === 'red') return cn(base, "bg-red-600 border-red-700 text-white shadow-[0_0_15px_rgba(220,38,38,0.6)] cursor-pointer hover:bg-red-500")
    return cn(base, "bg-black border-black text-white shadow-[0_0_15px_rgba(0,0,0,0.6)] cursor-pointer hover:bg-gray-800")
  }

  return (
    <Button
      className={getStyles()}
      disabled={disabled || isCollected || !canCollect}
      onClick={onCollect ?? (() => collectDragons(color))}
    >
      {getIcon()}
    </Button>
  )
}
