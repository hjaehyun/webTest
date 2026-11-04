"use client";

// Saves the day's picture as a PNG. Today the picture is the SVG placeholder from
// components/Art.tsx; once the image AI fills Artwork.imageUrl, download that file instead.

const SIZE = 1024;

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Renders an inline <svg> onto a canvas and downloads it as PNG. */
export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(SIZE));
  copy.setAttribute("height", String(SIZE));
  const markup = new XMLSerializer().serializeToString(copy);
  const src = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(img, 0, 0, SIZE, SIZE);

    const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!png) throw new Error("PNG encoding failed");
    save(png, filename);
  } finally {
    URL.revokeObjectURL(src);
  }
}
