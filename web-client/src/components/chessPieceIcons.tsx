import React from 'react';

export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type ChessPieceTeam = 'w' | 'b';

interface Props {
  type: ChessPieceType;
  /** Board-model color ('w'/'b') — mapped to the app's blue/orange identity colors, not literal black/white. */
  team: ChessPieceTeam;
  size: number | string;
  /** Blue team fill (usually theme.identity). */
  blue: string;
  /** Orange team fill (usually theme.accent). */
  orange: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

/** Darkens (negative) or lightens (positive) a hex color by `percent` (-1..1) — used to derive each piece's outline/shadow shade from its single team color, and reused by ChessBoardView to tint the board squares from the same theme color. */
export function shadeColor(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  let r = (num >> 16) + Math.round(255 * percent);
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * percent);
  let b = (num & 0x0000ff) + Math.round(255 * percent);
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

const UNICODE_GLYPH: Record<ChessPieceType, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

/** Standard Unicode chess glyphs, tinted with the app's blue/orange team colors. */
function ChessPieceIcon({ type, team, size, blue, orange, style, onClick }: Props): React.JSX.Element {
  const fill = team === 'w' ? blue : orange;
  const stroke = shadeColor(fill, -0.35);

  return (
    <svg width={size} height={size} viewBox="0 0 45 45" style={style} onClick={onClick}>
      <text
        x={22.5}
        y={34}
        textAnchor="middle"
        fontSize={38}
        fontFamily="'Segoe UI Symbol', 'Noto Sans Symbols', Arial, sans-serif"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        paintOrder="stroke"
      >
        {UNICODE_GLYPH[type]}
      </text>
    </svg>
  );
}

export default ChessPieceIcon;
