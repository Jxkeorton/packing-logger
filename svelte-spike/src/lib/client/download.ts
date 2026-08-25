// Direct port of the main app's lib/client/dom.ts downloadFile/wireDownloadButtons
// — every download here is behind the password gate, and a plain
// `<a href download>` doesn't reliably carry the login cookie on iOS
// Safari (a long-standing WebKit bug), so this fetches the bytes itself
// (which already carries the cookie correctly, same as every other
// request on this page) and hands the browser the blob directly.

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : fallback;
}

export async function downloadFile(url: string, fallbackName: string): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Download failed', url, res.status, await res.text());
      return { ok: false };
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
    return { ok: true };
  } catch (err) {
    console.error('Download failed', err);
    return { ok: false };
  }
}
