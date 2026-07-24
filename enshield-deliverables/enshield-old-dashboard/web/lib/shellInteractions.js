export function isEscapeKey(event) {
  return event?.key === "Escape";
}

export function getFocusWrapTarget(event, activeElement, focusables) {
  if (event?.key && event.key !== "Tab") return null;
  if (!Array.isArray(focusables) || focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event?.shiftKey && activeElement === first) return last;
  if (!event?.shiftKey && activeElement === last) return first;
  return null;
}

export function isOutsideInteractiveSurface(panel, trigger, target) {
  return !panel?.contains(target) && !trigger?.contains(target);
}
