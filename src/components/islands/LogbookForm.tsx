// The Logbook tab's Log sub-view: running total, "log a jump" form, and
// entry list (expand/edit/delete) — as one React island (`client:load`
// from LogbookTab.astro) instead of markup + a chunk of imperative DOM
// wiring. Editing a jump used to mean writing its fields into `data-*`
// attributes on the list row, then reading them back out into the form's
// DOM nodes by id; here it's just a plain object in state (see
// enterEditMode below), built by formFromEntry in
// lib/client/logbook-form-helpers.ts, and the form re-renders from it.
//
// The Places/Equipment/Aircraft/Jump types profiles these dropdowns pick
// from live in the Settings sub-tab, which stays plain Astro + vanilla TS
// (lib/client/logbook-reference-lists.ts). This island doesn't watch that
// sub-tab for changes — the two are otherwise-independent pieces of the
// page, and wiring a live cross-island sync for what's a rare edit
// (add/rename/delete a saved profile, immediately followed by logging a
// jump in the same page load) would be more moving parts than the problem
// warrants. Instead the "Refresh profiles" button below just re-fetches
// GET /api/logbook-settings on demand.
import { useRef, useState, type FormEvent } from 'react';
import type { NumberedEntry } from '../../lib/logbook';
import type { LogbookSettings } from '../../lib/logbook-settings';
import {
  dash,
  formatShortDate,
  emptyForm,
  formFromEntry,
  buildPayload,
  type FormFields,
} from '../../lib/client/logbook-form-helpers';
import {
  MASTHEAD,
  STAMP,
  STAMP_LABEL,
  STAMP_DATE,
  TOTALS,
  TOTALS_BLOCK_FLEX,
  TOTALS_VALUE_INK,
  TOTALS_LABEL,
  FIELD_LABEL,
  FIELD_INPUT,
  FIELD_SELECT,
  FORM_ACTIONS,
  FORM_SAVE_BUTTON,
  FORM_STATUS,
} from '../../lib/ui-classes';

interface Props {
  today: string;
  dateDisplay: string;
  nextLogbookNumber: number;
  logbookEntries: NumberedEntry[];
  logbookSettings: LogbookSettings;
}

interface Status {
  text: string;
  state?: 'ok' | 'error';
}

