// Shared Tailwind utility-class strings for patterns repeated across the
// Packing, Tandems and Logbook tabs — the masthead, the totals strip, the
// category cards, the collapsible toggle-panel, history tables, forms and
// footer. Named constants rather than the same long class string
// hand-copied at every call site: change the look of "a collapsible
// panel" once here, not once per tab.
//
// These only cover markup that's rendered once by Astro and never
// replaced via innerHTML — see PackingTab.astro's <style> block for why
// client-rendered lists (tandem jumps, logbook entries, reference-list
// rows) stay as plain CSS classes instead.

// ---- App shell ----

export const APP_VIEW = 'flex flex-col gap-[22px] [&[hidden]]:hidden';

// ---- Masthead (date stamp + totals strip) ----

export const MASTHEAD = 'flex flex-col gap-4';
export const STAMP =
  'self-start flex flex-col gap-0.5 px-4 py-2 border-2 border-dashed border-line-strong rounded-[10px] -rotate-[1.5deg] text-ink';
export const STAMP_LABEL = 'font-mono text-[11px] tracking-[0.14em] uppercase text-gold';
export const STAMP_DATE = 'font-display font-bold text-[19px] tracking-[-0.01em]';

export const TOTALS = 'flex items-center gap-4 px-[18px] py-4 bg-panel border border-line rounded-card shadow-card';
export const TOTALS_BLOCK = 'flex flex-col gap-0.5';
export const TOTALS_BLOCK_FLEX = `${TOTALS_BLOCK} flex-1`;
export const TOTALS_VALUE =
  'font-display font-bold text-[34px] leading-none tracking-[-0.02em] [font-variant-numeric:tabular-nums]';
export const TOTALS_VALUE_GOLD = `${TOTALS_VALUE} text-gold`;
export const TOTALS_VALUE_INK = `${TOTALS_VALUE} text-ink`;
export const TOTALS_LABEL = 'text-xs text-ink-soft uppercase tracking-[0.08em]';
export const TOTALS_DIVIDER = 'w-px self-stretch bg-line';

// ---- Category cards ----

export const CATEGORIES_LIST = 'flex flex-col gap-3 min-[480px]:gap-3.5';
export const CARD =
  'bg-panel border border-line rounded-card px-4 pt-3.5 pb-4 shadow-card border-l-[5px] border-l-[var(--accent,var(--line-strong))]';
export const CARD_TOP = 'flex items-baseline justify-between gap-2';
export const CARD_LABEL = 'm-0 text-[17px] font-bold tracking-[-0.01em]';
export const CARD_RATE = 'font-mono text-xs text-ink-soft';
export const CARD_SUBTOTAL = 'mt-2 text-right font-mono text-[13px] text-ink-soft';

// ---- Collapsible toggle-panel (History, Invoice details, Places, ...) ----

export const TOGGLE_SECTION = 'bg-panel border border-line rounded-card overflow-hidden';
export const TOGGLE_BUTTON =
  'group w-full flex items-center justify-between bg-transparent border-0 px-4 py-3.5 font-sans font-semibold text-[15px] text-ink cursor-pointer';
export const TOGGLE_ICON = 'transition-transform duration-150 ease text-xl text-ink-soft group-aria-expanded:rotate-90';
export const TOGGLE_PANEL = 'border-t border-line pt-1 pb-2';
export const TOGGLE_PANEL_PADDED = 'px-4 pt-3.5 pb-4';

// ---- Day/Week/Month history sub-tabs + table ----

export const HISTORY_TABS = 'flex gap-1.5 px-4 pt-2.5 pb-1.5';
export const HISTORY_TAB =
  'appearance-none border border-line bg-transparent text-ink-soft font-sans font-semibold text-[12.5px] px-3 py-1.5 rounded-full cursor-pointer aria-selected:bg-ink aria-selected:border-ink aria-selected:text-canvas';
export const HISTORY_EMPTY = 'm-0 px-4 py-3.5 text-ink-soft text-sm';
export const HISTORY_SCROLL = 'overflow-x-auto px-2';
export const HISTORY_TABLE = 'w-full border-collapse font-mono text-[12.5px] whitespace-nowrap';
export const HISTORY_THEAD_ROW = '[&>th]:text-ink-soft [&>th]:font-semibold [&>th]:border-b [&>th]:border-line';
export const HISTORY_TBODY_ROW = '[&>td]:border-b [&>td]:border-line last:[&>td]:border-b-0';
export const HISTORY_CELL_LEFT = 'p-2 text-left';
export const HISTORY_CELL_RIGHT = 'p-2 text-right';

// ---- Form fields (invoice details, places/equipment/aircraft/jump-types, settings) ----

export const FIELD_LABEL = 'flex flex-col gap-1 mb-3 text-[12.5px] font-semibold text-ink-soft';
export const FIELD_LABEL_NARROW = `${FIELD_LABEL} max-w-[160px]`;
export const FIELD_INPUT =
  'w-full px-3 py-2.5 rounded-[10px] border border-line-strong bg-canvas text-ink font-sans text-sm font-normal resize-y focus-visible:outline-[3px] focus-visible:outline-gold focus-visible:outline-offset-1';
export const FIELD_SELECT = `${FIELD_INPUT} h-10`;
export const FORM_ACTIONS = 'flex items-center gap-3 mt-1';
export const FORM_SAVE_BUTTON =
  'appearance-none border-0 rounded-[10px] h-[42px] px-5 font-display font-bold text-sm text-white bg-gold cursor-pointer touch-manipulation disabled:opacity-60 disabled:cursor-default';
export const FORM_STATUS = 'text-[12.5px] text-ink-soft data-[state=ok]:text-student data-[state=error]:text-danger';
export const PANEL_HINT = 'mt-0 mb-3.5 text-[12.5px] text-ink-soft';

// ---- Footer ----

export const FOOT = 'text-center';
export const FOOT_DOWNLOAD =
  'appearance-none inline-block border-0 bg-transparent p-0 font-sans text-[12.5px] font-semibold text-gold no-underline border-b border-current cursor-pointer disabled:opacity-60 disabled:cursor-default';
