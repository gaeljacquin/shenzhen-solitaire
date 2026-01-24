import React from 'react'
import { Circle, Diamond, Flower, Square } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { motion } from 'motion/react'
import type { Card as CardType } from '@/lib/types'
import { cn } from '@/lib/utils'

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

type CardStyle = 'filled' | 'outlined'

function getCardColors(color: string, cardStyle: CardStyle) {
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

function getDragonIcon(color: string) {
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

function renderBackContent() {
  return (
    <div
      className={cn(
        'w-full h-full rounded-md border-2 border-slate-600 bg-[#FDF6E3] bg-no-repeat bg-center',
      )}
      style={{ backgroundImage: 'url(/logo.png)', backgroundSize: '70%' }}
    />
  )
}

function renderNormalCard(
  value: number,
  color: string,
  cardStyle: CardStyle,
  isDragging: boolean,
) {
  const colorClass = getCardColors(color, cardStyle)
  return (
    <div
      className={cn(
        'w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2',
        isDragging ? 'border-current' : 'border-transparent',
        colorClass,
      )}
    >
      <div className="text-xs sm:text-sm font-bold leading-none self-start">
        {value}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <span className="text-3xl sm:text-4xl font-bold">{value}</span>
      </div>
      <div className="text-xs sm:text-sm font-bold leading-none rotate-180 self-end">
        {value}
      </div>
    </div>
  )
}

function renderDragonCard(
  color: string,
  cardStyle: CardStyle,
  isDragging: boolean,
  isLocked?: boolean,
) {
  const colorClass = getCardColors(color, cardStyle)
  const icon = getDragonIcon(color)

  return (
    <div
      className={cn(
        'w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2',
        isDragging ? 'border-current' : 'border-transparent',
        colorClass,
        isLocked && 'opacity-50 grayscale',
      )}
    >
      <div className="leading-none">{icon}</div>
      <div className="flex-1 flex items-center justify-center">
        {icon &&
          React.cloneElement(
            icon as React.ReactElement<{ className?: string }>,
            {
              className: 'size-8 sm:size-10 fill-current',
            },
          )}
      </div>
      <div className="leading-none rotate-180">{icon}</div>
    </div>
  )
}

function renderFlowerCard(cardStyle: CardStyle, isDragging: boolean) {
  const isOutlined = cardStyle === 'outlined'
  const bgClass = isOutlined ? 'bg-[#FDF6E3]' : ''
  const colorClass = isOutlined
    ? `${bgClass} text-pink-600 border-pink-600`
    : 'bg-pink-600 text-white border-pink-700'

  return (
    <div
      className={cn(
        'w-full h-full flex flex-col justify-between p-1.5 rounded-md border-2',
        isDragging ? 'border-current' : 'border-transparent',
        colorClass,
      )}
    >
      <div className="leading-none">
        <Flower className="size-3 sm:size-4" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Flower className="size-8 sm:size-10" />
      </div>
      <div className="leading-none rotate-180">
        <Flower className="size-3 sm:size-4" />
      </div>
    </div>
  )
}

function renderFrontContent(
  card: CardType,
  cardStyle: CardStyle,
  isDragging: boolean,
) {
  switch (card.kind) {
    case 'normal':
      return renderNormalCard(card.value, card.color, cardStyle, isDragging)
    case 'dragon':
      return renderDragonCard(card.color, cardStyle, isDragging, card.isLocked)
    default:
      return renderFlowerCard(cardStyle, isDragging)
  }
}

function renderCardContent(
  card: CardType,
  cardStyle: CardStyle,
  isDragging: boolean,
  isFaceDown?: boolean,
) {
  if (isFaceDown) return renderBackContent()
  return renderFrontContent(card, cardStyle, isDragging)
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
  isFaceDown,
}: Readonly<CardProps>) {
  const isCardDisabled = Boolean(
    disabled || (card.kind === 'dragon' && card.isLocked),
  )
  const isDndDisabled = isCardDisabled || propIsDragging
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging: dndIsDragging,
  } = useDraggable({
    id: card.id,
    disabled: isDndDisabled,
  })

  const isDragging = propIsDragging || dndIsDragging

  const style = {
    zIndex: isDragging ? 100 : undefined,
    ...propStyle,
  }
  const isInteractive = Boolean(onClick || onDoubleClick || listeners)
  const isButtonDisabled = isCardDisabled || !isInteractive

  if (isDragging) {
    return (
      <button
        type="button"
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        data-card-id={dataIdDisabled ? undefined : card.id}
        disabled={isButtonDisabled}
        className={cn(
          'w-(--card-width) h-(--card-height) rounded-lg shadow-sm select-none relative overflow-hidden p-1 touch-none transition-none',
          !className?.includes('opacity-0') && 'opacity-50 z-50',
          isCardDisabled && 'cursor-default',
          className,
        )}
        style={style}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {renderCardContent(card, cardStyle, isDragging, isFaceDown)}
      </button>
    )
  }

  const instantHide = className?.includes('instant-hide')

  return (
    <motion.button
      type="button"
      layoutId={
        disableLayout || className?.includes('opacity-0') ? undefined : card.id
      }
      layout={disableLayout ? false : 'position'}
      initial={false}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-card-id={dataIdDisabled ? undefined : card.id}
      disabled={isButtonDisabled}
      className={cn(
        'w-(--card-width) h-(--card-height) rounded-lg shadow-sm select-none relative overflow-hidden p-1 touch-none transition-none',
        isCardDisabled && 'cursor-default',
        canMoveToFoundation && 'border-white animate-border-pulse',
        className,
      )}
      style={{ ...style, perspective: '1000px' }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      animate={{
        opacity: className?.includes('opacity-0') ? 0 : 1,
      }}
      transition={{
        layout: { duration: 0.45, type: 'spring', bounce: 0.15 },
        opacity: { duration: instantHide ? 0 : 0.2 },
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
          {renderFrontContent(card, cardStyle, isDragging)}
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {renderBackContent()}
        </div>
      </div>
    </motion.button>
  )
}
