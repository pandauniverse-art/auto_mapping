const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");

const bgSelect = document.getElementById("bgSelect");
const contentSelect = document.getElementById("contentSelect");
const resetQuadButton = document.getElementById("resetQuadButton");
const fitButton = document.getElementById("fitButton");

const stage = document.getElementById("stage");
const backgroundImage = document.getElementById("backgroundImage");
const mappedLayer = document.getElementById("mappedLayer");
const mappedImage = document.getElementById("mappedImage");
const mappedVideo = document.getElementById("mappedVideo");

const fileList = document.getElementById("fileList");
const bgInfo = document.getElementById("bgInfo");
const contentInfo = document.getElementById("contentInfo");
const modeInfo = document.getElementById("modeInfo");

const handles = [
  document.getElementById("h0"),
  document.getElementById("h1"),
  document.getElementById("h2"),
  document.getElementById("h3"),
];

const files = [];
let bgUrl = null;
let contentUrl = null;
let activeHandle = null;

let quad = [
  { x: 160, y: 120 },
  { x: 640, y: 120 },
  { x: 640, y: 390 },
  { x: 160, y: 390 },
];

fileInput.addEventListener("change", (event) => {
  addFiles(Array.from(event.target.files));
});

folderInput.addEventListener("change", (event) => {
  addFiles(Array.from(event.target.files));
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-over");
});

dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-over");

  const items = Array.from(event.dataTransfer.items || []);
  if (items.length && items[0].webkitGetAsEntry) {
    const droppedFiles = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        const entryFiles = await readEntry(entry);
        droppedFiles.push(...entryFiles);
      }
    }
    addFiles(droppedFiles);
  } else {
    addFiles(Array.from(event.dataTransfer.files || []));
  }
});

bgSelect.addEventListener("change", () => {
  const file = files[Number(bgSelect.value)];
  if (file) setBackground(file);
});

contentSelect.addEventListener("change", () => {
  const file = files[Number(contentSelect.value)];
  if (file) setContent(file);
});

resetQuadButton.addEventListener("click", () => {
  resetQuad();
  updateWarp();
});

fitButton.addEventListener("click", () => {
  fitQuadToCenter();
  updateWarp();
});

handles.forEach((handle, index) => {
  handle.addEventListener("pointerdown", (event) => {
    activeHandle = index;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (activeHandle !== index) return;

    const rect = stage.getBoundingClientRect();
    quad[index] = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    updateWarp();
  });

  handle.addEventListener("pointerup", () => {
    activeHandle = null;
  });
});

window.addEventListener("resize", () => {
  if (backgroundImage.src) {
    fitQuadToCenter();
    updateWarp();
  }
});

function addFiles(newFiles) {
  const valid = newFiles.filter((file) =>
    file.type.startsWith("image/") || file.type.startsWith("video/")
  );

  for (const file of valid) {
    const exists = files.some((item) => item.name === file.name && item.size === file.size);
    if (!exists) files.push(file);
  }

  refreshFileUI();

  if (!backgroundImage.src) {
    const firstImage = files.find((file) => file.type.startsWith("image/"));
    if (firstImage) setBackground(firstImage);
  }

  if (!contentUrl) {
    const firstContent = files.find((file) => file.type.startsWith("video/")) ||
      files.find((file) => file.type.startsWith("image/") && file !== getCurrentBgFile());

    if (firstContent) setContent(firstContent);
  }
}

function refreshFileUI() {
  bgSelect.innerHTML = "";
  contentSelect.innerHTML = "";
  fileList.innerHTML = "";

  files.forEach((file, index) => {
    const label = `${file.type.startsWith("video/") ? "VIDEO" : "IMAGE"} - ${file.name}`;

    if (file.type.startsWith("image/")) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = label;
      bgSelect.appendChild(option);
    }

    const contentOption = document.createElement("option");
    contentOption.value = String(index);
    contentOption.textContent = label;
    contentSelect.appendChild(contentOption);

    const item = document.createElement("div");
    item.textContent = label;
    fileList.appendChild(item);
  });
}

function getCurrentBgFile() {
  if (!bgSelect.value) return null;
  return files[Number(bgSelect.value)] || null;
}

function setBackground(file) {
  if (bgUrl) URL.revokeObjectURL(bgUrl);
  bgUrl = URL.createObjectURL(file);

  backgroundImage.onload = () => {
    bgInfo.textContent = file.name;
    modeInfo.textContent = "배경 적용";
    fitQuadToCenter();
    showHandles(true);
    updateWarp();
    resetQuadButton.disabled = false;
    fitButton.disabled = false;
  };

  backgroundImage.src = bgUrl;

  const index = files.indexOf(file);
  if (index >= 0) bgSelect.value = String(index);
}

