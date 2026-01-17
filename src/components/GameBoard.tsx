import { useStore } from '@tanstack/react-store'
import { CheckCheck, Flower } from 'lucide-react'
import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { LayoutGroup, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { CardColor, Card as CardType, DragonColor } from '@/lib/types'
import type { ReactNode } from 'react'
import { collectDragons, computeUndoState, gameStore, moveCard, newGame, triggerAutoMove, undo } from '@/lib/store'
import { Card } from '@/components/Card'
import { ControlPanel } from '@/components/ControlPanel'
import { cn } from '@/lib/utils'
import { DragonButton } from '@/components/DragonButton'

function DroppableZone({ id, children, className }: Readonly<{ id: string, children: ReactNode, className?: string }>) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      data-zone-id={id}
      className={cn(
        className,
        isOver && "ring-2 ring-inset ring-white/80 border-white/80",
      )}
    >
      {children}
    </div>
  )
}

const FREE_CELL_IDS = ['free-0', 'free-1', 'free-2'] as const
const COLUMN_IDS = ['col-0', 'col-1', 'col-2', 'col-3', 'col-4', 'col-5', 'col-6', 'col-7'] as const
const FOUNDATION_COLORS: Array<CardColor> = ['green', 'red', 'black']
const DRAGON_IDS = [0, 1, 2, 3]

const getIndexFromZoneId = (id: string) => Number.parseInt(id.split('-')[1] ?? '0', 10)
type GameState = typeof gameStore.state
type DragonLocation = { card: CardType; source: 'col' | 'free'; index: number }

const getTopCard = (column: Array<CardType>) => column.at(-1) ?? null

const findCardForRankInState = (currentState: GameState, color: CardColor, rank: number) => {
  const freeCard = currentState.freeCells.find(
    c => c?.kind === 'normal' && c.color === color && c.value === rank,
  )
  if (freeCard) return freeCard

  for (const col of currentState.columns) {
    const card = getTopCard(col)
    if (card?.kind === 'normal' && card.color === color && card.value === rank) {
      return card
    }
  }

  return null
}

