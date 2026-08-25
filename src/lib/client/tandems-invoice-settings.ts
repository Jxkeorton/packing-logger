// The Tandems tab's invoice letterhead settings form (your details, who
// it's billed to, next invoice number) — used when exporting a month's
// invoice PDF from the History panel's Month view.

export function initTandemInvoiceSettings() {
  const invoiceSettingsForm = document.getElementById('invoiceSettingsForm') as HTMLFormElement | null;
  const invoiceSettingsStatus = document.getElementById('invoiceSettingsStatus');

  invoiceSettingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fromName = (document.getElementById('invoiceFromName') as HTMLInputElement | null)?.value ?? '';
    const fromAddress = (document.getElementById('invoiceFromAddress') as HTMLTextAreaElement | null)?.value ?? '';
    const vatNote = (document.getElementById('invoiceVatNote') as HTMLInputElement | null)?.value ?? '';
    const billTo = (document.getElementById('invoiceBillTo') as HTMLTextAreaElement | null)?.value ?? '';
    const nextInvoiceRef = Number(
      (document.getElementById('invoiceNextRef') as HTMLInputElement | null)?.value ?? '',
    );

    const submitButton = invoiceSettingsForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    if (invoiceSettingsStatus) {
      invoiceSettingsStatus.textContent = 'Saving…';
      invoiceSettingsStatus.removeAttribute('data-state');
    }

    try {
      const res = await fetch('/api/invoice-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromName, fromAddress, vatNote, billTo, nextInvoiceRef }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Failed to save');
      }
      if (invoiceSettingsStatus) {
        invoiceSettingsStatus.textContent = 'Saved';
        invoiceSettingsStatus.dataset.state = 'ok';
      }
    } catch (err) {
      console.error('Failed to save invoice settings', err);
      if (invoiceSettingsStatus) {
        invoiceSettingsStatus.textContent = err instanceof Error ? err.message : 'Failed to save';
        invoiceSettingsStatus.dataset.state = 'error';
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}
