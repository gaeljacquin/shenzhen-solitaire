import { useStore } from '@tanstack/react-store'
import { CheckCheck, Flower } from 'lucide-react'
import { DndContext,  DragOverlay,  PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { LayoutGroup, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type {DragEndEvent, DragStartEvent} from '@dnd-kit/core';
import type { CardColor, Card as CardType, DragonColor } from '@/lib/types'
import type { ReactNode } from 'react';
import { collectDragons, computeUndoState, gameStore, moveCard, newGame, triggerAutoMove, undo } from '@/lib/store'
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
  isFaceDown?: boolean
  transitionType?: 'spring' | 'tween'
  duration?: number
}

export function GameBoard() {
  const state = useStore(gameStore)
  const [cardStyle] = useState<'filled' | 'outlined'>('outlined')
  const [movingCardIds, setMovingCardIds] = useState<Set<string>>(() => new Set())
  const [movingColumnIds, setMovingColumnIds] = useState<Set<number>>(() => new Set())
  const [floatingCards, setFloatingCards] = useState<Array<FloatingCardMove>>([])
  const [isAutoMoving, setIsAutoMoving] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [skipLayoutIds, setSkipLayoutIds] = useState<Set<string>>(() => new Set())
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const [isDealingCards, setIsDealingCards] = useState(false)
  const [isFlipping, setIsFlipping] = useState(false)
  const [areCardsFaceDown, setAreCardsFaceDown] = useState(false)
  const [dealtCounts, setDealtCounts] = useState<Array<number>>(() => Array(8).fill(0))
  const dealRunRef = useRef(0)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggedStack, setDraggedStack] = useState<Array<CardType>>([])
  const isUiLocked = isDealingCards || isFlipping || isAutoMoving
  const isBoardLocked = isUiLocked || isUndoing

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

  const isAutoSolveActive = useMemo(() => {
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
  const shouldHideCard = (cardId: string) => movingCardIds.has(cardId)

  const getCardPositionMap = (currentState: typeof gameStore.state) => {
    const positions = new Map<string, string>()

    currentState.freeCells.forEach((card, index) => {
      if (card) {
        positions.set(card.id, `free-${index}`)
      }
    })

    currentState.columns.forEach((column, colIndex) => {
      column.forEach((card) => {
        positions.set(card.id, `col-${colIndex}`)
      })
    })

    const foundationColors: Array<CardColor> = ['green', 'red', 'black']
    foundationColors.forEach((color) => {
      const value = currentState.foundations[color]
      if (value > 0) {
        positions.set(`normal-${color}-${value}`, `foundation-${color}`)
      }
    })

    if (currentState.foundations.flower) {
      positions.set('flower', 'foundation-flower')
    }

    return positions
  }

  const parseCardId = (cardId: string): CardType | null => {
    if (cardId === 'flower') {
      return { id: 'flower', kind: 'flower' }
    }

    if (cardId.startsWith('normal-')) {
      const [, color, value] = cardId.split('-')
      if (!color || !value) return null
      return { id: cardId, kind: 'normal', color: color as CardColor, value: Number(value) }
    }

    if (cardId.startsWith('dragon-')) {
      const [, color, marker] = cardId.split('-')
      if (!color) return null
      return {
        id: cardId,
        kind: 'dragon',
        color: color as DragonColor,
        isLocked: marker === 'locked',
      }
    }

    return null
  }

  const getCardFromState = (currentState: typeof gameStore.state, cardId: string) => {
    for (const column of currentState.columns) {
      const card = column.find(item => item.id === cardId)
      if (card) return card
    }

    const freeCard = currentState.freeCells.find(card => card?.id === cardId)
    if (freeCard) return freeCard

    return parseCardId(cardId)
  }

  const animateCardMove = async (
    card: CardType,
    targetZoneId: string,
    onStart?: () => void,
  ) => {
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

      const nextMove: FloatingCardMove = {
        id: animationId,
        card,
        from,
        to,
        onComplete,
      }

      flushSync(() => {
        onStart?.()
        setFloatingCards(prev => [...prev, nextMove])
      })
    })
  }

  const animateCardFromTo = async (
    card: CardType,
    from: DOMRect,
    to: DOMRect,
    options: { isFaceDown?: boolean; transitionType?: 'spring' | 'tween'; duration?: number } = {},
  ) => {
    if (Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1) return

    const animationId = `${card.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`

    await new Promise<void>((resolve) => {
      const onComplete = () => {
        setFloatingCards(prev => prev.filter(item => item.id !== animationId))
        resolve()
      }

      const nextMove: FloatingCardMove = {
        id: animationId,
        card,
        from,
        to,
        onComplete,
        isFaceDown: options.isFaceDown,
        transitionType: options.transitionType,
        duration: options.duration,
      }

      flushSync(() => {
        setFloatingCards(prev => [...prev, nextMove])
      })
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

  const handleAutoSolve = async () => {
    if (isBoardLocked || !isAutoSolveActive || isAutoMoving) return
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
    if (isBoardLocked || isAutoMoving) return

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
    if (isBoardLocked) return false
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
    if (isBoardLocked) return
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
    if (isBoardLocked) return
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
    if (state.status === 'playing' && !isDealingCards && !isFlipping) {
      const timer = setTimeout(() => {
        triggerAutoMove()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [state.status, state.history.length === 0, isDealingCards, isFlipping])

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

  const getCardLocationForState = (currentState: typeof state, cardId: string) => {
    const freeIndex = currentState.freeCells.findIndex(c => c?.id === cardId)
    if (freeIndex !== -1) {
      return { type: 'free' as const, index: freeIndex }
    }

    for (let i = 0; i < currentState.columns.length; i++) {
      const column = currentState.columns[i]
      const cardIndex = column.findIndex(c => c.id === cardId)
      if (cardIndex !== -1) {
        return { type: 'col' as const, index: i, cardIndex }
      }
    }

    if (cardId === 'flower' && currentState.foundations.flower) {
      return { type: 'foundation' as const, id: 'foundation-flower' }
    }

    if (cardId.startsWith('normal-')) {
      const [, color, value] = cardId.split('-')
      if (color && value) {
        const targetValue = currentState.foundations[color as CardColor]
        if (targetValue === Number(value)) {
          return { type: 'foundation' as const, id: `foundation-${color}` }
        }
      }
    }

    return null
  }

  const getStackOffset = () => {
    const columnEls = Array.from(document.querySelectorAll('[data-zone-id^="col-"]'))
    for (const colEl of columnEls) {
      const cards = Array.from(colEl.querySelectorAll('[data-card-id]'))
      if (cards.length >= 2) {
        const first = cards[0].getBoundingClientRect()
        const second = cards[1].getBoundingClientRect()
        const offset = second.top - first.top
        if (offset > 0) return offset
      }
    }
    return 32
  }

  const getTargetRectForState = (
    currentState: typeof state,
    cardId: string,
    cardRect: DOMRect,
    stackOffset: number,
  ) => {
    const location = getCardLocationForState(currentState, cardId)
    if (!location) return null

    if (location.type === 'free') {
      const zone = document.querySelector(`[data-zone-id="free-${location.index}"]`)
      if (!zone) return null
      const zoneRect = zone.getBoundingClientRect()
      return new DOMRect(zoneRect.left, zoneRect.top, zoneRect.width, zoneRect.height)
    }

    if (location.type === 'foundation') {
      const zone = document.querySelector(`[data-zone-id="${location.id}"]`)
      if (!zone) return null
      const zoneRect = zone.getBoundingClientRect()
      return new DOMRect(zoneRect.left, zoneRect.top, zoneRect.width, zoneRect.height)
    }

    const columnEl = document.querySelector(`[data-zone-id="col-${location.index}"]`)
    if (!columnEl) return null
    const columnRect = columnEl.getBoundingClientRect()
    const columnStyle = window.getComputedStyle(columnEl)
    const paddingTop = Number.parseFloat(columnStyle.paddingTop || '0') || 0
    const left = columnRect.left + (columnRect.width - cardRect.width) / 2
    const top = columnRect.top + paddingTop + location.cardIndex * stackOffset
    return new DOMRect(left, top, cardRect.width, cardRect.height)
  }

  function handleCardDoubleClick(card: CardType) {
    if (isBoardLocked) return
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
      const animation = animateCardMove(card, targetFoundationId, () => {
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
      })

      animation.finally(() => {
        flushSync(() => {
          moveCard(card.id, targetFoundationId)
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
      const animation = animateCardMove(card, targetFreeCellId, () => {
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
      })

      animation.finally(() => {
        flushSync(() => {
          moveCard(card.id, targetFreeCellId, true)
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
        triggerAutoMove()
      })
    }
  }

  function handleCardClick(card: CardType) {
    if (isBoardLocked) return
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

  const handleUndo = () => {
    if (isUndoing || isUiLocked) return

    const currentState = gameStore.state
    const targetState = computeUndoState(currentState)
    if (!targetState) return

    const currentPositions = getCardPositionMap(currentState)
    const targetPositions = getCardPositionMap(targetState)
    const movingIds: Array<string> = []
    const fromRects = new Map<string, DOMRect>()
    const toRects = new Map<string, DOMRect>()
    const stackOffset = getStackOffset()

    targetPositions.forEach((targetPosition, cardId) => {
      const currentPosition = currentPositions.get(cardId)
      if (!currentPosition || currentPosition === targetPosition) return
      if (
        cardId.startsWith('normal-') &&
        cardId.endsWith('-1') &&
        currentPosition.startsWith('foundation-') &&
        (targetPosition.startsWith('col-') || targetPosition.startsWith('free-'))
      ) {
        return
      }

      const sourceEl = document.querySelector(`[data-card-id="${cardId}"]`)
      if (!sourceEl) return

      const fromRect = sourceEl.getBoundingClientRect()
      const toRect = getTargetRectForState(targetState, cardId, fromRect, stackOffset)
      if (!toRect) return

      fromRects.set(cardId, fromRect)
      toRects.set(cardId, toRect)
      movingIds.push(cardId)
    })

    if (movingIds.length === 0) {
      undo()
      return
    }

    const pendingMoves: Array<FloatingCardMove> = []
    let remaining = 0

    movingIds.forEach((cardId) => {
      const from = fromRects.get(cardId)
      const to = toRects.get(cardId)
      if (!from || !to) return

      if (Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1) return

      const card = getCardFromState(targetState, cardId)
      if (!card) return

      remaining += 1
      const animationId = `${card.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const onComplete = () => {
        setFloatingCards(prev => prev.filter(item => item.id !== animationId))
        remaining -= 1

        if (remaining === 0) {
          flushSync(() => {
            undo()
            setMovingCardIds(prev => {
              const next = new Set(prev)
              movingIds.forEach(id => next.delete(id))
              return next
            })
            setIsUndoing(false)
          })
        }
      }

      pendingMoves.push({
        id: animationId,
        card,
        from,
        to,
        onComplete,
      })
    })

    if (pendingMoves.length === 0) {
      undo()
      return
    }

    flushSync(() => {
      setIsUndoing(true)
      setSkipLayoutIds(new Set(movingIds))
      setMovingCardIds(prev => {
        const next = new Set(prev)
        movingIds.forEach(id => next.add(id))
        return next
      })
      setFloatingCards(prev => [...prev, ...pendingMoves])
    })
  }

  useLayoutEffect(() => {
    if (state.status !== 'playing') return

    let cancelled = false
    const runId = dealRunRef.current + 1
    dealRunRef.current = runId

    const runDeal = async () => {
      setIsDealingCards(true)
      setIsFlipping(false)
      setAreCardsFaceDown(true)
      setDealtCounts(Array(state.columns.length).fill(0))
      setFloatingCards([])

      await wait(50)
      if (cancelled || dealRunRef.current !== runId) return

      const stackOffset = getStackOffset()
      const dealColumns = gameStore.state.columns
      const cardsPerColumn = dealColumns[0]?.length ?? 0
      const columnDealDuration = 0.3
      const perCardDuration = cardsPerColumn > 0 ? columnDealDuration / cardsPerColumn : columnDealDuration

      for (let colIndex = 0; colIndex < dealColumns.length; colIndex++) {
        if (cancelled || dealRunRef.current !== runId) return
        const sourceZone = document.querySelector('[data-zone-id="foundation-flower"]')
        if (!sourceZone) continue

        const fromRect = sourceZone.getBoundingClientRect()

        for (let rowIndex = 0; rowIndex < cardsPerColumn; rowIndex++) {
          if (cancelled || dealRunRef.current !== runId) return
          const card = dealColumns[colIndex]?.[rowIndex]
          if (!card) continue

          const toRect = getTargetRectForState(gameStore.state, card.id, fromRect, stackOffset)
          if (!toRect) continue
          await animateCardFromTo(card, fromRect, toRect, {
            isFaceDown: true,
            transitionType: 'tween',
            duration: perCardDuration,
          })
          setDealtCounts(prev => {
            const next = [...prev]
            next[colIndex] = Math.min(next[colIndex] + 1, dealColumns[colIndex].length)
            return next
          })
        }
      }

      if (cancelled || dealRunRef.current !== runId) return
      await new Promise(requestAnimationFrame)
      if (cancelled || dealRunRef.current !== runId) return
      await new Promise(requestAnimationFrame)
      if (cancelled || dealRunRef.current !== runId) return
      setIsDealingCards(false)
      const flipDurationMs = 500
      setIsFlipping(true)
      setAreCardsFaceDown(false)
      await wait(flipDurationMs)
      if (cancelled || dealRunRef.current !== runId) return
      setIsFlipping(false)
    }

    runDeal()

    return () => {
      cancelled = true
    }
  }, [state.gameId, state.status])

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
                  transition={
                    move.transitionType === 'tween'
                      ? { duration: move.duration ?? 0.3, type: 'tween', ease: 'easeOut' }
                      : { duration: move.duration ?? 0.3, type: 'spring', bounce: 0.2 }
                  }
                  style={{ position: 'fixed', left: 0, top: 0, zIndex: 1000 }}
                  onAnimationComplete={move.onComplete}
                >
                  <Card
                    card={move.card}
                    cardStyle={cardStyle}
                    isDragging
                    className="opacity-100"
                    dataIdDisabled
                    isFaceDown={move.isFaceDown}
                  />
                </motion.div>
              ))}
            </div>
          )}

          <div className="w-full grid grid-cols-3 items-start mb-8 gap-8">
            <div className="flex flex-col gap-3 justify-self-start w-fit">
              <div className="grid grid-cols-[repeat(4,7rem)] gap-2">
                {state.freeCells.map((card, i) => {
                  const isBeingDragged = card && draggedStack.some(c => c.id === card.id)
                  const isMovingCard = !!card && movingCardIds.has(card.id)
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
                            card && shouldHideCard(card.id) && "opacity-0 instant-hide",
                            isMovingCard && "pointer-events-none",
                            state.status === 'paused' && "opacity-0"
                          )}
                          disableLayout={movingCardIds.has(card.id) || skipLayoutIds.has(card.id)}
                          onClick={() => handleCardClick(card)}
                          canMoveToFoundation={canMoveToFoundation(card)}
                          disabled={isUiLocked}
                          isFaceDown={areCardsFaceDown}
                        />
                      )}
                    </DroppableZone>
                  )
                })}
              </div>

              <div className="grid grid-cols-[repeat(4,7rem)] gap-2">
                <div className="flex justify-center">
                  <DragonButton
                    color="green"
                    disabled={isUiLocked}
                    onCollect={() => handleCollectDragons('green')}
                  />
                </div>
                <div className="flex justify-center">
                  <DragonButton
                    color="red"
                    disabled={isUiLocked}
                    onCollect={() => handleCollectDragons('red')}
                  />
                </div>
                <div className="flex justify-center">
                  <DragonButton
                    color="black"
                    disabled={isUiLocked}
                    onCollect={() => handleCollectDragons('black')}
                  />
                </div>
                <div />
              </div>
            </div>

            <div className="flex flex-col gap-4 items-center justify-self-center">
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
              {isDealingCards && (
                <Card
                  card={{ id: 'deal-dummy', kind: 'flower' }}
                  cardStyle={cardStyle}
                  className="absolute pointer-events-none"
                  dataIdDisabled
                  disabled={true}
                  isFaceDown={true}
                />
              )}
              {state.foundations.flower && (
                <Card
                  card={{ id: 'flower', kind: 'flower' }}
                  cardStyle={cardStyle}
                  className={cn(
                    shouldHideCard('flower') && "opacity-0 instant-hide",
                    movingCardIds.has('flower') && "pointer-events-none"
                  )}
                  disableLayout={movingCardIds.has('flower') || skipLayoutIds.has('flower')}
                  disabled={true}
                />
              )}
            </DroppableZone>

          </div>

          <div className="flex items-start justify-end justify-self-end">
            <div className="grid grid-cols-3 gap-2 items-start">
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
                        className={cn(
                          shouldHideCard(foundationCard.id) && "opacity-0 instant-hide",
                          movingCardIds.has(foundationCard.id) && "pointer-events-none"
                        )}
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

              <div className="col-start-2 flex justify-center mt-2">
                <button
                  className={cn(
                    "w-16 h-12 rounded-md border-2 flex items-center justify-center transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed",
                    isAutoSolveActive
                      ? "bg-cyan-900/50 border-cyan-500 text-cyan-400 hover:bg-cyan-800 hover:text-white shadow-[0_0_10px_rgba(34,211,238,0.3)] cursor-pointer"
                      : "bg-slate-900 active:scale-95 active:brightness-90 disabled:pointer-events-auto opacity-50",
                  )}
                  onClick={handleAutoSolve}
                  disabled={isUiLocked || !isAutoSolveActive}
                >
                  <CheckCheck className="size-5" />
                </button>
              </div>
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
                  {column.slice(0, isDealingCards ? dealtCounts[i] : column.length).map((card, index) => {
                    const isBeingDragged = draggedStack.some(c => c.id === card.id)
                    const isTopCard = index === column.length - 1
                    const canMove = !areCardsFaceDown && isTopCard && canMoveToFoundation(card)
                    const isDraggable = canDragCard(card.id)

                    return (
                      <div key={card.id} style={{ marginTop: index === 0 ? 0 : '-8rem' }}>
                        <Card
                          card={card}
                          cardStyle={cardStyle}
                          className={cn(
                            isBeingDragged ? "opacity-0" : "",
                            shouldHideCard(card.id) && "opacity-0 instant-hide",
                            movingCardIds.has(card.id) && "pointer-events-none",
                            state.status === 'paused' ? "opacity-0" : ""
                          )}
                      disableLayout={skipLayoutIds.has(card.id) || movingCardIds.has(card.id) || movingColumnIds.has(i)}
                          onClick={() => handleCardClick(card)}
                          canMoveToFoundation={canMove}
                          disabled={isBoardLocked || !isDraggable}
                          isFaceDown={areCardsFaceDown}
                        />
                      </div>
                    )
              })}
            </DroppableZone>
          ))}
        </div>

          <ControlPanel onUndo={handleUndo} isInputLocked={isUiLocked} />
        </div>
      </LayoutGroup>
    </DndContext>
  )
}
