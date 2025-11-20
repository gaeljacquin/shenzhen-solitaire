import { describe, it, expect, beforeEach } from 'vitest'
import { gameStore, moveCard, collectDragons, undo, pauseGame, resumeGame, newGame, GameStatus, performWandMove } from './store'
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
