import React from 'react'
import { useStore } from '@tanstack/react-store'
import { gameStore, moveCard, performWandMove, triggerAutoMove } from '../lib/store'
import { Card } from './Card'
import { ControlPanel } from './ControlPanel'
import { Flower, Wand2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { DndContext, DragEndEvent, DragStartEvent, useSensor, useSensors, PointerSensor, useDroppable, DragOverlay } from '@dnd-kit/core'
import { Card as CardType } from '../lib/types'
import Rules from './Rules'
import { DragonButton } from './DragonButton'

function DroppableZone({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-cyan-400 ring-opacity-50")}>
      {children}
    </div>
  )
}

export function GameBoard() {
  const state = useStore(gameStore)
  const [cardStyle, setCardStyle] = React.useState<'filled' | 'outlined'>('filled')
  const [isGlowEnabled, setIsGlowEnabled] = React.useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [draggedStack, setDraggedStack] = React.useState<CardType[]>([])

  // Check if flower is available to be moved (top of column or in free cell)
  const isFlowerAvailable = React.useMemo(() => {
    if (state.foundations.flower) return false
    // Check free cells
    if (state.freeCells.some(c => c?.kind === 'flower')) return true
    // Check columns
    return state.columns.some(col => col.length > 0 && col[col.length - 1].kind === 'flower')
  }, [state.freeCells, state.columns, state.foundations.flower])

  const isWandActive = React.useMemo(() => {
    // Check if next rank is ready to move
    const { foundations, columns, freeCells } = state
    const minFoundation = Math.min(foundations.green, foundations.purple, foundations.indigo)
    const nextRank = minFoundation + 1

    if (nextRank > 9) return false

    const colors: ('green' | 'purple' | 'indigo')[] = ['green', 'purple', 'indigo']
    let allAvailable = true

    for (const color of colors) {
      if (foundations[color] >= nextRank) continue

      let found = false

      // Check free cells
      if (freeCells.some(c => c?.kind === 'normal' && c.color === color && c.value === nextRank)) {
        found = true
      } else {
        // Check columns (top only)
        for (const col of columns) {
          if (col.length > 0) {
            const card = col[col.length - 1]
            if (card.kind === 'normal' && card.color === color && card.value === nextRank) {
              found = true
              break
            }
          }
        }
      }

      if (!found) {
        allAvailable = false
        break
      }
    }
    return allAvailable
  }, [state.foundations, state.columns, state.freeCells])

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    setActiveId(active.id as string)

    // Find the stack being dragged
    const cardId = active.id as string
    let stack: CardType[] = []

    // Check columns for the card and subsequent cards
    for (const column of state.columns) {
      const index = column.findIndex(c => c.id === cardId)
      if (index !== -1) {
        stack = column.slice(index)
        break
      }
    }

    // If not in column, check free cells (single card)
    if (stack.length === 0) {
      const freeCard = state.freeCells.find(c => c?.id === cardId)
      if (freeCard) stack = [freeCard]
    }

    setDraggedStack(stack)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setDraggedStack([])

    if (over && active.id !== over.id) {
      moveCard(active.id as string, over.id as string)
    }
  }

  // Auto-move '1's on mount or new game
  React.useEffect(() => {
    if (state.status === 'playing') {
      // Delay to allow deal animation to finish and user to see the tableau
      const timer = setTimeout(() => {
        triggerAutoMove()
      }, 1000) // Increased to 1000ms
      return () => clearTimeout(timer)
    }
  }, [state.status, state.history.length === 0])

  // Helper to check if a card can move to foundation
  const canMoveToFoundation = (card: CardType) => {
    if (card.kind === 'flower') return isFlowerAvailable
    if (card.kind === 'normal') {
      const currentVal = state.foundations[card.color]
      return card.value === currentVal + 1
    }
    return false
  }

  function handleCardDoubleClick(card: CardType) {
    // ... existing logic ...
    let targetFoundationId: string | null = null
    if (card.kind === 'flower') {
      if (isFlowerAvailable) targetFoundationId = 'foundation-flower'
    } else if (card.kind === 'normal') {
      const currentVal = state.foundations[card.color]
      if (card.value === currentVal + 1) {
        targetFoundationId = `foundation-${card.color}`
      }
    }

    if (targetFoundationId) {
      moveCard(card.id, targetFoundationId)
      return
    }

    // 2. If not foundation, try Rightmost Free Cell
    let targetFreeCellId: string | null = null
    for (let i = state.freeCells.length - 1; i >= 0; i--) {
      if (state.freeCells[i] === null) {
        targetFreeCellId = `free-${i}`
        break
      }
    }

    if (targetFreeCellId) {
      moveCard(card.id, targetFreeCellId)
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div key={state.gameId} className="w-full max-w-7xl mx-auto p-4 flex flex-col items-center min-h-screen">
        {/* ... existing layout ... */}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeId && draggedStack.length > 0 ? (
            <div className="flex flex-col gap-[-3rem]">
              {draggedStack.map((card, index) => (
                <div key={card.id} style={{ marginTop: index === 0 ? 0 : '-6rem' }}>
                  <Card card={card} cardStyle={cardStyle} isDragging />
                </div>
              ))}
            </div>
          ) : null}
        </DragOverlay>

        {/* Top Bar: Free Cells, Center Stack, Foundations */}
        <div className="w-full flex justify-between items-start mb-8 gap-8">

          {/* Free Cells (Top Left) */}
          <div className="flex gap-2">
            {state.freeCells.map((card, i) => (
              <DroppableZone key={`free-${i}`} id={`free-${i}`} className="w-24 h-32 border-2 border-slate-700 rounded-lg bg-slate-800/30 flex items-center justify-center">
                {card && (
                  <Card
                    card={card}
                    cardStyle={cardStyle}
                    onDoubleClick={() => handleCardDoubleClick(card)}
                    canMoveToFoundation={canMoveToFoundation(card)}
                  />
                )}
              </DroppableZone>
            ))}
          </div>

          {/* Center Stack: Flower + Dragons */}
          <div className="flex flex-col gap-4 items-center">
            {/* Flower Slot (Top) */}
            <DroppableZone
              id="foundation-flower"
              className={cn(
                "w-24 h-32 border-2 border-slate-700 rounded-lg bg-slate-800/30 flex items-center justify-center relative transition-all duration-300",
                (isGlowEnabled || isFlowerAvailable) && "shadow-[0_0_15px_rgba(236,72,153,0.6)] border-pink-500/50"
              )}
            >
              <Flower className={cn(
                "text-slate-700/50 absolute size-8",
                (isGlowEnabled || isFlowerAvailable) && "text-pink-500/50"
              )} />
              {state.foundations.flower && (
                <Card
                  card={{ id: 'flower', kind: 'flower' }} // Use consistent ID for layout animation
                  cardStyle={cardStyle}
                  disabled={true}
                />
              )}
            </DroppableZone>

            {/* Dragon Buttons (Bottom) */}
            <div className="flex gap-2">
              <DragonButton color="green" />
              <DragonButton color="red" />
              <DragonButton color="white" />
            </div>
          </div>

          {/* Foundations (Top Right) */}
          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-2">
              {/* Numbered Foundations */}
              {['green', 'purple', 'indigo'].map((color) => {
                const value = state.foundations[color as keyof typeof state.foundations] as number
                const foundationCard: CardType | null = value > 0 ? {
                  id: `normal-${color}-${value}`,
                  kind: 'normal',
                  color: color as any,
                  value: value
                } : null

                return (
                  <DroppableZone key={color} id={`foundation-${color}`} className="w-24 h-32 border-2 border-slate-700 rounded-lg bg-slate-800/30 flex items-center justify-center relative">
                    <div className={cn("absolute inset-0 opacity-20 rounded-sm",
                      color === 'green' && "bg-emerald-600",
                      color === 'purple' && "bg-purple-900",
                      color === 'indigo' && "bg-indigo-900"
                    )} />
                    {foundationCard ? (
                      <Card
                        card={foundationCard}
                        cardStyle={cardStyle}
                        disabled={true}
                      />
                    ) : (
                      <div className="text-slate-500 font-bold text-3xl opacity-70">
                        {/* Empty placeholder */}
                      </div>
                    )}
                  </DroppableZone>
                )
              })}
            </div>

            {/* Auto-Complete Button */}
            <div className="flex gap-2">
              <button
                className={cn(
                  "w-16 h-12 rounded-md border-2 flex items-center justify-center transition-all duration-100 mt-2",
                  isWandActive
                    ? "bg-cyan-900/50 border-cyan-500 text-cyan-400 hover:bg-cyan-800 hover:text-white shadow-[0_0_10px_rgba(34,211,238,0.3)] cursor-pointer"
                    : "border-slate-700 text-slate-600 cursor-not-allowed opacity-50"
                )}
                onClick={() => isWandActive && performWandMove()}
                disabled={!isWandActive}
                title="Auto-Complete"
              >
                <Wand2 className="size-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Tableau (Columns) */}
        <div className="w-full flex justify-center gap-6 mb-8">
          {state.columns.map((column, i) => (
            <DroppableZone
              key={`col-${i}`}
              id={`col-${i}`}
              className="w-28 min-h-[600px] flex flex-col gap-[-3rem] p-1 border-2 border-slate-800/50 rounded-lg bg-slate-900/20 items-center pt-2"
            >
              {column.map((card, index) => {
                const isBeingDragged = draggedStack.some(c => c.id === card.id)
                // Only top card of column can move to foundation
                const isTopCard = index === column.length - 1
                const canMove = isTopCard && canMoveToFoundation(card)

                return (
                  <div key={`${i}-${index}`} style={{ marginTop: index === 0 ? 0 : '-6rem' }}>
                    <Card
                      card={card}
                      cardStyle={cardStyle}
                      className={isBeingDragged ? "opacity-0" : ""}
                      onDoubleClick={() => handleCardDoubleClick(card)}
                      canMoveToFoundation={canMove}
                    />
                  </div>
                )
              })}
            </DroppableZone>
          ))}
        </div>

        <ControlPanel
          cardStyle={cardStyle}
          onToggleStyle={() => setCardStyle(s => s === 'filled' ? 'outlined' : 'filled')}
          isGlowEnabled={isGlowEnabled}
          onToggleGlow={() => setIsGlowEnabled(!isGlowEnabled)}
        />

        {/* Rules Section */}
        <Rules />
      </div>
    </DndContext>
  )
}
