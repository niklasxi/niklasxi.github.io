import backPageUrl from "./assets/daily-chronicle-back.webp?url";
import { printFinalEdition } from "./finalEdition";

export const portfolio = document.querySelector<HTMLElement>("#portfolio")!;
const sheet = document.querySelector<HTMLButtonElement>("#newspaper-sheet")!;
const turn = document.querySelector<HTMLButtonElement>("#turn-newspaper")!;
const beginJourney = document.querySelector<HTMLButtonElement>("#begin-journey")!;
export const newspaper = sheet.querySelector<HTMLImageElement>(".newspaper-front")!;
export const reversePage = sheet.querySelector<HTMLImageElement>(".newspaper-back")!;
const about = document.querySelector<HTMLButtonElement>("#about-button")!;
const dialog = document.querySelector<HTMLDialogElement>("#about-page")!;
let craneView: Promise<() => void> | undefined;
about.addEventListener("click", async () => {
  dialog.showModal();
  try {
    craneView ??= import("./aboutCranes").then(module => module.createAboutCranes(dialog));
    const draw = await craneView;
    if (dialog.open) draw();
  } catch (error) {
    craneView = undefined;
    console.warn("The hanging crane model could not be loaded.", error);
  }
});
const finalEdition = sheet.querySelector<HTMLCanvasElement>(".newspaper-final")!;
reversePage.src = backPageUrl;
let frontLabel = "Fold the newspaper. Front page: AI Harvesting Humans.";

let backFacing = false;
let turnTimer = 0;

function finishTurn() {
  window.clearTimeout(turnTimer);
  sheet.classList.remove("is-turning");
}

function showSide(back: boolean) {
  backFacing = back;
  sheet.dataset.side = back ? "back" : "front";
  sheet.setAttribute("aria-label", back
    ? "Fold the newspaper. Reverse page: The Last Offline District."
    : frontLabel);
  turn.setAttribute("aria-pressed", String(back));
}

sheet.addEventListener("transitionend", (event) => {
  if (event.propertyName === "transform") finishTurn();
});

turn.addEventListener("click", () => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishTurn();
  } else {
    sheet.classList.add("is-turning");
    window.clearTimeout(turnTimer);
    turnTimer = window.setTimeout(finishTurn, 600);
  }
  showSide(!backFacing);
});

export function revealFinalEdition(frame: HTMLCanvasElement, completedAt: Date) {
  const { utc, cover } = printFinalEdition(finalEdition, newspaper, frame, completedAt);
  frontLabel = "Fold the newspaper. Final edition: The last human has died. "
    + "Final heartbeat at " + utc + ". By ChatGPT COSMOS. No delivery addresses remain.";
  newspaper.hidden = true;
  finalEdition.hidden = false;
  return { canvas: finalEdition, cover };
}

export function resetNewspaper() {
  finishTurn();
  showSide(false);
  sheet.disabled = false;
  turn.hidden = turn.disabled = false;
  beginJourney.hidden = beginJourney.disabled = false;
  about.hidden = about.disabled = false;
  sheet.focus({ preventScroll: true });
}

export async function zoomOutFromCover(cover: ReturnType<typeof revealFinalEdition>["cover"]) {
  finishTurn();
  showSide(false);
  sheet.disabled = true;
  turn.hidden = turn.disabled = true;
  beginJourney.hidden = beginJourney.disabled = true;
  about.hidden = true;
  const page = sheet.getBoundingClientRect();
  const view = portfolio.getBoundingClientRect();
  const units = page.width / finalEdition.width;
  const scale = Math.max(view.width / (cover.width * units), view.height / (cover.height * units));
  const x = (finalEdition.width / 2 - cover.x - cover.width / 2) * units * scale;
  const y = (finalEdition.height / 2 - cover.y - cover.height / 2) * units * scale;
  portfolio.classList.add("revealing-edition");
  try {
    await sheet.animate([
      { transform: "translate(" + x + "px," + y + "px) scale(" + scale + ")" },
      { transform: "none" },
    ], { duration: 2700, easing: "cubic-bezier(.45,.15,.15,1)" }).finished.catch(() => {});
  } finally {
    portfolio.classList.remove("revealing-edition");
    resetNewspaper();
  }
}

export function waitForPortfolioClick(onActivate: () => void) {
  return new Promise<boolean>((resolve) => {
    function activate(event: MouseEvent) {
      const control = event.target instanceof Element ? event.target.closest("button") : null;
      if (control && control !== sheet && control !== beginJourney) return;
      finishTurn();
      portfolio.removeEventListener("click", activate);
      // Keep the selected face stable while the WebGL scene finishes loading.
      turn.disabled = beginJourney.disabled = about.disabled = true;
      onActivate();
      resolve(backFacing);
    }
    portfolio.addEventListener("click", activate);
  });
}