const getAutoSolveMoves = (currentState: GameState) => {
  const minFoundation = Math.min(
    currentState.foundations.green,
    currentState.foundations.red,
    currentState.foundations.black,
  )
  const nextRank = minFoundation + 1
  if (nextRank > 9) return null

  const moves: Array<{ card: CardType; targetId: string }> = []

  for (const color of FOUNDATION_COLORS) {
    if (currentState.foundations[color] >= nextRank) continue
    const card = findCardForRankInState(currentState, color, nextRank)
    if (!card) return null
    moves.push({ card, targetId: `foundation-${color}` })
  }

  return moves.length > 0 ? moves : null
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const getDragonLocationsForState = (currentState: GameState, color: DragonColor) => {
  const locations: Array<DragonLocation> = []

  for (const idSuffix of DRAGON_IDS) {
    const id = `dragon-${color}-${idSuffix}`
    const freeIdx = currentState.freeCells.findIndex(c => c?.id === id)
    if (freeIdx !== -1) {
      locations.push({ card: currentState.freeCells[freeIdx]!, source: 'free', index: freeIdx })
      continue
    }

    const colIndex = currentState.columns.findIndex(col => getTopCard(col)?.id === id)
    if (colIndex !== -1) {
      const card = getTopCard(currentState.columns[colIndex])
      if (card) {
        locations.push({ card, source: 'col', index: colIndex })
        continue
      }
    }

    return { locations, allFound: false }
  }

  return { locations, allFound: true }
}

const getDragonTargetFreeIndex = (locations: Array<DragonLocation>, freeCells: Array<CardType | null>) => {
  const occupied = locations.find(loc => loc.source === 'free')
  if (occupied) return occupied.index
  return freeCells.indexOf(null)
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

const isPlayableState = (currentState: GameState) => currentState.status === 'playing' || currentState.devMode

const getFoundationTargetId = (
  card: CardType,
  currentState: GameState,
  flowerAvailable: boolean,
) => {
  if (card.kind === 'flower') {
    return flowerAvailable ? 'foundation-flower' : null
  }

  if (card.kind === 'normal') {
    const currentVal = currentState.foundations[card.color]
    return card.value === currentVal + 1 ? `foundation-${card.color}` : null
  }

  return null
}

const getLastFreeCellId = (currentState: GameState) => {
  for (let i = currentState.freeCells.length - 1; i >= 0; i--) {
    if (currentState.freeCells[i] === null) {
      return `free-${i}`
    }
  }

  return null
}

export function GameBoard() {
  const state = useStore(gameStore)
  const [cardStyle] = useState<'filled' | 'outlined'>('outlined')
  const [movingCardIds, setMovingCardIds] = useState<Set<string>>(() => new Set())
  const [movingColumnIds, setMovingColumnIds] = useState<Set<number>>(() => new Set())
  const [floatingCards, setFloatingCards] = useState<Array<FloatingCardMove>>([])
  const [isAutoMoving, setIsAutoMoving] = useState<boolean>(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [undoPreviewFoundations, setUndoPreviewFoundations] = useState<GameState['foundations'] | null>(null)
  const [skipLayoutIds, setSkipLayoutIds] = useState<Set<string>>(() => new Set())
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const [isDealingCards, setIsDealingCards] = useState(false)
  const [isFlipping, setIsFlipping] = useState(false)
  const [areCardsFaceDown, setAreCardsFaceDown] = useState(false)
  const [dealtCounts, setDealtCounts] = useState<Array<number>>(() => new Array(8).fill(0))
  const dealRunRef = useRef(0)
  const dealCancelledRef = useRef(false)
  const previousStatusRef = useRef<GameState['status']>(state.status)

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
  const isBoardLocked = isUiLocked || isUndoing || state.status === 'paused'

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
    return state.columns.some(col => col.at(-1)?.kind === 'flower')
  }, [state.freeCells, state.columns, state.foundations.flower])

  const isAutoSolveActive = useMemo(() => {
    return Boolean(getAutoSolveMoves(state))
  }, [state.foundations, state.columns, state.freeCells])

  const shouldHideCard = (cardId: string) => movingCardIds.has(cardId)
  const removeFloatingCard = (animationId: string) => {
    setFloatingCards(prev => prev.filter(item => item.id !== animationId))
  }
  const appendFloatingCard = (move: FloatingCardMove) => {
    setFloatingCards(prev => [...prev, move])
  }
  const updateMovingCardIds = (cardIds: Array<string>, action: 'add' | 'delete') => {
    setMovingCardIds(prev => {
      const next = new Set(prev)
      for (const id of cardIds) {
        if (action === 'add') {
          next.add(id)
        } else {
          next.delete(id)
        }
      }
      return next
    })
  }
  const enqueueFloatingMove = (
    move: Omit<FloatingCardMove, 'onComplete'>,
    onStart?: () => void,
  ) => {
    return new Promise<void>((resolve) => {
      const onComplete = () => {
        removeFloatingCard(move.id)
        resolve()
      }
      const moveWithComplete = { ...move, onComplete }

      flushSync(() => {
        onStart?.()
        appendFloatingCard(moveWithComplete)
      })
    })
  }

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

    FOUNDATION_COLORS.forEach((color) => {
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
      return { id: 'flower', kind: 'flower', color: null }
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

  const markCardMoving = (cardId: string, sourceColumnIndex: number | null) => {
    setMovingCardIds(prev => new Set(prev).add(cardId))
    if (sourceColumnIndex !== null) {
      setMovingColumnIds(prev => {
        const next = new Set(prev)
        next.add(sourceColumnIndex)
        return next
      })
    }
    setSkipLayoutIds(prev => {
      const next = new Set(prev)
      next.add(cardId)
      return next
    })
  }

  const finalizeCardMove = (
    cardId: string,
    targetId: string,
    sourceColumnIndex: number | null,
    skipAutoMove: boolean,
  ) => {
    flushSync(() => {
      moveCard(cardId, targetId, skipAutoMove)
      setSkipLayoutIds(prev => {
        const next = new Set(prev)
        next.add(cardId)
        return next
      })
      setMovingCardIds(prev => {
        const next = new Set(prev)
        next.delete(cardId)
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
  }

  const runAnimatedMove = (
    card: CardType,
    targetId: string,
    sourceColumnIndex: number | null,
    skipAutoMove: boolean,
    onAfterMove?: () => void,
  ) => {
    const animation = animateCardMove(card, targetId, () => {
      markCardMoving(card.id, sourceColumnIndex)
    })

    animation.finally(() => {
      finalizeCardMove(card.id, targetId, sourceColumnIndex, skipAutoMove)
      onAfterMove?.()
    })
  }

  const finalizeUndoMoves = (movingIds: Array<string>) => {
    flushSync(() => {
      undo()
      setUndoPreviewFoundations(null)
      setMovingCardIds(prev => {
        const next = new Set(prev)
        for (const id of movingIds) {
          next.delete(id)
        }
        return next
      })
      setIsUndoing(false)
    })
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

    await enqueueFloatingMove(
      {
        id: animationId,
        card,
        from,
        to,
      },
      onStart,
    )
  }

  const animateCardFromTo = async (
    card: CardType,
    from: DOMRect,
    to: DOMRect,
    options: { isFaceDown?: boolean; transitionType?: 'spring' | 'tween'; duration?: number } = {},
  ) => {
    if (Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1) return

    const animationId = `${card.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`

    await enqueueFloatingMove({
      id: animationId,
      card,
      from,
      to,
      isFaceDown: options.isFaceDown,
      transitionType: options.transitionType,
      duration: options.duration,
    })
  }

  const runAutoSolveStep = async (moves: Array<{ card: CardType; targetId: string }>) => {
    updateMovingCardIds(
      moves.map(move => move.card.id),
      'add',
    )

    await Promise.all(moves.map(move => animateCardMove(move.card, move.targetId)))

    moves.forEach(move => {
      moveCard(move.card.id, move.targetId, true)
    })

    updateMovingCardIds(
      moves.map(move => move.card.id),
      'delete',
    )
  }

  const finalizeAutoSolveHistory = (historyStart: number) => {
    if (gameStore.state.history.length > historyStart + 1) {
      gameStore.setState(storeState => ({
        ...storeState,
        history: storeState.history.slice(0, historyStart + 1),
      }))
    }
  }

  const handleAutoSolve = async () => {
    if (isBoardLocked || !isAutoSolveActive) return
    setIsAutoMoving(true)

    try {
      const historyStart = gameStore.state.history.length
      let moves = getAutoSolveMoves(gameStore.state)
      while (moves) {
        await runAutoSolveStep(moves)
        await wait(20)
        moves = getAutoSolveMoves(gameStore.state)
      }

      finalizeAutoSolveHistory(historyStart)
    } finally {
      setIsAutoMoving(false)
    }
  }

  const handleCollectDragons = async (color: DragonColor) => {
    if (isBoardLocked) return

    const currentState = gameStore.state
    if (!isPlayableState(currentState)) return

    const { locations, allFound } = getDragonLocationsForState(currentState, color)
    if (!allFound && !currentState.devMode) return
    if (locations.length !== DRAGON_IDS.length && !currentState.devMode) return

    const targetFreeIndex = getDragonTargetFreeIndex(locations, currentState.freeCells)
    if (targetFreeIndex === -1) return

    const targetId = `free-${targetFreeIndex}`
    setIsAutoMoving(true)

    try {
      updateMovingCardIds(
        locations.map(loc => loc.card.id),
        'add',
      )

      await Promise.all(locations.map(loc => animateCardMove(loc.card, targetId)))
      collectDragons(color)
    } finally {
      updateMovingCardIds(
        locations.map(loc => loc.card.id),
        'delete',
      )
      setIsAutoMoving(false)
    }
  }

  function canStack(bottomCard: CardType, topCard: CardType): boolean {
    if (bottomCard.kind !== 'normal' || topCard.kind !== 'normal') return false
    if (bottomCard.value !== topCard.value + 1) return false
    if (bottomCard.color === topCard.color) return false
    return true
  }

  const isValidStackSequence = (column: Array<CardType>, startIndex: number) => {
    for (let i = startIndex; i < column.length - 1; i++) {
      if (!canStack(column[i], column[i + 1])) return false
    }
    return true
  }

  const getDraggedStackForCard = (cardId: string, currentState: typeof state) => {
    for (const column of currentState.columns) {
      const index = column.findIndex(c => c.id === cardId)
      if (index === -1) continue

      if (!currentState.devMode && index < column.length - 1 && !isValidStackSequence(column, index)) {
        return []
      }

      return column.slice(index)
    }

    const freeCard = currentState.freeCells.find(c => c?.id === cardId)
    return freeCard ? [freeCard] : []
  }

  function canDragCard(cardId: string): boolean {
    if (isBoardLocked) return false
    if (state.devMode || state.freeCells.some(c => c?.id === cardId)) return true

    for (const column of state.columns) {
      const index = column.findIndex(c => c.id === cardId)
      if (index !== -1) {
        if (index === column.length - 1) return true

        for (let i = index; i < column.length - 1; i++) {
          if (!canStack(column[i], column[i + 1])) {
            return false
          }
        }
      }
    }

    return true
  }

  function handleDragStart(event: DragStartEvent) {
    if (isBoardLocked) return
    const { active } = event
    const cardId = active.id as string
    setActiveId(cardId)
    setDraggedStack(getDraggedStackForCard(cardId, state))
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
  }, [state.status, state.history.length, isDealingCards, isFlipping, triggerAutoMove])

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
    return currentState.columns.some(col => col.at(-1)?.kind === 'flower')
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
        const isTop = column.slice(cardIndex + 1).every(card => movingCardIds.has(card.id))
        return {
          type: 'col' as const,
          index: i,
          isTop,
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
    const columnStyle = globalThis.getComputedStyle(columnEl)
    const paddingTop = Number.parseFloat(columnStyle.paddingTop || '0') || 0
    const left = columnRect.left + (columnRect.width - cardRect.width) / 2
    const top = columnRect.top + paddingTop + location.cardIndex * stackOffset
    return new DOMRect(left, top, cardRect.width, cardRect.height)
  }

  const resetDealState = () => {
    setIsDealingCards(true)
    setIsFlipping(false)
    setAreCardsFaceDown(true)
    setDealtCounts(new Array(state.columns.length).fill(0))
    setFloatingCards([])
  }

  const getDealSourceRect = () => {
    const sourceZone = document.querySelector('[data-zone-id="foundation-flower"]')
    return sourceZone ? sourceZone.getBoundingClientRect() : null
  }

  const dealColumnCards = async (
    columnCards: Array<CardType>,
    colIndex: number,
    fromRect: DOMRect,
    stackOffset: number,
    perCardDuration: number,
    isCancelled: () => boolean,
  ) => {
    for (const card of columnCards) {
      if (isCancelled()) return true

      const toRect = getTargetRectForState(gameStore.state, card.id, fromRect, stackOffset)
      if (!toRect) continue

      await animateCardFromTo(card, fromRect, toRect, {
        isFaceDown: true,
        transitionType: 'tween',
        duration: perCardDuration,
      })
      setDealtCounts(prev => {
        const next = [...prev]
        next[colIndex] = Math.min(next[colIndex] + 1, columnCards.length)
        return next
      })
    }

    return false
  }

  const waitForDealFrames = async (isCancelled: () => boolean) => {
    await new Promise(requestAnimationFrame)
    if (isCancelled()) return true
    await new Promise(requestAnimationFrame)
    return isCancelled()
  }

  const runDealFlip = async (isCancelled: () => boolean) => {
    if (await waitForDealFrames(isCancelled)) return true
    setIsDealingCards(false)
    const flipDurationMs = 500
    setIsFlipping(true)
    setAreCardsFaceDown(false)
    await wait(flipDurationMs)
    if (isCancelled()) return true
    setIsFlipping(false)
    return false
  }

  function handleCardDoubleClick(card: CardType) {
    if (isBoardLocked) return
    if (movingCardIds.has(card.id)) return

    const currentState = gameStore.state
    if (!isPlayableState(currentState)) return
    const location = getCardLocation(currentState, card.id)
    if (!location?.isTop) return
    if (card.kind === 'dragon' && card.isLocked) return

    const sourceColumnIndex = location.type === 'col' ? location.index : null
    const flowerAvailable = isFlowerAvailableForState(currentState)
    const targetFoundationId = getFoundationTargetId(card, currentState, flowerAvailable)

    if (targetFoundationId) {
      runAnimatedMove(card, targetFoundationId, sourceColumnIndex, false)
      return
    }

    if (location.type === 'free') return

    const targetFreeCellId = getLastFreeCellId(currentState)
    if (targetFreeCellId) {
      runAnimatedMove(card, targetFreeCellId, sourceColumnIndex, true, () => {
        triggerAutoMove()
      })
    }
  }

  function handleCardClick(card: CardType) {
    if (isBoardLocked) return
    const now = Date.now()
    const lastClick = lastClickRef.current
    const isDouble = lastClick !== null && lastClick.id === card.id && now - lastClick.time < 320

    if (isDouble) {
      lastClickRef.current = null
      handleCardDoubleClick(card)
      return
    }

    lastClickRef.current = { id: card.id, time: now }
  }

  const isPriorityUndoCard = (cardId: string, currentPosition: string, targetPosition: string) => {
    if (!cardId.startsWith('normal-') || !cardId.endsWith('-1')) return false
    if (!currentPosition.startsWith('foundation-')) return false
    return targetPosition.startsWith('col-') || targetPosition.startsWith('free-')
  }

  const collectUndoMovements = (
    currentState: typeof gameStore.state,
    targetState: typeof gameStore.state,
    stackOffset: number,
  ) => {
    const currentPositions = getCardPositionMap(currentState)
    const targetPositions = getCardPositionMap(targetState)
    const movingIds: Array<string> = []
    const priorityIds = new Set<string>()
    const fromRects = new Map<string, DOMRect>()
    const toRects = new Map<string, DOMRect>()

    for (const [cardId, targetPosition] of targetPositions) {
      const currentPosition = currentPositions.get(cardId)
      if (!currentPosition || currentPosition === targetPosition) continue
      if (isPriorityUndoCard(cardId, currentPosition, targetPosition)) {
        priorityIds.add(cardId)
      }

      const sourceEl = document.querySelector(`[data-card-id="${cardId}"]`)
      if (!sourceEl) continue

      const fromRect = sourceEl.getBoundingClientRect()
      const toRect = getTargetRectForState(targetState, cardId, fromRect, stackOffset)
      if (!toRect) continue

      fromRects.set(cardId, fromRect)
      toRects.set(cardId, toRect)
      movingIds.push(cardId)
    }

    return { movingIds, fromRects, toRects, priorityIds }
  }

  const buildUndoFloatingMoves = (
    targetState: typeof gameStore.state,
    movingIds: Array<string>,
    fromRects: Map<string, DOMRect>,
    toRects: Map<string, DOMRect>,
    priorityIds: Set<string>,
  ) => {
    const pendingMoves: Array<FloatingCardMove> = []
    const remaining = { count: 0 }

    for (const cardId of movingIds) {
      const from = fromRects.get(cardId)
      const to = toRects.get(cardId)
      if (!from || !to) continue
      if (Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1) continue

      const card = getCardFromState(targetState, cardId)
      if (!card) continue

      remaining.count += 1
      const animationId = `${card.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const onComplete = () => {
        removeFloatingCard(animationId)
        remaining.count -= 1
        if (remaining.count === 0) {
          finalizeUndoMoves(movingIds)
        }
      }

      const isPriority = priorityIds.has(cardId)
      pendingMoves.push({
        id: animationId,
        card,
        from,
        to,
        onComplete,
        transitionType: isPriority ? 'tween' : undefined,
        duration: isPriority ? 0.2 : undefined,
      })
    }

    return { pendingMoves }
  }

  const handleUndo = () => {
    if (isUndoing || isUiLocked) return

    const currentState = gameStore.state
    const targetState = computeUndoState(currentState)
    if (!targetState) return

    const stackOffset = getStackOffset()
    const { movingIds, fromRects, toRects, priorityIds } = collectUndoMovements(
      currentState,
      targetState,
      stackOffset,
    )

    if (movingIds.length === 0) {
      undo()
      return
    }

    const { pendingMoves } = buildUndoFloatingMoves(
      targetState,
      movingIds,
      fromRects,
      toRects,
      priorityIds,
    )

    if (pendingMoves.length === 0) {
      undo()
      return
    }

    flushSync(() => {
      setIsUndoing(true)
      setUndoPreviewFoundations(targetState.foundations)
      setSkipLayoutIds(new Set(movingIds))
      updateMovingCardIds(movingIds, 'add')
      setFloatingCards(prev => [...prev, ...pendingMoves])
    })
  }

  useLayoutEffect(() => {
    if (state.status !== 'playing') return

    dealCancelledRef.current = false
    const runId = dealRunRef.current + 1
    dealRunRef.current = runId
    const isCancelled = () => dealCancelledRef.current || dealRunRef.current !== runId

    const runDeal = async () => {
      resetDealState()

      await wait(50)
      if (isCancelled()) return

      const stackOffset = getStackOffset()
      const dealColumns = gameStore.state.columns
      const cardsPerColumn = dealColumns[0]?.length ?? 0
      const columnDealDuration = 0.3
      const perCardDuration = cardsPerColumn > 0 ? columnDealDuration / cardsPerColumn : columnDealDuration

      for (const [colIndex, columnCards] of dealColumns.entries()) {
        if (isCancelled()) return
        const fromRect = getDealSourceRect()
        if (!fromRect) continue
        const didCancel = await dealColumnCards(
          columnCards,
          colIndex,
          fromRect,
          stackOffset,
          perCardDuration,
          isCancelled,
        )
        if (didCancel) return
      }

      await runDealFlip(isCancelled)
    }

    runDeal()

    return () => {
      dealCancelledRef.current = true
    }
  }, [state.gameId])

  useEffect(() => {
    const previousStatus = previousStatusRef.current
    if (previousStatus === state.status) return
    previousStatusRef.current = state.status

    const runPauseFlip = async (faceDown: boolean) => {
      const flipDurationMs = 500
      setIsFlipping(true)
      setAreCardsFaceDown(faceDown)
      await wait(flipDurationMs)
      setIsFlipping(false)
    }

    if (previousStatus === 'playing' && state.status === 'paused') {
      runPauseFlip(true)
      return
    }

    if (previousStatus === 'paused' && state.status === 'playing') {
      runPauseFlip(false)
    }
  }, [state.status])

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <LayoutGroup id={`game-${state.gameId}`}>
        <div key={state.gameId} className="game-board w-full max-w-7xl mx-auto px-2 py-4 sm:p-4 flex flex-col items-center min-h-screen relative pb-4">

          <DragOverlay>
            {activeId && draggedStack.length > 0 ? (
              <div className="flex flex-col gap-[-3rem]">
                {draggedStack.map((card, index) => (
                  <div key={card.id} style={{ marginTop: index === 0 ? 0 : 'var(--card-stack-offset)' }}>
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

          <div className="w-full grid grid-cols-1 md:grid-cols-3 items-start mb-4 sm:mb-8 gap-4 sm:gap-6 lg:gap-8">
            <div className="flex flex-col gap-3 justify-self-center sm:justify-self-start w-fit">
              <div className="grid grid-cols-4 gap-2 md:grid-cols-[repeat(4,var(--card-width))]">
                {FREE_CELL_IDS.map((zoneId) => {
                  const index = getIndexFromZoneId(zoneId)
                  const card = state.freeCells[index] ?? null
                  const isBeingDragged = draggedStack.some(c => c.id === card?.id)
                  const isMovingCard = card?.id ? movingCardIds.has(card.id) : false
                  return (
                    <DroppableZone key={zoneId} id={zoneId} className={cn(
                      "w-(--card-width) h-(--card-height) border-2 border-white/20 rounded-lg bg-white/5 flex items-center justify-center transition-opacity",
                      card?.kind === 'dragon' && card.isLocked && "opacity-50"
                    )}>
                      {card && (
                        <Card
                          card={card}
                          cardStyle={cardStyle}
                          className={cn(
                            isBeingDragged && "opacity-0",
                            shouldHideCard(card.id) && "opacity-0 instant-hide",
                            isMovingCard && "pointer-events-none",
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
            </div>

            <div className="flex flex-col gap-3 sm:gap-4 items-center justify-self-center">
              <DroppableZone
                id="foundation-flower"
                className={cn(
                  "w-(--card-width) h-(--card-height) border-2 border-white/20 rounded-lg bg-white/5 flex items-center justify-center relative transition-all duration-300",
                  (undoPreviewFoundations ?? state.foundations).flower && "opacity-50"
                )}
              >
                <Flower className={cn(
                  "text-white absolute size-6 sm:size-8",
                )} />
                {isDealingCards && (
                  <Card
                    card={{ id: 'deal-dummy', kind: 'flower', color: null }}
                    cardStyle={cardStyle}
                    className="absolute pointer-events-none"
                    dataIdDisabled
                    disabled={true}
                    isFaceDown={true}
                  />
                )}
                {(undoPreviewFoundations ?? state.foundations).flower && (
                  <Card
                    card={{ id: 'flower', kind: 'flower', color: null }}
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

              <div className="flex items-center justify-center gap-3 sm:gap-7">
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
                <button
                  className={cn(
                    "w-12 h-10 sm:w-16 sm:h-12 rounded-md border-2 flex items-center justify-center transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed",
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

            <div className="flex items-start justify-self-center sm:justify-self-end">
              <div className="grid grid-cols-[repeat(3,var(--card-width))] gap-2 items-start w-fit">
                {(['green', 'red', 'black'] as const).map((color) => {
                  const value = (undoPreviewFoundations ?? state.foundations)[color]
                  const foundationCard: CardType | null = value > 0 ? {
                    id: `normal-${color}-${value}`,
                    kind: 'normal',
                    color,
                    value,
                  } : null

                  return (
                    <DroppableZone key={color} id={`foundation-${color}`} className={cn(
                      "w-(--card-width) h-(--card-height) border-2 border-white/20 rounded-lg bg-white/5 flex items-center justify-center relative transition-opacity",
                      foundationCard && "opacity-50"
                    )}>
                      <img
                        src="/logo.png"
                        alt=""
                        aria-hidden="true"
                        className="absolute left-1/2 top-1/2 size-12 sm:size-16 -translate-x-1/2 -translate-y-1/2 opacity-30 pointer-events-none"
                      />
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
                        <div className="text-emerald-900/30 font-bold text-2xl sm:text-3xl opacity-70">
                          {/* Empty placeholder */}
                        </div>
                      )}
                    </DroppableZone>
                  )
                })}

              </div>
            </div>
          </div>

        <div className="w-full overflow-x-auto pb-2 sm:pb-0">
          <div className="inline-flex w-max gap-2 sm:gap-4 px-2">
            {COLUMN_IDS.map((columnId) => {
              const columnIndex = getIndexFromZoneId(columnId)
              const column = state.columns[columnIndex] ?? []
              const visibleCount = isDealingCards ? dealtCounts[columnIndex] : column.length

              return (
                <DroppableZone
                  key={columnId}
                  id={columnId}
                  className="w-(--column-width) min-h-(--column-min-height) flex flex-col gap-[-8rem] p-1 border-2 border-white/10 rounded-lg bg-white/5 items-center pt-2"
                >
                  {column.slice(0, visibleCount).map((card, index) => {
                    const isBeingDragged = draggedStack.some(c => c.id === card.id)
                    const isTopCard = index === column.length - 1
                    const canMove = !areCardsFaceDown && isTopCard && canMoveToFoundation(card)
                    const isDraggable = canDragCard(card.id)

                    return (
                      <div key={card.id} style={{ marginTop: index === 0 ? 0 : 'var(--card-stack-offset)' }}>
                        <Card
                          card={card}
                          cardStyle={cardStyle}
                          className={cn(
                            isBeingDragged ? "opacity-0" : "",
                            shouldHideCard(card.id) && "opacity-0 instant-hide",
                            movingCardIds.has(card.id) && "pointer-events-none",
                          )}
                          disableLayout={skipLayoutIds.has(card.id) || movingCardIds.has(card.id) || movingColumnIds.has(columnIndex)}
                          onClick={() => handleCardClick(card)}
                          canMoveToFoundation={canMove}
                          disabled={isBoardLocked || !isDraggable}
                          isFaceDown={areCardsFaceDown}
                        />
                      </div>
                    )
                  })}
                </DroppableZone>
              )
            })}
          </div>
        </div>

          <ControlPanel onUndo={handleUndo} isInputLocked={isUiLocked} />
        </div>
      </LayoutGroup>
    </DndContext>
  )
}
