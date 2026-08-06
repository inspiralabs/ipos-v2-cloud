export function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
export function daysAgo(n: number, hour = 8, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}
