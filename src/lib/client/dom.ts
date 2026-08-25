// Small browser-side DOM helpers shared by more than one tab's script.
// Nothing here talks to an API or knows about a specific feature — it's
// generic wiring (tab groups, collapsible panels, file downloads) reused
// across the Packing, Tandems and Logbook tabs.

/**
 * Wires up a group of tab buttons and their matching views. Scoped to
 * `root` so that two independent tab groups (e.g. the app-level Packing /
 * Tandems tabs, and a Day / Week / Month history group nested inside one
 * of them) can reuse the same class names/data attributes without
 * cross-wiring each other's visibility.
 */
export function wireTabGroup(
  root: ParentNode,
  tabSelector: string,
  viewSelector: string,
  tabAttr: string,
  viewAttr: string,
) {
  const tabs = root.querySelectorAll<HTMLButtonElement>(tabSelector);
  const views = root.querySelectorAll<HTMLElement>(viewSelector);
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      views.forEach((view) => {
        view.hidden = view.dataset[viewAttr] !== tab.dataset[tabAttr];
      });
    });
  });
}

/** Wires a single collapsible `<button aria-expanded>` / panel pair. */
export function wireToggle(toggleId: string, panelId: string) {
  const toggle = document.getElementById(toggleId);
  const panel = document.getElementById(panelId);
  toggle?.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    if (panel) panel.hidden = expanded;
  });
}

/** Restarts the `.bump` pop animation, even on rapid repeat taps. */
export function bump(el: Element | null) {
  if (!el) return;
  el.classList.remove('bump');
  // Force reflow so the animation can restart on rapid taps.
  void (el as HTMLElement).offsetWidth;
  el.classList.add('bump');
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function money(n: number): string {
  return `£${n.toFixed(2)}`;
}

// ---- Single-value `<select>` matching ----
//
// Several dropdowns (Logbook's Place/Aircraft/Jump type — Equipment is its
// own case, since it matches on three fields at once) share the same
// "which option has this label?" logic: mark the field as user-touched, and
// leave it on "none selected" if nothing matches.

/** Flags a select as deliberately chosen, so a later options rebuild (see reference-list.ts's `apply`) re-applies this value instead of snapping back to the fresh default. */
export function markTouched(select: HTMLSelectElement | null) {
  select?.setAttribute('data-user-touched', 'true');
}

/** The selected option's label — but '' for the placeholder option (value=""), whose own textContent ("No place selected" etc.) isn't a real value. */
export function selectedOptionText(select: HTMLSelectElement | null): string {
  if (!select?.value) return '';
  return select.selectedOptions[0]?.textContent ?? '';
}

/** Selects whichever option's label matches `text` exactly, or falls back to "none selected" (e.g. the saved profile was since renamed or deleted). */
export function selectOptionByText(select: HTMLSelectElement | null, text: string) {
  if (!select) return;
  markTouched(select);
  for (const option of Array.from(select.options)) {
    if (option.textContent === text) {
      select.value = option.value;
      return;
    }
  }
  select.value = '';
}

// ---- File downloads ----
//
// Every download on this page is behind the password gate. A plain
// `<a href download>` doesn't reliably carry the login cookie on iOS
// Safari (a long-standing WebKit bug), so instead of letting Safari fetch
// the URL itself, we fetch it ourselves — which we already know carries
// the cookie correctly, since every other API call on this page does —
// and hand the browser the bytes directly as a blob.

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : fallback;
}

export async function downloadFile(url: string, fallbackName: string, button: HTMLButtonElement) {
  const originalText = button.textContent;
  button.disabled = true;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Download failed', url, res.status, await res.text());
      button.textContent = 'Export failed';
      window.setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
      return;
    }
    const blob = await res.blob();
    const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), fallbackName);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  } catch (err) {
    console.error('Download failed', err);
  } finally {
    button.disabled = false;
  }
}

/** Wires every `[data-download]` button under `root` to `downloadFile`. */
export function wireDownloadButtons(root: ParentNode) {
  root.querySelectorAll<HTMLButtonElement>('[data-download]').forEach((button) => {
    button.addEventListener('click', () => {
      void downloadFile(button.dataset.download!, button.dataset.downloadName || 'download', button);
    });
  });
}
