import { Store } from '@tanstack/store'
import type { Card, CardColor, DragonColor } from '@/lib/types'

export type GameStatus = 'idle' | 'playing' | 'paused' | 'won'

interface GameState {
  columns: Array<Array<Card>>
  freeCells: Array<Card | null>
  initialColumns: Array<Array<Card>>
  initialFreeCells: Array<Card | null>
  foundations: {
    green: number
    red: number
    black: number
    flower: boolean
  }
  dragons: {
    green: number
    red: number
    black: number
  }
  status: GameStatus
  history: Array<Omit<GameState, 'history' | 'status'> & { isAuto?: boolean }>
  devMode: boolean
  gameId: number
  startTime: number | null
  elapsedTime: number
  timerRunning: boolean
  isTimerVisible: boolean
  isUndoEnabled: boolean
  isNoAutoMoveFirstMove: boolean
  isLocked?: boolean
}

function createDeck(): Array<Card> {
  const deck: Array<Card> = []

  const colors: Array<CardColor> = ['green', 'red', 'black']
  colors.forEach(color => {
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `normal-${color}-${i}`, kind: 'normal', color, value: i })
    }
  })

  const dragonColors: Array<DragonColor> = ['green', 'red', 'black']
  dragonColors.forEach(color => {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `dragon-${color}-${i}`, kind: 'dragon', color })
    }
  })

  deck.push({ id: 'flower', kind: 'flower', color: null })

  return deck
}

function shuffle<T>(array: Array<T>): Array<T> {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}

const TIMER_VISIBILITY_KEY = 'shenzhen-solitaire-timer-visible'
const UNDO_ENABLED_KEY = 'shenzhen-solitaire-undo-enabled'
const NO_AUTO_MOVE_FIRST_MOVE_KEY = 'shenzhen-solitaire-no-auto-move-first-move'

