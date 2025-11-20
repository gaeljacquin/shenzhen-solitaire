export type CardColor = 'green' | 'purple' | 'indigo'
export type DragonColor = 'green' | 'red' | 'white'

export type Card =
  | { id: string; kind: 'normal'; color: CardColor; value: number }
  | { id: string; kind: 'dragon'; color: DragonColor }
  | { id: string; kind: 'flower' }

export interface CardProps {
  card: Card
  isDragging?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}
