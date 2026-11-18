/** Client/server-safe helpers for <input type="date"> round-tripping. */

/** ISO timestamp → "YYYY-MM-DD" in the viewer's local time. */
export function toDateInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → ISO at the end of that local day (a dispatch deadline). */
export function endOfDayIso(date: string | null | undefined) {
  if (!date) return null;
  const d = new Date(`${date}T23:59:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "YYYY-MM-DD" → ISO at the start of that local day. */
export function startOfDayIso(date: string | null | undefined) {
  if (!date) return null;
  const d = new Date(`${date}T09:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
