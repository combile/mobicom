"use client";

/**
 * The unread count, shown where a browser can show it.
 *
 * The desktop shell has a dock badge and a taskbar overlay; a browser tab has
 * neither. What it has is a title and a favicon, and both are worth using — a
 * tab sitting in a row of twenty is only findable by those two things.
 *
 * The favicon is redrawn rather than swapped between prebuilt images: the
 * number changes, and shipping a file per possible count is not a thing anyone
 * should do.
 */

const BASE_TITLE = "MOBICOM — Mobile Computing";
const ICON_HREF = "/icon.svg";

let baseImage: HTMLImageElement | null = null;
let baseImageFailed = false;

/** The <link rel="icon"> this module owns, created once and reused. */
function badgeLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link[data-mobion-badge]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.setAttribute("data-mobion-badge", "");
    document.head.appendChild(link);
  }
  return link;
}

/** Removes our icon so the one Next.js declared takes over again. */
function clearBadgeIcon() {
  document.querySelector("link[data-mobion-badge]")?.remove();
}

function loadBaseImage(): Promise<HTMLImageElement | null> {
  if (baseImage) return Promise.resolve(baseImage);
  if (baseImageFailed) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      resolve(img);
    };
    img.onerror = () => {
      // Draw the badge on a plain ground rather than giving up — the count is
      // the part that matters, the artwork is not.
      baseImageFailed = true;
      resolve(null);
    };
    img.src = ICON_HREF;
  });
}

async function drawFavicon(count: number) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = await loadBaseImage();
  if (img) {
    ctx.drawImage(img, 0, 0, size, size);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
  }

  // Bottom-right, overlapping the edge the way every platform draws it.
  const label = count > 99 ? "99+" : String(count);
  const r = label.length > 2 ? 22 : 19;
  const cx = size - r + 4;
  const cy = size - r + 4;

  // A ring in the page's own background separates the badge from whatever it
  // sits on, which is what keeps it readable against a dark icon.
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${label.length > 2 ? 22 : 28}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 1);

  badgeLink().href = canvas.toDataURL("image/png");
}

/**
 * Reflects `count` in the tab title and favicon. Zero restores both.
 *
 * Safe to call whenever the count changes, and a no-op outside the browser.
 */
export function applyUnreadBadge(count: number): void {
  if (typeof document === "undefined") return;

  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  document.title = n > 0 ? `(${n > 99 ? "99+" : n}) ${BASE_TITLE}` : BASE_TITLE;

  if (n === 0) {
    clearBadgeIcon();
    return;
  }
  void drawFavicon(n);
}
