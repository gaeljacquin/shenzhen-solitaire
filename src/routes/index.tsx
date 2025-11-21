import { createFileRoute } from '@tanstack/react-router'
import { GameBoard } from '@/components/GameBoard'

export const Route = createFileRoute('/')({ component: ShenzhenSolitaire })

function ShenzhenSolitaire() {
  return (
    <div className="min-h-screen bg-[#2d5a3d] text-slate-100 flex flex-col items-center justify-center">
      <GameBoard />
    </div>
  )
}
