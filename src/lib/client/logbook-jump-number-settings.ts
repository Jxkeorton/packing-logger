// The Logbook tab's "jumps logged before this app" starting-number
// setting. Saving it shifts every jump number downstream — the Log
// sub-tab's entry list is a React island (see components/islands/
// LogbookForm.tsx) with its own state, so rather than reaching into it
// from here, a successful save just reloads the page: the simplest way
// to get every dependent number back in sync, and this form is edited
// rarely enough that a reload is no real cost.
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
      window.location.reload();
    } catch (err) {
      console.error('Failed to save logbook settings', err);
      if (logbookSettingsStatus) {
        logbookSettingsStatus.textContent = err instanceof Error ? err.message : 'Failed to save';
        logbookSettingsStatus.dataset.state = 'error';
      }
      if (submitButton) submitButton.disabled = false;
    }
  });
}
