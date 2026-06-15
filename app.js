const imageInput = document.getElementById("imageInput");
const scanButton = document.getElementById("scanButton");
const clearButton = document.getElementById("clearButton");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const imageInfo = document.getElementById("imageInfo");
const lineCount = document.getElementById("lineCount");
const horizontalCount = document.getElementById("horizontalCount");
const verticalCount = document.getElementById("verticalCount");

let sourceImage = null;
let sourceBitmap = null;

imageInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = async () => {
    sourceImage = img;
    sourceBitmap = img;

    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / img.width);

    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    drawBaseImage();

    imageInfo.textContent = `${img.width} x ${img.height}`;
    scanButton.disabled = false;
    clearButton.disabled = false;

    resetStats();
    URL.revokeObjectURL(url);
  };

  img.src = url;
});

scanButton.addEventListener("click", () => {
  if (!sourceBitmap) return;

  drawBaseImage();

  const edgeMap = detectEdges();
  const lines = detectStrongLines(edgeMap);

  drawLines(lines);

  const horizontal = lines.filter((line) => line.type === "horizontal");
  const vertical = lines.filter((line) => line.type === "vertical");

  lineCount.textContent = String(lines.length);
  horizontalCount.textContent = String(horizontal.length);
  verticalCount.textContent = String(vertical.length);
});

clearButton.addEventListener("click", () => {
  drawBaseImage();
  resetStats();
});

function drawBaseImage() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceBitmap, 0, 0, canvas.width, canvas.height);
}

function resetStats() {
  lineCount.textContent = "0";
  horizontalCount.textContent = "0";
  verticalCount.textContent = "0";
}

function detectEdges() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  const gray = new Uint8ClampedArray(width * height);
  const edges = new Uint8ClampedArray(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;

      const gx =
        -gray[(y - 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] +
        gray[(y + 1) * width + (x + 1)];

      const gy =
        -gray[(y - 1) * width + (x - 1)] -
        2 * gray[(y - 1) * width + x] -
        gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        gray[(y + 1) * width + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[i] = magnitude > 95 ? 255 : 0;
    }
  }

  return {
    width,
    height,
    data: edges,
  };
}

function detectStrongLines(edgeMap) {
  const { width, height, data } = edgeMap;
  const lines = [];

  const horizontalStep = Math.max(4, Math.floor(height / 180));
  const verticalStep = Math.max(4, Math.floor(width / 220));

  for (let y = 0; y < height; y += horizontalStep) {
    let hits = 0;

    for (let x = 0; x < width; x++) {
      if (data[y * width + x] > 0) hits++;
    }

    const ratio = hits / width;

    if (ratio > 0.16) {
      lines.push({
        type: "horizontal",
        score: ratio,
        x1: 0,
        y1: y,
        x2: width,
        y2: y,
      });
    }
  }

  for (let x = 0; x < width; x += verticalStep) {
    let hits = 0;

    for (let y = 0; y < height; y++) {
      if (data[y * width + x] > 0) hits++;
    }

    const ratio = hits / height;

    if (ratio > 0.16) {
      lines.push({
        type: "vertical",
        score: ratio,
        x1: x,
        y1: 0,
        x2: x,
        y2: height,
      });
    }
  }

  return mergeNearbyLines(lines);
}

function mergeNearbyLines(lines) {
  const merged = [];
  const threshold = 14;

  const horizontal = lines
    .filter((line) => line.type === "horizontal")
    .sort((a, b) => a.y1 - b.y1);

  const vertical = lines
    .filter((line) => line.type === "vertical")
    .sort((a, b) => a.x1 - b.x1);

  mergeGroup(horizontal, "horizontal");
  mergeGroup(vertical, "vertical");

  function mergeGroup(group, type) {
    let current = null;

    for (const line of group) {
      if (!current) {
        current = { ...line };
        continue;
      }

      const distance =
        type === "horizontal"
          ? Math.abs(line.y1 - current.y1)
          : Math.abs(line.x1 - current.x1);

      if (distance < threshold) {
        if (line.score > current.score) current = { ...line };
      } else {
        merged.push(current);
        current = { ...line };
      }
    }

    if (current) merged.push(current);
  }

  return merged
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}

function drawLines(lines) {
  ctx.save();
  ctx.lineWidth = 2;

  for (const line of lines) {
    ctx.beginPath();

    if (line.type === "horizontal") {
      ctx.strokeStyle = "rgba(0, 255, 255, 0.85)";
    } else {
      ctx.strokeStyle = "rgba(255, 80, 180, 0.85)";
    }

    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }

  ctx.restore();
}
