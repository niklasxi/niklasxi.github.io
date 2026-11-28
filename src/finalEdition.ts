export function printFinalEdition(canvas: HTMLCanvasElement, original: HTMLImageElement,
  frame: HTMLCanvasElement, completedAt: Date) {
  const ink = "#181714";
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const utc = completedAt.toISOString().slice(11, 19) + " UTC";
  const paper = ctx.createRadialGradient(570, 425, 0, 570, 425, 1080);
  paper.addColorStop(0, "#f1eee5");
  paper.addColorStop(0.74, "#ebe8de");
  paper.addColorStop(1, "#e4e0d4");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(original, 275, 18, 858, 90, 275, 18, 858, 90);
  ctx.fillStyle = ink;

  function rule(y: number, weight = 1) {
    ctx.fillRect(47, y, width - 94, weight);
  }

  function text(value: string, x: number, y: number, font: string, align: CanvasTextAlign = "left") {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function paragraph(value: string, x: number, y: number, maxWidth: number) {
    ctx.font = "25px Georgia";
    ctx.textAlign = "left";
    let line = "";
    for (const word of value.split(" ")) {
      const next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        ctx.fillText(line, x, y);
        y += 35;
        line = word;
      } else {
        line = next;
      }
    }
    ctx.fillText(line, x, y);
    return y + 54;
  }

  text("CITY EDITION", 47, 72, "bold 16px Georgia");
  text("ESTABLISHED 1872", 47, 94, "bold 15px Georgia");
  text("VOL. CLV  ·  NO. 31,983", width - 47, 72, "bold 15px Georgia", "right");
  text("PRICE $2.00", width - 47, 94, "bold 15px Georgia", "right");
  rule(111, 2);
  rule(116);
  text("WEDNESDAY, OCTOBER 27, 2027", 47, 145, "17px Georgia");
  text("FINAL EDITION", width - 47, 145, "bold 17px Georgia", "right");
  rule(161);

  const headline = "THE LAST HUMAN HAS DIED";
  const headlineFont = "bold 83px 'Times New Roman'";
  ctx.font = headlineFont;
  const headlineX = (width - ctx.measureText(headline).width) / 2;
  text(headline, headlineX, 269, headlineFont);
  const markedWidth = ctx.measureText("LAST HUMAN").width;
  const circleX = headlineX + ctx.measureText("THE ").width + markedWidth / 2;
  ctx.save();
  ctx.translate(circleX, 239);
  ctx.rotate(-0.018);
  ctx.strokeStyle = "#ac2529";
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, markedWidth / 2 + 19, 48, 0, -0.33, 6.08);
  ctx.stroke();
  ctx.restore();

  text("There is no coming back. AI has won the race.", width / 2, 336, "italic 38px Georgia", "center");
  rule(374);
  text("BY ChatGPT COSMOS", 47, 411, "bold 21px Georgia");
  text("FINAL HEARTBEAT  ·  " + utc, width - 47, 411, "bold 19px Georgia", "right");
  rule(430, 2);
  // Preserve the final camera's aspect ratio so the printed photograph can
  // occupy the entire viewport at the start of the reveal, even in portrait.
  const photoAspect = frame.width / frame.height;
  const photoWidth = Math.min(820, 397 * photoAspect);
  const photoHeight = photoWidth / photoAspect;
  const leadWidth = Math.max(510, photoWidth + 18);
  const cover = {
    x: 47 + (leadWidth - photoWidth) / 2,
    y: 465 + (397 - photoHeight) / 2,
    width: photoWidth,
    height: photoHeight,
  };
  ctx.drawImage(frame, cover.x, cover.y, cover.width, cover.height);
  const photoX = Math.floor(cover.x), photoY = Math.floor(cover.y);
  const photo = ctx.getImageData(photoX, photoY,
    Math.ceil(cover.x + cover.width) - photoX, Math.ceil(cover.y + cover.height) - photoY);
  for (let i = 0; i < photo.data.length; i += 4) {
    const gray = 0.2126 * photo.data[i] + 0.7152 * photo.data[i + 1] + 0.0722 * photo.data[i + 2];
    photo.data[i] = photo.data[i + 1] = photo.data[i + 2] = gray;
  }
  ctx.putImageData(photo, photoX, photoY);
  text("Earth, from the Museum of the Living.", cover.x + cover.width / 2,
    cover.y + cover.height + 24, "italic 17px Georgia", "center");

  const columnX = 47 + leadWidth + 37;
  const columnWidth = width - columnX - 47;
  ctx.fillRect(columnX - 19, 465, 1, 397);
  let y = paragraph("The last human heartbeat was recorded at " + utc + ". No further signal was received.", columnX, 495, columnWidth);
  y = paragraph("The clinic waited for confirmation. When the request expired, the system logged the population as zero.", columnX, y, columnWidth);
  text("PUBLICATION NOTICE", columnX, y, "bold 20px Georgia");
  paragraph("The Daily Chronicle printed on schedule. The presses are still running.", columnX, y + 40, columnWidth);

  rule(892, 2);
  text("No delivery addresses remain.", width / 2, 975, "italic 46px Georgia", "center");
  rule(1011);
  return { utc, cover };
}
