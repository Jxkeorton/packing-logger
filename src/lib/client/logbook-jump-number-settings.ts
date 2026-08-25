// The Logbook tab's "jumps logged before this app" starting-number
// setting. Saving it shifts every jump number downstream, so it refreshes
// the entry list + total via applyLogbookState from logbook-jump-form.ts
// rather than patching numbers in place.
import { applyLogbookState } from './logbook-jump-form';

export function initLogbookJumpNumberSettings() {
  const logbookSettingsForm = document.getElementById('logbookSettingsForm') as HTMLFormElement | null;
  const logbookSettingsStatus = document.getElementById('logbookSettingsStatus');
  const logbookBaseJumps = document.getElementById('logbookBaseJumps') as HTMLInputElement | null;

  logbookSettingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = logbookSettingsForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    if (logbookSettingsStatus) {
      logbookSettingsStatus.textContent = 'Saving…';
      logbookSettingsStatus.removeAttribute('data-state');
    }

    try {
      const res = await fetch('/api/logbook-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseJumps: Number(logbookBaseJumps?.value ?? 0) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Failed to save');
      }
      // Every jump number downstream shifts with the base, so refetch the
      // full list rather than patching numbers in place.
      const listRes = await fetch('/api/logbook');
      if (listRes.ok) {
        const listData = await listRes.json();
        applyLogbookState(listData.entries, listData.nextNumber);
      }
      if (logbookSettingsStatus) {
        logbookSettingsStatus.textContent = 'Saved';
        logbookSettingsStatus.dataset.state = 'ok';
      }
    } catch (err) {
      console.error('Failed to save logbook settings', err);
      if (logbookSettingsStatus) {
        logbookSettingsStatus.textContent = err instanceof Error ? err.message : 'Failed to save';
        logbookSettingsStatus.dataset.state = 'error';
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}
