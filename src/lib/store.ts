import { Store } from '@tanstack/store'
import type { Card, CardColor, DragonColor } from '@/lib/types'

export type GameStatus = 'idle' | 'playing' | 'paused' | 'won'

interface GameState {
  columns: Card[][]
  freeCells: (Card | null)[]
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
  history: (Omit<GameState, 'history' | 'status'> & { isAuto?: boolean })[]
  devMode: boolean
  gameId: number
  startTime: number | null
  elapsedTime: number
  timerRunning: boolean
  isTimerVisible: boolean
}

function createDeck(): Card[] {
  const deck: Card[] = []

  const colors: CardColor[] = ['green', 'red', 'black']
  colors.forEach(color => {
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `normal-${color}-${i}`, kind: 'normal', color, value: i })
    }
  })

  const dragonColors: DragonColor[] = ['green', 'red', 'black']
  dragonColors.forEach(color => {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `dragon-${color}-${i}`, kind: 'dragon', color })
    }
  })

  deck.push({ id: 'flower', kind: 'flower' })

  return deck
}

function shuffle<T>(array: T[]): T[] {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}

const TIMER_VISIBILITY_KEY = 'shenzhen-solitaire-timer-visible'

function getTimerVisibilityFromStorage(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const stored = localStorage.getItem(TIMER_VISIBILITY_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

function saveTimerVisibilityToStorage(visible: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TIMER_VISIBILITY_KEY, String(visible))
  } catch {
  }
}

function dealCards(): { columns: Card[][], freeCells: (Card | null)[] } {
  const deck = shuffle(createDeck())
  const columns: Card[][] = Array.from({ length: 8 }, () => [])

  deck.forEach((card, index) => {
    columns[index % 8].push(card)
  })

  return {
    columns,
    freeCells: [null, null, null]
  }
}

export const gameStore = new Store<GameState>({
  columns: Array.from({ length: 8 }, () => []),
  freeCells: [null, null, null],
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
  isTimerVisible: true
})

export function syncTimerVisibility() {
  gameStore.setState(state => ({
    ...state,
    isTimerVisible: getTimerVisibilityFromStorage()
  }))
}

function canStack(bottomCard: Card, topCard: Card): boolean {
  if (bottomCard.kind !== 'normal' || topCard.kind !== 'normal') return false
  if (bottomCard.value !== topCard.value + 1) return false
  if (bottomCard.color === topCard.color) return false
  return true
}

