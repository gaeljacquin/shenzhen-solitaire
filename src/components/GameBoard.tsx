import { useStore } from '@tanstack/react-store'
import { Flower, Wand2 } from 'lucide-react'
import { DndContext,  DragOverlay,  PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { LayoutGroup, motion } from 'motion/react'
import {  useEffect, useMemo, useRef, useState } from 'react'
import type {DragEndEvent, DragStartEvent} from '@dnd-kit/core';
import type { CardColor, Card as CardType, DragonColor } from '@/lib/types'
import type { ReactNode } from 'react';
import { collectDragons, gameStore, moveCard, newGame, triggerAutoMove } from '@/lib/store'
import { Card } from '@/components/Card'
import { ControlPanel } from '@/components/ControlPanel'
import { cn } from '@/lib/utils'
import { DragonButton } from '@/components/DragonButton'

function DroppableZone({ id, children, className }: { id: string, children: ReactNode, className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      data-zone-id={id}
      className={cn(className, isOver && "ring-2 ring-black ring-opacity-50")}
    >
      {children}
    </div>
  )
}

type FloatingCardMove = {
  id: string
  card: CardType
  from: DOMRect
  to: DOMRect
  onComplete: () => void
}

export function GameBoard() {
  const state = useStore(gameStore)
  const [cardStyle] = useState<'filled' | 'outlined'>('outlined')
  const [movingCardIds, setMovingCardIds] = useState<Set<string>>(() => new Set())
  const [movingColumnIds, setMovingColumnIds] = useState<Set<number>>(() => new Set())
  const [floatingCards, setFloatingCards] = useState<Array<FloatingCardMove>>([])
  const [isAutoMoving, setIsAutoMoving] = useState(false)
  const [skipLayoutIds, setSkipLayoutIds] = useState<Set<string>>(() => new Set())
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggedStack, setDraggedStack] = useState<Array<CardType>>([])

  useEffect(() => {
    if (state.status === 'idle') {
      newGame()
    }
  }, [state.status])

  useEffect(() => {
    if (skipLayoutIds.size === 0) return
    const frame = requestAnimationFrame(() => {
      setSkipLayoutIds(new Set())
    })
    return () => cancelAnimationFrame(frame)
  }, [skipLayoutIds])

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

    const colors: Array<'green' | 'red' | 'black'> = ['green', 'red', 'black']
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

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const animateCardMove = async (card: CardType, targetZoneId: string) => {
    const sourceEl = document.querySelector(`[data-card-id="${card.id}"]`)
    const targetEl = document.querySelector(`[data-zone-id="${targetZoneId}"]`)

    if (!sourceEl || !targetEl) return

    const from = sourceEl.getBoundingClientRect()
    const to = targetEl.getBoundingClientRect()

    if (Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1) return

    const animationId = `${card.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`

    await new Promise<void>((resolve) => {
      const onComplete = () => {
        setFloatingCards(prev => prev.filter(item => item.id !== animationId))
        resolve()
      }

      setFloatingCards(prev => [
        ...prev,
        {
          id: animationId,
          card,
          from,
          to,
          onComplete,
        },
      ])
    })
  }

  const findCardForRank = (currentState: typeof state, color: CardColor, rank: number) => {
    const freeIdx = currentState.freeCells.findIndex(
      c => c?.kind === 'normal' && c.color === color && c.value === rank
    )
    if (freeIdx !== -1) return currentState.freeCells[freeIdx]!

    for (const col of currentState.columns) {
      if (col.length === 0) continue
      const card = col[col.length - 1]
      if (card.kind === 'normal' && card.color === color && card.value === rank) {
        return card
      }
    }

    return null
  }

  const handleWandMove = async () => {
    if (!isWandActive || isAutoMoving) return
    setIsAutoMoving(true)

    try {
      const historyStart = gameStore.state.history.length
      const moved = true
      while (moved) {
        const currentState = gameStore.state
        const minFoundation = Math.min(
          currentState.foundations.green,
          currentState.foundations.red,
          currentState.foundations.black
        )
        const nextRank = minFoundation + 1

        if (nextRank > 9) break

        const colors: Array<CardColor> = ['green', 'red', 'black']
        const moves: Array<{ card: CardType; targetId: string }> = []
        let allAvailable = true

        for (const color of colors) {
          if (currentState.foundations[color] >= nextRank) continue
          const card = findCardForRank(currentState, color, nextRank)
          if (!card) {
            allAvailable = false
            break
          }
          moves.push({ card, targetId: `foundation-${color}` })
        }

        if (!allAvailable || moves.length === 0) break

        setMovingCardIds(prev => {
          const next = new Set(prev)
          moves.forEach(move => next.add(move.card.id))
          return next
        })

        await Promise.all(moves.map(move => animateCardMove(move.card, move.targetId)))

        for (const move of moves) {
          moveCard(move.card.id, move.targetId, true)
        }

        setMovingCardIds(prev => {
          const next = new Set(prev)
          moves.forEach(move => next.delete(move.card.id))
          return next
        })

        await wait(20)
      }

      if (gameStore.state.history.length > historyStart + 1) {
        gameStore.setState(state => ({
          ...state,
          history: state.history.slice(0, historyStart + 1),
        }))
      }
    } finally {
      setIsAutoMoving(false)
    }
  }

  const handleCollectDragons = async (color: DragonColor) => {
    if (isAutoMoving) return

    const currentState = gameStore.state
    if (currentState.status !== 'playing' && !currentState.devMode) return

    const dragonIds = [0, 1, 2, 3].map(i => `dragon-${color}-${i}`)
    const locations: Array<{ card: CardType; source: 'col' | 'free'; index: number }> = []

    for (const id of dragonIds) {
      const freeIdx = currentState.freeCells.findIndex(c => c?.id === id)
      if (freeIdx !== -1) {
        locations.push({ card: currentState.freeCells[freeIdx]!, source: 'free', index: freeIdx })
        continue
      }
      let foundInCol = false
      for (let i = 0; i < currentState.columns.length; i++) {
        const col = currentState.columns[i]
        if (col.length > 0 && col[col.length - 1].id === id) {
          locations.push({ card: col[col.length - 1], source: 'col', index: i })
          foundInCol = true
          break
        }
      }
      if (!foundInCol && !currentState.devMode) return
    }

    if (locations.length !== 4 && !currentState.devMode) return

    let targetFreeIndex = -1
    for (const loc of locations) {
      if (loc.source === 'free') {
        targetFreeIndex = loc.index
        break
      }
    }
    if (targetFreeIndex === -1) {
      targetFreeIndex = currentState.freeCells.findIndex(c => c === null)
    }
    if (targetFreeIndex === -1) return

    const targetId = `free-${targetFreeIndex}`
    setIsAutoMoving(true)

    try {
      setMovingCardIds(prev => {
        const next = new Set(prev)
        locations.forEach(loc => next.add(loc.card.id))
        return next
      })

      await Promise.all(locations.map(loc => animateCardMove(loc.card, targetId)))
      collectDragons(color)
    } finally {
      setMovingCardIds(prev => {
        const next = new Set(prev)
        locations.forEach(loc => next.delete(loc.card.id))
        return next
      })
      setIsAutoMoving(false)
    }
  }

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
    let stack: Array<CardType> = []

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
      if (draggedStack.length > 1) {
        setSkipLayoutIds(new Set(draggedStack.map(card => card.id)))
      }
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

  const isFlowerAvailableForState = (currentState: typeof state) => {
    if (currentState.foundations.flower) return false
    if (currentState.freeCells.some(c => c?.kind === 'flower')) return true
    return currentState.columns.some(
      col => col.length > 0 && col[col.length - 1].kind === 'flower',
    )
  }

  const getCardLocation = (currentState: typeof state, cardId: string) => {
    const freeIndex = currentState.freeCells.findIndex(c => c?.id === cardId)
    if (freeIndex !== -1) {
      return { type: 'free' as const, index: freeIndex, isTop: true }
    }

    for (let i = 0; i < currentState.columns.length; i++) {
      const column = currentState.columns[i]
      const cardIndex = column.findIndex(c => c.id === cardId)
      if (cardIndex !== -1) {
        return {
          type: 'col' as const,
          index: i,
          isTop: cardIndex === column.length - 1,
        }
      }
    }

    return null
  }

  function handleCardDoubleClick(card: CardType) {
    if (movingCardIds.has(card.id)) return

    const currentState = gameStore.state
    if (currentState.status !== 'playing' && !currentState.devMode) return
    const flowerAvailable = isFlowerAvailableForState(currentState)
    const location = getCardLocation(currentState, card.id)
    if (!location || !location.isTop) return
    if (card.kind === 'dragon' && card.isLocked) return

    const sourceColumnIndex = location.type === 'col' ? location.index : null

    let targetFoundationId: string | null = null
    if (card.kind === 'flower') {
      if (flowerAvailable) targetFoundationId = 'foundation-flower'
    } else if (card.kind === 'normal') {
      const currentVal = currentState.foundations[card.color]
      if (card.value === currentVal + 1) {
        targetFoundationId = `foundation-${card.color}`
      }
    }

    if (targetFoundationId) {
      setMovingCardIds(prev => new Set(prev).add(card.id))
      if (sourceColumnIndex !== null) {
        setMovingColumnIds(prev => {
          const next = new Set(prev)
          next.add(sourceColumnIndex)
          return next
        })
      }
      setSkipLayoutIds(prev => {
        const next = new Set(prev)
        next.add(card.id)
        return next
      })

      const animation = animateCardMove(card, targetFoundationId)
      moveCard(card.id, targetFoundationId)

      animation.finally(() => {
        setSkipLayoutIds(prev => {
          const next = new Set(prev)
          next.add(card.id)
          return next
        })
        setMovingCardIds(prev => {
          const next = new Set(prev)
          next.delete(card.id)
          return next
        })
        if (sourceColumnIndex !== null) {
          setMovingColumnIds(prev => {
            const next = new Set(prev)
            next.delete(sourceColumnIndex)
            return next
          })
        }
      })
      return
    }

    let targetFreeCellId: string | null = null
    for (let i = currentState.freeCells.length - 1; i >= 0; i--) {
      if (currentState.freeCells[i] === null) {
        targetFreeCellId = `free-${i}`
        break
      }
    }

    if (location.type === 'free') return

    if (targetFreeCellId) {
      // Move to free cell without auto-move, then trigger auto-move after animation
      setMovingCardIds(prev => new Set(prev).add(card.id))
      if (sourceColumnIndex !== null) {
        setMovingColumnIds(prev => {
          const next = new Set(prev)
          next.add(sourceColumnIndex)
          return next
        })
      }
      setSkipLayoutIds(prev => {
        const next = new Set(prev)
        next.add(card.id)
        return next
      })

      const animation = animateCardMove(card, targetFreeCellId)
      moveCard(card.id, targetFreeCellId, true)

      animation.finally(() => {
        setSkipLayoutIds(prev => {
          const next = new Set(prev)
          next.add(card.id)
          return next
        })
        setMovingCardIds(prev => {
          const next = new Set(prev)
          next.delete(card.id)
          return next
        })
        if (sourceColumnIndex !== null) {
          setMovingColumnIds(prev => {
            const next = new Set(prev)
            next.delete(sourceColumnIndex)
            return next
          })
        }
        triggerAutoMove()
      })
    }
  }

  function handleCardClick(card: CardType) {
    const now = Date.now()
    const lastClick = lastClickRef.current
    const isDouble = !!lastClick && lastClick.id === card.id && now - lastClick.time < 320

    if (isDouble) {
      lastClickRef.current = null
      handleCardDoubleClick(card)
      return
    }

    lastClickRef.current = { id: card.id, time: now }
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

          {floatingCards.length > 0 && (
            <div className="pointer-events-none fixed inset-0 z-50">
              {floatingCards.map((move) => (
                <motion.div
                  key={move.id}
                  initial={{
                    x: move.from.left,
                    y: move.from.top,
                    width: move.from.width,
                    height: move.from.height,
                  }}
                  animate={{
                    x: move.to.left,
                    y: move.to.top,
                    width: move.to.width,
                    height: move.to.height,
                  }}
                  transition={{ duration: 0.3, type: 'spring', bounce: 0.2 }}
                  style={{ position: 'fixed', left: 0, top: 0, zIndex: 1000 }}
                  onAnimationComplete={move.onComplete}
                >
                  <Card
                    card={move.card}
                    cardStyle={cardStyle}
                    isDragging
                    className="opacity-100"
                    dataIdDisabled
                  />
                </motion.div>
              ))}
            </div>
          )}

          <div className="w-full flex justify-between items-start mb-8 gap-8">

          <div className="flex gap-2">
            {state.freeCells.map((card, i) => {
              const isBeingDragged = card && draggedStack.some(c => c.id === card.id)
              const isMovingCard = !!card && movingCardIds.has(card.id)
              return (
                <DroppableZone key={`free-${i}`} id={`free-${i}`} className={cn(
                  "w-28 h-40 border-2 border-white/20 rounded-lg bg-white/5 flex items-center justify-center transition-opacity",
                  card && card.kind === 'dragon' && card.isLocked && "opacity-50"
                )}>
                  {card && !isMovingCard && (
                    <Card
                      card={card}
                      cardStyle={cardStyle}
                      className={cn(
                        isBeingDragged && "opacity-0",
                        movingCardIds.has(card.id) && "opacity-0 pointer-events-none",
                        state.status === 'paused' && "opacity-0"
                      )}
                      disableLayout={movingCardIds.has(card.id) || skipLayoutIds.has(card.id)}
                      onClick={() => handleCardClick(card)}
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
              <DragonButton
                color="green"
                disabled={isAutoMoving}
                onCollect={() => handleCollectDragons('green')}
              />
              <DragonButton
                color="red"
                disabled={isAutoMoving}
                onCollect={() => handleCollectDragons('red')}
              />
              <DragonButton
                color="black"
                disabled={isAutoMoving}
                onCollect={() => handleCollectDragons('black')}
              />
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
                    {foundationCard && !movingCardIds.has(foundationCard.id) ? (
                      <Card
                        card={foundationCard}
                        cardStyle={cardStyle}
                      disableLayout={movingCardIds.has(foundationCard.id) || skipLayoutIds.has(foundationCard.id)}
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
                    : "bg-slate-900/30 border-slate-700/50 text-slate-500/30 cursor-not-allowed"
                )}
                onClick={handleWandMove}
                disabled={!isWandActive || isAutoMoving}
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
              className="w-32 min-h-144 flex flex-col gap-[-8rem] p-1 border-2 border-white/10 rounded-lg bg-white/5 items-center pt-2"
            >
                  {column.map((card, index) => {
                    const isBeingDragged = draggedStack.some(c => c.id === card.id)
                    const isTopCard = index === column.length - 1
                    const canMove = isTopCard && canMoveToFoundation(card)
                    const isDraggable = canDragCard(card.id)

                    return (
                      <div key={card.id} style={{ marginTop: index === 0 ? 0 : '-8rem' }}>
                        <Card
                          card={card}
                          cardStyle={cardStyle}
                          className={cn(
                            isBeingDragged ? "opacity-0" : "",
                            movingCardIds.has(card.id) && "opacity-0 pointer-events-none",
                            state.status === 'paused' ? "opacity-0" : ""
                          )}
                      disableLayout={skipLayoutIds.has(card.id) || movingCardIds.has(card.id) || movingColumnIds.has(i)}
                          onClick={() => handleCardClick(card)}
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
