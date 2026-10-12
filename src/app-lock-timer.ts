export function inactivityExpired(lastActivity: number, now: number, minutes: number): boolean {
  if (!Number.isFinite(lastActivity) || !Number.isFinite(now) || !Number.isFinite(minutes) || minutes <= 0 || now < lastActivity) return true;
  return now - lastActivity >= minutes * 60000;
}