export function moveCard(cardId: string, targetId: string, skipAutoMove: boolean = false) {
  gameStore.setState((state) => {
    if (state.status !== 'playing' && !state.devMode) return state

    let timerRunning = state.timerRunning
    let startTime = state.startTime
    if (!timerRunning && state.status === 'playing') {
        timerRunning = true
        startTime = Date.now() - state.elapsedTime
    }

    let card: Card | undefined
    let source: { type: 'column', index: number } | { type: 'free', index: number } | undefined

    for (let i = 0; i < state.columns.length; i++) {
      const found = state.columns[i].find(c => c.id === cardId)
      if (found) {
        card = found
        source = { type: 'column', index: i }
        break
      }
    }

    if (!card) {
      for (let i = 0; i < state.freeCells.length; i++) {
        if (state.freeCells[i]?.id === cardId) {
          card = state.freeCells[i]!
          source = { type: 'free', index: i }
          break
        }
      }
    }

    if (!card || !source) return state

    let target: { type: 'column', index: number } | { type: 'free', index: number } | { type: 'foundation', id: string } | undefined

    if (targetId.startsWith('col-')) {
      const index = parseInt(targetId.split('-')[1])
      target = { type: 'column', index }
    } else if (targetId.startsWith('free-')) {
      const index = parseInt(targetId.split('-')[1])
      target = { type: 'free', index }
    } else if (targetId.startsWith('foundation-')) {
      target = { type: 'foundation', id: targetId.split('-')[1] }
    }

    if (!target) return state

    const historyEntry: (Omit<GameState, 'history' | 'status'> & { isAuto?: boolean }) = {
        columns: state.columns,
        freeCells: state.freeCells,
        foundations: state.foundations,
        dragons: state.dragons,
        devMode: state.devMode,
        gameId: state.gameId,
        startTime: state.startTime,
        elapsedTime: state.elapsedTime,
        timerRunning: state.timerRunning,
        isTimerVisible: state.isTimerVisible,
        isAuto: false
    }

    const newColumns = [...state.columns.map(col => [...col])]
    const newFreeCells = [...state.freeCells]
    const newFoundations = { ...state.foundations }
    let cardsToMove: Card[] = []

    if (source.type === 'column') {
      const col = newColumns[source.index]
      const cardIndex = col.findIndex(c => c.id === cardId)
      cardsToMove = col.slice(cardIndex)

      if (!state.devMode) {
        for (let i = 0; i < cardsToMove.length - 1; i++) {
            if (!canStack(cardsToMove[i], cardsToMove[i+1])) return state
        }
      }

      newColumns[source.index] = col.slice(0, cardIndex)

    } else if (source.type === 'free') {
      cardsToMove = [newFreeCells[source.index]!]
      newFreeCells[source.index] = null
    }

    if (target.type === 'column') {
      const targetCol = newColumns[target.index]
      if (targetCol.length > 0 && !state.devMode) {
        const topCard = targetCol[targetCol.length - 1]
        if (!canStack(topCard, cardsToMove[0])) return state
      }

      newColumns[target.index].push(...cardsToMove)

    } else if (target.type === 'free') {
      const targetCard = state.freeCells[target.index]
      if (targetCard?.kind === 'dragon' && targetCard.isLocked) return state

      if (cardsToMove.length === 1 && (!newFreeCells[target.index] || state.devMode)) {
        newFreeCells[target.index] = cardsToMove[0]
      } else {
        return state
      }

    } else if (target.type === 'foundation') {
       if (cardsToMove.length === 1) {
          const c = cardsToMove[0]

          if (target.id === 'flower' && c.kind === 'flower') {
              newFoundations.flower = true
          } else if (c.kind === 'normal' && c.color === target.id) {
              const currentVal = newFoundations[target.id as 'green'|'red'|'black']
              if (c.value === currentVal + 1 || state.devMode) {
                  newFoundations[target.id as 'green'|'red'|'black'] = c.value
              } else {
                  return state
              }
          } else {
              return state
          }
       } else {
           return state
       }
    }

    let status: GameStatus = state.status
    const newDragons = { ...state.dragons }
    if (newFoundations.green === 9 && newFoundations.red === 9 && newFoundations.black === 9 && newFoundations.flower && newDragons.green === 1 && newDragons.red === 1 && newDragons.black === 1) {
        status = 'won'
        timerRunning = false
    }

    const nextState = {
      ...state,
      columns: newColumns,
      freeCells: newFreeCells,
      foundations: newFoundations,
      history: [...state.history, historyEntry],
      status,
      timerRunning,
      startTime
    }

    return skipAutoMove ? nextState : autoMoveOnes(nextState)
  })
}

