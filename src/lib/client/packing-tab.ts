// The Packing tab's two sub-views: the pack-job counters (with their
// week/month running totals) and the stopwatch + fastest-5 board. Kept in
// one module — rather than two — because both are small and neither is
// reused elsewhere, unlike the Tandems/Logbook tabs' larger feature areas.
import { formatDuration, formatWhen } from '../format';
import { bump, money } from './dom';

const RATES: Record<string, number> = {
  tandem: 11,
  instructor: 6.5,
  student: 6.5,
  sport: 6.5,
};

interface Aggregate {
  counts: Record<string, number>;
  totalPacks?: number;
  totalEarnings: number;
}

function applyState(counts: Record<string, number>, packs: number, earnings: number) {
  for (const category of Object.keys(counts)) {
    const countEl = document.querySelector(`[data-count="${category}"]`);
    const subtotalEl = document.querySelector(`[data-subtotal="${category}"]`);
    if (countEl) countEl.textContent = String(counts[category]);
    if (subtotalEl) subtotalEl.textContent = money(counts[category] * RATES[category]);
  }
  const totalPacksEl = document.getElementById('totalPacks');
  const totalEarningsEl = document.getElementById('totalEarnings');
  if (totalPacksEl) totalPacksEl.textContent = String(packs);
  if (totalEarningsEl) totalEarningsEl.textContent = money(earnings);
}

// Keeps the "this week" / "this invoice month" row's numbers current as
// taps land, without re-rendering the whole history table.
function applyAggregate(prefix: 'week' | 'month', agg: Aggregate) {
  for (const category of Object.keys(agg.counts)) {
    const cell = document.querySelector(`[data-agg-count="${prefix}:${category}"]`);
    if (cell) cell.textContent = String(agg.counts[category]);
  }
  const packsCell = document.querySelector(`[data-agg-total="${prefix}:packs"]`);
  const earningsCell = document.querySelector(`[data-agg-total="${prefix}:earnings"]`);
  if (packsCell) packsCell.textContent = String(agg.totalPacks);
  if (earningsCell) earningsCell.textContent = money(agg.totalEarnings);
}

async function adjust(category: string, delta: number) {
  const res = await fetch('/api/adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, delta }),
  });
  if (!res.ok) {
    console.error('Failed to save pack job', await res.text());
    return;
  }
  const data = await res.json();
  applyState(data.state.counts, data.totalPacks, data.totalEarnings);
  if (data.currentWeek) applyAggregate('week', data.currentWeek);
  if (data.currentMonth) applyAggregate('month', data.currentMonth);
  bump(document.querySelector(`[data-count="${category}"]`));
}

export function initPackingCounters() {
  document.querySelectorAll<HTMLButtonElement>('[data-action][data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.category!;
      const delta = button.dataset.action === 'increment' ? 1 : -1;
      button.disabled = true;
      adjust(category, delta).finally(() => {
        button.disabled = false;
      });
    });
  });
}

// ---- Stopwatch + fastest-5 board ----

interface PackTime {
  ms: number;
  at: string;
}

function renderFastestBoard(top5: PackTime[]) {
  const board = document.getElementById('fastestBoard');
  if (!board) return;
  if (top5.length === 0) {
    board.innerHTML = '<p class="fastest-empty">Time a pack job to start the board.</p>';
    return;
  }
  const rows = top5
    .map(
      (t, i) => `
        <li class="fastest-row${i === 0 ? ' is-first' : ''}">
          <span class="fastest-rank">${i + 1}</span>
          <span class="fastest-duration">${formatDuration(t.ms)}</span>
          <span class="fastest-when">${formatWhen(t.at)}</span>
          <button type="button" class="fastest-delete" data-at="${t.at}" aria-label="Delete the ${formatDuration(t.ms)} time">&times;</button>
        </li>`,
    )
    .join('');
  board.innerHTML = `<ol class="fastest-list">${rows}</ol>`;
}

async function savePackTime(ms: number) {
  try {
    const res = await fetch('/api/pack-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ms }),
    });
    if (!res.ok) return;
    const data = await res.json();
    renderFastestBoard(data.top5);
  } catch (err) {
    console.error('Failed to save pack time', err);
  }
}

async function deletePackTime(at: string) {
  try {
    const res = await fetch('/api/pack-time', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ at }),
    });
    if (!res.ok) return;
    const data = await res.json();
    renderFastestBoard(data.top5);
  } catch (err) {
    console.error('Failed to delete pack time', err);
  }
}

export function initPackingTimer() {
  const timerButton = document.getElementById('timerButton') as HTMLButtonElement | null;
  const timerDisplay = document.getElementById('timerDisplay');
  let timerHandle: number | undefined;
  let startedAt = 0;

  function renderElapsed() {
    if (timerDisplay) timerDisplay.textContent = formatDuration(Date.now() - startedAt);
  }

  // Delegated so it keeps working after renderFastestBoard() replaces the
  // rows' innerHTML.
  document.getElementById('fastestBoard')?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.fastest-delete');
    if (!button?.dataset.at) return;
    void deletePackTime(button.dataset.at);
  });

  timerButton?.addEventListener('click', () => {
    const running = timerButton.dataset.running === 'true';
    if (!running) {
      startedAt = Date.now();
      timerButton.dataset.running = 'true';
      timerButton.textContent = 'Stop';
      renderElapsed();
      timerHandle = window.setInterval(renderElapsed, 100);
    } else {
      window.clearInterval(timerHandle);
      const elapsed = Date.now() - startedAt;
      timerButton.dataset.running = 'false';
      timerButton.textContent = 'Start';
      if (timerDisplay) timerDisplay.textContent = '0:00.0';
      void savePackTime(elapsed);
    }
  });
}
