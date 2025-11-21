import { Store } from '@tanstack/store'
import { Card, CardColor, DragonColor } from './types'

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
    green: number // count of collected dragons
    red: number
    yellow: number
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

  // Normal cards
  const colors: CardColor[] = ['green', 'red', 'black']
  colors.forEach(color => {
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `normal-${color}-${i}`, kind: 'normal', color, value: i })
    }
  })

  // Dragon cards
  const dragonColors: DragonColor[] = ['green', 'red', 'yellow']
  dragonColors.forEach(color => {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `dragon-${color}-${i}`, kind: 'dragon', color })
    }
  })

  // Flower card
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

const initialStateData = dealCards()

export const gameStore = new Store<GameState>({
  columns: initialStateData.columns,
  freeCells: initialStateData.freeCells,
  foundations: {
    green: 0,
    red: 0,
    black: 0,
    flower: false
  },
  dragons: {
    green: 0,
    red: 0,
    yellow: 0
  },
  status: 'playing',
  history: [],
  devMode: false,
  gameId: 0,
  startTime: null,
  elapsedTime: 0,
  timerRunning: false,
  isTimerVisible: true
})

// Helper to check if a move is valid between cards
function canStack(bottomCard: Card, topCard: Card): boolean {
  if (bottomCard.kind !== 'normal' || topCard.kind !== 'normal') return false
  if (bottomCard.value !== topCard.value + 1) return false
  if (bottomCard.color === topCard.color) return false
  return true
}

