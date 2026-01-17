import React from 'react'
import type { Card as CardType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Flower, Circle, Square, Diamond } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
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
  dataIdDisabled?: boolean
  disableLayout?: boolean
  isFaceDown?: boolean
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
  canMoveToFoundation,
  dataIdDisabled,
  disableLayout,
  isFaceDown
}: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging: dndIsDragging } = useDraggable({
    id: card.id,
    disabled: disabled || (card.kind === 'dragon' && card.isLocked) || propIsDragging,
  })

  const isDragging = propIsDragging || dndIsDragging

  const style = {
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

  const renderBackContent = () => (
    <div
      className={cn(
        "w-full h-full rounded-md border-2 border-slate-600 bg-[#FDF6E3] bg-no-repeat bg-center",
      )}
      style={{ backgroundImage: 'url(/logo.png)', backgroundSize: '70%' }}
    />
  )

  const renderFrontContent = () => {
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

  const renderContent = () => {
    if (isFaceDown) return renderBackContent()
    return renderFrontContent()
  }

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        data-card-id={dataIdDisabled ? undefined : card.id}
        className={cn(
          "w-28 h-40 rounded-lg shadow-sm select-none relative overflow-hidden p-1 touch-none transition-none",
          !className?.includes('opacity-0') && "opacity-50 z-50",
          (disabled || (card.kind === 'dragon' && card.isLocked)) && "cursor-default",
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

  const instantHide = className?.includes('instant-hide')

  return (
    <motion.div
      layoutId={disableLayout || className?.includes('opacity-0') ? undefined : card.id}
      layout={disableLayout ? false : 'position'}
      initial={false}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-card-id={dataIdDisabled ? undefined : card.id}
      className={cn(
        "w-28 h-40 rounded-lg shadow-sm select-none relative overflow-hidden p-1 touch-none transition-none",
        (disabled || (card.kind === 'dragon' && card.isLocked)) && "cursor-default",
        canMoveToFoundation && "border-white animate-border-pulse",
        className
      )}
      style={{ ...style, perspective: '1000px' }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      animate={{
        opacity: className?.includes('opacity-0') ? 0 : 1
      }}
      transition={{
        layout: { duration: 0.45, type: "spring", bounce: 0.15 },
        opacity: { duration: instantHide ? 0 : 0.2 }
      }}
    >
      <div
        className="relative w-full h-full transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateY(${isFaceDown ? 180 : 0}deg)`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {renderFrontContent()}
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {renderBackContent()}
        </div>
      </div>
    </motion.div>
  )
}
