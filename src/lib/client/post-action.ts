// For the few triggers that call a named form action directly instead of
// submitting a <form> (see instructions.md §3 for why they exist). Callers
// still `await invalidateAll()` themselves, because several of them close a
// modal or collapse a row *between* the POST landing and the reload, and
// folding the reload in here would quietly reorder that.

/**
 * POSTs `fields` to `?/<action>`. `true` is sent as 'on' and `false` or
 * `undefined` is omitted, the same way a real checkbox would submit, so
 * the server side can keep reading `formData.get(x) === 'on'`.
 */
export async function postAction(
  action: string,
  fields: Record<string, string | number | boolean | undefined>,
): Promise<Response> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === true) formData.set(key, 'on');
    else if (value !== false && value !== undefined) formData.set(key, String(value));
  }
  return fetch(`?/${action}`, { method: 'POST', body: formData });
}
