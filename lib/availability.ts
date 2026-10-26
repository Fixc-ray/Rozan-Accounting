import type { AvailabilityRule } from "./firebase/types";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidAvailabilityDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidAvailabilityTime(value: string) {
  return timePattern.test(value);
}

export function weekdayForAvailabilityDate(date: string) {
  return isValidAvailabilityDate(date) ? new Date(`${date}T00:00:00Z`).getUTCDay() : -1;
}

export function slotsForAvailabilityRule(rule: Partial<AvailabilityRule> | undefined) {
  if (!rule?.enabled || !rule.startTime || !rule.endTime || !isValidAvailabilityTime(rule.startTime) || !isValidAvailabilityTime(rule.endTime)) return [];
  const start = toMinutes(rule.startTime);
  const end = toMinutes(rule.endTime);
  const interval = Number(rule.slotMinutes);
  if (!Number.isInteger(interval) || interval < 15 || interval > 180 || end <= start) return [];

  const slots: string[] = [];
  for (let cursor = start; cursor + interval <= end; cursor += interval) slots.push(fromMinutes(cursor));
  return slots;
}

export function isFutureAvailabilitySlot(date: string, time: string, now = new Date()) {
  if (!isValidAvailabilityDate(date) || !isValidAvailabilityTime(time)) return false;
  return new Date(`${date}T${time}:00+03:00`).getTime() > now.getTime();
}

export function availableSlotsForDate(date: string, rule: Partial<AvailabilityRule> | undefined, now = new Date()) {
  if (!isValidAvailabilityDate(date)) return [];
  return slotsForAvailabilityRule(rule).filter((time) => isFutureAvailabilitySlot(date, time, now));
}

export function availabilitySlotId(date: string, time: string) {
  return `${date}_${time.replace(":", "")}`;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
