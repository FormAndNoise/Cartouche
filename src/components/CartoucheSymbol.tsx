/**
 * Cartouche Brand Symbol — Form & Noise Loose Endorsed Family standard.
 * 24x24u canvas, 1.75u stroke, 2u corner radius:
 * 2:3 rectangular deliverable card socket bound to an extended baseline seal bar
 * via dual knot loops, with 1 solid circular state pip (#D45500 House Metal).
 */
export function CartoucheSymbol({
 size = 24,
 className = "",
 pipColor = "#D45500",
}: {
 size?: number;
 className?: string;
 pipColor?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="1.75"
 strokeLinecap="round"
 strokeLinejoin="round"
 className={className}
 aria-hidden="true"
 >
 {/* Cartouche stadium deliverable enclosure */}
 <rect x="6.5" y="3" width="11" height="14.5" rx="5.5" />
 {/* Tangent baseline seal bar */}
 <line x1="4.5" y1="20.25" x2="19.5" y2="20.25" />
 {/* Dual knot binding loops */}
 <line x1="8.75" y1="17.5" x2="8.75" y2="20.25" />
 <line x1="15.25" y1="17.5" x2="15.25" y2="20.25" />
 {/* Locked work state pip (House Metal #D45500) */}
 <circle cx="12" cy="10.25" r="1.3" fill={pipColor} stroke="none" />
 </svg>
 );
}

