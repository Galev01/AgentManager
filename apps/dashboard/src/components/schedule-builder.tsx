"use client";

import { useEffect, useMemo, useState } from "react";

type RunMode = "every-hour" | "at-hour" | "interval" | "multi-hour";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const INTERVAL_PRESETS = [5, 10, 15, 20, 30];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

function dowField(days: boolean[]): string {
  if (days.every(Boolean)) return "*";
  const picks = days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  return picks.join(",");
}

function buildCron(mode: RunMode, days: boolean[], hour: number, interval: number, hours: number[]): string {
  const dow = dowField(days);
  switch (mode) {
    case "every-hour":
      return `0 * * * ${dow}`;
    case "at-hour":
      return `0 ${hour} * * ${dow}`;
    case "interval":
      return `*/${interval} * * * ${dow}`;
    case "multi-hour": {
      const list = hours.length ? [...hours].sort((a, b) => a - b).join(",") : "0";
      return `0 ${list} * * ${dow}`;
    }
  }
}

function describe(mode: RunMode, days: boolean[], hour: number, interval: number, hours: number[]): string {
  const dayPart = days.every(Boolean)
    ? "every day"
    : `on ${days.map((on, i) => (on ? DAY_LABELS[i] : null)).filter(Boolean).join(", ")}`;
  switch (mode) {
    case "every-hour":
      return `Every hour, ${dayPart}`;
    case "at-hour":
      return `At ${formatHour(hour)}, ${dayPart}`;
    case "interval":
      return `Every ${interval} minutes, ${dayPart}`;
    case "multi-hour": {
      const list = hours.length
        ? [...hours].sort((a, b) => a - b).map(formatHour).join(", ")
        : "(pick at least one hour)";
      return `At ${list}, ${dayPart}`;
    }
  }
}

export function ScheduleBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (cron: string) => void;
}) {
  const [days, setDays] = useState<boolean[]>(() => Array(7).fill(true));
  const [mode, setMode] = useState<RunMode>("every-hour");
  const [hour, setHour] = useState(9);
  const [interval, setInterval] = useState(30);
  const [hours, setHours] = useState<number[]>([9, 17]);
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState(value);

  const cron = useMemo(
    () => buildCron(mode, days, hour, interval, hours),
    [mode, days, hour, interval, hours],
  );

  useEffect(() => {
    if (!advanced) {
      onChange(cron);
      setRaw(cron);
    }
  }, [cron, advanced, onChange]);

  function toggleDay(i: number) {
    setDays((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      if (!next.some(Boolean)) next[i] = true;
      return next;
    });
  }

  function toggleHour(h: number) {
    setHours((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]));
  }

  const noDays = !days.some(Boolean);
  const noHours = mode === "multi-hour" && hours.length === 0;

  return (
    <div className="space-y-4 rounded-md border border-zinc-700 bg-zinc-900/40 p-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Days of week</div>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((label, i) => (
            <label
              key={label}
              className={`cursor-pointer select-none rounded border px-3 py-1.5 text-xs font-medium transition ${
                days[i]
                  ? "border-blue-500 bg-blue-900/40 text-blue-200"
                  : "border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              <input type="checkbox" checked={days[i]} onChange={() => toggleDay(i)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Run at</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { id: "every-hour", label: "Every hour" },
              { id: "at-hour", label: "Specific hour of day" },
              { id: "interval", label: "Repeat every N minutes" },
              { id: "multi-hour", label: "Multiple times per day" },
            ] as { id: RunMode; label: string }[]
          ).map((opt) => (
            <label
              key={opt.id}
              className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm transition ${
                mode === opt.id
                  ? "border-blue-500 bg-blue-900/30 text-zinc-100"
                  : "border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              <input
                type="radio"
                name="run-mode"
                value={opt.id}
                checked={mode === opt.id}
                onChange={() => setMode(opt.id)}
                className="accent-blue-500"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {mode === "at-hour" && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Hour of day
          </label>
          <select
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{formatHour(h)}</option>
            ))}
          </select>
        </div>
      )}

      {mode === "interval" && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Interval (minutes)</div>
          <div className="flex flex-wrap gap-2">
            {INTERVAL_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setInterval(n)}
                className={`rounded border px-3 py-1.5 text-xs font-medium transition ${
                  interval === n
                    ? "border-blue-500 bg-blue-900/40 text-blue-200"
                    : "border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {n} min
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "multi-hour" && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Hours ({hours.length} selected)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => toggleHour(h)}
                className={`min-w-[3.25rem] rounded border px-2 py-1 text-xs font-mono transition ${
                  hours.includes(h)
                    ? "border-blue-500 bg-blue-900/40 text-blue-200"
                    : "border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {formatHour(h)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded border border-zinc-700 bg-zinc-950/60 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Preview</div>
          <button
            type="button"
            onClick={() => {
              setAdvanced((prev) => {
                const next = !prev;
                if (next) setRaw(cron);
                else onChange(cron);
                return next;
              });
            }}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            {advanced ? "Use builder" : "Edit raw cron"}
          </button>
        </div>
        {advanced ? (
          <input
            type="text"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              onChange(e.target.value);
            }}
            className="mt-2 w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <>
            <div className="mt-2 font-mono text-sm text-zinc-100">{cron}</div>
            <div className="mt-1 text-xs text-zinc-400">{describe(mode, days, hour, interval, hours)}</div>
          </>
        )}
        {(noDays || noHours) && (
          <div className="mt-2 text-xs text-amber-400">
            {noDays ? "Select at least one day." : "Select at least one hour."}
          </div>
        )}
      </div>
    </div>
  );
}
