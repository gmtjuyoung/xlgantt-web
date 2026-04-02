import type { DependencyType, BarRect } from './types'

/**
 * Calculate SVG path for a dependency arrow using orthogonal routing.
 * Returns an SVG path `d` attribute string.
 */
export function calculateDependencyPath(
  predRect: BarRect,
  succRect: BarRect,
  depType: DependencyType,
  offset: number = 10
): string {
  const predMidY = predRect.y + predRect.height / 2
  const succMidY = succRect.y + succRect.height / 2

  let fromX: number
  let toX: number

  switch (depType) {
    case 1: // FS: Finish-to-Start
      fromX = predRect.x + predRect.width
      toX = succRect.x
      break
    case 2: // SS: Start-to-Start
      fromX = predRect.x
      toX = succRect.x
      break
    case 3: // FF: Finish-to-Finish
      fromX = predRect.x + predRect.width
      toX = succRect.x + succRect.width
      break
    case 4: // SF: Start-to-Finish
      fromX = predRect.x
      toX = succRect.x + succRect.width
      break
  }

  // Determine routing
  if (depType === 1) {
    // FS: most common
    if (fromX + offset < toX) {
      // Simple: go right, then vertical, then right to target
      const midX = (fromX + toX) / 2
      return [
        `M ${fromX} ${predMidY}`,
        `H ${midX}`,
        `V ${succMidY}`,
        `H ${toX}`,
      ].join(' ')
    } else {
      // Overlap: go right, down past pred, left, down to succ level, right
      const clearRight = fromX + offset
      const dropY = Math.max(predRect.y + predRect.height + offset, succRect.y - offset)
      return [
        `M ${fromX} ${predMidY}`,
        `H ${clearRight}`,
        `V ${dropY}`,
        `H ${toX - offset}`,
        `V ${succMidY}`,
        `H ${toX}`,
      ].join(' ')
    }
  }

  if (depType === 2) {
    // SS: Start-to-Start
    const leftX = Math.min(fromX, toX) - offset
    return [
      `M ${fromX} ${predMidY}`,
      `H ${leftX}`,
      `V ${succMidY}`,
      `H ${toX}`,
    ].join(' ')
  }

  if (depType === 3) {
    // FF: Finish-to-Finish
    const rightX = Math.max(fromX, toX) + offset
    return [
      `M ${fromX} ${predMidY}`,
      `H ${rightX}`,
      `V ${succMidY}`,
      `H ${toX}`,
    ].join(' ')
  }

  // SF: Start-to-Finish
  if (fromX - offset > toX + offset) {
    const midX = (fromX + toX) / 2
    return [
      `M ${fromX} ${predMidY}`,
      `H ${midX}`,
      `V ${succMidY}`,
      `H ${toX}`,
    ].join(' ')
  } else {
    const leftX = fromX - offset
    const dropY = Math.max(predRect.y + predRect.height + offset, succRect.y - offset)
    return [
      `M ${fromX} ${predMidY}`,
      `H ${leftX}`,
      `V ${dropY}`,
      `H ${toX + offset}`,
      `V ${succMidY}`,
      `H ${toX}`,
    ].join(' ')
  }
}

/**
 * SVG arrowhead marker definition (to be placed in <defs>).
 */
export const ARROW_MARKER_ID = 'dependency-arrow'

export function getArrowMarkerSvg(color: string = '#00FF00'): string {
  return `<marker id="${ARROW_MARKER_ID}" viewBox="0 0 10 7" refX="10" refY="3.5"
    markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <polygon points="0 0, 10 3.5, 0 7" fill="${color}" />
  </marker>`
}
