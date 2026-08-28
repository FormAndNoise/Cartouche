/**
 * Cartouche Canonical Nameplate Component — Form & Noise Atelier Standard.
 * Renders the ultra-snug horizontal cartouche stadium with geometrically dead-centered
 * Space Grotesk typography, trailing knot seal bar, and internal #D45500 state pip.
 */
export function CartoucheNameplate({
  height = 40,
  className = "",
  pipColor = "#D45500",
  textColor = "var(--text)",
  strokeColor = "currentColor",
}: {
  height?: number;
  className?: string;
  pipColor?: string;
  textColor?: string;
  strokeColor?: string;
}) {
  // Original aspect ratio is 440 x 100
  const width = Math.round(height * 4.4);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 440 100"
      fill="none"
      className={className}
      aria-label="Cartouche"
      role="img"
    >
      {/* Snug Stadium Enclosure */}
      <rect
        x="20"
        y="16"
        width="355"
        height="68"
        rx="34"
        stroke={strokeColor}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Trailing Knot Seal Bar */}
      <line
        x1="405"
        y1="10"
        x2="405"
        y2="90"
        stroke={strokeColor}
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* Dual Knot Binding Loops */}
      <line
        x1="375"
        y1="36"
        x2="405"
        y2="36"
        stroke={strokeColor}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <line
        x1="375"
        y1="64"
        x2="405"
        y2="64"
        stroke={strokeColor}
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* Geometrically Dead-Centered CARTOUCHE in Space Grotesk */}
      <text
        x="197.5"
        y="60"
        fontFamily="'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="33"
        fontWeight="700"
        letterSpacing="3.8"
        fill={textColor}
        textAnchor="middle"
      >
        CARTOUCHE
      </text>

      {/* Solid State Pip inside right aperture */}
      <circle cx="350" cy="50" r="4.5" fill={pipColor} stroke="none" />
    </svg>
  );
}