/**
 * Framer Motion variants for modals that fly from a trigger rect to center
 * (same behavior as Save new link / Edit link on Saved links).
 */

export const MODAL_FLY_DEFAULT_MAX_W = 680
export const MODAL_FLY_DEFAULT_MAX_H = 920
/** Matches `.sort-via-sheet { max-width: 520px }` in SortViaPop.css */
export const MODAL_FLY_SORT_VIA_MAX_W = 520

export function createModalFlySheetVariants(
  maxW = MODAL_FLY_DEFAULT_MAX_W,
  maxH = MODAL_FLY_DEFAULT_MAX_H,
) {
  return {
    fromOrigin: (custom) => {
      const rect = custom?.rect
      if (custom?.reduceMotion || !rect || typeof window === 'undefined') {
        return { x: 0, y: 0, scale: 0.97, opacity: 1 }
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = cx - vw / 2
      const dy = cy - vh / 2
      const destW = Math.min(maxW, vw - 24)
      const destH = Math.min(vh * 0.92, maxH)
      const s0 = Math.min(rect.width / destW, rect.height / destH, 1)
      const s = Math.max(0.12, s0)
      return { x: dx, y: dy, scale: s, opacity: 0.97 }
    },
    expanded: { x: 0, y: 0, scale: 1, opacity: 1 },
  }
}
