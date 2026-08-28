# Brand Identity & Standards — Cartouche

## 1. Product Summary & Identity
- **Product Name**: Cartouche (formerly Cadre / Tableau / Tarot Socket Board)
- **Repository**: `cartouche`
- **Model**: Loose Endorsed Family (Form & Noise)
- **One-Sentence Invariant Job Line**:
 > *"Local workspace to stage, audition, and lock artwork into ordered deliverable grids."*

---

## 2. Visual Architecture: The Two-Speed System

| Layer | Job | Form | File |
|---|---|---|---|
| **Primary Mark** | Desktop App Icon, Favicon, System Badge | **Card-Socket Enclosure**: 2:3 rectangular deliverable socket ($2\text{u}$ radius) bound to an extended baseline seal bar via dual knot loops with a solid state pip. | `brand/svg/symbol.svg` |
| **Canonical Nameplate** | Primary Wordmark, README Hero, Title Page | **Horizontal Cartouche Enclosure**: Ultra-snug stadium enclosing **CARTOUCHE** in Space Grotesk with an internal House Metal state pip and trailing vertical seal knot. | `brand/svg/nameplate.svg` |
| **Brand Device** | Packaging, Posters, Colophon | **Printer's Copperplate Cartouche**: Single-stroke continuous frame with delicate corner volutes. | `brand/svg/device.svg` |

---

## 3. Geometric Specifications

### 3.1 Primary App Mark (`symbol.svg`)
- **Canvas**: $24\times 24$ unit square canvas.
- **Stroke**: Exactly `1.75` units (`stroke-width="1.75"`, `stroke-linecap="round"`, `stroke-linejoin="round"`).
- **Socket Frame**: Rectangular card ratio `x="6.5"`, `y="3.0"`, `width="11.0"`, `height="14.5"`, `rx="2.0"`.
- **Baseline Seal Bar**: Tangent line `(4.5, 20.25)` to `(19.5, 20.25)`.
- **Dual Knot Loops**: Vertical ties connecting socket base to seal bar at `x="8.75"` and `x="15.25"`.
- **The Family Fingerprint**: Exactly **one solid circular state pip** (`r="1.3"`, `fill="#D45500"`, `stroke="none"`) centered at `(12.0, 10.25)`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" fill="none">
 <rect width="24" height="24" fill="#0B0B0B"/>
 <rect x="6.5" y="3" width="11" height="14.5" rx="2" 
 stroke="#6FA0BE" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
 <line x1="4.5" y1="20.25" x2="19.5" y2="20.25" stroke="#6FA0BE" stroke-width="1.75" stroke-linecap="round"/>
 <line x1="8.75" y1="17.5" x2="8.75" y2="20.25" stroke="#6FA0BE" stroke-width="1.75" stroke-linecap="round"/>
 <line x1="15.25" y1="17.5" x2="15.25" y2="20.25" stroke="#6FA0BE" stroke-width="1.75" stroke-linecap="round"/>
 <circle cx="12" cy="10.25" r="1.3" fill="#D45500" stroke="none"/>
</svg>
```

### 3.2 Canonical Horizontal Nameplate (`nameplate.svg`)
- **Stadium Enclosure**: Snug horizontal stadium `width="355"`, `height="68"`, `rx="34"`, `stroke-width="4.5"`.
- **Trailing Seal Knot**: Vertical bar `x="405"` with dual knot binding loops.
- **Display Typography**: **CARTOUCHE** in Space Grotesk SemiBold, centered inside the stadium.
- **Internal Lock State Pip**: Solid `#D45500` pip (`r="4.5px"`) nestled inside the trailing curve adjacent to the terminal `E`.

---

## 4. Color Tokens
- **Light Accent (Paper Ground)**: Slate-Blue `#3F6E8C`
- **Dark Mode Accent (Void Ground)**: `#6FA0BE`
- **House Metal Accent (Locked State Pip)**: `#D45500`
- **Ink Foreground (Light)**: `#141414`
- **Ink Foreground (Dark)**: `#F2EEE8`
- **Paper Ground (Light)**: `#F6F1EA`
- **Void Ground (Dark)**: `#0B0B0B`
- **Muted Hairline**: `#8A8680` (Dark: `#1F2428`)

---

## 5. Typography Stack
- **Wordmarks & Display**: Space Grotesk (Medium / SemiBold, tracking $-1\%$ to $-2\%$)
- **Interface & Body**: Inter (Regular / Medium)
- **Code & CLI Parameters**: IBM Plex Mono / JetBrains Mono (Regular)

---

## 6. Invariant Hero Lockup Pattern
```markdown
# Cartouche — Local workspace to stage, audition, and lock artwork into ordered deliverable grids.
```
