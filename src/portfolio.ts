// Paint the live layout using the browser's measured text ranges. This keeps
// line breaks, scroll offset and the explicit print on the sheet in sync.
import { sheetHeight, sheetWidth } from "./creases";
export const portfolio = document.querySelector<HTMLElement>("#portfolio")!;

// Gradient-filled text computes to a transparent colour. Use the first stop
// so the printed sheet still carries the headline ink.
function ink(style: CSSStyleDeclaration) {
  if (style.color !== "transparent" && style.color !== "rgba(0, 0, 0, 0)")
    return style.color;
  return (
    style.backgroundImage.match(/(?:rgba?\([^)]*\)|#[0-9a-f]{3,8})/i)?.[0] ??
    style.color
  );
}
function capturePage() {
  const w = window.innerWidth,
    h = window.innerHeight,
    aspect = sheetHeight / sheetWidth;
  const pw = Math.max(w, h * aspect),
    ph = pw / aspect;
  const scale = Math.min(
    window.devicePixelRatio || 1,
    2,
    2304 / Math.max(pw, ph),
  );
  const image = document.createElement("canvas");
  image.width = Math.round(pw * scale);
  image.height = Math.round(ph * scale);
  const ctx = image.getContext("2d")!;
  ctx.scale(image.width / pw, image.height / ph);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, pw, ph);
  ctx.translate((pw - w) / 2, (ph - h) / 2);
  ctx.textBaseline = "alphabetic";
  function paint(element: Element) {
    const style = getComputedStyle(element),
      box = element.getBoundingClientRect();
    if (style.display === "none") return;
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    for (const side of ["Top", "Bottom"] as const) {
      const thickness = parseFloat(style[`border${side}Width`]);
      if (!thickness) continue;
      ctx.fillStyle = style[`border${side}Color`];
      ctx.fillRect(
        box.x,
        side === "Top" ? box.y : box.bottom - thickness,
        box.width,
        thickness,
      );
    }
    for (const child of Array.from(element.childNodes)) {
      if (child instanceof Element) {
        paint(child);
        continue;
      }
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const content = child.textContent ?? "";
      for (const word of content.matchAll(/\S+/gu)) {
        const range = document.createRange();
        range.setStart(child, word.index!);
        range.setEnd(child, word.index! + word[0].length);
        const rect = range.getBoundingClientRect();
        if (!rect.height) continue;
        const text =
          style.textTransform === "uppercase"
            ? word[0].toUpperCase()
            : style.textTransform === "lowercase"
              ? word[0].toLowerCase()
              : style.textTransform === "capitalize"
                ? word[0][0].toUpperCase() + word[0].slice(1)
                : word[0];
        ctx.font =
          style.fontStyle +
          " " +
          style.fontWeight +
          " " +
          style.fontSize +
          " " +
          style.fontFamily;
        // Match the live page's tracking so large headings do not collide.
        ctx.letterSpacing =
          style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
        const metrics = ctx.measureText(text);
        const asc = metrics.fontBoundingBoxAscent,
          desc = metrics.fontBoundingBoxDescent;
        const baseline = rect.y + (rect.height - asc - desc) / 2 + asc;
        ctx.fillStyle = ink(style);
        ctx.fillText(text, rect.x, baseline);
        if (style.textDecorationLine.includes("underline"))
          ctx.fillRect(rect.x, baseline + 1, rect.width, 1);
      }
    }
  }
  paint(portfolio.firstElementChild!);
  return image;
}
export function waitForPortfolioClick(onActivate: () => void) {
  return new Promise<HTMLCanvasElement>((resolve) => {
    portfolio.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        onActivate();
        resolve(capturePage());
      },
      { once: true },
    );
  });
}
