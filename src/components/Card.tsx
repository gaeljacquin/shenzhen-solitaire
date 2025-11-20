import React from 'react'
import { Card as CardType } from '../lib/types'
import { cn } from '../lib/utils'
import { Flower, Sparkles, Flame, Cloud } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

interface CardProps {
  card: CardType
  isDragging?: boolean
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  cardStyle?: 'filled' | 'outlined'
  disabled?: boolean
  onDoubleClick?: () => void
}

export function Card({ card, isDragging: propIsDragging, className, style: propStyle, onClick, onDoubleClick, cardStyle = 'filled', disabled }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: disabled || (card.kind === 'dragon' && card.isLocked), // Disable drag if card is disabled or locked dragon
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    ...propStyle,
  }

  const getCardColors = (color: string) => {
    const isOutlined = cardStyle === 'outlined'

    switch (color) {
      case 'green':
        return isOutlined
          ? 'bg-white text-emerald-600 border-emerald-600'
          : 'bg-emerald-600 text-white border-emerald-700'
      case 'purple':
        return isOutlined
          ? 'bg-white text-purple-900 border-purple-900'
          : 'bg-purple-900 text-white border-purple-950'
      case 'indigo':
        return isOutlined
          ? 'bg-white text-indigo-900 border-indigo-900'
          : 'bg-indigo-900 text-white border-indigo-950'
      case 'red':
        return isOutlined
          ? 'bg-white text-red-600 border-red-600'
          : 'bg-red-600 text-white border-red-700'
      case 'white': // Now Orange as per instructions
        return isOutlined
          ? 'bg-white text-orange-500 border-orange-500'
          : 'bg-orange-500 text-white border-orange-600'
      case 'sky': // For Green Dragon (Cloud)
        return isOutlined
          ? 'bg-white text-sky-500 border-sky-500'
          : 'bg-sky-500 text-white border-sky-600'
      default:
        return 'bg-white text-black border-slate-300'
    }
  }

  const getDragonIcon = (color: string) => {
    switch (color) {
      case 'green':
        return <Cloud className="size-4" />
      case 'red':
        return <Flame className="size-4" />
      case 'white':
        return <Sparkles className="size-4" />
      default:
        return null
    }
  }

  const renderContent = () => {
    if (card.kind === 'normal') {
      const displayColor = card.color === 'indigo' ? 'indigo' : card.color
      const colorClass = getCardColors(displayColor)

      return (
        <div className={cn("w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2",
          (isDragging || propIsDragging) ? "border-current" : "border-transparent", // Only show border on drag
          colorClass
        )}>
          <div className="text-sm font-bold leading-none">{card.value}</div>
          <div className="flex-1 flex items-center justify-center">
            <span className="text-4xl font-bold">{card.value}</span>
          </div>
          <div className="text-sm font-bold leading-none rotate-180">{card.value}</div>
        </div>
      )
    }

    if (card.kind === 'dragon') {
      // Map colors to new visual requirements
      // Green Dragon -> Cloud -> Sky Blue
      // White Dragon -> Sparkles -> Orange
      // Red Dragon -> Flame -> Red (unchanged)
      let displayColor: string = card.color
      if (card.color === 'green') displayColor = 'sky'
      if (card.color === 'white') displayColor = 'white' // mapped to orange in getCardColors

      const colorClass = getCardColors(displayColor)
      const icon = getDragonIcon(card.color)

      return (
        <div className={cn("w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2",
          (isDragging || propIsDragging) ? "border-current" : "border-transparent",
          colorClass,
          card.isLocked && "opacity-50 grayscale" // Visual indication for locked dragon
        )}>
          <div className="leading-none">{icon}</div>
          <div className="flex-1 flex items-center justify-center">
            {icon && React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "size-10" })}
          </div>
          <div className="leading-none rotate-180">{icon}</div>
        </div>
      )
    }

    if (card.kind === 'flower') {
      // Flower -> Pink
      const isOutlined = cardStyle === 'outlined'
      const colorClass = isOutlined
        ? 'bg-white text-pink-600 border-pink-600'
        : 'bg-pink-600 text-white border-pink-700'

      return (
        <div className={cn("w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2",
          (isDragging || propIsDragging) ? "border-current" : "border-transparent",
          colorClass
        )}>
          <div className="leading-none"><Flower className="size-4" /></div>
          <div className="flex-1 flex items-center justify-center">
            <Flower className="size-10" />
          </div>
          <div className="leading-none rotate-180"><Flower className="size-4" /></div>
        </div>
      )
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "w-24 h-32 rounded-lg shadow-sm select-none relative overflow-hidden p-1 touch-none transition-opacity", // Removed bg-white/10
        (isDragging || propIsDragging) ? "opacity-50 z-50" : "opacity-100",
        (disabled || (card.kind === 'dragon' && card.isLocked)) && "cursor-default", // Dimmed if disabled
        className
      )}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {renderContent()}
    </div>
  )
}
