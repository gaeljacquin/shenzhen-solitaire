import React from 'react'
import { useStore } from '@tanstack/react-store'
import { gameStore, moveCard } from '../lib/store'
import { Card } from './Card'
import { ControlPanel } from './ControlPanel'
import { Cloud, Flame, Sparkles, Flower } from 'lucide-react'
import { cn } from '../lib/utils'
import { DndContext, DragEndEvent, DragStartEvent, useSensor, useSensors, PointerSensor, useDroppable, DragOverlay } from '@dnd-kit/core'
import { Card as CardType } from '../lib/types'
import Rules from './Rules'

function DroppableZone({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-cyan-400 ring-opacity-50")}>
      {children}
    </div>
  )
}

export function GameBoard() {
  const state = useStore(gameStore)
  const [cardStyle, setCardStyle] = React.useState<'filled' | 'outlined'>('filled')
  const [isGlowEnabled, setIsGlowEnabled] = React.useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [draggedStack, setDraggedStack] = React.useState<CardType[]>([])

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    setActiveId(active.id as string)

    // Find the stack being dragged
    const cardId = active.id as string
    let stack: CardType[] = []

    // Check columns for the card and subsequent cards
    for (const column of state.columns) {
      const index = column.findIndex(c => c.id === cardId)
      if (index !== -1) {
        stack = column.slice(index)
        break
      }
    }

    // If not in column, check free cells (single card)
    if (stack.length === 0) {
      const freeCard = state.freeCells.find(c => c?.id === cardId)
      if (freeCard) stack = [freeCard]
    }

    setDraggedStack(stack)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setDraggedStack([])

    if (over && active.id !== over.id) {
      moveCard(active.id as string, over.id as string)
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="w-full max-w-7xl mx-auto p-4 flex flex-col items-center min-h-screen">
        {/* ... existing layout ... */}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeId && draggedStack.length > 0 ? (
            <div className="flex flex-col gap-[-3rem]">
              {draggedStack.map((card, index) => (
                <div key={card.id} style={{ marginTop: index === 0 ? 0 : '-6rem' }}>
                  <Card card={card} cardStyle={cardStyle} isDragging />
                </div>
              ))}
            </div>
          ) : null}
        </DragOverlay>

        {/* Top Bar: Free Cells, Center Stack, Foundations */}
        <div className="w-full flex justify-between items-start mb-8 gap-8"> {/* Increased gap */}

          {/* Free Cells (Top Left) */}
          <div className="flex gap-2">
            {state.freeCells.map((card, i) => (
              <DroppableZone key={`free-${i}`} id={`free-${i}`} className="w-24 h-32 border-2 border-slate-700 rounded-lg bg-slate-800/30 flex items-center justify-center">
                {card && <Card card={card} cardStyle={cardStyle} />}
              </DroppableZone>
            ))}
          </div>

          {/* Center Stack: Flower + Dragons */}
          <div className="flex flex-col gap-4 items-center">
            {/* Flower Slot (Top) */}
            <DroppableZone
              id="foundation-flower"
              className={cn(
                "w-24 h-32 border-2 border-slate-700 rounded-lg bg-slate-800/30 flex items-center justify-center relative transition-all duration-300",
                isGlowEnabled && "shadow-[0_0_15px_rgba(236,72,153,0.6)] border-pink-500/50" // Added glow
              )}
            >
              <Flower className={cn(
                "text-slate-700/50 absolute size-8",
                isGlowEnabled && "text-pink-500/50"
              )} />
              {state.foundations.flower && (
                <Card
                  card={{ id: 'flower-placeholder', kind: 'flower' }}
                  cardStyle={cardStyle}
                  disabled={true} // Disable drag and dim
                />
              )}
            </DroppableZone>

            {/* Dragon Buttons (Bottom) */}
            <div className="flex gap-2">
              <DragonButton color="green" icon={<Cloud className="size-5" />} isGlowEnabled={isGlowEnabled} />
              <DragonButton color="red" icon={<Flame className="size-5" />} isGlowEnabled={isGlowEnabled} />
              <DragonButton color="white" icon={<Sparkles className="size-5" />} isGlowEnabled={isGlowEnabled} />
            </div>
          </div>

          {/* Foundations (Top Right) */}
          <div className="flex gap-2">
            {/* Numbered Foundations */}
            {['green', 'purple', 'indigo'].map((color) => (
              <DroppableZone key={color} id={`foundation-${color}`} className="w-24 h-32 border-2 border-slate-700 rounded-lg bg-slate-800/30 flex items-center justify-center relative">
                <div className={cn("absolute inset-0 opacity-20 rounded-sm",
                  color === 'green' && "bg-emerald-600",
                  color === 'purple' && "bg-purple-900",
                  color === 'indigo' && "bg-indigo-900"
                )} />
                {/* Placeholder for foundation top card */}
                <div className="text-slate-500 font-bold text-3xl opacity-70">
                  {state.foundations[color as keyof typeof state.foundations] || ''}
                </div>
              </DroppableZone>
            ))}
          </div>
        </div>

        {/* Main Tableau (Columns) */}
        <div className="w-full flex justify-center gap-6 mb-8"> {/* Increased gap to 6 */}
          {state.columns.map((column, i) => (
            <DroppableZone
              key={`col-${i}`}
              id={`col-${i}`}
              className="w-28 min-h-[600px] flex flex-col gap-[-3rem] p-1 border-2 border-slate-800/50 rounded-lg bg-slate-900/20 items-center pt-2" // Increased width to w-28, added items-center and pt-2 for gap
            >
              {column.map((card, index) => {
                // Check if this card is part of the currently dragged stack
                const isBeingDragged = draggedStack.some(c => c.id === card.id)

                return (
                  <div key={`${i}-${index}`} style={{ marginTop: index === 0 ? 0 : '-6rem' }}>
                    <Card
                      card={card}
                      cardStyle={cardStyle}
                      className={isBeingDragged ? "opacity-0" : ""} // Hide dragged cards
                    />
                  </div>
                )
              })}
            </DroppableZone>
          ))}
        </div>

        <ControlPanel
          cardStyle={cardStyle}
          onToggleStyle={() => setCardStyle(s => s === 'filled' ? 'outlined' : 'filled')}
          isGlowEnabled={isGlowEnabled}
          onToggleGlow={() => setIsGlowEnabled(!isGlowEnabled)}
        />

        {/* Rules Section */}
        <Rules />
      </div>
    </DndContext>
  )
}