export function collectDragons(color: DragonColor) {
    gameStore.setState((state) => {
        if (state.status !== 'playing' && !state.devMode) return state

        if (state.dragons[color] > 0) return state

        const dragonIds = [0, 1, 2, 3].map(i => `dragon-${color}-${i}`)
        const locations: ({ type: 'col', index: number } | { type: 'free', index: number })[] = []

        for (const id of dragonIds) {
            const freeIdx = state.freeCells.findIndex(c => c?.id === id)
            if (freeIdx !== -1) {
                locations.push({ type: 'free', index: freeIdx })
                continue
            }
            let foundInCol = false
            for (let i = 0; i < state.columns.length; i++) {
                const col = state.columns[i]
                if (col.length > 0 && col[col.length - 1].id === id) {
                    locations.push({ type: 'col', index: i })
                    foundInCol = true
                    break
                }
            }
            if (!foundInCol && !state.devMode) return state
        }

        if (locations.length !== 4 && !state.devMode) return state

        let targetFreeIndex = -1

        const occupiedFreeIndices = locations
            .filter(loc => loc.type === 'free')
            .map(loc => loc.index)
            .sort((a, b) => a - b)

        if (occupiedFreeIndices.length > 0) {
            targetFreeIndex = occupiedFreeIndices[0]
        } else {
            targetFreeIndex = state.freeCells.findIndex(c => c === null)
        }

        if (targetFreeIndex === -1) return state

        const historyEntry: (Omit<GameState, 'history' | 'status'> & { isAuto?: boolean }) = {
            columns: state.columns,
            freeCells: state.freeCells,
            foundations: state.foundations,
            dragons: state.dragons,
            devMode: state.devMode,
            gameId: state.gameId,
            startTime: state.startTime,
            elapsedTime: state.elapsedTime,
            timerRunning: state.timerRunning,
            isTimerVisible: state.isTimerVisible,
            isAuto: false
        }

        const newColumns = state.columns.map(col => [...col])
        const newFreeCells = [...state.freeCells]

        // Remove all dragons
        locations.forEach(loc => {
            if (loc.type === 'col') {
                newColumns[loc.index].pop()
            } else {
                newFreeCells[loc.index] = null
            }
        })

        // Place "locked" marker.
        newFreeCells[targetFreeIndex] = { id: `dragon-${color}-locked`, kind: 'dragon', color, isLocked: true }

        const nextState = {
            ...state,
            columns: newColumns,
            freeCells: newFreeCells,
            dragons: {
                ...state.dragons,
                [color]: 1
            },
            history: [...state.history, historyEntry]
        }

        return autoMoveOnes(nextState)
    })
}

export function undo() {
    gameStore.setState((state) => {
        if (state.history.length === 0) return state

        const history = [...state.history]
        let previous = history.pop()!
        let newState = {
            ...state,
            ...previous,
            history: history,
            status: 'playing' as GameStatus,
            timerRunning: true,
            isTimerVisible: state.isTimerVisible
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
                isTimerVisible: state.isTimerVisible
            }
        }

        return newState
    })
}

export function newGame() {
    const newState = dealCards()
    gameStore.setState((s) => ({
        columns: newState.columns,
        freeCells: newState.freeCells,
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
        isTimerVisible: s.isTimerVisible
    }))
}

