import assert from "node:assert/strict";
import test from "node:test";
import { availableSlotsForDate, isFutureNairobiSlot, isValidDate, isValidTime, slotId, slotsForRule, weekdayForDate } from "./availability.js";

test("validates calendar dates and 24-hour times", () => {
  assert.equal(isValidDate("2026-10-06"), true);
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidTime("09:30"), true);
  assert.equal(isValidTime("24:00"), false);
});

test("builds configured slots without passing the closing time", () => {
  assert.deepEqual(slotsForRule({ enabled: true, startTime: "09:00", endTime: "12:00", slotMinutes: 60 }), ["09:00", "10:00", "11:00"]);
  assert.deepEqual(slotsForRule({ enabled: false, startTime: "09:00", endTime: "12:00", slotMinutes: 60 }), []);
  assert.deepEqual(slotsForRule({ enabled: true, startTime: "12:00", endTime: "09:00", slotMinutes: 60 }), []);
});

test("filters elapsed Nairobi slots while preserving future configured slots", () => {
  const now = new Date("2026-10-06T07:30:00Z"); // 10:30 in Nairobi
  const rule = { enabled: true, startTime: "09:00", endTime: "13:00", slotMinutes: 60 };
  assert.deepEqual(availableSlotsForDate("2026-10-06", rule, now), ["11:00", "12:00"]);
  assert.deepEqual(availableSlotsForDate("2026-10-05", rule, now), []);
  assert.equal(isFutureNairobiSlot("2026-10-06", "11:00", now), true);
});

test("uses stable weekday and booking lock identifiers", () => {
  assert.equal(weekdayForDate("2026-10-06"), 2);
  assert.equal(weekdayForDate("invalid"), -1);
  assert.equal(slotId("2026-10-06", "09:30"), "2026-10-06_0930");
});