function DragonButton({ color, icon, isGlowEnabled }: { color: string, icon: React.ReactNode, isGlowEnabled: boolean }) {
  const getStyles = () => {
    // Background colors matching cards
    const base = "w-16 h-12 rounded-md border-2 flex items-center justify-center transition-all duration-100 active:scale-95 active:brightness-90" // Added active styles

    if (color === 'green') { // Sky Blue
      return cn(base, "bg-sky-500 border-sky-600 text-white",
        !isGlowEnabled && "opacity-30 grayscale",
        isGlowEnabled && "shadow-[0_0_15px_rgba(14,165,233,0.6)]"
      )
    }
    if (color === 'red') {
      return cn(base, "bg-red-600 border-red-700 text-white",
        !isGlowEnabled && "opacity-30 grayscale",
        isGlowEnabled && "shadow-[0_0_15px_rgba(220,38,38,0.6)]"
      )
    }
    if (color === 'white') { // Orange
      return cn(base, "bg-orange-500 border-orange-600 text-white",
        !isGlowEnabled && "opacity-30 grayscale",
        isGlowEnabled && "shadow-[0_0_15px_rgba(249,115,22,0.6)]"
      )
    }
    return base
  }

  return (
    <button className={getStyles()}>
      {icon}
    </button>
  )
}
