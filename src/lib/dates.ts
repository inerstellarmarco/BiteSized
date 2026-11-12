export function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIso(value: Date | string | null | undefined): string | null {
  const date = asDate(value);
  return date ? date.toISOString() : null;
}
