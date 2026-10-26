export type AvailabilityRuleData = {
  enabled?: boolean;
  startTime?: string;
  endTime?: string;
  slotMinutes?: number;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string) {
  return timePattern.test(value);
}

export function weekdayForDate(date: string) {
  return isValidDate(date) ? new Date(`${date}T00:00:00Z`).getUTCDay() : -1;
}

export function slotsForRule(rule: AvailabilityRuleData | undefined) {
  if (!rule?.enabled || !rule.startTime || !rule.endTime || !isValidTime(rule.startTime) || !isValidTime(rule.endTime)) return [];
  const start = toMinutes(rule.startTime);
  const end = toMinutes(rule.endTime);
  const interval = Number(rule.slotMinutes);
  if (!Number.isInteger(interval) || interval < 15 || interval > 180 || end <= start) return [];

  const slots: string[] = [];
  for (let cursor = start; cursor + interval <= end; cursor += interval) slots.push(fromMinutes(cursor));
  return slots;
}

export function isFutureNairobiSlot(date: string, time: string, now = new Date()) {
  if (!isValidDate(date) || !isValidTime(time)) return false;
  return new Date(`${date}T${time}:00+03:00`).getTime() > now.getTime();
}

export function availableSlotsForDate(date: string, rule: AvailabilityRuleData | undefined, now = new Date()) {
  if (!isValidDate(date)) return [];
  return slotsForRule(rule).filter((time) => isFutureNairobiSlot(date, time, now));
}

export function slotId(date: string, time: string) {
  return `${date}_${time.replace(":", "")}`;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
