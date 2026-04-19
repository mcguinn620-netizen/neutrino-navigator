// Date helpers for "today" + week-bucketing (week starts Monday).

export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Returns Monday at 00:00 of the week containing `d`.
export const startOfWeek = (d: Date) => {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sun, 1 = Mon...
  const diff = (day + 6) % 7; // days since Monday
  x.setDate(x.getDate() - diff);
  return x;
};

export const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

export const formatWeekRange = (weekStart: Date) => {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const m = (date: Date) => date.toLocaleDateString(undefined, { month: "short" });
  if (sameMonth) {
    return `${m(weekStart)} ${weekStart.getDate()}–${end.getDate()}`;
  }
  return `${m(weekStart)} ${weekStart.getDate()} – ${m(end)} ${end.getDate()}`;
};

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
