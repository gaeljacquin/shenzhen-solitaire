export type CardColor = 'green' | 'red' | 'black'
export type DragonColor = 'green' | 'red' | 'yellow'

export type Card =
  | { id: string; kind: 'normal'; color: CardColor; value: number }
  | { id: string; kind: 'dragon'; color: DragonColor; isLocked?: boolean }
  | { id: string; kind: 'flower' }

export interface CardProps {
  card: Card
  isDragging?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}
