---
name: Telemetry Slate
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#40474f'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#707881'
  outline-variant: '#c0c7d1'
  surface-tint: '#006399'
  primary: '#00507d'
  on-primary: '#ffffff'
  primary-container: '#0369a1'
  on-primary-container: '#cbe4ff'
  inverse-primary: '#94ccff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#00507b'
  on-tertiary: '#ffffff'
  tertiary-container: '#0069a0'
  on-tertiary-container: '#cae4ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cde5ff'
  primary-fixed-dim: '#94ccff'
  on-primary-fixed: '#001d32'
  on-primary-fixed-variant: '#004b74'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#93ccff'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#004b73'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  metric-display:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 38px
  metric-compact:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
  code-telemetry:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.05em
  label-status:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

The design system embodies precision instrumentation, operational reliability, and field-grade clarity tailored for mission-critical environmental monitoring (IoT/MQTT). The target audience includes automation engineers, environmental scientists, plant managers, and field technicians who require rapid situational awareness under varying light and stress conditions.

The aesthetic blends **Modern Industrial Minimalism** with **Instrument-Grade Information Architecture**. It avoids decorative frivolity in favor of structural clarity, high data density, clear visual hierarchies, and instantaneous status recognition. The visual language conveys engineering rigor, low latency, and absolute auditability across hardware telemetry streams.

## Colors

The palette operates on calibrated contrast tiers to distinguish hardware infrastructure signals from system framing.

### Surface and Structure
- **Canvas Base:** `#F8FAFC` (Slate 50) for uniform, anti-glare screen time.
- **Card/Panel Surface:** `#FFFFFF` (Pure White) providing elevation against the canvas.
- **Structural Borders:** `#E2E8F0` (Slate 200) for sharp, unblurred boundaries between sensor modules.
- **Subtle Surface:** `#F1F5F9` (Slate 100) for table headers, inactive tracks, and telemetry metric backgrounds.

### Primary Identity & Neutral Grays
- **Primary Technical Blue:** `#0369A1` (Oceanic Deep Teal/Sky 700) for active controls, navigation anchors, and focal charts.
- **Brand Accent / Highlights:** `#0284C7` (Sky 600) for dynamic states, hover highlights, and active tabs.
- **Deep Navy / Slate Solid:** `#0F172A` (Slate 900) for primary text, structural app bars, and high-priority device nodes.
- **Secondary Neutral:** `#475569` (Slate 600) for secondary data keys and technical metadata.
- **Muted Neutral:** `#64748B` (Slate 500) for auxiliary labels, units, and offline/stale indicators.

### Rigorous Semantic Status System (RN005 / RF009)
Every operational status must combine color with distinct typography and icons; color alone is never sufficient:
- **Normal (Nominal State):** `#059669` (Emerald 600) default, `#10B981` (Emerald 500) accent, with `#ECFDF5` (Emerald 50) fill.
- **Atenção (Warning / Threshold Drift):** `#D97706` (Amber 600) default, `#F59E0B` (Amber 500) accent, with `#FFFBEB` (Amber 50) fill.
- **Crítico (Alarm / Exceeded Threshold):** `#DC2626` (Red 600) default, `#EF4444` (Red 500) accent, with `#FEF2F2` (Red 50) fill.
- **Sem Dados / Offline (Hardware Disconnected / Keepalive Timeout):** `#64748B` (Slate 500) default, `#94A3B8` (Slate 400) accent, with `#F1F5F9` (Slate 100) fill.

## Typography

The type system separates analytical UI control labels from telemetry readings.

- **Primary UI (Inter):** Leveraged for high legibility at micro-sizes, comprehensive glyph coverage for Portuguese technical nomenclature, and clean geometric curves.
- **Telemetry & Identity Engine (JetBrains Mono):** Dedicated to technical data fields: sensor readings (e.g., `24.8 °C`, `78.2 %RH`, `1013.25 hPa`), MAC addresses (`A4:CF:12:8B:90:3A`), MQTT Client/Topic IDs (`stma/br-ba/sensor-01`), timestamps (`2025-05-18T14:32:01-03:00`), and raw register hex outputs. JetBrains Mono prevents character misalignment during real-time value updates.
- **Tabular Figures:** All numeric figures within table records and metric displays must enforce OpenType tabular figures (`font-variant-numeric: tabular-nums`) to prevent horizontal jitter during MQTT live streaming.

## Layout & Spacing

A strictly disciplined 4px/8px layout system engineered for continuous telemetry streams and dense instrument displays:

### Grid System
- **Desktop (>= 1280px):** 12-column fluid grid system with `gutter-desktop: 1.5rem` (24px) and `margin-desktop: 2rem` (32px). Maximum container width is 1600px for expansive mission-control layouts.
- **Tablet (768px - 1279px):** 8-column fluid grid, `gutter: 1rem` (16px), `margin: 1.5rem` (24px). Telemetry cards reorganize into a 2x2 or 2x4 matrix.
- **Mobile (< 768px):** 4-column single-stream stack, `gutter: 0.75rem` (12px), `margin: 1rem` (16px). All table views switch to compact cards or single-axis horizontally scrollable data lists.

### Densities & Rhythms
- **High-Density Sensor Grids:** Component gaps inside sensor metrics rely on `space-xs` (4px) and `space-sm` (8px) to bundle parameter names, live readings, and threshold deltas into cohesive units.
- **Panel Insets:** Standard cards adhere to `space-md` (16px) internal padding; industrial data summary tables use condensed vertical padding of `space-sm` (8px).

## Elevation & Depth

Visual hierarchy relies on crisp borders and functional surfaces rather than heavy decorative shadows, ensuring readability on factory floor monitors and in direct sunlight.

