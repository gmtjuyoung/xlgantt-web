import { useRef, useEffect, useCallback } from 'react'
import type { TimescaleRow } from '@/lib/gantt-math'

interface GanttTimescaleProps {
  topRow: TimescaleRow
  bottomRow: TimescaleRow
  totalWidth: number
  scrollRef?: React.RefObject<HTMLDivElement | null>
}

export function GanttTimescale({ topRow, bottomRow, totalWidth, scrollRef }: GanttTimescaleProps) {
  const headerRef = useRef<HTMLDivElement>(null)

  // Sync header scroll with chart scroll using RAF for smooth updates
  useEffect(() => {
    const scrollEl = scrollRef?.current
    if (!scrollEl) return

    let rafId: number | null = null
    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        if (headerRef.current && scrollEl) {
          headerRef.current.scrollLeft = scrollEl.scrollLeft
        }
        rafId = null
      })
    }

    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    // Initial sync
    onScroll()

    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [scrollRef, scrollRef?.current])

  return (
    <div ref={headerRef} className="flex-shrink-0 border-b border-border/40 bg-gradient-to-b from-card to-muted/50 overflow-hidden" style={{ height: 48 }}>
      <svg width={totalWidth} height={48}>
        {/* Top row (months/years) */}
        <g>
          {topRow.items.map((item, i) => (
            <g key={`top-${i}`}>
              <rect
                x={item.x}
                y={0}
                width={item.width}
                height={topRow.height}
                fill="none"
                stroke="oklch(0.92 0.008 250)"
                strokeWidth={0.3}
              />
              <text
                x={item.x + item.width / 2}
                y={topRow.height / 2 + 4}
                textAnchor="middle"
                fontSize={13}
                fontWeight="700"
                fill="oklch(0.35 0.02 250)"
                letterSpacing="0.5"
              >
                {item.label}
              </text>
            </g>
          ))}
        </g>

        {/* Bottom row (weeks/days) */}
        <g transform={`translate(0, ${topRow.height})`}>
          {bottomRow.items.map((item, i) => (
            <g key={`bot-${i}`}>
              <rect
                x={item.x}
                y={0}
                width={item.width}
                height={bottomRow.height}
                fill={item.isWeekend ? 'oklch(0.97 0.008 250)' : 'none'}
                stroke="oklch(0.93 0.005 250)"
                strokeWidth={0.3}
              />
              <text
                x={item.x + item.width / 2}
                y={bottomRow.height / 2 + 3}
                textAnchor="middle"
                fontSize={12}
                fontWeight="500"
                fill={item.isWeekend ? 'oklch(0.7 0.02 250)' : 'oklch(0.5 0.015 250)'}
              >
                {item.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