function setContent(file) {
  if (contentUrl) URL.revokeObjectURL(contentUrl);
  contentUrl = URL.createObjectURL(file);

  mappedImage.style.display = "none";
  mappedVideo.style.display = "none";
  mappedVideo.pause();
  mappedVideo.removeAttribute("src");
  mappedImage.removeAttribute("src");

  if (file.type.startsWith("video/")) {
    mappedVideo.src = contentUrl;
    mappedVideo.style.display = "block";
    mappedVideo.play().catch(() => {});
    modeInfo.textContent = "영상 매핑";
  } else {
    mappedImage.src = contentUrl;
    mappedImage.style.display = "block";
    modeInfo.textContent = "이미지 매핑";
  }

  contentInfo.textContent = file.name;

  const index = files.indexOf(file);
  if (index >= 0) contentSelect.value = String(index);

  updateWarp();
}

function resetQuad() {
  const rect = stage.getBoundingClientRect();
  const w = Math.max(320, rect.width * 0.55);
  const h = Math.max(180, rect.height * 0.38);
  const x = (rect.width - w) / 2;
  const y = (rect.height - h) / 2;

  quad = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function fitQuadToCenter() {
  const rect = stage.getBoundingClientRect();
  const w = rect.width * 0.5;
  const h = rect.height * 0.32;
  const x = rect.width * 0.25;
  const y = rect.height * 0.34;

  quad = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function updateWarp() {
  if (!backgroundImage.src) return;

  const width = 320;
  const height = 180;

  mappedLayer.style.width = `${width}px`;
  mappedLayer.style.height = `${height}px`;

  const matrix = getProjectiveTransform(
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    quad
  );

  mappedLayer.style.transform = matrixToCss(matrix);

  handles.forEach((handle, index) => {
    handle.style.left = `${quad[index].x}px`;
    handle.style.top = `${quad[index].y}px`;
  });
}

function showHandles(show) {
  handles.forEach((handle) => {
    handle.style.display = show ? "block" : "none";
  });
}

function getProjectiveTransform(src, dst) {
  const a = [];
  const b = [];

  for (let i = 0; i < 4; i++) {
    const x = src[i].x;
    const y = src[i].y;
    const u = dst[i].x;
    const v = dst[i].y;

    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);

    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem(a, b);
  h.push(1);

  return [
    h[0], h[1], h[2],
    h[3], h[4], h[5],
    h[6], h[7], h[8],
  ];
}

function matrixToCss(h) {
  const a = h[0];
  const b = h[3];
  const c = 0;
  const d = h[6];

  const e = h[1];
  const f = h[4];
  const g = 0;
  const i = h[7];

  const j = 0;
  const k = 0;
  const l = 1;
  const m = 0;

  const n = h[2];
  const o = h[5];
  const p = 0;
  const q = h[8];

  return `matrix3d(${a},${b},${c},${d},${e},${f},${g},${i},${j},${k},${l},${m},${n},${o},${p},${q})`;
}

function solveLinearSystem(a, b) {
  const n = b.length;

  for (let i = 0; i < n; i++) {
    let maxRow = i;

    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) {
        maxRow = k;
      }
    }

    [a[i], a[maxRow]] = [a[maxRow], a[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    const pivot = a[i][i] || 1e-12;

    for (let k = i + 1; k < n; k++) {
      const factor = a[k][i] / pivot;

      for (let j = i; j < n; j++) {
        a[k][j] -= factor * a[i][j];
      }

      b[k] -= factor * b[i];
    }
  }

  const x = new Array(n).fill(0);

  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];

    for (let j = i + 1; j < n; j++) {
      sum -= a[i][j] * x[j];
    }

    x[i] = sum / (a[i][i] || 1e-12);
  }

  return x;
}

function readEntry(entry) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => resolve([file]), () => resolve([]));
      return;
    }

    if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];

      function readBatch() {
        reader.readEntries(async (entries) => {
          if (!entries.length) {
            resolve(all);
            return;
          }

          for (const child of entries) {
            const childFiles = await readEntry(child);
            all.push(...childFiles);
          }

          readBatch();
        }, () => resolve(all));
      }

      readBatch();
      return;
    }

    resolve([]);
  });
}
