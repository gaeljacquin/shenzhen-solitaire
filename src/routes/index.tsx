import { createFileRoute } from '@tanstack/react-router'
import { GameBoard } from '@/components/GameBoard'

export const Route = createFileRoute('/')({ component: ShenzhenSolitaire })

function ShenzhenSolitaire() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center">
      <GameBoard />
    </div>
  )
}
