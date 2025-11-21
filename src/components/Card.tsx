import React from 'react'
import { Card as CardType } from '../lib/types'
import { cn } from '../lib/utils'
import { Flower, Circle, Square, Diamond } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'motion/react'

interface CardProps {
  card: CardType
  isDragging?: boolean
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  cardStyle?: 'filled' | 'outlined'
  disabled?: boolean
  onDoubleClick?: () => void
  canMoveToFoundation?: boolean
}

export function Card({
  card,
  isDragging: propIsDragging,
  className,
  style: propStyle,
  onClick,
  onDoubleClick,
  cardStyle = 'outlined', // Default to outlined
  disabled,
  canMoveToFoundation
}: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: dndIsDragging } = useDraggable({
    id: card.id,
    disabled: disabled || (card.kind === 'dragon' && card.isLocked),
  })

  const isDragging = propIsDragging || dndIsDragging

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 100 : undefined,
    ...propStyle,
  }

  const getCardColors = (color: string) => {
    const isOutlined = cardStyle === 'outlined'
    const bgClass = isOutlined ? 'bg-[#FDF6E3]' : ''

    switch (color) {
      case 'green':
        return isOutlined
          ? `${bgClass} text-emerald-600 border-emerald-600`
          : 'bg-emerald-600 text-white border-emerald-700'
      case 'red':
        return isOutlined
          ? `${bgClass} text-red-600 border-red-600`
          : 'bg-red-600 text-white border-red-700'
      case 'black':
        return isOutlined
          ? `${bgClass} text-black border-black`
          : 'bg-black text-white border-black'
      default:
        return `${bgClass} text-black border-slate-300`
    }
  }

  const getDragonIcon = (color: string) => {
    switch (color) {
      case 'green':
        return <Circle className="size-4 fill-current" />
      case 'red':
        return <Square className="size-4 fill-current" />
      case 'black':
        return <Diamond className="size-4 fill-current" />
      default:
        return null
    }
  }

  const renderContent = () => {
    if (card.kind === 'normal') {
      const colorClass = getCardColors(card.color)

      return (
        <div className={cn("w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2",
          isDragging ? "border-current" : "border-transparent",
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
      const colorClass = getCardColors(card.color)
      const icon = getDragonIcon(card.color)

      return (
        <div className={cn("w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2",
          isDragging ? "border-current" : "border-transparent",
          colorClass,
          card.isLocked && "opacity-50 grayscale"
        )}>
          <div className="leading-none">{icon}</div>
          <div className="flex-1 flex items-center justify-center">
            {icon && React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "size-10 fill-current" })}
          </div>
          <div className="leading-none rotate-180">{icon}</div>
        </div>
      )
    }

    if (card.kind === 'flower') {
      const isOutlined = cardStyle === 'outlined'
      const bgClass = isOutlined ? 'bg-[#FDF6E3]' : ''
      const colorClass = isOutlined
        ? `${bgClass} text-pink-600 border-pink-600`
        : 'bg-pink-600 text-white border-pink-700'

      return (
        <div className={cn("w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2",
          isDragging ? "border-current" : "border-transparent",
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
    <motion.div
      layoutId={card.id}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "w-28 h-40 rounded-lg shadow-sm select-none relative overflow-hidden p-1 touch-none transition-all",
        // Opacity logic: If className has opacity-0, it wins. Otherwise, if dragging, opacity-50.
        !className?.includes('opacity-0') && isDragging && "opacity-50 z-50",
        (disabled || (card.kind === 'dragon' && card.isLocked)) && "cursor-default",
        canMoveToFoundation && !isDragging && "border-white animate-border-pulse",
        className
      )}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: className?.includes('opacity-0') ? 0 : 1
      }}
      transition={{
        layout: { duration: 0.2, type: "spring", bounce: 0.2 },
        opacity: { duration: 0.2 }
      }}
    >
      {renderContent()}
    </motion.div>
  )
}
