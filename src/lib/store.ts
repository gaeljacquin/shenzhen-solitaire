import { Store } from '@tanstack/store'
import { Card, CardColor, DragonColor } from './types'

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

const initialState = dealCards()

export const gameStore = new Store<GameState>({
  columns: initialState.columns,
  freeCells: initialState.freeCells,
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
  }
})

export function moveCard(cardId: string, targetId: string) {
  gameStore.setState((state) => {
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

    // 3. Validate Move (Simplified: Allow most moves for now as per prompt)
    // TODO: Implement strict rules later

    // 4. Execute Move
    const newColumns = [...state.columns.map(col => [...col])]
    const newFreeCells = [...state.freeCells]
    const newFoundations = { ...state.foundations }

    // Remove from source
    if (source.type === 'column') {
      // If moving from column, we might be moving a stack.
      // For simplicity, let's assume we are moving the card and everything above it?
      // Or just the single card if it's the top one?
      // The prompt says "drag and drop functionality".
      // Let's assume single card move for now or handle stack if needed.
      // But dnd-kit usually drags one item.
      // If we drag a card from the middle of a column, we should move it and cards on top of it.

      const col = newColumns[source.index]
      const cardIndex = col.findIndex(c => c.id === cardId)
      const cardsToMove = col.slice(cardIndex)
      newColumns[source.index] = col.slice(0, cardIndex)

      // Add to target
      if (target.type === 'column') {
        newColumns[target.index].push(...cardsToMove)
      } else if (target.type === 'free') {
        // Can only move one card to free cell
        if (cardsToMove.length === 1 && !newFreeCells[target.index]) {
          newFreeCells[target.index] = cardsToMove[0]
        } else {
          // Invalid move to free cell (full or stack)
          return state
        }
      } else if (target.type === 'foundation') {
         // Can only move one card to foundation
         if (cardsToMove.length === 1) {
            // Update foundation logic would go here
            // For now, let's just remove it from the board if it goes to foundation?
            // Or update the foundation count/state.
            // The foundation state is just numbers/boolean.
            const c = cardsToMove[0]
            if (target.id === 'flower' && c.kind === 'flower') {
                newFoundations.flower = true
            } else if (c.kind === 'normal' && c.color === target.id) {
                // Should check if value is next in sequence
                newFoundations[target.id as 'green'|'purple'|'indigo'] = c.value
            } else {
                return state // Invalid foundation move
            }
         } else {
             return state
         }
      }

    } else if (source.type === 'free') {
      const cardToMove = newFreeCells[source.index]!
      newFreeCells[source.index] = null

      if (target.type === 'column') {
        newColumns[target.index].push(cardToMove)
      } else if (target.type === 'free') {
        if (!newFreeCells[target.index]) {
           newFreeCells[target.index] = cardToMove
        } else {
           return state // Target occupied
        }
      } else if (target.type === 'foundation') {
         if (target.id === 'flower' && cardToMove.kind === 'flower') {
             newFoundations.flower = true
         } else if (cardToMove.kind === 'normal' && cardToMove.color === target.id) {
             newFoundations[target.id as 'green'|'purple'|'indigo'] = cardToMove.value
         } else {
             return state
         }
      }
    }

    return {
      ...state,
      columns: newColumns,
      freeCells: newFreeCells,
      foundations: newFoundations
    }
  })
}

export function resetGame() {
  const newState = dealCards()
  gameStore.setState(() => ({
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
    }
  }))
}
