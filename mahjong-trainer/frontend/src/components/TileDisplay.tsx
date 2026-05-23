import { type Tile, tileEmoji, tileName } from '../engine/tiles.ts'

interface Props {
  tile: Tile
  highlight?: boolean
  small?: boolean
  onClick?: () => void
}

export function TileDisplay({ tile, highlight, small, onClick }: Props) {
  return (
    <span
      title={tileName(tile)}
      onClick={onClick}
      style={{
        fontSize: small ? '1.4rem' : '2rem',
        cursor: onClick ? 'pointer' : 'default',
        display: 'inline-block',
        lineHeight: 1,
        filter: highlight ? 'drop-shadow(0 0 4px #f59e0b)' : undefined,
        transition: 'transform 0.1s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
    >
      {tileEmoji(tile)}
    </span>
  )
}

interface HandDisplayProps {
  tiles: readonly Tile[]
  agari?: Tile
  small?: boolean
}

export function HandDisplay({ tiles, agari, small }: HandDisplayProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', alignItems: 'center' }}>
      {tiles.map((t, i) => (
        <TileDisplay
          key={i}
          tile={t}
          small={small}
          highlight={agari !== undefined && agari.suit === t.suit && agari.num === t.num && i === tiles.length - 1}
        />
      ))}
    </div>
  )
}
