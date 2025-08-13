(function () {
  "use strict";

  /**
   * Utils
   */
  const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

  function toStartOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatDateLabel(date) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function formatWeekday(date) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  function formatTime(tsSeconds) {
    const d = new Date(tsSeconds * 1000);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function addWeeks(date, weeks) {
    return addDays(date, 7 * weeks);
  }

  function addMonthsPreservingDay(date, months) {
    const d = new Date(date);
    const originalDay = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() !== originalDay) {
      // Handle month rollover (e.g., Jan 31 -> Feb 28/29); clamp to last day of month
      d.setDate(0);
    }
    return d;
  }

  function startOfMonth(date) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfMonth(date) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1, 0); // day 0 -> last day of previous month
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function alignToWeekStartSunday(date) {
    const d = toStartOfDay(date);
    const dow = d.getDay(); // 0=Sun
    return addDays(d, -dow);
  }

  function alignToWeekEndSaturday(date) {
    const d = toStartOfDay(date);
    const dow = d.getDay(); // 0=Sun
    const add = 6 - dow;
    return addDays(d, add);
  }

  function getLocalTimezoneLabel() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
      return "Local Time";
    }
  }

  /**
   * Recurrence expansion
   */
  function expandEvents(events, windowStart, windowEnd) {
    const expanded = [];
    const startMs = windowStart.getTime();
    const endMs = windowEnd.getTime();

    for (const ev of events) {
      const start = new Date(ev.start_time * 1000);
      const end = new Date(ev.end_time * 1000);
      const durationMs = end.getTime() - start.getTime();

      if (!ev.recurring || ev.recurrence_type === "none") {
        if (end.getTime() >= startMs && start.getTime() <= endMs) {
          expanded.push(ev);
        }
        continue;
      }

      const recurrence = ev.recurrence_type;
      // Generate occurrences until we pass the window end
      let occurrenceStart = new Date(start);
      while (occurrenceStart.getTime() <= endMs) {
        const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
        const overlapsWindow =
          occurrenceEnd.getTime() >= startMs &&
          occurrenceStart.getTime() <= endMs;
        if (overlapsWindow) {
          expanded.push({
            ...ev,
            start_time: Math.floor(occurrenceStart.getTime() / 1000),
            end_time: Math.floor(occurrenceEnd.getTime() / 1000),
          });
        }

        if (recurrence === "daily") {
          occurrenceStart = addDays(occurrenceStart, 1);
        } else if (recurrence === "weekly") {
          occurrenceStart = addWeeks(occurrenceStart, 1);
        } else if (recurrence === "monthly") {
          occurrenceStart = addMonthsPreservingDay(occurrenceStart, 1);
        } else {
          break; // unknown recurrence
        }
      }
    }

    return expanded;
  }

  function groupEventsByDay(events, windowStart, totalDays) {
    // Split each event occurrence across day buckets it overlaps
    const map = new Map();
    for (let i = 0; i < totalDays; i++) {
      map.set(i, []);
    }

    const windowStartMs = windowStart.getTime();
    const windowEndMs = windowStartMs + totalDays * MILLISECONDS_IN_DAY - 1;

    for (const ev of events) {
      const occStartMs = Math.max(ev.start_time * 1000, windowStartMs);
      const occEndMs = Math.min(ev.end_time * 1000, windowEndMs);
      if (occEndMs < windowStartMs || occStartMs > windowEndMs) continue;

      let dayCursor = toStartOfDay(new Date(occStartMs));
      const lastDay = toStartOfDay(new Date(occEndMs));
      while (dayCursor.getTime() <= lastDay.getTime()) {
        const dayStartMs = dayCursor.getTime();
        const dayEndMs = dayStartMs + MILLISECONDS_IN_DAY - 1;
        const segStart = Math.max(occStartMs, dayStartMs);
        const segEnd = Math.min(occEndMs, dayEndMs);
        const index = Math.floor((dayStartMs - windowStartMs) / MILLISECONDS_IN_DAY);
        if (index >= 0 && index < totalDays && segEnd >= segStart) {
          map.get(index).push({
            ...ev,
            start_time: Math.floor(segStart / 1000),
            end_time: Math.floor(segEnd / 1000),
          });
        }
        dayCursor = addDays(dayCursor, 1);
      }
    }

    // Sort segments per day by start time
    for (const [idx, list] of map) {
      list.sort((a, b) => a.start_time - b.start_time);
      map.set(idx, list);
    }

    return map;
  }

  function typeToLabel(type) {
    switch (type) {
      case "double_xp":
        return "Double XP";
      case "triple_xp":
        return "Triple XP";
      case "quadruple_xp":
        return "Quadruple XP";
      case "double_aether_shards":
        return "Double Shards";
      case "double_quest_points":
        return "Double QP";
      case "double_random_encounters":
        return "Double Encounter";
      case "quadruple_drop_chance":
        return "Quadruple Drops";
      case "triple_drop_chance":
        return "Triple Drops";
      case "double_drop_chance":
        return "Double Drops";
      default:
        return type.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    }
  }

  function renderCalendar(container, events, rangeStart, totalDays) {
    const today = toStartOfDay(new Date());
    container.innerHTML = "";

    const rangeEnd = addDays(rangeStart, totalDays - 1);
    rangeEnd.setHours(23, 59, 59, 999);

    const grouped = groupEventsByDay(events, rangeStart, totalDays);

    // Build list of months that intersect the range
    const months = [];
    let iter = startOfMonth(rangeStart);
    const lastMonth = startOfMonth(rangeEnd);
    while (iter <= lastMonth) {
      months.push(new Date(iter));
      iter.setMonth(iter.getMonth() + 1);
    }

    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (const monthStart of months) {
      const monthEnd = endOfMonth(monthStart);
      const gridStart = alignToWeekStartSunday(monthStart);
      const gridEnd = alignToWeekEndSaturday(monthEnd);

      const section = document.createElement("section");
      section.className = "month-section";

      const header = document.createElement("div");
      header.className = "month-header";
      header.innerHTML = `<div class="month-title">${monthStart.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })}</div>`;

      const headerGrid = document.createElement("div");
      headerGrid.className = "weekday-grid";
      for (const name of weekdayNames) {
        const wd = document.createElement("div");
        wd.className = "weekday";
        wd.textContent = name;
        headerGrid.appendChild(wd);
      }

      const daysGrid = document.createElement("div");
      daysGrid.className = "days-grid";

      // Leading spacers before the 1st of month
      const leading = (gridStart.getTime() !== startOfMonth(monthStart).getTime())
        ? startOfMonth(monthStart).getDay()
        : 0;
      for (let i = 0; i < leading; i++) {
        const spacer = document.createElement("div");
        spacer.className = "day-spacer";
        daysGrid.appendChild(spacer);
      }

      for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) {
        const dayDate = new Date(d);
        const offsetFromRangeStart = Math.floor(
          (toStartOfDay(dayDate).getTime() - rangeStart.getTime()) / MILLISECONDS_IN_DAY
        );
        const inRange = offsetFromRangeStart >= 0 && offsetFromRangeStart < totalDays;
        const isToday = isSameDay(dayDate, today);
        const dayEvents = inRange ? grouped.get(offsetFromRangeStart) || [] : [];

        const card = document.createElement("section");
        card.className = `day-card${isToday ? " today" : ""}${inRange ? "" : " outside"}`;
        card.setAttribute("aria-label", dayDate.toDateString());

        const dayHeader = document.createElement("div");
        dayHeader.className = "day-header";
        dayHeader.innerHTML = `
          <div class="date">${formatDateLabel(dayDate)}</div>
          <div class="weekday">${formatWeekday(dayDate)}</div>
        `;

        const list = document.createElement("div");
        list.className = "events";
        if (inRange && dayEvents.length > 0) {
          for (const ev of dayEvents) {
            const item = document.createElement("div");
            item.className = `event ${ev.type || ""}`;
            const typeLabel = typeToLabel(ev.type || "event");
            item.innerHTML = `
              <div class="badge">${typeLabel}</div>
              <div class="meta">
                <div class="time">${formatTime(ev.start_time)} – ${formatTime(
              ev.end_time
            )}</div>
              </div>
            `;
            list.appendChild(item);
          }
        }

        card.appendChild(dayHeader);
        card.appendChild(list);
        daysGrid.appendChild(card);
      }

      // Trailing spacers to complete the last week
      const trailing = 6 - monthEnd.getDay();
      for (let i = 0; i < trailing; i++) {
        const spacer = document.createElement("div");
        spacer.className = "day-spacer";
        daysGrid.appendChild(spacer);
      }

      section.appendChild(header);
      section.appendChild(headerGrid);
      section.appendChild(daysGrid);
      container.appendChild(section);
    }
  }

  async function loadEvents() {
    const res = await fetch("./events.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("Failed to load events.json");
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    return json;
  }

  function computeRange() {
    const start = toStartOfDay(new Date());
    const totalDays = 61; // today + next 60 days
    const end = addDays(start, totalDays - 1);
    end.setHours(23, 59, 59, 999);
    return { start, end, totalDays };
  }

  async function init() {
    const tzLabel = getLocalTimezoneLabel();
    const tzNode = document.getElementById("tz");
    if (tzNode) tzNode.textContent = `Timezone: ${tzLabel}`;

    const { start, end, totalDays } = computeRange();
    const rangeInfo = document.getElementById("range-info");
    if (rangeInfo) {
      const opts = { month: "short", day: "numeric" };
      rangeInfo.textContent = `${start.toLocaleDateString(
        undefined,
        opts
      )} – ${end.toLocaleDateString(undefined, opts)} (${totalDays} days)`;
    }

    let events = [];
    try {
      events = await loadEvents();
    } catch (e) {
      // Fallback to demo data if fetch fails (e.g., local preview)
      events = [
        {
          id: "demo-quad-1",
          type: "quadruple_xp",
          start_time: Math.floor(Date.now() / 1000) + 60 * 60,
          end_time: Math.floor(Date.now() / 1000) + 3 * 60 * 60,
          recurring: false,
          recurrence_type: "none",
        },
        {
          id: "demo-triple-weekly",
          type: "triple_xp",
          start_time: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
          end_time: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
          recurring: true,
          recurrence_type: "weekly",
        },
        {
          id: "demo-double-daily",
          type: "double_xp",
          start_time: Math.floor(Date.now() / 1000) + 5 * 60 * 60,
          end_time: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
          recurring: true,
          recurrence_type: "daily",
        },
        {
          id: "demo-monthly",
          type: "double_xp",
          start_time: (() => {
            const t = new Date();
            t.setHours(18, 0, 0, 0);
            return Math.floor(t.getTime() / 1000);
          })(),
          end_time: (() => {
            const t = new Date();
            t.setHours(20, 0, 0, 0);
            return Math.floor(t.getTime() / 1000);
          })(),
          recurring: true,
          recurrence_type: "monthly",
        },
      ];
    }

    const expanded = expandEvents(events, start, end);
    const calendar = document.getElementById("calendar");
    renderCalendar(calendar, expanded, start, totalDays);
  }

  window.addEventListener("DOMContentLoaded", init);
})();

