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

const handles = ["h0", "h1", "h2", "h3"].map((id) => document.getElementById(id));

const files = [];
let bgUrl = "";
let contentUrl = "";
let activeHandle = null;

let quad = [
  { x: 120, y: 90 },
  { x: 520, y: 90 },
  { x: 520, y: 320 },
  { x: 120, y: 320 },
];

mappedLayer.classList.add("is-empty");
showHandles(false);

fileInput.addEventListener("change", (event) => {
  addFiles(Array.from(event.target.files || []));
  fileInput.value = "";
});

folderInput.addEventListener("change", (event) => {
  addFiles(Array.from(event.target.files || []));
  folderInput.value = "";
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
  const droppedFiles = [];

  if (items.length && items[0].webkitGetAsEntry) {
    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        const entryFiles = await readEntry(entry);
        droppedFiles.push(...entryFiles);
      }
    }
  } else {
    droppedFiles.push(...Array.from(event.dataTransfer.files || []));
  }

  addFiles(droppedFiles);
});

bgSelect.addEventListener("change", () => {
  const index = Number(bgSelect.value);
  if (!Number.isNaN(index) && files[index]) setBackground(files[index]);
});

contentSelect.addEventListener("change", () => {
  const index = Number(contentSelect.value);
  if (!Number.isNaN(index) && files[index]) setContent(files[index]);
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

  handle.addEventListener("pointercancel", () => {
    activeHandle = null;
  });
});

function addFiles(newFiles) {
  const validFiles = newFiles.filter((file) => {
    return file && (file.type.startsWith("image/") || file.type.startsWith("video/"));
  });

  for (const file of validFiles) {
    const exists = files.some((item) => {
      return item.name === file.name && item.size === file.size && item.type === file.type;
    });

    if (!exists) files.push(file);
  }

  refreshFileUI();

  const firstImageIndex = files.findIndex((file) => file.type.startsWith("image/"));
  const firstContentIndex = files.findIndex((file, index) => {
    return index !== firstImageIndex && (file.type.startsWith("image/") || file.type.startsWith("video/"));
  });

  if (!backgroundImage.getAttribute("src") && firstImageIndex >= 0) {
    bgSelect.value = String(firstImageIndex);
    setBackground(files[firstImageIndex]);
  }

  if (!contentUrl) {
    const contentIndex = firstContentIndex >= 0 ? firstContentIndex : firstImageIndex;
    if (contentIndex >= 0) {
      contentSelect.value = String(contentIndex);
      setContent(files[contentIndex]);
    }
  }
}

function refreshFileUI() {
  bgSelect.innerHTML = "";
  contentSelect.innerHTML = "";
  fileList.innerHTML = "";

  const bgPlaceholder = document.createElement("option");
  bgPlaceholder.value = "";
  bgPlaceholder.textContent = "배경을 선택하세요";
  bgSelect.appendChild(bgPlaceholder);

  const contentPlaceholder = document.createElement("option");
  contentPlaceholder.value = "";
  contentPlaceholder.textContent = "콘텐츠를 선택하세요";
  contentSelect.appendChild(contentPlaceholder);

  files.forEach((file, index) => {
    const typeLabel = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
    const label = `${typeLabel} - ${file.webkitRelativePath || file.name}`;

    if (file.type.startsWith("image/")) {
      const bgOption = document.createElement("option");
      bgOption.value = String(index);
      bgOption.textContent = label;
      bgSelect.appendChild(bgOption);
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

function setBackground(file) {
  if (bgUrl) URL.revokeObjectURL(bgUrl);
  bgUrl = URL.createObjectURL(file);

  backgroundImage.onload = () => {
    bgInfo.textContent = file.name;
    modeInfo.textContent = "배경 적용됨";

    fitQuadToCenter();
    showHandles(true);
    updateWarp();

    resetQuadButton.disabled = false;
    fitButton.disabled = false;
  };

  backgroundImage.src = bgUrl;
}

function setContent(file) {
  if (contentUrl) URL.revokeObjectURL(contentUrl);
  contentUrl = URL.createObjectURL(file);

  mappedLayer.classList.remove("is-empty");
  mappedLayer.classList.add("is-active");

  mappedImage.style.display = "none";
  mappedVideo.style.display = "none";

  mappedImage.removeAttribute("src");
  mappedVideo.pause();
  mappedVideo.removeAttribute("src");
  mappedVideo.load();

  if (file.type.startsWith("video/")) {
    mappedVideo.src = contentUrl;
    mappedVideo.style.display = "block";
    mappedVideo.muted = true;
    mappedVideo.loop = true;
    mappedVideo.playsInline = true;

    mappedVideo.play().catch(() => {
      modeInfo.textContent = "영상 선택됨";
    });

    modeInfo.textContent = "영상 매핑";
  } else {
    mappedImage.src = contentUrl;
    mappedImage.style.display = "block";
    modeInfo.textContent = "이미지 매핑";
  }

  contentInfo.textContent = file.name;
  updateWarp();
}

function fitQuadToCenter() {
  const rect = stage.getBoundingClientRect();

  const w = rect.width * 0.5;
  const h = Math.max(120, rect.height * 0.32);
  const x = rect.width * 0.25;
  const y = Math.max(40, rect.height * 0.32);

  quad = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function resetQuad() {
  fitQuadToCenter();
}

function updateWarp() {
  if (!backgroundImage.getAttribute("src")) return;

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

  return h;
}

function matrixToCss(h) {
  return `matrix3d(
    ${h[0]}, ${h[3]}, 0, ${h[6]},
    ${h[1]}, ${h[4]}, 0, ${h[7]},
    0, 0, 1, 0,
    ${h[2]}, ${h[5]}, 0, ${h[8]}
  )`;
}

function solveLinearSystem(a, b) {
  const n = b.length;

  for (let i = 0; i < n; i++) {
    let maxRow = i;

    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) maxRow = k;
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

      const readBatch = () => {
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
      };

      readBatch();
      return;
    }

    resolve([]);
  });
}
