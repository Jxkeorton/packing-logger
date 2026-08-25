// The Tandems tab's jump log: every tandem jump is credited to a customer,
// so adding one prompts for a name via a small modal rather than just
// bumping a count. Covers the per-category list, the day's running
// totals + week/month aggregate rows, and that name-prompt modal. Invoice
// letterhead settings are their own module — tandems-invoice-settings.ts —
// since they don't touch any of this.
import { escapeHtml, money } from './dom';

const TANDEM_RATES: Record<string, number> = {
  instructor: 42,
  videographer: 42,
};

const TANDEM_CATEGORY_LABELS: Record<string, string> = {
  instructor: 'Instructor',
  videographer: 'Videographer',
};

interface Jump {
  name: string;
  at: string;
}

interface TandemState {
  counts: Record<string, number>;
  entries: Record<string, Jump[]>;
}

interface Aggregate {
  counts: Record<string, number>;
  totalJumps?: number;
  totalEarnings: number;
}

function renderTandemList(category: string, entries: Jump[]) {
  const list = document.querySelector(`[data-tandem-list="${category}"]`);
  if (!list) return;
  if (entries.length === 0) {
    list.innerHTML = '<li class="tandem-jump-empty">No jumps logged yet today.</li>';
    return;
  }
  list.innerHTML = entries
    .map(
      (j) => `
        <li class="tandem-jump-row" data-at="${j.at}">
          <span class="tandem-jump-name">${escapeHtml(j.name)}</span>
          <button type="button" class="tandem-jump-delete" data-at="${j.at}" aria-label="Remove ${escapeHtml(j.name)}">&times;</button>
        </li>`,
    )
    .join('');
}

function applyTandemState(state: TandemState, jumps: number, earnings: number) {
  for (const category of Object.keys(state.counts)) {
    renderTandemList(category, state.entries[category] ?? []);
    const subtotalEl = document.querySelector(`[data-tandem-subtotal="${category}"]`);
    if (subtotalEl) subtotalEl.textContent = money(state.counts[category] * TANDEM_RATES[category]);
  }
  const totalJumpsEl = document.getElementById('tandemTotalJumps');
  const totalEarningsEl = document.getElementById('tandemTotalEarnings');
  if (totalJumpsEl) totalJumpsEl.textContent = String(jumps);
  if (totalEarningsEl) totalEarningsEl.textContent = money(earnings);
}

function applyTandemAggregate(prefix: 'tweek' | 'tmonth', agg: Aggregate) {
  for (const category of Object.keys(agg.counts)) {
    const cell = document.querySelector(`[data-agg-count="${prefix}:${category}"]`);
    if (cell) cell.textContent = String(agg.counts[category]);
  }
  const jumpsCell = document.querySelector(`[data-agg-total="${prefix}:jumps"]`);
  const earningsCell = document.querySelector(`[data-agg-total="${prefix}:earnings"]`);
  if (jumpsCell) jumpsCell.textContent = String(agg.totalJumps);
  if (earningsCell) earningsCell.textContent = money(agg.totalEarnings);
}

async function addTandemJump(category: string, name: string) {
  const res = await fetch('/api/tandem-adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, name }),
  });
  if (!res.ok) {
    console.error('Failed to save tandem jump', await res.text());
    return;
  }
  const data = await res.json();
  applyTandemState(data.state, data.totalJumps, data.totalEarnings);
  if (data.currentWeek) applyTandemAggregate('tweek', data.currentWeek);
  if (data.currentMonth) applyTandemAggregate('tmonth', data.currentMonth);
}

async function deleteTandemJump(at: string) {
  try {
    const res = await fetch('/api/tandem-adjust', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ at }),
    });
    if (!res.ok) return;
    const data = await res.json();
    applyTandemState(data.state, data.totalJumps, data.totalEarnings);
    if (data.currentWeek) applyTandemAggregate('tweek', data.currentWeek);
    if (data.currentMonth) applyTandemAggregate('tmonth', data.currentMonth);
  } catch (err) {
    console.error('Failed to delete tandem jump', err);
  }
}

/** Wires the per-category add buttons, delete buttons, and the customer-name modal in between them. `root` is the tab's view element, used to scope the [data-tandem-add] / [data-tandem-list] queries. */
export function initTandemJumpLog(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-tandem-list]').forEach((list) => {
    list.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.tandem-jump-delete');
      if (!button?.dataset.at) return;
      void deleteTandemJump(button.dataset.at);
    });
  });

  // ---- Customer-name modal ----

  let pendingCategory: string | null = null;

  const nameModal = document.getElementById('tandemNameModal');
  const nameModalSubtitle = document.getElementById('tandemNameModalSubtitle');
  const nameForm = document.getElementById('tandemNameForm') as HTMLFormElement | null;
  const nameInput = document.getElementById('tandemNameInput') as HTMLInputElement | null;
  const nameCancel = document.getElementById('tandemNameCancel');

  function openNameModal(category: string) {
    pendingCategory = category;
    if (nameModalSubtitle) {
      nameModalSubtitle.textContent = `${TANDEM_CATEGORY_LABELS[category] ?? category} jump — ${money(TANDEM_RATES[category])}`;
    }
    if (nameInput) nameInput.value = '';
    if (nameModal) nameModal.hidden = false;
    nameInput?.focus();
  }

  function closeNameModal() {
    pendingCategory = null;
    if (nameModal) nameModal.hidden = true;
  }

  root.querySelectorAll<HTMLButtonElement>('[data-tandem-add]').forEach((button) => {
    button.addEventListener('click', () => openNameModal(button.dataset.tandemAdd!));
  });

  nameCancel?.addEventListener('click', closeNameModal);
  nameModal?.addEventListener('click', (event) => {
    if (event.target === nameModal) closeNameModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nameModal && !nameModal.hidden) closeNameModal();
  });

  nameForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput?.value.trim();
    const category = pendingCategory;
    if (!name || !category) return;
    const submitButton = nameForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    addTandemJump(category, name)
      .then(() => closeNameModal())
      .finally(() => {
        if (submitButton) submitButton.disabled = false;
      });
  });
}
