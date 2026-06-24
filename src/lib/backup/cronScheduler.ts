/**
 * Lightweight cron expression matcher for backup scheduling.
 * Supports: star wildcards, numbers, ranges (1-5), steps, lists (1,3,5)
 * Fields: minute hour day-of-month month day-of-week
 */

type CronField = number[];

function parseField(part: string, min: number, max: number): CronField {
  const values = new Set<number>();

  const addRange = (start: number, end: number, step = 1) => {
    for (let i = start; i <= end; i += step) {
      if (i >= min && i <= max) values.add(i);
    }
  };

  for (const segment of part.split(',')) {
    if (segment === '*') {
      addRange(min, max);
      continue;
    }

    const stepMatch = segment.match(/^(.+)\/(\d+)$/);
    const base = stepMatch ? stepMatch[1] : segment;
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;

    if (base === '*') {
      addRange(min, max, step);
    } else if (base.includes('-')) {
      const [startStr, endStr] = base.split('-');
      addRange(parseInt(startStr, 10), parseInt(endStr, 10), step);
    } else {
      const n = parseInt(base, 10);
      if (!Number.isNaN(n)) values.add(n);
    }
  }

  return [...values].sort((a, b) => a - b);
}

export function parseCron(expression: string): CronField[] {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }
  return [
    parseField(parts[0], 0, 59),
    parseField(parts[1], 0, 23),
    parseField(parts[2], 1, 31),
    parseField(parts[3], 1, 12),
    parseField(parts[4], 0, 6),
  ];
}

export function cronMatches(expression: string, date = new Date()): boolean {
  const [minutes, hours, days, months, weekdays] = parseCron(expression);
  return (
    minutes.includes(date.getMinutes()) &&
    hours.includes(date.getHours()) &&
    days.includes(date.getDate()) &&
    months.includes(date.getMonth() + 1) &&
    weekdays.includes(date.getDay())
  );
}

export function getNextCronRun(expression: string, from = new Date()): Date {
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let i = 0; i < 366 * 24 * 60; i += 1) {
    if (cronMatches(expression, cursor)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  throw new Error('Could not find next cron run within one year');
}

export function resolveCronExpression(
  frequency: string,
  customExpression: string
): string {
  if (frequency === 'custom') return customExpression;
  const presets: Record<string, string> = {
    hourly: '0 * * * *',
    daily: '0 2 * * *',
    weekly: '0 2 * * 0',
  };
  return presets[frequency] ?? customExpression;
}
