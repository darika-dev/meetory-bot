const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

export type LocalDateTimeParts = {
  endDate: string;
  endTime: string;
};

export function buildLocalDateTime(date: string, time: string) {
  if (!datePattern.test(date)) {
    throw new Error("Invalid local date format");
  }

  if (!timePattern.test(time)) {
    throw new Error("Invalid local time format");
  }

  return `${date}T${time}:00`;
}

export function addCalendarDays(date: string, days: number) {
  if (!datePattern.test(date)) {
    throw new Error("Invalid local date format");
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);

  return parsed.toISOString().slice(0, 10);
}

export function addMinutesToLocalTime(date: string, time: string, minutesToAdd: number): LocalDateTimeParts {
  if (!datePattern.test(date)) {
    throw new Error("Invalid local date format");
  }

  if (!timePattern.test(time)) {
    throw new Error("Invalid local time format");
  }

  let currentDate = date;
  const [hour, minute] = time.split(":").map(Number);
  let totalMinutes = hour * 60 + minute + minutesToAdd;

  while (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    currentDate = addCalendarDays(currentDate, 1);
  }

  while (totalMinutes < 0) {
    totalMinutes += 24 * 60;
    currentDate = addCalendarDays(currentDate, -1);
  }

  const endHour = Math.floor(totalMinutes / 60);
  const endMinute = totalMinutes % 60;

  return {
    endDate: currentDate,
    endTime: `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`,
  };
}
