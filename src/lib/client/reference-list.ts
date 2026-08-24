// The Logbook tab has four small "saved profile" lists — Places,
// Equipment, Aircraft, Jump types — that are all the same shape of
// feature: a form that POSTs a new one, a list that renders them with a
// "make default" star and a delete button, and a `<select>` back in the
// main log-a-jump form that has to stay in sync with both. Equipment
// carries a few extra fields (canopy/container/AAD) that the others
// don't, but otherwise the four are identical, so this factory wires one
// from a small config instead of repeating the CRUD/render wiring four
// times over.
import { escapeHtml } from './dom';

export interface ReferenceItem {
  id: string;
}

/** Markup for one list row's "make default" star — shared by every reference list. */
export function defaultStarHtml(category: string, categoryLabel: string, id: string, isDefault: boolean, label: string): string {
  return `<button type="button" class="default-star" data-default-category="${category}" data-default-id="${id}" aria-pressed="${isDefault}" aria-label="Set ${escapeHtml(label)} as the default ${categoryLabel}">&#9733;</button>`;
}

export interface ReferenceListConfig<T extends ReferenceItem> {
  /** e.g. "place" — sent to the shared /api/logbook-defaults endpoint. */
  category: string;
  /** e.g. "/api/places" — used for both the create (POST) and delete (DELETE) calls. */
  apiPath: string;
  listElId: string;
  formElId: string;
  statusElId: string;
  /** The `<select>` in the main log-a-jump form this list's options feed, if any. */
  selectEl: HTMLSelectElement | null;
  emptyListHtml: string;
  optionsHtml: (items: T[], defaultId: string | null) => string;
  rowHtml: (item: T, isDefault: boolean) => string;
  /** Reads and validates the form's fields into a create-request payload; return null to abort the submit (e.g. empty required field). */
  readForm: () => Record<string, unknown> | null;
  getItems: (settings: any) => T[];
  getDefaultId: (settings: any) => string | null;
  /** Runs when a star anywhere among the four lists is clicked — shared because one click updates all four at once. */
  onStarClick: (star: HTMLButtonElement) => void;
}

export interface ReferenceListHandle<T extends ReferenceItem> {
  /** Re-renders the list and the linked `<select>` from a fresh settings payload. */
  apply(items: T[], defaultId: string | null): void;
}

export function wireReferenceList<T extends ReferenceItem>(config: ReferenceListConfig<T>): ReferenceListHandle<T> {
  const { selectEl } = config;

  function listHtml(items: T[], defaultId: string | null): string {
    if (items.length === 0) return config.emptyListHtml;
    return items.map((item) => config.rowHtml(item, item.id === defaultId)).join('');
  }

  function apply(items: T[], defaultId: string | null) {
    const list = document.getElementById(config.listElId);
    if (list) list.innerHTML = listHtml(items, defaultId);
    if (selectEl) {
      // Only re-apply a previous selection if the user (or edit mode)
      // actually chose one — see markTouched in LogbookTab. Otherwise let
      // the freshly rendered default (marked via the `selected` attribute)
      // stand rather than forcing it back to "unselected".
      const touched = selectEl.dataset.userTouched === 'true';
      const previous = selectEl.value;
      selectEl.innerHTML = config.optionsHtml(items, defaultId);
      if (touched && Array.from(selectEl.options).some((o) => o.value === previous)) {
        selectEl.value = previous;
      }
    }
  }

  const form = document.getElementById(config.formElId) as HTMLFormElement | null;
  const list = document.getElementById(config.listElId);
  const status = document.getElementById(config.statusElId);

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = config.readForm();
    if (!payload) return;
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    if (status) {
      status.textContent = 'Saving…';
      status.removeAttribute('data-state');
    }

    try {
      const res = await fetch(config.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Failed to save');
      }
      const data = await res.json();
      apply(config.getItems(data.settings), config.getDefaultId(data.settings));
      form.reset();
      if (status) {
        status.textContent = 'Saved';
        status.dataset.state = 'ok';
      }
    } catch (err) {
      console.error(`Failed to save ${config.category}`, err);
      if (status) {
        status.textContent = err instanceof Error ? err.message : 'Failed to save';
        status.dataset.state = 'error';
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  list?.addEventListener('click', async (event) => {
    const star = (event.target as HTMLElement).closest<HTMLButtonElement>('.default-star');
    if (star) {
      config.onStarClick(star);
      return;
    }

    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ref-delete]');
    const id = button?.dataset.refDelete;
    if (!id) return;
    button.disabled = true;
    try {
      const res = await fetch(config.apiPath, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return;
      const data = await res.json();
      apply(config.getItems(data.settings), config.getDefaultId(data.settings));
    } catch (err) {
      console.error(`Failed to delete ${config.category}`, err);
    } finally {
      button.disabled = false;
    }
  });

  return { apply };
}