### Depth Strategy: Structural Outlines + Tonal Separation
- **Level 0 (App Shell/Background):** Baseline `#F8FAFC`. Flat, zero elevation.
- **Level 1 (Sensor Panels & Metric Cards):** `#FFFFFF` background bound by a 1px solid `#E2E8F0` border. A faint, low-opacity shadow (`0 1px 2px 0 rgba(15, 23, 42, 0.05)`) decouples the panel from the canvas without adding visual clutter.
- **Level 2 (Dropdowns, Tooltips, Modals, Overlays):** `#FFFFFF` with 1px solid `#CBD5E1` and an elevated shadow (`0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)`).
- **Active Node / Dragged Threshold Indicator:** Retains a focused outline of `2px solid #0284C7` with a subtle outer glow: `0 0 0 3px rgba(2, 132, 199, 0.15)`.

## Shapes

The design system maintains a **Soft** shape archetype (`roundedness: 1`), conveying engineering rigor and structural precision.

- **Micro Shapes (Badges, Pills, Status Indicators, Checkboxes):** `0.25rem` (4px) border radius.
- **Standard Controls (Inputs, Buttons, Segmented Selectors):** `0.375rem` (6px) border radius.
- **Panels & Cards (Sensor Blocks, Trend Containers, Log Windows):** `0.5rem` (8px) border radius (`rounded-lg`).
- **Modal Windows & Industrial Flyout Trays:** `0.75rem` (12px) border radius (`rounded-xl`).
- **Fully Rounded Pills (`9999px`):** Restricted solely to status indicator badges and MQTT keepalive network indicators.

## Components

### Buttons
- **Primary:** Background `#0369A1`, text `#FFFFFF`, border none, height 36px (compact) or 40px (standard). Hover: `#0284C7`. Focus-visible: 2px ring `#0284C7` with 2px offset.
- **Secondary (Structural Outline):** Background `#FFFFFF`, text `#0F172A`, 1px border `#E2E8F0`. Hover: `#F8FAFC` and border `#CBD5E1`.
- **Destructive / Trigger Reset:** Background `#DC2626`, text `#FFFFFF`. Hover: `#B91C1C`.
- **Toolbar / Icon Buttons:** Flat `#FFFFFF`, 1px border `#E2E8F0`, 36x36px square. Active state highlights with `#F1F5F9`.

### Badges & Status Chips (Accessibility RNF001 / RNF004)
To ensure accessibility, status badges must always pair a recognizable SVG glyph with unambiguous, capitalized text:
- **Normal:** Fill `#ECFDF5`, border `#A7F3D0`, text `#065F46`. Icon: Check circle (`✓`). Text: `NORMAL`.
- **Atenção:** Fill `#FFFBEB`, border `#FDE68A`, text `#92400E`. Icon: Triangle alert (`▲`). Text: `ATENÇÃO`.
- **Crítico:** Fill `#FEF2F2`, border `#FECACA`, text `#991B1B`. Icon: Octagon alert (`!`). Text: `CRÍTICO`.
- **Sem Dados:** Fill `#F1F5F9`, border `#CBD5E1`, text `#475569`. Icon: Circle slash (`⊘`). Text: `OFFLINE`.

### Telemetry Metric Cards (High-Density)
- **Structure:** 1px `#E2E8F0` border, `#FFFFFF` background, internal padding of 16px.
- **Header:** Label (`label-caps`, `#64748B`) aligned alongside device topic/ID in `JetBrains Mono` (`11px`, `#94A3B8`). Top-right houses the status badge.
- **Core Value:** Large tabular numbers (`metric-display`, `#0F172A`) paired with unit strings (`Inter 14px SemiBold`, `#64748B`).
- **Threshold Footprint:** Mini progress indicator strip displaying the current reading plotted across acceptable, warning, and critical safe zones, with delta change vs previous sample (e.g., `+0.4 / h`).

### Data Tables (Industrial Compact)
- **Header:** `#F8FAFC` surface, 1px bottom border `#E2E8F0`. Text formatted with `label-caps` in `#475569`. Height 36px.
- **Rows:** Alternating subtle row styles are avoided; use clean rows on `#FFFFFF` with 1px divider lines (`#F1F5F9`). Row height is locked at 40px for maximum vertical scan efficiency.
- **Data Columns:** Numeric readings, MAC addresses, and timestamps render in `JetBrains Mono 13px`. Text values render in `Inter 13px`.

### Trend Charts with Ideal Range Shading
- **Canvas:** Crisp white background with a `#F1F5F9` Cartesian grid (dashed lines: `stroke-dasharray="3 3"`).
- **Nominal Range Bands:** Shaded with `#ECFDF5` (`rgba(16, 185, 129, 0.08)`) bound by green boundary guides (`#10B981` at 20% opacity).
- **Threshold Limit Lines:** Warning and Critical thresholds display as horizontal dashed lines using `#F59E0B` and `#EF4444`.
- **Telemetry Line Trace:** 2px solid curve in `#0284C7`. Interactive hover crosshair displays a floating card rendering timestamp in Bahia time (`America/Bahia` / UTC-3), exact numeric value, and device status.

### Form Inputs & Telemetry Filters
- **Inputs:** 1px border `#CBD5E1`, `#FFFFFF` background, 36px height, font `Inter 14px`. Placeholder text `#94A3B8`.
- **Monospace Inputs (MAC / Device ID / MQTT Regex):** Formatted with `JetBrains Mono 13px` with fixed uppercase conversion.
- **Focus:** Border shifts to `#0284C7` with a 3px ring (`rgba(2, 132, 199, 0.15)`).