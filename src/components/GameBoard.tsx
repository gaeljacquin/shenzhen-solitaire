import { useStore } from '@tanstack/react-store'
import { gameStore, moveCard, performWandMove, triggerAutoMove, newGame } from '@/lib/store'
import { Card } from '@/components/Card'
import { ControlPanel } from '@/components/ControlPanel'
import { Flower, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DndContext, type DragEndEvent, type DragStartEvent, useSensor, useSensors, PointerSensor, useDroppable, DragOverlay } from '@dnd-kit/core'
import { LayoutGroup } from 'motion/react'
import type { Card as CardType } from '@/lib/types'
import { DragonButton } from '@/components/DragonButton'
import { type ReactNode, useState, useMemo, useEffect } from 'react'

function DroppableZone({ id, children, className }: { id: string, children: ReactNode, className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-black ring-opacity-50")}>
      {children}
    </div>
  )
}

export function GameBoard() {
  const state = useStore(gameStore)
  const [cardStyle] = useState<'filled' | 'outlined'>('outlined')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggedStack, setDraggedStack] = useState<CardType[]>([])

  useEffect(() => {
    if (state.status === 'idle') {
      newGame()
    }
  }, [state.status])

  const isFlowerAvailable = useMemo(() => {
    if (state.foundations.flower) return false
    if (state.freeCells.some(c => c?.kind === 'flower')) return true
    return state.columns.some(col => col.length > 0 && col[col.length - 1].kind === 'flower')
  }, [state.freeCells, state.columns, state.foundations.flower])

  const isWandActive = useMemo(() => {
    const { foundations, columns, freeCells } = state
    const minFoundation = Math.min(foundations.green, foundations.red, foundations.black)
    const nextRank = minFoundation + 1

    if (nextRank > 9) return false

    const colors: ('green' | 'red' | 'black')[] = ['green', 'red', 'black']
    let allAvailable = true

    for (const color of colors) {
      if (foundations[color] >= nextRank) continue

      let found = false

      if (freeCells.some(c => c?.kind === 'normal' && c.color === color && c.value === nextRank)) {
        found = true
      } else {
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

  function canStack(bottomCard: CardType, topCard: CardType): boolean {
    if (bottomCard.kind !== 'normal' || topCard.kind !== 'normal') return false
    if (bottomCard.value !== topCard.value + 1) return false
    if (bottomCard.color === topCard.color) return false
    return true
  }

  function canDragCard(cardId: string): boolean {
    if (state.devMode) return true

    if (state.freeCells.some(c => c?.id === cardId)) return true
    for (const column of state.columns) {
      const index = column.findIndex(c => c.id === cardId)
      if (index !== -1) {
        if (index === column.length - 1) return true

        for (let i = index; i < column.length - 1; i++) {
          if (!canStack(column[i], column[i + 1])) {
            return false
          }
        }
        return true
      }
    }

    return true
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    setActiveId(active.id as string)

    const cardId = active.id as string
    let stack: CardType[] = []

    for (const column of state.columns) {
      const index = column.findIndex(c => c.id === cardId)
      if (index !== -1) {
        if (!state.devMode && index < column.length - 1) {
          let isValidSequence = true
          for (let i = index; i < column.length - 1; i++) {
            if (!canStack(column[i], column[i + 1])) {
              isValidSequence = false
              break
            }
          }

          if (!isValidSequence) {
            stack = []
            break
          }
        }

        stack = column.slice(index)
        break
      }
    }

    if (stack.length === 0) {
      const freeCard = state.freeCells.find(c => c?.id === cardId)
      if (freeCard) stack = [freeCard]
    }

    setDraggedStack(stack)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      moveCard(active.id as string, over.id as string)
    }

    setActiveId(null)
    setDraggedStack([])
  }

  useEffect(() => {
    if (state.status === 'playing') {
      const timer = setTimeout(() => {
        triggerAutoMove()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [state.status, state.history.length === 0])

  const canMoveToFoundation = (card: CardType) => {
    if (card.kind === 'flower') return isFlowerAvailable
    if (card.kind === 'normal') {
      const currentVal = state.foundations[card.color]
      return card.value === currentVal + 1
    }
    return false
  }

  function handleCardDoubleClick(card: CardType) {
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

    let targetFreeCellId: string | null = null
    for (let i = state.freeCells.length - 1; i >= 0; i--) {
      if (state.freeCells[i] === null) {
        targetFreeCellId = `free-${i}`
        break
      }
    }

    if (targetFreeCellId) {
      // Move to free cell without auto-move, then trigger auto-move after animation
      moveCard(card.id, targetFreeCellId, true)
      setTimeout(() => {
        triggerAutoMove()
      }, 250) // Slightly longer than the 200ms animation duration
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <LayoutGroup id={`game-${state.gameId}`}>
        <div key={state.gameId} className="w-full max-w-7xl mx-auto p-4 flex flex-col items-center min-h-screen relative pb-4">

          <DragOverlay>
            {activeId && draggedStack.length > 0 ? (
              <div className="flex flex-col gap-[-3rem]">
                {draggedStack.map((card, index) => (
                  <div key={card.id} style={{ marginTop: index === 0 ? 0 : '-8rem' }}>
                    <Card card={card} cardStyle={cardStyle} isDragging />
                  </div>
                ))}
              </div>
            ) : null}
          </DragOverlay>

        <div className="w-full flex justify-between items-start mb-8 gap-8">

          <div className="flex gap-2">
            {state.freeCells.map((card, i) => {
              const isBeingDragged = card && draggedStack.some(c => c.id === card.id)
              return (
                <DroppableZone key={`free-${i}`} id={`free-${i}`} className={cn(
                  "w-28 h-40 border-2 border-white/20 rounded-lg bg-white/5 flex items-center justify-center transition-opacity",
                  card && card.kind === 'dragon' && card.isLocked && "opacity-50"
                )}>
                  {card && (
                    <Card
                      card={card}
                      cardStyle={cardStyle}
                      className={cn(
                        isBeingDragged && "opacity-0",
                        state.status === 'paused' && "opacity-0"
                      )}
                      onDoubleClick={() => handleCardDoubleClick(card)}
                      canMoveToFoundation={canMoveToFoundation(card)}
                    />
                  )}
                </DroppableZone>
              )
            })}
          </div>

          <div className="flex flex-col gap-4 items-center">
            <DroppableZone
              id="foundation-flower"
              className={cn(
                "w-28 h-40 border-2 border-white/20 rounded-lg bg-white/5 flex items-center justify-center relative transition-all duration-300",
                state.foundations.flower && "opacity-50"
              )}
            >
              <Flower className={cn(
                "text-white absolute size-8",
              )} />
              {state.foundations.flower && (
                <Card
                  card={{ id: 'flower', kind: 'flower' }}
                  cardStyle={cardStyle}
                  disabled={true}
                />
              )}
            </DroppableZone>

            <div className="flex gap-2">
              <DragonButton color="green" />
              <DragonButton color="red" />
              <DragonButton color="black" />
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-2">
              {['green', 'red', 'black'].map((color) => {
                const value = state.foundations[color as keyof typeof state.foundations] as number
                const foundationCard: CardType | null = value > 0 ? {
                  id: `normal-${color}-${value}`,
                  kind: 'normal',
                  color: color as any,
                  value: value
                } : null

                return (
                  <DroppableZone key={color} id={`foundation-${color}`} className={cn(
                    "w-28 h-40 border-2 border-white/20 rounded-lg bg-white/5 flex items-center justify-center relative transition-opacity",
                    foundationCard && "opacity-50"
                  )}>
                    {foundationCard ? (
                      <Card
                        card={foundationCard}
                        cardStyle={cardStyle}
                        disabled={true}
                      />
                    ) : (
                      <div className="text-emerald-900/30 font-bold text-3xl opacity-70">
                        {/* Empty placeholder */}
                      </div>
                    )}
                  </DroppableZone>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button
                className={cn(
                  "w-16 h-12 rounded-md border-2 flex items-center justify-center transition-all duration-100 mt-2",
                  isWandActive
                    ? "bg-cyan-900/50 border-cyan-500 text-cyan-400 hover:bg-cyan-800 hover:text-white shadow-[0_0_10px_rgba(34,211,238,0.3)] cursor-pointer"
                    : "border-emerald-800/30 text-emerald-800/50 cursor-not-allowed opacity-50"
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

        <div className="w-full flex justify-center gap-4 mb-2">
          {state.columns.map((column, i) => (
            <DroppableZone
              key={`col-${i}`}
              id={`col-${i}`}
              className="w-32 min-h-[36rem] flex flex-col gap-[-8rem] p-1 border-2 border-white/10 rounded-lg bg-white/5 items-center pt-2"
            >
              {column.map((card, index) => {
                const isBeingDragged = draggedStack.some(c => c.id === card.id)
                const isTopCard = index === column.length - 1
                const canMove = isTopCard && canMoveToFoundation(card)
                const isDraggable = canDragCard(card.id)

                return (
                  <div key={`${i}-${index}`} style={{ marginTop: index === 0 ? 0 : '-8rem' }}>
                    <Card
                      card={card}
                      cardStyle={cardStyle}
                      className={cn(
                        isBeingDragged ? "opacity-0" : "",
                        state.status === 'paused' ? "opacity-0" : ""
                      )}
                      onDoubleClick={() => handleCardDoubleClick(card)}
                      canMoveToFoundation={canMove}
                      disabled={!isDraggable}
                    />
                  </div>
                )
              })}
            </DroppableZone>
          ))}
        </div>

          <ControlPanel />
        </div>
      </LayoutGroup>
    </DndContext>
  )
}
