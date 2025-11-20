import { describe, it, expect, beforeEach } from 'vitest'
import { gameStore, moveCard, collectDragons, undo, pauseGame, resumeGame, newGame, GameStatus, performWandMove, triggerAutoMove } from './store'
import { Card } from './types'

// Helper to reset store for tests
function resetStore() {
    newGame()
    gameStore.setState(s => ({ ...s, devMode: false }))
}

describe('Shenzhen Solitaire Store', () => {
    beforeEach(() => {
        resetStore()
    })

    it('initializes with correct state', () => {
        const state = gameStore.state
        expect(state.columns.length).toBe(8)
        expect(state.freeCells.length).toBe(3)
        expect(state.foundations.green).toBe(0)
        expect(state.status).toBe('playing')
    })

    it('validates legal moves between columns', () => {
        // Setup a specific scenario
        // We need to find a valid move or force the state.
        // Let's force state for testing.

        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 9 }
        const card2: Card = { id: 'c2', kind: 'normal', color: 'purple', value: 8 }

        gameStore.setState(s => ({
            ...s,
            columns: [[card1], [card2], [], [], [], [], [], []],
            freeCells: [null, null, null]
        }))

        moveCard('c2', 'col-0')

        const state = gameStore.state
        expect(state.columns[0].length).toBe(2)
        expect(state.columns[0][1].id).toBe('c2')
        expect(state.columns[1].length).toBe(0)
    })

    it('prevents illegal moves (same color)', () => {
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 9 }
        const card2: Card = { id: 'c2', kind: 'normal', color: 'green', value: 8 }

        gameStore.setState(s => ({
            ...s,
            columns: [[card1], [card2], [], [], [], [], [], []]
        }))

        moveCard('c2', 'col-0')

        const state = gameStore.state
        expect(state.columns[0].length).toBe(1)
        expect(state.columns[1].length).toBe(1) // Move failed
    })

    it('prevents illegal moves (wrong value)', () => {
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 9 }
        const card2: Card = { id: 'c2', kind: 'normal', color: 'purple', value: 7 } // Should be 8

        gameStore.setState(s => ({
            ...s,
            columns: [[card1], [card2], [], [], [], [], [], []]
        }))

        moveCard('c2', 'col-0')

        const state = gameStore.state
        expect(state.columns[0].length).toBe(1)
        expect(state.columns[1].length).toBe(1)
    })

    it('moves to free cell', () => {
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 9 }

        gameStore.setState(s => ({
            ...s,
            columns: [[card1], [], [], [], [], [], [], []],
            freeCells: [null, null, null]
        }))

        moveCard('c1', 'free-0')

        const state = gameStore.state
        expect(state.columns[0].length).toBe(0)
        expect(state.freeCells[0]?.id).toBe('c1')
    })

    it('collects dragons', () => {
        const dragons: Card[] = [0, 1, 2, 3].map(i => ({ id: `dragon-green-${i}`, kind: 'dragon', color: 'green' }))

        // Place 3 in columns, 1 in free cell
        gameStore.setState(s => ({
            ...s,
            columns: [[dragons[0]], [dragons[1]], [dragons[2]], [], [], [], [], []],
            freeCells: [dragons[3], null, null],
            dragons: { green: 0, red: 0, white: 0 }
        }))

        collectDragons('green')

        const state = gameStore.state
        expect(state.dragons.green).toBe(1)
        expect(state.columns[0].length).toBe(0)
        expect(state.columns[1].length).toBe(0)
        expect(state.columns[2].length).toBe(0)
        // One free cell should be locked (occupied by a dragon card)
        // We implemented it as putting a dragon card back in a free cell.
        // Since we had one in free-0, and we need to consolidate,
        // the logic prefers using an occupied free cell or an empty one.
        // Here free-0 was occupied by dragon-green-3.
        // It should be replaced by the locked dragon or similar.

        const lockedCell = state.freeCells.find(c => c?.id.includes('locked'))
        expect(lockedCell).toBeDefined()
        expect(lockedCell?.color).toBe('green')
    })

    it('collects dragons to leftmost free cell', () => {
        const dragons: Card[] = [0, 1, 2, 3].map(i => ({ id: `dragon-green-${i}`, kind: 'dragon', color: 'green' }))

        // Place dragons in free cells 0 and 2, and two in columns
        gameStore.setState(s => ({
            ...s,
            columns: [[dragons[0]], [dragons[1]], [], [], [], [], [], []],
            freeCells: [dragons[2], null, dragons[3]],
            dragons: { green: 0, red: 0, white: 0 }
        }))

        collectDragons('green')

        const state = gameStore.state
        expect(state.dragons.green).toBe(1)
        // Should consolidate to free cell 0 (leftmost occupied)
        expect(state.freeCells[0]?.id).toContain('locked')
        expect(state.freeCells[2]).toBeNull()
    })

    it('auto-moves ones to foundation', () => {
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 1 }
        const card2: Card = { id: 'c2', kind: 'normal', color: 'purple', value: 9 }

        gameStore.setState(s => ({
            ...s,
            columns: [[card1], [card2], [], [], [], [], [], []],
            foundations: { green: 0, purple: 0, indigo: 0, flower: false }
        }))

        // Trigger a move (even a dummy one or just calling autoMoveOnes via a move)
        // We can simulate a move that exposes the 1, or just move the 1 itself?
        // But auto-move happens *after* a move.
        // Let's move card2 to free cell, which shouldn't trigger 1 unless 1 was already exposed.
        // If 1 is at top, it should move immediately if we trigger a state update that calls autoMoveOnes.
        // But we only call it in moveCard/collectDragons.
        // So let's move card2 to free cell.

        moveCard('c2', 'free-0')

        const state = gameStore.state
        expect(state.foundations.green).toBe(1)
        expect(state.columns[0].length).toBe(0)
    })

    it('wand moves all available next rank cards', () => {
        const green2: Card = { id: 'g2', kind: 'normal', color: 'green', value: 2 }
        const purple2: Card = { id: 'p2', kind: 'normal', color: 'purple', value: 2 }
        const indigo2: Card = { id: 'i2', kind: 'normal', color: 'indigo', value: 2 }

        gameStore.setState(s => ({
            ...s,
            columns: [[green2], [purple2], [indigo2], [], [], [], [], []],
            foundations: { green: 1, purple: 1, indigo: 1, flower: false }
        }))

        performWandMove()

        const state = gameStore.state
        expect(state.foundations.green).toBe(2)
        expect(state.foundations.purple).toBe(2)
        expect(state.foundations.indigo).toBe(2)
        expect(state.columns[0].length).toBe(0)
    })

    it('triggerAutoMove moves ones', () => {
        const store = gameStore
        store.setState({
            ...store.state,
            freeCells: [{ id: 'normal-green-1', kind: 'normal', color: 'green', value: 1 }, null, null],
            foundations: { green: 0, purple: 0, indigo: 0, flower: false },
            status: 'playing'
        })

        triggerAutoMove()

        expect(gameStore.state.foundations.green).toBe(1)
    })

    it('prevents moving card onto locked dragon', () => {
        const store = gameStore
        store.setState({
            ...store.state,
            freeCells: [{ id: 'dragon-green-locked', kind: 'dragon', color: 'green', isLocked: true }, null, null],
            columns: [[{ id: 'normal-green-9', kind: 'normal', color: 'green', value: 9 }]]
        })

        moveCard('normal-green-9', 'free-0')

        // Should not move
        expect(store.state.columns[0].length).toBe(1)
        expect(store.state.freeCells[0]?.isLocked).toBe(true)
    })

    it('undo reverts auto-moves together with manual move', () => {
        const store = gameStore
        // Setup: '1' in column, ready to move. User moves a card to expose it.
        // We need a '1' that is NOT at the top.
        // Col 0: [Card A, Card 1] -> No, 1 must be at top to move.
        // Scenario:
        // Col 0: [Card 1]
        // Col 1: [Card 2]
        // Move Card 2 to somewhere? No.
        // Scenario:
        // Col 0: [Card 1]
        // But 1s auto move immediately.
        // We need a move that *triggers* an auto move.
        // Example: 1 is in a column, but blocked by another card?
        // No, only top cards move.
        // So 1 must be covered.
        // Col 0: [Card 1, Card A]
        // Move Card A to another column.
        // Then Card 1 is exposed and auto-moves.

        store.setState({
            ...store.state,
            columns: [
                [{ id: 'normal-green-1', kind: 'normal', color: 'green', value: 1 }, { id: 'normal-red-9', kind: 'normal', color: 'red', value: 9 }],
                [], // Empty col to move to
                [], [], [], [], [], []
            ],
            foundations: { green: 0, purple: 0, indigo: 0, flower: false },
            history: []
        })

        // Move Card A (red-9) to Col 1
        moveCard('normal-red-9', 'col-1')

        // Expect:
        // 1. Red-9 moved to Col 1
        // 2. Green-1 exposed and auto-moved to foundation
        expect(store.state.columns[1].length).toBe(1) // Red-9
        expect(store.state.foundations.green).toBe(1) // Green-1
        expect(store.state.columns[0].length).toBe(0) // Empty

        // Undo
        undo()

        // Expect:
        // Both moves reverted.
        // Col 0: [Green-1, Red-9]
        // Col 1: []
        // Foundation: 0
        expect(store.state.foundations.green).toBe(0)
        expect(store.state.columns[1].length).toBe(0)
        expect(store.state.columns[0].length).toBe(2)
        expect(store.state.columns[0][0].id).toBe('normal-green-1')
        expect(store.state.columns[0][1].id).toBe('normal-red-9')
    })

    it('prevents moving card onto locked dragon even in dev mode', () => {
        const store = gameStore
        store.setState({
            ...store.state,
            devMode: true,
            freeCells: [{ id: 'dragon-green-locked', kind: 'dragon', color: 'green', isLocked: true }, null, null],
            columns: [[{ id: 'normal-green-9', kind: 'normal', color: 'green', value: 9 }]]
        })

        moveCard('normal-green-9', 'free-0')

        // Should not move
        expect(store.state.columns[0].length).toBe(1)
        expect(store.state.freeCells[0]?.isLocked).toBe(true)
    })

    it('initial auto-move does not enable undo', () => {
        const store = gameStore
        // Setup state as if new game just started (history empty) but with a '1' ready to move
        store.setState({
            ...store.state,
            history: [],
            status: 'playing',
            freeCells: [{ id: 'normal-green-1', kind: 'normal', color: 'green', value: 1 }, null, null],
            foundations: { green: 0, purple: 0, indigo: 0, flower: false }
        })

        // Trigger auto move
        triggerAutoMove()

        // Expect foundation to be updated
        expect(store.state.foundations.green).toBe(1)

        // Expect history to still be empty
        expect(store.state.history.length).toBe(0)
    })

    it('dev mode allows illegal moves', () => {
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 9 }
        const card2: Card = { id: 'c2', kind: 'normal', color: 'green', value: 8 }

        gameStore.setState(s => ({
            ...s,
            columns: [[card1], [card2], [], [], [], [], [], []],
            devMode: true
        }))

        moveCard('c2', 'col-0')

        const state = gameStore.state
        expect(state.columns[0].length).toBe(2) // Move allowed in dev mode
    })

    it('undo functionality', () => {
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 9 }

        gameStore.setState(s => ({
            ...s,
            columns: [[card1], [], [], [], [], [], [], []],
            freeCells: [null, null, null],
            history: []
        }))

        moveCard('c1', 'free-0')
        const card = gameStore.state.freeCells[0]
        expect(card).not.toBeNull()
        if (card && card.kind === 'dragon') {
            expect(card.isLocked).toBe(true)
            expect(card.color).toBe('green')
        }
        expect(gameStore.state.freeCells[0]?.id).toBe('c1')
        expect(gameStore.state.history.length).toBe(1)

        undo()
        expect(gameStore.state.freeCells[0]).toBeNull()
        expect(gameStore.state.columns[0].length).toBe(1)
        expect(gameStore.state.history.length).toBe(0)
    })

    it('pause and resume', () => {
        expect(gameStore.state.status).toBe('playing')
        pauseGame()
        expect(gameStore.state.status).toBe('paused')

        // Move should be blocked
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 9 }
        gameStore.setState(s => ({ ...s, columns: [[card1], [], [], [], [], [], [], []], freeCells: [null, null, null] }))

        moveCard('c1', 'free-0')
        expect(gameStore.state.columns[0].length).toBe(1) // Move blocked

        resumeGame()
        expect(gameStore.state.status).toBe('playing')
        moveCard('c1', 'free-0')
        expect(gameStore.state.columns[0].length).toBe(0) // Move allowed
    })
})