export default function LogbookForm({ today, dateDisplay, nextLogbookNumber, logbookEntries, logbookSettings }: Props) {
  const [entries, setEntries] = useState(logbookEntries);
  const [nextNumber, setNextNumber] = useState(nextLogbookNumber);
  const [editingAt, setEditingAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(() => new Set());
  // Seeded from props, but replaceable in place by "Refresh profiles"
  // below — everything that reads the saved Places/Equipment/Aircraft/
  // Jump types goes through this state, not the `logbookSettings` prop
  // directly, so a refresh actually reaches the dropdowns.
  const [settings, setSettings] = useState(logbookSettings);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormFields>(() => emptyForm(today, settings));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ text: '' });
  const formRef = useRef<HTMLFormElement>(null);

  const editingEntry = editingAt ? entries.find((e) => e.at === editingAt) : undefined;
  const displayNumber = editingEntry ? editingEntry.number : nextNumber;

  function enterAddMode() {
    setEditingAt(null);
    setForm(emptyForm(today, settings));
  }

  function enterEditMode(entry: NumberedEntry) {
    setEditingAt(entry.at);
    setForm(formFromEntry(entry, settings));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Re-fetches the saved Places/Equipment/Aircraft/Jump types from the
  // server — the only way this island finds out about an edit made in the
  // Settings sub-tab, since the two don't otherwise talk to each other
  // (see the file header comment).
  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/logbook-settings');
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data.settings);
    } catch (err) {
      console.error('Failed to refresh saved profiles', err);
    } finally {
      setRefreshing(false);
    }
  }

  function toggleExpanded(at: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(at)) next.delete(at);
      else next.add(at);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus({ text: 'Saving…' });
    try {
      const res = await fetch('/api/logbook', {
        method: editingAt ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(form, settings, editingAt)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Failed to save');
      }
      const data = await res.json();
      setEntries(data.entries);
      setNextNumber(data.nextNumber);
      setStatus({ text: editingAt ? 'Saved' : 'Logged', state: 'ok' });
      enterAddMode();
      window.setTimeout(() => setStatus({ text: '' }), 2000);
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : 'Failed to save', state: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(at: string) {
    setPendingDelete((prev) => new Set(prev).add(at));
    try {
      const res = await fetch('/api/logbook', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ at }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setEntries(data.entries);
      setNextNumber(data.nextNumber);
      // If the jump being deleted was the one open in the edit form, drop
      // back to add mode rather than leaving a stale edit target.
      if (editingAt === at) enterAddMode();
    } catch (err) {
      console.error('Failed to delete jump', err);
    } finally {
      setPendingDelete((prev) => {
        const next = new Set(prev);
        next.delete(at);
        return next;
      });
    }
  }

  return (
    <>
      <header className={MASTHEAD}>
        <div className={STAMP} aria-hidden="false">
          <span className={STAMP_LABEL}>Logbook</span>
          <span className={STAMP_DATE}>{dateDisplay}</span>
        </div>
        <div className={TOTALS}>
          <div className={TOTALS_BLOCK_FLEX}>
            <span className={TOTALS_VALUE_INK}>{nextNumber - 1}</span>
            <span className={TOTALS_LABEL}>jumps logged</span>
          </div>
        </div>
      </header>

      <section className="bg-panel border border-line rounded-card shadow-card px-4 pt-3.5 pb-4">
        <div className="flex items-baseline justify-between gap-2 mb-2.5">
          <h2 className="m-0 text-[17px] font-bold tracking-[-0.01em]">{editingAt ? 'Edit jump' : 'Log a jump'}</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="appearance-none border-0 bg-transparent text-ink-soft font-sans text-[12.5px] font-semibold cursor-pointer p-0 underline disabled:opacity-60 disabled:cursor-default"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Re-fetch the saved Places/Equipment/Aircraft/Jump types from Settings"
            >
              {refreshing ? 'Refreshing…' : 'Refresh profiles'}
            </button>
            <span className="font-mono font-semibold text-sm text-gold">#{displayNumber}</span>
          </div>
        </div>
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-0 max-[420px]:grid-cols-1">
            <label className={FIELD_LABEL}>
              <span>Date *</span>
              <input
                type="date"
                className={FIELD_INPUT}
                required
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <label className={FIELD_LABEL}>
              <span>Place</span>
              <select
                className={FIELD_SELECT}
                value={form.placeId}
                onChange={(e) => setForm((f) => ({ ...f, placeId: e.target.value }))}
              >
                <option value="">No place selected</option>
                {settings.places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD_LABEL}>
              <span>Exit altitude</span>
              <input
                type="text"
                className={FIELD_INPUT}
                placeholder="e.g. 13,000 ft"
                autoComplete="off"
                maxLength={120}
                value={form.altitude}
                onChange={(e) => setForm((f) => ({ ...f, altitude: e.target.value }))}
              />
            </label>
            <label className={FIELD_LABEL}>
              <span>Equipment</span>
              <select
                className={FIELD_SELECT}
                value={form.equipmentId}
                onChange={(e) => setForm((f) => ({ ...f, equipmentId: e.target.value }))}
              >
                <option value="">No equipment selected</option>
                {settings.equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD_LABEL}>
              <span>Aircraft</span>
              <select
                className={FIELD_SELECT}
                value={form.aircraftId}
                onChange={(e) => setForm((f) => ({ ...f, aircraftId: e.target.value }))}
              >
                <option value="">No aircraft selected</option>
                {settings.aircraft.map((ac) => (
                  <option key={ac.id} value={ac.id}>
                    {ac.plate}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD_LABEL}>
              <span>Jump type</span>
              <select
                className={FIELD_SELECT}
                value={form.jumpTypeId}
                onChange={(e) => setForm((f) => ({ ...f, jumpTypeId: e.target.value }))}
              >
                <option value="">No jump type selected</option>
                {settings.jumpTypes.map((jt) => (
                  <option key={jt.id} value={jt.id}>
                    {jt.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={FIELD_LABEL}>
            <span>Description</span>
            <textarea
              className={FIELD_INPUT}
              rows={3}
              placeholder="Freefall, exercises, canopy notes…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className={FORM_ACTIONS}>
            <button type="submit" className={FORM_SAVE_BUTTON} disabled={saving}>
              {editingAt ? 'Save changes' : 'Log jump'}
            </button>
            {editingAt && (
              <button
                type="button"
                className="appearance-none border-0 bg-transparent text-ink-soft font-sans text-[13px] font-semibold cursor-pointer p-0 underline"
                onClick={enterAddMode}
              >
                Cancel edit
              </button>
            )}
            <span className={FORM_STATUS} data-state={status.state} role="status">
              {status.text}
            </span>
          </div>
        </form>
      </section>

      <section className="bg-panel border border-line rounded-card shadow-card overflow-hidden">
        <ul className="list-none m-0 p-0">
          {entries.length === 0 ? (
            <li className="logbook-empty">No jumps logged yet.</li>
          ) : (
            entries.map((entry) => {
              const isExpanded = expanded.has(entry.at);
              return (
                <li key={entry.at} className="logbook-entry">
                  <button
                    type="button"
                    className="logbook-row"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpanded(entry.at)}
                  >
                    <span className="logbook-row-number">#{entry.number}</span>
                    <span className="logbook-row-date">{formatShortDate(entry.date)}</span>
                    <span className="logbook-row-place">{entry.place || '—'}</span>
                    <span className="logbook-row-chevron">&rsaquo;</span>
                  </button>
                  {isExpanded && (
                    <div className="logbook-details">
                      <dl className="logbook-details-grid">
                        <div>
                          <dt>Jump type</dt>
                          <dd>{dash(entry.jumpType)}</dd>
                        </div>
                        <div>
                          <dt>Exit altitude</dt>
                          <dd>{dash(entry.exitAltitude)}</dd>
                        </div>
                        <div>
                          <dt>Aircraft</dt>
                          <dd>{dash(entry.aircraft)}</dd>
                        </div>
                        <div>
                          <dt>Canopy</dt>
                          <dd>{dash(entry.canopy)}</dd>
                        </div>
                        <div>
                          <dt>Container</dt>
                          <dd>{dash(entry.container)}</dd>
                        </div>
                        <div>
                          <dt>AAD</dt>
                          <dd>{dash(entry.aad)}</dd>
                        </div>
                      </dl>
                      {entry.description && <p className="logbook-details-description">{entry.description}</p>}
                      <div className="logbook-details-actions">
                        <button type="button" className="logbook-edit" onClick={() => enterEditMode(entry)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="logbook-delete"
                          disabled={pendingDelete.has(entry.at)}
                          onClick={() => handleDelete(entry.at)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </section>
    </>
  );
}
