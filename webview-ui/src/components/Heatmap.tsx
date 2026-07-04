import { useState, useMemo, useRef, useEffect } from "preact/hooks";
import type { ChartDayItem } from "@shared/webview-contract";
import { formatTokensCompact } from "@/view-helpers";

type TooltipState = { left: number; top: number; content: string };
type HoverEvent = { clientX: number; clientY: number };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const GAP = 2;
const WEEKS = 26;

const LEVEL_COLORS = [
  "rgba(128, 128, 128, 0.14)",
  "rgba(55, 148, 255, 0.28)",
  "rgba(55, 148, 255, 0.48)",
  "rgba(55, 148, 255, 0.72)",
  "rgba(55, 148, 255, 0.95)",
];

const CELL_CLASS = "box-border inline-block appearance-none m-0 min-w-0 min-h-0 overflow-hidden rounded-[2px] border border-solid border-(--border) p-0 leading-none outline-none transition-shadow hover:z-[1] hover:ring-1 hover:ring-(--accent) focus-visible:z-[1] focus-visible:ring-1 focus-visible:ring-(--accent)";

function levelFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function parseDay(day: string): Date {
  return new Date(day + "T00:00:00");
}

function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

type DailyCell = { date: Date; item: ChartDayItem | null; future: boolean };

function buildDailyColumns(items: ChartDayItem[]): DailyCell[][] {
  const byDay = new Map(items.map((item) => [item.day, item]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = startOfWeekMonday(today);
  const start = new Date(end);
  start.setDate(end.getDate() - (WEEKS - 1) * 7);

  const columns: DailyCell[][] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const week: DailyCell[] = [];
    for (let index = 0; index < 7; index++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + index);
      const future = d.getTime() > today.getTime();
      const key = toKey(d);
      week.push({ date: d, item: future ? null : (byDay.get(key) ?? null), future });
    }
    columns.push(week);
    cursor.setDate(cursor.getDate() + 7);
  }
  return columns;
}

function dailyCellContent(cell: DailyCell): string {
  const d = cell.date;
  const label = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (!cell.item) return `${label} — no usage`;
  return `${label} — ${formatTokensCompact(cell.item.totalTokens)} tokens`;
}

function Heatmap({ chartData, separated = false }: { chartData: ChartDayItem[]; separated?: boolean }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => [...chartData].sort((left, right) => left.day.localeCompare(right.day)), [chartData]);
  const columns = useMemo(() => buildDailyColumns(items), [items]);
  const max = useMemo(() => {
    const cutoff = Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000;
    return items.reduce((currentMax, item) => (parseDay(item.day).getTime() >= cutoff ? Math.max(currentMax, item.totalTokens) : currentMax), 0);
  }, [items]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const update = () => setContainerWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cellSize = containerWidth === 0 ? 0 : Math.max(1, Math.floor((containerWidth - (WEEKS - 1) * GAP) / WEEKS));

  function showTooltip(event: HoverEvent, content: string) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const width = 200;
    const height = 40;
    const pad = 8;
    const left = Math.min(Math.max(pad, event.clientX - rect.left + 12), wrap.clientWidth - width - pad);
    const top = Math.min(Math.max(pad, event.clientY - rect.top - height - 12), wrap.clientHeight - height - pad);
    setTooltip({ left, top, content });
  }

  const isEmpty = items.length === 0;

  return (
    <section class={`flex flex-col gap-2.5${separated ? " mt-[22px] border-t border-(--border) pt-[22px]" : ""}`} data-chart-id="daily-heatmap">
      <div class="flex items-center justify-between gap-2">
        <div class="text-[10px] font-bold uppercase tracking-[.5px] text-(--muted)">Usage Heatmap</div>
        <div class="flex items-center gap-1 text-[9px] uppercase tracking-[.3px] text-(--muted)">
          <span>Less</span>
          {LEVEL_COLORS.map((color, index) => (
            <span key={index} class="inline-block h-[10px] w-[10px] box-border rounded-[2px] border border-solid border-(--border)" style={{ background: color }} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div class="relative w-full" ref={wrapRef}>
        {isEmpty ? (
          <div class="py-6 text-center text-[10px] text-(--muted)">No usage data</div>
        ) : (
          <div class="flex justify-center">
            <div class="flex" style={{ gap: GAP }}>
              {columns.map((column, columnIndex) => (
                <div key={columnIndex} class="flex flex-col" style={{ gap: GAP }}>
                  {column.map((cell) => {
                    if (cell.future) {
                      return <div key={toKey(cell.date)} style={{ width: cellSize, height: cellSize }} />;
                    }
                    const level = levelFor(cell.item?.totalTokens ?? 0, max);
                    const content = dailyCellContent(cell);
                    return (
                      <button
                        key={toKey(cell.date)}
                        type="button"
                        aria-label={content}
                        class={CELL_CLASS}
                        style={{ width: cellSize, height: cellSize, background: LEVEL_COLORS[level] }}
                        onPointerEnter={(event) => showTooltip(event, content)}
                        onPointerMove={(event) => showTooltip(event, content)}
                        onPointerLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        {tooltip ? (
          <div
            class="pointer-events-none absolute left-0 top-0 z-[2] max-w-[calc(100%_-_12px)] rounded-md border border-(--border) bg-(--card-bg) px-2.5 py-[7px] text-[11px] font-semibold shadow-[0_10px_28px_rgba(0,0,0,.2)]"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            {tooltip.content}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export { Heatmap };
