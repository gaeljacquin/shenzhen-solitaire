export type CardColor = 'green' | 'red' | 'black'
export type DragonColor = 'green' | 'red' | 'black'

export type Card =
  | { id: string; kind: 'normal'; color: CardColor; value: number; isLocked?: boolean }
  | { id: string; kind: 'dragon'; color: DragonColor; isLocked?: boolean }
  | { id: string; kind: 'flower'; color: null; isLocked?: boolean }

export interface CardProps {
  card: Card
  isDragging?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}