export function restartGame() {
    newGame()
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

export function performWandMove() {
    gameStore.setState((state) => {
        if (state.status !== 'playing' && !state.devMode) return state

        let currentState = { ...state }
        let moved = true
        let historyEntry: (Omit<GameState, 'history' | 'status'> & { isAuto?: boolean }) | null = null

        while (moved) {
            moved = false

            const minFoundation = Math.min(currentState.foundations.green, currentState.foundations.red, currentState.foundations.black)
            const nextRank = minFoundation + 1

            if (nextRank > 9) break

            const colors: CardColor[] = ['green', 'red', 'black']
            let allAvailable = true
            const locations: { id: string, source: 'col' | 'free', index: number, color: CardColor }[] = []

            for (const color of colors) {
                if (currentState.foundations[color] >= nextRank) continue

                let found = false

                const freeIdx = currentState.freeCells.findIndex(c => c?.kind === 'normal' && c.color === color && c.value === nextRank)
                if (freeIdx !== -1) {
                    locations.push({ id: currentState.freeCells[freeIdx]!.id, source: 'free', index: freeIdx, color })
                    found = true
                } else {
                    for (let i = 0; i < currentState.columns.length; i++) {
                        const col = currentState.columns[i]
                        if (col.length > 0) {
                            const card = col[col.length - 1]
                            if (card.kind === 'normal' && card.color === color && card.value === nextRank) {
                                locations.push({ id: card.id, source: 'col', index: i, color })
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

            if (allAvailable && locations.length > 0) {
                if (!historyEntry) {
                     historyEntry = {
                        columns: state.columns,
                        freeCells: state.freeCells,
                        foundations: state.foundations,
                        dragons: state.dragons,
                        devMode: state.devMode,
                        gameId: state.gameId,
                        startTime: state.startTime,
                        elapsedTime: state.elapsedTime,
                        timerRunning: state.timerRunning,
                        isTimerVisible: state.isTimerVisible,
                        isAuto: false
                    }
                }

                const newColumns = currentState.columns.map(col => [...col])
                const newFreeCells = [...currentState.freeCells]
                const newFoundations = { ...currentState.foundations }

                locations.forEach(loc => {
                    if (loc.source === 'col') {
                        newColumns[loc.index].pop()
                    } else {
                        newFreeCells[loc.index] = null
                    }
                    newFoundations[loc.color] = nextRank
                })

                currentState = {
                    ...currentState,
                    columns: newColumns,
                    freeCells: newFreeCells,
                    foundations: newFoundations
                }
                moved = true
            }
        }

        if (historyEntry) {
            let status: GameStatus = currentState.status
            if (currentState.foundations.green === 9 && currentState.foundations.red === 9 && currentState.foundations.black === 9 && currentState.foundations.flower && currentState.dragons.green === 1 && currentState.dragons.red === 1 && currentState.dragons.black === 1) {
                status = 'won'
            }

            const nextState = {
                ...currentState,
                history: [...state.history, historyEntry],
                status
            }
            return autoMoveOnes(nextState)
        }

        return state
    })
}

function autoMoveOnes(state: GameState): GameState {
    let currentState = { ...state }
    let moved = true

    // Check if foundation is full (all three colors at 9) to auto-move flower
    const isFoundationFull = currentState.foundations.green === 9 && currentState.foundations.red === 9 && currentState.foundations.black === 9

    while (moved) {
        moved = false
        const moves: { source: 'col' | 'free', index: number, card: Card }[] = []

        currentState.freeCells.forEach((c, i) => {
            if (c) {
                if ((c.kind === 'normal' && c.value === 1) || (c.kind === 'flower' && (isFoundationFull || !currentState.foundations.flower))) {
                    moves.push({ source: 'free', index: i, card: c })
                }
            }
        })

        currentState.columns.forEach((col, i) => {
            if (col.length > 0) {
                const c = col[col.length - 1]
                if ((c.kind === 'normal' && c.value === 1) || (c.kind === 'flower' && (isFoundationFull || !currentState.foundations.flower))) {
                    moves.push({ source: 'col', index: i, card: c })
                }
            }
        })

        if (moves.length > 0) {
            const newColumns = currentState.columns.map(col => [...col])
            const newFreeCells = [...currentState.freeCells]
            const newFoundations = { ...currentState.foundations }

            moves.forEach(move => {
                if (move.source === 'col') {
                    newColumns[move.index].pop()
                } else {
                    newFreeCells[move.index] = null
                }
                // Update foundation
                if (move.card.kind === 'normal') {
                    newFoundations[move.card.color] = 1
                } else if (move.card.kind === 'flower') {
                    newFoundations.flower = true
                }
            })

            let newHistory = currentState.history

            if (currentState.history.length > 0) {
                const historyEntry: (Omit<GameState, 'history' | 'status'> & { isAuto?: boolean }) = {
                    columns: currentState.columns,
                    freeCells: currentState.freeCells,
                    foundations: currentState.foundations,
                    dragons: currentState.dragons,
                    devMode: currentState.devMode,
                    gameId: currentState.gameId,
                    startTime: currentState.startTime,
                    elapsedTime: currentState.elapsedTime,
                    timerRunning: currentState.timerRunning,
                    isTimerVisible: currentState.isTimerVisible,
                    isAuto: true // Mark as auto-move
                }
                newHistory = [...currentState.history, historyEntry]
            }

            currentState = {
                ...currentState,
                columns: newColumns,
                freeCells: newFreeCells,
                foundations: newFoundations,
                history: newHistory
            }
            moved = true
        }
    }

    if (currentState.foundations.green === 9 && currentState.foundations.red === 9 && currentState.foundations.black === 9 && currentState.foundations.flower && currentState.dragons.green === 1 && currentState.dragons.red === 1 && currentState.dragons.black === 1) {
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

        let nextState = { ...state }
        if (!state.timerRunning && state.status === 'playing') {
            nextState.timerRunning = true
            nextState.startTime = Date.now() - state.elapsedTime
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