function getTimerVisibilityFromStorage(): boolean {
  try {
    const stored = globalThis.localStorage.getItem(TIMER_VISIBILITY_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

function saveTimerVisibilityToStorage(visible: boolean): void {
  try {
    globalThis.localStorage.setItem(TIMER_VISIBILITY_KEY, String(visible))
  } catch {
  }
}

function getUndoEnabledFromStorage(): boolean {
  try {
    const stored = globalThis.localStorage.getItem(UNDO_ENABLED_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

function saveUndoEnabledToStorage(enabled: boolean): void {
  try {
    globalThis.localStorage.setItem(UNDO_ENABLED_KEY, String(enabled))
  } catch {
  }
}

function getNoAutoMoveFirstMoveFromStorage(): boolean {
  try {
    const stored = globalThis.localStorage.getItem(NO_AUTO_MOVE_FIRST_MOVE_KEY)
    return stored === 'true'
  } catch {
    return false
  }
}

function saveNoAutoMoveFirstMoveToStorage(enabled: boolean): void {
  try {
    globalThis.localStorage.setItem(NO_AUTO_MOVE_FIRST_MOVE_KEY, String(enabled))
  } catch {
  }
}

function dealCards(
  options: { noAutoMoveFirstMove?: boolean } = {},
): { columns: Array<Array<Card>>, freeCells: Array<Card | null> } {
  const { noAutoMoveFirstMove = false } = options

  const dealOnce = () => {
    const deck = shuffle(createDeck())
    const columns: Array<Array<Card>> = Array.from({ length: 8 }, () => [])
    const cardsPerColumn = Math.floor(deck.length / columns.length)
    let deckIndex = 0

    for (const column of columns) {
      for (let i = 0; i < cardsPerColumn; i++) {
        const card = deck[deckIndex]
        column.push(card)
        deckIndex += 1
      }
    }

    return {
      columns,
      freeCells: [null, null, null],
    }
  }

  if (!noAutoMoveFirstMove) return dealOnce()

  const maxAttempts = 500
  let attempt = 0
  let deal = dealOnce()
  while (attempt < maxAttempts && hasAutoMoveOnDeal(deal.columns)) {
    attempt += 1
    deal = dealOnce()
  }

  return deal
}

export const gameStore = new Store<GameState>({
  columns: Array.from({ length: 8 }, () => []),
  freeCells: [null, null, null],
  initialColumns: Array.from({ length: 8 }, () => []),
  initialFreeCells: [null, null, null],
  foundations: {
    green: 0,
    red: 0,
    black: 0,
    flower: false
  },
  dragons: {
    green: 0,
    red: 0,
    black: 0
  },
  status: 'idle',
  history: [],
  devMode: false,
  gameId: 0,
  startTime: null,
  elapsedTime: 0,
  timerRunning: false,
  isTimerVisible: true,
  isUndoEnabled: true,
  isNoAutoMoveFirstMove: false,
  isLocked: false,
})

export function syncTimerVisibility() {
  gameStore.setState(state => ({
    ...state,
    isTimerVisible: getTimerVisibilityFromStorage()
  }))
}

export function syncUndoEnabled() {
  gameStore.setState(state => ({
    ...state,
    isUndoEnabled: getUndoEnabledFromStorage()
  }))
}

export function syncNoAutoMoveFirstMove() {
  gameStore.setState(state => ({
    ...state,
    isNoAutoMoveFirstMove: getNoAutoMoveFirstMoveFromStorage(),
  }))
}

function canStack(bottomCard: Card, topCard: Card): boolean {
  if (bottomCard.kind !== 'normal' || topCard.kind !== 'normal') return false
  if (bottomCard.value !== topCard.value + 1) return false
  if (bottomCard.color === topCard.color) return false
  return true
}

type SourceLocation = { type: 'column'; index: number } | { type: 'free'; index: number }
type TargetLocation =
  | { type: 'column'; index: number }
  | { type: 'free'; index: number }
  | { type: 'foundation'; id: CardColor | 'flower' }
type HistoryEntry = Omit<GameState, 'history' | 'status'> & { isAuto?: boolean }

const FOUNDATION_COLORS: Array<CardColor> = ['green', 'red', 'black']
const DRAGON_IDS = [0, 1, 2, 3]

function createHistoryEntry(state: GameState, isAuto = false): HistoryEntry {
  return {
    columns: state.columns,
    freeCells: state.freeCells,
    initialColumns: state.initialColumns,
    initialFreeCells: state.initialFreeCells,
    foundations: state.foundations,
    dragons: state.dragons,
    devMode: state.devMode,
    gameId: state.gameId,
    startTime: state.startTime,
    elapsedTime: state.elapsedTime,
    timerRunning: state.timerRunning,
    isTimerVisible: state.isTimerVisible,
    isUndoEnabled: state.isUndoEnabled,
    isNoAutoMoveFirstMove: state.isNoAutoMoveFirstMove,
    isLocked: state.isLocked,
    isAuto,
  }
}

function isWinState(
  foundations: GameState['foundations'],
  dragons: GameState['dragons'],
): boolean {
  return (
    foundations.green === 9 &&
    foundations.red === 9 &&
    foundations.black === 9 &&
    foundations.flower &&
    dragons.green === 1 &&
    dragons.red === 1 &&
    dragons.black === 1
  )
}

function ensureTimerRunning(state: GameState) {
  if (!state.timerRunning && state.status === 'playing') {
    return {
      timerRunning: true,
      startTime: Date.now() - state.elapsedTime,
    }
  }
  return { timerRunning: state.timerRunning, startTime: state.startTime }
}

const isPlayableState = (state: GameState) => state.status === 'playing' || state.devMode

function getCardSource(state: GameState, cardId: string) {
  for (const [index, column] of state.columns.entries()) {
    const card = column.find(c => c.id === cardId)
    if (card) {
      return { card, source: { type: 'column', index } as const }
    }
  }

  const freeIndex = state.freeCells.findIndex(c => c?.id === cardId)
  if (freeIndex !== -1) {
    return { card: state.freeCells[freeIndex]!, source: { type: 'free', index: freeIndex } as const }
  }

  return null
}

function parseTarget(targetId: string): TargetLocation | null {
  if (targetId.startsWith('col-')) {
    const index = Number.parseInt(targetId.split('-')[1] ?? '', 10)
    if (Number.isNaN(index)) return null
    return { type: 'column', index }
  }
  if (targetId.startsWith('free-')) {
    const index = Number.parseInt(targetId.split('-')[1] ?? '', 10)
    if (Number.isNaN(index)) return null
    return { type: 'free', index }
  }
  if (targetId.startsWith('foundation-')) {
    const id = targetId.split('-')[1]
    if (!id) return null
    return { type: 'foundation', id: id as CardColor | 'flower' }
  }
  return null
}

function isValidSequence(cards: Array<Card>) {
  for (let i = 0; i < cards.length - 1; i++) {
    if (!canStack(cards[i], cards[i + 1])) return false
  }
  return true
}

function getMoveStateForSource(state: GameState, cardId: string, source: SourceLocation) {
  const newColumns = state.columns.map(col => [...col])
  const newFreeCells = [...state.freeCells]

  if (source.type === 'column') {
    const col = newColumns[source.index]
    const cardIndex = col.findIndex(c => c.id === cardId)
    if (cardIndex === -1) return null
    const cardsToMove = col.slice(cardIndex)
    if (!state.devMode && !isValidSequence(cardsToMove)) return null
    newColumns[source.index] = col.slice(0, cardIndex)
    return { cardsToMove, newColumns, newFreeCells }
  }

  const card = newFreeCells[source.index]
  if (!card) return null
  newFreeCells[source.index] = null
  return { cardsToMove: [card], newColumns, newFreeCells }
}

type DragonLocation = { type: 'col'; index: number } | { type: 'free'; index: number }

function getDragonLocations(state: GameState, color: DragonColor) {
  const locations: Array<DragonLocation> = []

  for (const idSuffix of DRAGON_IDS) {
    const id = `dragon-${color}-${idSuffix}`
    const freeIdx = state.freeCells.findIndex(c => c?.id === id)
    if (freeIdx !== -1) {
      locations.push({ type: 'free', index: freeIdx })
      continue
    }

    const colIndex = state.columns.findIndex(col => col.at(-1)?.id === id)
    if (colIndex !== -1) {
      locations.push({ type: 'col', index: colIndex })
      continue
    }

    return { locations, allFound: false }
  }

  return { locations, allFound: true }
}

function getDragonTargetIndex(locations: Array<DragonLocation>, freeCells: Array<Card | null>) {
  const occupiedFreeIndex = locations.find(loc => loc.type === 'free')?.index
  if (occupiedFreeIndex !== undefined) return occupiedFreeIndex
  return freeCells.indexOf(null)
}

function getNextRankLocations(state: GameState) {
  const minFoundation = Math.min(state.foundations.green, state.foundations.red, state.foundations.black)
  const nextRank = minFoundation + 1
  if (nextRank > 9) return null

  const locations: Array<{ id: string; source: 'col' | 'free'; index: number; color: CardColor }> = []

  for (const color of FOUNDATION_COLORS) {
    if (state.foundations[color] >= nextRank) continue

    const freeIdx = state.freeCells.findIndex(
      c => c?.kind === 'normal' && c.color === color && c.value === nextRank,
    )
    if (freeIdx !== -1) {
      locations.push({ id: state.freeCells[freeIdx]!.id, source: 'free', index: freeIdx, color })
      continue
    }

    const colIndex = state.columns.findIndex(col => {
      const card = col.at(-1)
      return card?.kind === 'normal' && card.color === color && card.value === nextRank
    })
    if (colIndex !== -1) {
      const card = state.columns[colIndex].at(-1)!
      locations.push({ id: card.id, source: 'col', index: colIndex, color })
      continue
    }

    return null
  }

  return { nextRank, locations }
}

function applyAutoSolveMove(
  state: GameState,
  nextRank: number,
  locations: Array<{ source: 'col' | 'free'; index: number; color: CardColor }>,
) {
  const newColumns = state.columns.map(col => [...col])
  const newFreeCells = [...state.freeCells]
  const newFoundations = { ...state.foundations }

  locations.forEach(loc => {
    if (loc.source === 'col') {
      newColumns[loc.index].pop()
    } else {
      newFreeCells[loc.index] = null
    }
    newFoundations[loc.color] = nextRank
  })

  return {
    ...state,
    columns: newColumns,
    freeCells: newFreeCells,
    foundations: newFoundations,
  }
}

function shouldAutoMoveCard(state: GameState, card: Card, isFoundationFull: boolean) {
  if (card.kind === 'normal') return card.value === 1
  if (card.kind === 'flower') return isFoundationFull || !state.foundations.flower
  return false
}

function hasAutoMoveOnDeal(columns: Array<Array<Card>>) {
  return columns.some(col => {
    const card = col.at(-1)
    if (!card) return false
    return card.kind === 'flower' || (card.kind === 'normal' && card.value === 1)
  })
}

function getAutoMoveCandidates(state: GameState, isFoundationFull: boolean) {
  const moves: Array<{ source: 'col' | 'free'; index: number; card: Card }> = []

  state.freeCells.forEach((card, index) => {
    if (!card) return
    if (shouldAutoMoveCard(state, card, isFoundationFull)) {
      moves.push({ source: 'free', index, card })
    }
  })

  state.columns.forEach((col, index) => {
    const card = col.at(-1)
    if (!card) return
    if (shouldAutoMoveCard(state, card, isFoundationFull)) {
      moves.push({ source: 'col', index, card })
    }
  })

  return moves
}

function applyAutoMoves(state: GameState, moves: Array<{ source: 'col' | 'free'; index: number; card: Card }>) {
  const newColumns = state.columns.map(col => [...col])
  const newFreeCells = [...state.freeCells]
  const newFoundations = { ...state.foundations }

  moves.forEach(move => {
    if (move.source === 'col') {
      newColumns[move.index].pop()
    } else {
      newFreeCells[move.index] = null
    }
    if (move.card.kind === 'normal') {
      newFoundations[move.card.color] = 1
    } else if (move.card.kind === 'flower') {
      newFoundations.flower = true
    }
  })

  let newHistory = state.history
  if (state.history.length > 0) {
    newHistory = [...state.history, createHistoryEntry(state, true)]
  }

  return {
    ...state,
    columns: newColumns,
    freeCells: newFreeCells,
    foundations: newFoundations,
    history: newHistory,
  }
}

type MoveResult = {
  newColumns: Array<Array<Card>>
  newFreeCells: Array<Card | null>
  newFoundations: GameState['foundations']
}

function applyMoveToColumn(
  state: GameState,
  targetIndex: number,
  cardsToMove: Array<Card>,
  newColumns: Array<Array<Card>>,
  newFreeCells: Array<Card | null>,
  newFoundations: GameState['foundations'],
): MoveResult | null {
  const targetCol = newColumns[targetIndex]
  const topCard = targetCol.at(-1)
  if (topCard && !state.devMode && !canStack(topCard, cardsToMove[0])) return null
  newColumns[targetIndex] = [...targetCol, ...cardsToMove]
  return { newColumns, newFreeCells, newFoundations }
}

function applyMoveToFreeCell(
  state: GameState,
  targetIndex: number,
  cardsToMove: Array<Card>,
  newColumns: Array<Array<Card>>,
  newFreeCells: Array<Card | null>,
  newFoundations: GameState['foundations'],
): MoveResult | null {
  const targetCard = state.freeCells[targetIndex]
  if (targetCard?.kind === 'dragon' && targetCard.isLocked) return null
  if (cardsToMove.length !== 1) return null
  if (newFreeCells[targetIndex] && !state.devMode) return null
  newFreeCells[targetIndex] = cardsToMove[0]
  return { newColumns, newFreeCells, newFoundations }
}

function applyMoveToFoundation(
  state: GameState,
  targetId: CardColor | 'flower',
  cardsToMove: Array<Card>,
  newColumns: Array<Array<Card>>,
  newFreeCells: Array<Card | null>,
  newFoundations: GameState['foundations'],
): MoveResult | null {
  if (cardsToMove.length !== 1) return null
  const card = cardsToMove[0]

  if (targetId === 'flower') {
    if (card.kind !== 'flower') return null
    newFoundations.flower = true
    return { newColumns, newFreeCells, newFoundations }
  }

  if (card.kind !== 'normal' || card.color !== targetId) return null
  const currentVal = newFoundations[targetId]
  if (card.value !== currentVal + 1 && !state.devMode) return null
  newFoundations[targetId] = card.value
  return { newColumns, newFreeCells, newFoundations }
}

function applyMoveToTarget(
  state: GameState,
  target: TargetLocation,
  cardsToMove: Array<Card>,
  newColumns: Array<Array<Card>>,
  newFreeCells: Array<Card | null>,
  newFoundations: GameState['foundations'],
) {
  switch (target.type) {
    case 'column':
      return applyMoveToColumn(
        state,
        target.index,
        cardsToMove,
        newColumns,
        newFreeCells,
        newFoundations,
      )
    case 'free':
      return applyMoveToFreeCell(
        state,
        target.index,
        cardsToMove,
        newColumns,
        newFreeCells,
        newFoundations,
      )
    case 'foundation':
      return applyMoveToFoundation(
        state,
        target.id,
        cardsToMove,
        newColumns,
        newFreeCells,
        newFoundations,
      )
    default:
      return null
  }
}

function applyCardMove(
  state: GameState,
  cardId: string,
  targetId: string,
): { columns: Array<Array<Card>>; freeCells: Array<Card | null>; foundations: GameState['foundations']; history: GameState['history'] } | null {
  const sourceInfo = getCardSource(state, cardId)
  if (!sourceInfo) return null

  const target = parseTarget(targetId)
  if (!target) return null

  const moveState = getMoveStateForSource(state, cardId, sourceInfo.source)
  if (!moveState) return null

  const newFoundations = { ...state.foundations }
  const appliedMove = applyMoveToTarget(
    state,
    target,
    moveState.cardsToMove,
    moveState.newColumns,
    moveState.newFreeCells,
    newFoundations,
  )
  if (!appliedMove) return null

  return {
    columns: appliedMove.newColumns,
    freeCells: appliedMove.newFreeCells,
    foundations: appliedMove.newFoundations,
    history: [...state.history, createHistoryEntry(state)],
  }
}

export function moveCard(cardId: string, targetId: string, skipAutoMove: boolean = false) {
  gameStore.setState((state) => {
    if (!isPlayableState(state)) return state

    const timerState = ensureTimerRunning(state)
    const appliedMove = applyCardMove(state, cardId, targetId)
    if (!appliedMove) return state

    const isWin = isWinState(appliedMove.foundations, state.dragons)
    const nextState = {
      ...state,
      ...appliedMove,
      status: isWin ? 'won' : state.status,
      timerRunning: isWin ? false : timerState.timerRunning,
      startTime: timerState.startTime,
    }

    return skipAutoMove ? nextState : autoMoveOnes(nextState)
  })
}

export function collectDragons(color: DragonColor) {
  gameStore.setState((state) => {
    if (!isPlayableState(state)) return state
    if (state.dragons[color] > 0) return state

    const { locations, allFound } = getDragonLocations(state, color)
    if (!allFound && !state.devMode) return state
    if (locations.length !== DRAGON_IDS.length && !state.devMode) return state

    const targetFreeIndex = getDragonTargetIndex(locations, state.freeCells)
    if (targetFreeIndex === -1) return state

    const newColumns = state.columns.map(col => [...col])
    const newFreeCells = [...state.freeCells]

    locations.forEach(loc => {
      if (loc.type === 'col') {
        newColumns[loc.index].pop()
      } else {
        newFreeCells[loc.index] = null
      }
    })

    newFreeCells[targetFreeIndex] = {
      id: `dragon-${color}-locked`,
      kind: 'dragon',
      color,
      isLocked: true,
    }

    const nextState = {
      ...state,
      columns: newColumns,
      freeCells: newFreeCells,
      dragons: {
        ...state.dragons,
        [color]: 1,
      },
      history: [...state.history, createHistoryEntry(state)],
    }

    return autoMoveOnes(nextState)
  })
}

export function undo() {
    gameStore.setState((state) => computeUndoState(state) ?? state)
}

export function computeUndoState(state: GameState): GameState | null {
    if (!state.isUndoEnabled) return null
    if (state.history.length === 0) return null

    const history = [...state.history]
    let previous = history.pop()!
    let newState = {
        ...state,
        ...previous,
        history: history,
        status: 'playing' as GameStatus,
        timerRunning: true,
        isTimerVisible: state.isTimerVisible,
        isUndoEnabled: state.isUndoEnabled,
        isNoAutoMoveFirstMove: state.isNoAutoMoveFirstMove,
    }

    if (newState.status === 'playing') {
        newState.timerRunning = true
    }

    while (previous.isAuto && history.length > 0) {
        previous = history.pop()!
        newState = {
            ...newState,
            ...previous,
            history: history,
            isTimerVisible: state.isTimerVisible,
            isUndoEnabled: state.isUndoEnabled,
            isNoAutoMoveFirstMove: state.isNoAutoMoveFirstMove,
        }
    }

    return newState
}

export function newGame() {
    gameStore.setState((s) => {
        const newState = dealCards({ noAutoMoveFirstMove: s.isNoAutoMoveFirstMove })
        const initialColumns = newState.columns.map(col => [...col])
        const initialFreeCells = [...newState.freeCells]
        return {
            columns: newState.columns,
            freeCells: newState.freeCells,
            initialColumns,
            initialFreeCells,
            foundations: {
                green: 0,
                red: 0,
                black: 0,
                flower: false
            },
            dragons: {
                green: 0,
                red: 0,
                black: 0
            },
            status: 'playing',
            history: [],
            devMode: s.devMode,
            gameId: s.gameId + 1,
            startTime: null,
            elapsedTime: 0,
            timerRunning: false,
            isTimerVisible: s.isTimerVisible,
            isUndoEnabled: s.isUndoEnabled,
            isNoAutoMoveFirstMove: s.isNoAutoMoveFirstMove,
            isLocked: s.isLocked,
        }
    })
}

export function newGameNoAutoMoveFirstMove() {
    gameStore.setState((s) => {
        const newState = dealCards({ noAutoMoveFirstMove: true })
        const initialColumns = newState.columns.map(col => [...col])
        const initialFreeCells = [...newState.freeCells]
        return {
            columns: newState.columns,
            freeCells: newState.freeCells,
            initialColumns,
            initialFreeCells,
            foundations: {
                green: 0,
                red: 0,
                black: 0,
                flower: false
            },
            dragons: {
                green: 0,
                red: 0,
                black: 0
            },
            status: 'playing',
            history: [],
            devMode: s.devMode,
            gameId: s.gameId + 1,
            startTime: null,
            elapsedTime: 0,
            timerRunning: false,
            isTimerVisible: s.isTimerVisible,
            isUndoEnabled: s.isUndoEnabled,
            isNoAutoMoveFirstMove: s.isNoAutoMoveFirstMove,
            isLocked: s.isLocked,
        }
    })
}

export function restartGame() {
    gameStore.setState((state) => ({
        ...state,
        columns: state.initialColumns.map(col => [...col]),
        freeCells: [...state.initialFreeCells],
        foundations: {
            green: 0,
            red: 0,
            black: 0,
            flower: false
        },
        dragons: {
            green: 0,
            red: 0,
            black: 0
        },
        status: 'playing',
        history: [],
        startTime: null,
        elapsedTime: 0,
        timerRunning: false
    }))
}

export function pauseGame() {
    gameStore.setState(state => ({
        ...state,
        status: state.status === 'paused' ? 'playing' : 'paused',
        timerRunning: state.status === 'paused',
    }))
}

export function resumeGame() {
    gameStore.setState(state => ({
        ...state,
        status: 'playing',
        timerRunning: true,
        startTime: Date.now() - state.elapsedTime
    }))
}

export function autoSolve() {
  gameStore.setState((state) => {
    if (!isPlayableState(state)) return state

    let currentState = { ...state }
    let historyEntry: HistoryEntry | null = null

    let result = getNextRankLocations(currentState)
    while (result && result.locations.length > 0) {
      historyEntry = historyEntry ?? createHistoryEntry(state)
      currentState = applyAutoSolveMove(
        currentState,
        result.nextRank,
        result.locations.map(({ source, index, color }) => ({ source, index, color })),
      )
      result = getNextRankLocations(currentState)
    }

    if (!historyEntry) return state

    const status = isWinState(currentState.foundations, currentState.dragons)
      ? 'won'
      : currentState.status

    const nextState = {
      ...currentState,
      history: [...state.history, historyEntry],
      status,
    }
    return autoMoveOnes(nextState)
  })
}

function autoMoveOnes(state: GameState): GameState {
  let currentState = { ...state }
  let moved = true
  const isFoundationFull =
    currentState.foundations.green === 9 &&
    currentState.foundations.red === 9 &&
    currentState.foundations.black === 9

  while (moved) {
    moved = false
    const moves = getAutoMoveCandidates(currentState, isFoundationFull)
    if (moves.length === 0) continue
    currentState = applyAutoMoves(currentState, moves)
    moved = true
  }

  if (isWinState(currentState.foundations, currentState.dragons)) {
    currentState.status = 'won'
    currentState.timerRunning = false
  }

  return currentState
}

export function toggleDevMode() {
    gameStore.setState(state => ({
        ...state,
        devMode: !state.devMode
    }))
}

export function triggerAutoMove() {
    gameStore.setState(state => {
        if (state.status !== 'playing' && !state.devMode) return state

        const timerState = ensureTimerRunning(state)
        const nextState = {
            ...state,
            timerRunning: timerState.timerRunning,
            startTime: timerState.startTime
        }

        return autoMoveOnes(nextState)
    })
}

export function updateTimer(elapsed: number) {
    gameStore.setState(state => ({
        ...state,
        elapsedTime: elapsed
    }))
}

export function setTimerVisibility(visible: boolean) {
    saveTimerVisibilityToStorage(visible)
    gameStore.setState(state => ({
        ...state,
        isTimerVisible: visible
    }))
}

export function toggleTimerVisibility() {
    gameStore.setState(state => {
        const newVisibility = !state.isTimerVisible
        saveTimerVisibilityToStorage(newVisibility)
        return {
            ...state,
            isTimerVisible: newVisibility
        }
    })
}

export function setUndoEnabled(enabled: boolean) {
    saveUndoEnabledToStorage(enabled)
    gameStore.setState(state => ({
        ...state,
        isUndoEnabled: enabled
    }))
}

export function setNoAutoMoveFirstMove(enabled: boolean) {
    saveNoAutoMoveFirstMoveToStorage(enabled)
    gameStore.setState(state => ({
        ...state,
        isNoAutoMoveFirstMove: enabled,
    }))
}