export function moveCard(cardId: string, targetId: string) {
  gameStore.setState((state) => {
    if (state.status !== 'playing' && !state.devMode) return state

    // Start timer on first move if not running
    let timerRunning = state.timerRunning
    let startTime = state.startTime
    if (!timerRunning && state.status === 'playing') {
        timerRunning = true
        startTime = Date.now() - state.elapsedTime
    }

    // 1. Find the card and its current location
    let card: Card | undefined
    let source: { type: 'column', index: number } | { type: 'free', index: number } | undefined

    // Search in columns
    for (let i = 0; i < state.columns.length; i++) {
      const found = state.columns[i].find(c => c.id === cardId)
      if (found) {
        card = found
        source = { type: 'column', index: i }
        break
      }
    }

    // Search in free cells
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

    // 2. Determine target location
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

    // Save history before mutation
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

    // 3. Execute Move with Validation
    const newColumns = [...state.columns.map(col => [...col])]
    const newFreeCells = [...state.freeCells]
    const newFoundations = { ...state.foundations }

    // Remove from source
    let cardsToMove: Card[] = []

    if (source.type === 'column') {
      const col = newColumns[source.index]
      const cardIndex = col.findIndex(c => c.id === cardId)
      cardsToMove = col.slice(cardIndex)

      // Validate stack internal consistency if > 1 card
      if (!state.devMode) {
        for (let i = 0; i < cardsToMove.length - 1; i++) {
            if (!canStack(cardsToMove[i], cardsToMove[i+1])) return state
        }
      }

      // Remove from column
      newColumns[source.index] = col.slice(0, cardIndex)

    } else if (source.type === 'free') {
      cardsToMove = [newFreeCells[source.index]!]
      newFreeCells[source.index] = null
    }

    // Add to target
    if (target.type === 'column') {
      const targetCol = newColumns[target.index]
      if (targetCol.length > 0 && !state.devMode) {
        const topCard = targetCol[targetCol.length - 1]
        // Validate move to column
        if (!canStack(topCard, cardsToMove[0])) return state
      }
      // If empty column, any card can go there (in Shenzhen? Yes, usually)

      newColumns[target.index].push(...cardsToMove)

    } else if (target.type === 'free') {
      // Check if target is locked dragon
      const targetCard = state.freeCells[target.index]
      if (targetCard?.kind === 'dragon' && targetCard.isLocked) return state

      // Can only move one card to free cell
      if (cardsToMove.length === 1 && (!newFreeCells[target.index] || state.devMode)) {
        newFreeCells[target.index] = cardsToMove[0]
      } else {
        return state // Invalid
      }

    } else if (target.type === 'foundation') {
       if (cardsToMove.length === 1) { // Foundations always only accept single cards
          const c = cardsToMove[0]

          if (target.id === 'flower' && c.kind === 'flower') {
              newFoundations.flower = true
          } else if (c.kind === 'normal' && c.color === target.id) {
              const currentVal = newFoundations[target.id as 'green'|'red'|'black']
              if (c.value === currentVal + 1 || state.devMode) { // Allow skipping values in dev mode
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

    // Check win condition
    let status: GameStatus = state.status
    if (newFoundations.green === 9 && newFoundations.red === 9 && newFoundations.black === 9 && newFoundations.flower) {
        status = 'won'
        timerRunning = false // Stop timer on win
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

    return autoMoveOnes(nextState)
  })
}

export function collectDragons(color: DragonColor) {
    gameStore.setState((state) => {
        if (state.status !== 'playing' && !state.devMode) return state

        if (state.dragons[color] > 0) return state // Already collected

        // Find all 4 dragons
        const dragonIds = [0, 1, 2, 3].map(i => `dragon-${color}-${i}`)
        const locations: ({ type: 'col', index: number } | { type: 'free', index: number })[] = []

        for (const id of dragonIds) {
            // Check free cells
            const freeIdx = state.freeCells.findIndex(c => c?.id === id)
            if (freeIdx !== -1) {
                locations.push({ type: 'free', index: freeIdx })
                continue
            }
            // Check columns (must be at top)
            let foundInCol = false
            for (let i = 0; i < state.columns.length; i++) {
                const col = state.columns[i]
                if (col.length > 0 && col[col.length - 1].id === id) {
                    locations.push({ type: 'col', index: i })
                    foundInCol = true
                    break
                }
            }
            if (!foundInCol && !state.devMode) return state // Not all visible/accessible, unless devMode
        }

        if (locations.length !== 4 && !state.devMode) return state // Not all 4 dragons found, unless devMode

        // Logic:
        // 1. Identify target free cell.
        //    Prefer a free cell that already has one of the dragons.
        //    If multiple dragons in free cells, pick the LEFTMOST (lowest index).
        //    If none, use the first empty free cell.

        let targetFreeIndex = -1

        // Find all free cells containing this dragon color
        const occupiedFreeIndices = locations
            .filter(loc => loc.type === 'free')
            .map(loc => loc.index)
            .sort((a, b) => a - b) // Sort to find leftmost

        if (occupiedFreeIndices.length > 0) {
            targetFreeIndex = occupiedFreeIndices[0]
        } else {
            // If not found, find first empty
            targetFreeIndex = state.freeCells.findIndex(c => c === null)
        }

        if (targetFreeIndex === -1) return state // No space to stack

        // Save history
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
            timerRunning: true, // Resume timer on undo if it was playing? Or just keep it running?
            // Actually, if we undo a win, we should resume.
            // If we undo a move, we just keep running.
            // But we don't track timer state in history fully (we track snapshot).
            // Let's just say if status becomes playing, timer runs.
            isTimerVisible: state.isTimerVisible // Preserve current visibility preference
        }

        if (newState.status === 'playing') {
            newState.timerRunning = true
        }

        // Recursive undo for auto-moves
        while (previous.isAuto && history.length > 0) {
            previous = history.pop()!
            newState = {
                ...newState,
                ...previous,
                history: history,
                isTimerVisible: state.isTimerVisible // Preserve current visibility preference
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
            yellow: 0
        },
        status: 'playing',
        history: [],
        devMode: s.devMode, // Preserve dev mode
        gameId: s.gameId + 1, // Increment game ID
        startTime: null,
        elapsedTime: 0,
        timerRunning: false,
        isTimerVisible: s.isTimerVisible // Preserve visibility setting
    }))
}

export function restartGame() {
    newGame()
}

export function pauseGame() {
    gameStore.setState(state => ({
        ...state,
        ...state,
        status: state.status === 'paused' ? 'playing' : 'paused',
        timerRunning: state.status === 'paused' // If paused -> playing, run. If playing -> paused, stop.
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

        // Logic:
        // 1. Find lowest rank R where all cards of rank R are available.
        //    Available means: In foundation OR (Top of column OR In free cell).
        //    AND foundations are ready (all foundations >= R-1).
        // 2. Move all cards of rank R to foundations.
        // 3. Repeat for R+1 until no more moves.

        let currentState = { ...state }
        let moved = true
        let historyEntry: (Omit<GameState, 'history' | 'status'> & { isAuto?: boolean }) | null = null

        // Save history once at start if we are going to move anything
        // But we don't know if we will move anything yet.
        // We'll save it before the first mutation.

        while (moved) {
            moved = false

            // Find lowest rank that can be auto-stacked
            // We check ranks 2 to 9 (1s are auto-moved)
            // Actually, we should check 1s too just in case, but they should be gone.

            // Check foundations levels
            const minFoundation = Math.min(currentState.foundations.green, currentState.foundations.red, currentState.foundations.black)
            const nextRank = minFoundation + 1

            if (nextRank > 9) break

            // Check if all cards of nextRank are available
            const colors: CardColor[] = ['green', 'red', 'black']
            let allAvailable = true
            const locations: { id: string, source: 'col' | 'free', index: number, color: CardColor }[] = []

            for (const color of colors) {
                // If already in foundation, good.
                if (currentState.foundations[color] >= nextRank) continue

                let found = false

                // Check free cells
                const freeIdx = currentState.freeCells.findIndex(c => c?.kind === 'normal' && c.color === color && c.value === nextRank)
                if (freeIdx !== -1) {
                    // We need the ID for the location to be precise?
                    // Actually we just need the index.
                    // But we stored ID in locations for debugging?
                    // The previous code used ID to find index.
                    // Here we found index directly.
                    // We can get ID from the card if needed, but we don't use it in the apply phase.
                    // We use index.
                    locations.push({ id: currentState.freeCells[freeIdx]!.id, source: 'free', index: freeIdx, color })
                    found = true
                } else {
                    // Check columns (top only)
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
                // Execute moves for this rank
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
             // Check win condition
            let status: GameStatus = currentState.status
            if (currentState.foundations.green === 9 && currentState.foundations.red === 9 && currentState.foundations.black === 9 && currentState.foundations.flower) {
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

// Helper to auto-move '1's and Flower
function autoMoveOnes(state: GameState): GameState {
    let currentState = { ...state }
    let moved = true

    while (moved) {
        moved = false
        const moves: { source: 'col' | 'free', index: number, card: Card }[] = []

        // Find available 1s and Flower
        // Check free cells
        currentState.freeCells.forEach((c, i) => {
            if (c) {
                if ((c.kind === 'normal' && c.value === 1) || c.kind === 'flower') {
                    moves.push({ source: 'free', index: i, card: c })
                }
            }
        })
        // Check columns
        currentState.columns.forEach((col, i) => {
            if (col.length > 0) {
                const c = col[col.length - 1]
                if ((c.kind === 'normal' && c.value === 1) || c.kind === 'flower') {
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

            // Only record history if there is existing history (i.e. not the initial deal auto-move)
            if (currentState.history.length > 0) {
                 // Save history for this batch
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

    // Check win condition
    if (currentState.foundations.green === 9 && currentState.foundations.red === 9 && currentState.foundations.black === 9 && currentState.foundations.flower) {
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

        // Start timer if auto-move happens (e.g. initial deal ones)
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

export function toggleTimerVisibility() {
    gameStore.setState(state => ({
        ...state,
        isTimerVisible: !state.isTimerVisible
    }))
}
