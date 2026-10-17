// A fixed near plane sized for close pins loses precision in national views.
// Keep it before the ground while resolving small surface offsets.
export function mapNearPlane(distance: number): number {
  return Math.max(0.001, Math.min(5, distance / 100));
}
