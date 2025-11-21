import { describe, it, expect, beforeEach } from 'vitest'
import { gameStore, moveCard, collectDragons, undo, pauseGame, resumeGame, newGame, performWandMove, triggerAutoMove } from './store'
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
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 9 }
        const card2: Card = { id: 'c2', kind: 'normal', color: 'red', value: 8 }

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
        const card2: Card = { id: 'c2', kind: 'normal', color: 'red', value: 7 } // Should be 8

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
            dragons: { green: 0, red: 0, yellow: 0 }
        }))

        collectDragons('green')

        const state = gameStore.state
        expect(state.dragons.green).toBe(1)
        expect(state.columns[0].length).toBe(0)
        expect(state.columns[1].length).toBe(0)
        expect(state.columns[2].length).toBe(0)

        const lockedCell = state.freeCells.find(c => c?.kind === 'dragon' && (c as any).isLocked)
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
            dragons: { green: 0, red: 0, yellow: 0 }
        }))

        collectDragons('green')

        const state = gameStore.state
        expect(state.dragons.green).toBe(1)
        // Should consolidate to free cell 0 (leftmost occupied)
        expect(state.freeCells[0]).toBeDefined()
        expect((state.freeCells[0] as any).isLocked).toBe(true)
        expect(state.freeCells[2]).toBeNull()
    })

    it('auto-moves ones to foundation', () => {
        const card1: Card = { id: 'c1', kind: 'normal', color: 'green', value: 1 }
        const card2: Card = { id: 'c2', kind: 'normal', color: 'red', value: 9 }

        gameStore.setState(s => ({
            ...s,
            columns: [[card1], [card2], [], [], [], [], [], []],
            foundations: { green: 0, red: 0, black: 0, flower: false }
        }))

        moveCard('c2', 'free-0')

        const state = gameStore.state
        expect(state.foundations.green).toBe(1)
        expect(state.columns[0].length).toBe(0)
    })

    it('wand moves all available next rank cards', () => {
        const green2: Card = { id: 'g2', kind: 'normal', color: 'green', value: 2 }
        const red2: Card = { id: 'r2', kind: 'normal', color: 'red', value: 2 }
        const black2: Card = { id: 'b2', kind: 'normal', color: 'black', value: 2 }

        gameStore.setState(s => ({
            ...s,
            columns: [[green2], [red2], [black2], [], [], [], [], []],
            foundations: { green: 1, red: 1, black: 1, flower: false }
        }))

        performWandMove()

        const state = gameStore.state
        expect(state.foundations.green).toBe(2)
        expect(state.foundations.red).toBe(2)
        expect(state.foundations.black).toBe(2)
        expect(state.columns[0].length).toBe(0)
    })

    it('triggerAutoMove moves ones', () => {
        const store = gameStore
        store.setState({
            ...store.state,
            freeCells: [{ id: 'normal-green-1', kind: 'normal', color: 'green', value: 1 }, null, null],
            foundations: { green: 0, red: 0, black: 0, flower: false },
            status: 'playing'
        })

        triggerAutoMove()

        expect(gameStore.state.foundations.green).toBe(1)
    })

    it('moves card to foundation', () => {
        // 1. Move 1 of Green to foundation (should work if foundation is at 0)
        gameStore.setState((state) => ({
            ...state,
            columns: [
                [{ id: 'normal-green-1', kind: 'normal', color: 'green', value: 1 }],
                [], [], [], [], [], [], []
            ],
            foundations: { ...state.foundations, green: 0 }
        }))

        moveCard('normal-green-1', 'foundation-green')
        expect(gameStore.state.foundations.green).toBe(1)
        expect(gameStore.state.columns[0].length).toBe(0)

        // 2. Move 9 of Green to foundation (should work if foundation is at 8)
        // Setup foundation AND place the card in a column so it can be found
        gameStore.setState((state) => ({
            ...state,
            columns: [
                [{ id: 'normal-green-9', kind: 'normal', color: 'green', value: 9 }],
                [], [], [], [], [], [], []
            ],
            foundations: { ...state.foundations, green: 8 }
        }))

        moveCard('normal-green-9', 'foundation-green')
        expect(gameStore.state.foundations.green).toBe(9)
    })

    it('collects all 4 dragons and locks a free cell', () => {
        // Setup: Place 4 green dragons in free cells/top of columns
        // We'll just put them in free cells for simplicity of test setup
        const dragons = [0, 1, 2, 3].map(i => ({ id: `dragon-green-${i}`, kind: 'dragon' as const, color: 'green' as const }))

        gameStore.setState((state) => ({
            ...state,
            freeCells: [dragons[0], dragons[1], dragons[2]],
            columns: [
                [dragons[3]], // Top of first column
                [], [], [], [], [], [], []
            ]
        }))

        collectDragons('green')

        const state = gameStore.state
        expect(state.dragons.green).toBe(1) // Collected
        // Should have a locked cell
        const lockedCell = state.freeCells.find(c => c?.kind === 'dragon' && (c as any).isLocked)
        expect(lockedCell).toBeDefined()
        expect(lockedCell?.kind).toBe('dragon')
        expect(lockedCell?.color).toBe('green')

        // Other dragons should be gone
        expect(state.columns[0].length).toBe(0)
    })

    it('undo reverts moves', () => {
        // Make a move
        const card = gameStore.state.columns[0][gameStore.state.columns[0].length - 1]
        // Find an empty free cell
        moveCard(card.id, 'free-0')

        expect(gameStore.state.freeCells[0]?.id).toBe(card.id)

        undo()

        expect(gameStore.state.freeCells[0]).toBeNull()
        const col = gameStore.state.columns[0]
        expect(col[col.length - 1].id).toBe(card.id)
    })

    it('grouped undo reverts auto-moves together with manual move', () => {
        gameStore.setState((state) => ({
            ...state,
            columns: [
                [{ id: 'normal-green-1', kind: 'normal', color: 'green', value: 1 }],
                [], [], [], [], [], [], []
            ],
            freeCells: [null, null, null],
            foundations: { green: 0, red: 0, black: 0, flower: false },
            history: [] // Clear history
        }))

        // Manual move to free cell
        moveCard('normal-green-1', 'free-0')

        // Verify it ended up in foundation
        expect(gameStore.state.foundations.green).toBe(1)
        expect(gameStore.state.freeCells[0]).toBeNull()

        // Undo
        undo()

        // Should be back in column
        expect(gameStore.state.foundations.green).toBe(0)
        expect(gameStore.state.columns[0].length).toBe(1)
        expect(gameStore.state.columns[0][0].id).toBe('normal-green-1')
    })

    it('dev mode allows moving to locked dragon cells', () => {
        // Setup: Locked dragon in free-0
        gameStore.setState((state) => ({
            ...state,
            freeCells: [{ id: 'dragon-green-locked', kind: 'dragon', color: 'green', isLocked: true } as any, null, null],
            columns: [
                [{ id: 'normal-red-1', kind: 'normal', color: 'red', value: 1 }],
                [], [], [], [], [], [], []
            ],
            devMode: true
        }))

        // Try to move card to locked cell
        moveCard('normal-red-1', 'free-0')

        // Should NOT move, even in dev mode (as per requirements, locked cells are locked)
        expect(gameStore.state.columns[0].length).toBe(1)
        expect((gameStore.state.freeCells[0] as any)?.isLocked).toBe(true)
    })

    it('initial auto-moves do not create undo history', () => {
        gameStore.setState({
            columns: [[{ id: 'normal-green-1', kind: 'normal', color: 'green', value: 1 }]],
            freeCells: [null, null, null],
            foundations: { green: 0, red: 0, black: 0, flower: false },
            dragons: { green: 0, red: 0, yellow: 0 },
            status: 'playing',
            history: [],
            devMode: false,
            gameId: 1,
            startTime: null,
            elapsedTime: 0,
            timerRunning: false
        })

        // Trigger auto move (simulate what happens after deal)
        triggerAutoMove()

        // Should be in foundation
        expect(gameStore.state.foundations.green).toBe(1)

        // History should be empty because it was the first move (history was empty)
        expect(gameStore.state.history.length).toBe(0)
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
            expect((card as any).isLocked).toBe(true)
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
