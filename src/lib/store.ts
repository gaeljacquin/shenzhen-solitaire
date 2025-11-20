import { Store } from '@tanstack/store'
import { Card, CardColor, DragonColor } from './types'

export type GameStatus = 'idle' | 'playing' | 'paused' | 'won'

interface GameState {
  columns: Card[][]
  freeCells: (Card | null)[]
  foundations: {
    green: number
    purple: number
    indigo: number
    flower: boolean
  }
  dragons: {
    green: number // count of collected dragons
    red: number
    white: number
  }
  status: GameStatus
  history: Omit<GameState, 'history' | 'status'>[]
  devMode: boolean
}

function createDeck(): Card[] {
  const deck: Card[] = []

  // Normal cards
  const colors: CardColor[] = ['green', 'purple', 'indigo']
  colors.forEach(color => {
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `normal-${color}-${i}`, kind: 'normal', color, value: i })
    }
  })

  // Dragon cards
  const dragonColors: DragonColor[] = ['green', 'red', 'white']
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
    purple: 0,
    indigo: 0,
    flower: false
  },
  dragons: {
    green: 0,
    red: 0,
    white: 0
  },
  status: 'playing',
  history: [],
  devMode: false
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
    const historyEntry: Omit<GameState, 'history' | 'status'> = {
        columns: state.columns,
        freeCells: state.freeCells,
        foundations: state.foundations,
        dragons: state.dragons,
        devMode: state.devMode
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
              const currentVal = newFoundations[target.id as 'green'|'purple'|'indigo']
              if (c.value === currentVal + 1 || state.devMode) { // Allow skipping values in dev mode
                  newFoundations[target.id as 'green'|'purple'|'indigo'] = c.value
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
    if (newFoundations.green === 9 && newFoundations.purple === 9 && newFoundations.indigo === 9 && newFoundations.flower) {
        status = 'won'
    }

    const nextState = {
      ...state,
      columns: newColumns,
      freeCells: newFreeCells,
      foundations: newFoundations,
      history: [...state.history, historyEntry],
      status
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
        const historyEntry: Omit<GameState, 'history' | 'status'> = {
            columns: state.columns,
            freeCells: state.freeCells,
            foundations: state.foundations,
            dragons: state.dragons,
            devMode: state.devMode
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
        const previous = state.history[state.history.length - 1]
        const newHistory = state.history.slice(0, -1)
        return {
            ...state,
            ...previous,
            history: newHistory,
            status: 'playing'
        }
    })
}

export function newGame() {
    const newState = dealCards()
    gameStore.setState((s) => ({
        columns: newState.columns,
        freeCells: newState.freeCells,
        foundations: {
            green: 0,
            purple: 0,
            indigo: 0,
            flower: false
        },
        dragons: {
            green: 0,
            red: 0,
            white: 0
        },
        status: 'playing',
        history: [],
        devMode: s.devMode // Preserve dev mode
    }))
}

export function restartGame() {
    newGame()
}

export function pauseGame() {
    gameStore.setState(state => ({
        ...state,
        status: state.status === 'paused' ? 'playing' : 'paused'
    }))
}

export function resumeGame() {
    gameStore.setState(state => ({
        ...state,
        status: 'playing'
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
        let historyEntry: Omit<GameState, 'history' | 'status'> | null = null

        // Save history once at start if we are going to move anything
        // But we don't know if we will move anything yet.
        // We'll save it before the first mutation.

        while (moved) {
            moved = false

            // Find lowest rank that can be auto-stacked
            // We check ranks 2 to 9 (1s are auto-moved)
            // Actually, we should check 1s too just in case, but they should be gone.

            // Check foundations levels
            const minFoundation = Math.min(currentState.foundations.green, currentState.foundations.purple, currentState.foundations.indigo)
            const nextRank = minFoundation + 1

            if (nextRank > 9) break

            // Check if all cards of nextRank are available
            const colors: CardColor[] = ['green', 'purple', 'indigo']
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
                        devMode: state.devMode
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
            if (currentState.foundations.green === 9 && currentState.foundations.purple === 9 && currentState.foundations.indigo === 9 && currentState.foundations.flower) {
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

// Helper to auto-move '1's
function autoMoveOnes(state: GameState): GameState {
    let currentState = { ...state }
    let moved = true
    // We don't save history here because this function is called *inside* other actions
    // which should have already saved history or will save it.
    // Wait, if we call this after a move, we are modifying the state *again*.
    // The history entry for the user's move is already pushed.
    // If we auto-move, we should probably append another history entry or merge it?
    // User requirement: "Undo Behavior: Auto-moves of '1's will be recorded as separate history entries."
    // So we should push to history.

    // BUT, we are inside a setState callback usually?
    // No, we will call this helper at the end of `moveCard` and `collectDragons`.
    // Those functions return a new state object.
    // We can wrap the result.

    // Actually, let's make `autoMoveOnes` recursive or iterative until no more 1s can move.
    // And it should update history for each batch or single move?
    // "Whenever a '1' card is available, move it to the foundation automatically."

    while (moved) {
        moved = false
        const onesToMove: { source: 'col' | 'free', index: number, card: Card }[] = []

        // Find available 1s
        // Check free cells
        currentState.freeCells.forEach((c, i) => {
            if (c && c.kind === 'normal' && c.value === 1) {
                onesToMove.push({ source: 'free', index: i, card: c })
            }
        })
        // Check columns
        currentState.columns.forEach((col, i) => {
            if (col.length > 0) {
                const c = col[col.length - 1]
                if (c.kind === 'normal' && c.value === 1) {
                    onesToMove.push({ source: 'col', index: i, card: c })
                }
            }
        })

        if (onesToMove.length > 0) {
            // Save history for this batch
            const historyEntry: Omit<GameState, 'history' | 'status'> = {
                columns: currentState.columns,
                freeCells: currentState.freeCells,
                foundations: currentState.foundations,
                dragons: currentState.dragons,
                devMode: currentState.devMode
            }

            const newColumns = currentState.columns.map(col => [...col])
            const newFreeCells = [...currentState.freeCells]
            const newFoundations = { ...currentState.foundations }

            onesToMove.forEach(move => {
                if (move.source === 'col') {
                    newColumns[move.index].pop()
                } else {
                    newFreeCells[move.index] = null
                }
                // Update foundation
                // We know it's a 1, so foundation must be 0.
                // But wait, what if we have multiple 1s of same color? Impossible in standard deck.
                if (move.card.kind === 'normal') {
                    newFoundations[move.card.color] = 1
                }
            })

            currentState = {
                ...currentState,
                columns: newColumns,
                freeCells: newFreeCells,
                foundations: newFoundations,
                history: [...currentState.history, historyEntry]
            }
            moved = true
        }
    }

    // Check win condition
    if (currentState.foundations.green === 9 && currentState.foundations.purple === 9 && currentState.foundations.indigo === 9 && currentState.foundations.flower) {
        currentState.status = 'won'
    }

    return currentState
}

export function toggleDevMode() {
    gameStore.setState(state => ({
        ...state,
        devMode: !state.devMode
    }))
}
