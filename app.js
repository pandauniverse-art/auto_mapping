const $ = (id) => document.getElementById(id);

const dropZone = $("dropZone");
const fileInput = $("fileInput");
const folderInput = $("folderInput");
const bgSelect = $("bgSelect");
const contentSelect = $("contentSelect");
const scanAreaButton = $("scanAreaButton");
const scanButton = $("scanButton");
const addPointButton = $("addPointButton");
const deletePointButton = $("deletePointButton");
const resetButton = $("resetButton");
const guideToggle = $("guideToggle");
const zoomSlider = $("zoomSlider");

const stage = $("stage");
const bgImg = $("bgImg");
const mapped = $("mapped");
const mapImg = $("mapImg");
const mapVideo = $("mapVideo");
const overlay = $("overlay");
const poly = $("poly");
const scanRect = $("scanRect");
const scanCanvas = $("scanCanvas");

const fileList = $("fileList");
const bgInfo = $("bgInfo");
const contentInfo = $("contentInfo");
const modeInfo = $("modeInfo");

const files = [];
let bgUrl = "";
let contentUrl = "";
let zoom = 1;
let mode = "move";
let selectedPoint = -1;
let dragPoint = -1;
let scanStart = null;
let scanBox = null;

let points = [
  { x: 200, y: 180 },
  { x: 760, y: 180 },
  { x: 760, y: 560 },
  { x: 200, y: 560 },
];

init();

function init() {
  mapped.classList.add("empty");
  bindFileEvents();
  bindUiEvents();
  bindStageEvents();
  refreshLists();
  render();
}

function bindFileEvents() {
  fileInput.onchange = (e) => {
    addFiles([...e.target.files]);
    fileInput.value = "";
  };

  folderInput.onchange = (e) => {
    addFiles([...e.target.files]);
    folderInput.value = "";
  };

  ["dragenter", "dragover"].forEach((name) => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add("over");
    });
  });

  ["dragleave", "drop"].forEach((name) => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      if (name === "drop") handleDrop(e);
      dropZone.classList.remove("over");
    });
  });
}

async function handleDrop(e) {
  const dropped = [];
  const items = [...(e.dataTransfer.items || [])];

  if (items.length && items[0].webkitGetAsEntry) {
    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) dropped.push(...await readEntry(entry));
    }
  } else {
    dropped.push(...(e.dataTransfer.files || []));
  }

  addFiles(dropped);
}

function bindUiEvents() {
  bgSelect.onchange = () => files[+bgSelect.value] && setBackground(files[+bgSelect.value]);
  contentSelect.onchange = () => files[+contentSelect.value] && setContent(files[+contentSelect.value]);

  scanAreaButton.onclick = () => {
    mode = mode === "scanArea" ? "move" : "scanArea";
    modeInfo.textContent = mode === "scanArea" ? "스캔 영역 드래그" : "이동";
  };

  scanButton.onclick = () => {
    scanCurrentArea();
    render();
    updateMappedArea();
  };

  addPointButton.onclick = () => {
    mode = mode === "add" ? "move" : "add";
    modeInfo.textContent = mode === "add" ? "포인트 추가" : "이동";
    render();
  };

  deletePointButton.onclick = () => {
    if (selectedPoint >= 0 && points.length > 4) {
      points.splice(selectedPoint, 1);
      selectedPoint = -1;
      points = sortClockwise(points);
      render();
      updateMappedArea();
    }
  };

  resetButton.onclick = () => {
    fitDefaultPoints();
    selectedPoint = -1;
    scanBox = null;
    modeInfo.textContent = "초기화";
    render();
    updateMappedArea();
  };

  guideToggle.onchange = () => {
    stage.classList.toggle("hide-guides", !guideToggle.checked);
  };

  zoomSlider.oninput = () => {
    zoom = +zoomSlider.value / 100;
    stage.style.transform = `scale(${zoom})`;
  };

  window.addEventListener("keydown", handleKeyMove);
}

function bindStageEvents() {
  stage.addEventListener("pointerdown", (e) => {
    const pos = getStagePos(e);

    if (mode === "scanArea") {
      scanStart = pos;
      scanBox = { x: pos.x, y: pos.y, w: 1, h: 1 };
      render();
      return;
    }

    if (mode === "add" && e.target === overlay) {
      points.push(pos);
      points = sortClockwise(points);
      selectedPoint = points.length - 1;
      render();
      updateMappedArea();
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (scanStart) {
      const pos = getStagePos(e);
      scanBox = normalizeBox(scanStart, pos);
      render();
    }

    if (dragPoint >= 0) {
      points[dragPoint] = getStagePos(e);
      selectedPoint = dragPoint;
      render();
      updateMappedArea();
    }
  });

  stage.addEventListener("pointerup", () => {
    if (scanStart) {
      modeInfo.textContent = "스캔 영역 지정됨";
      scanStart = null;
    }

    dragPoint = -1;
  });
}

function addFiles(newFiles) {
  const valid = newFiles.filter((file) => {
    return file && (file.type.startsWith("image/") || file.type.startsWith("video/"));
  });

  valid.forEach((file) => {
    const exists = files.some((item) => item.name === file.name && item.size === file.size);
    if (!exists) files.push(file);
  });

  refreshLists();
  autoApplyFiles();
}

function refreshLists() {
  bgSelect.innerHTML = '<option value="">배경 선택</option>';
  contentSelect.innerHTML = '<option value="">콘텐츠 선택</option>';
  fileList.innerHTML = "";

  files.forEach((file, index) => {
    const type = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
    const name = file.webkitRelativePath || file.name;
    const label = `${type} - ${name}`;

    if (file.type.startsWith("image/")) bgSelect.add(new Option(label, index));
    contentSelect.add(new Option(label, index));

    const row = document.createElement("div");
    row.textContent = label;
    fileList.appendChild(row);
  });
}

function autoApplyFiles() {
  const firstImage = files.findIndex((f) => f.type.startsWith("image/"));
  const firstContent = files.findIndex((f, i) => i !== firstImage);

  if (!bgImg.getAttribute("src") && firstImage >= 0) {
    bgSelect.value = firstImage;
    setBackground(files[firstImage]);
  }

  if (!contentUrl) {
    const index = firstContent >= 0 ? firstContent : firstImage;
    if (index >= 0) {
      contentSelect.value = index;
      setContent(files[index]);
    }
  }
}

function setBackground(file) {
  if (bgUrl) URL.revokeObjectURL(bgUrl);
  bgUrl = URL.createObjectURL(file);

  bgImg.onload = () => {
    stage.style.width = `${bgImg.naturalWidth}px`;
    stage.style.height = `${bgImg.naturalHeight}px`;

    overlay.setAttribute("width", bgImg.naturalWidth);
    overlay.setAttribute("height", bgImg.naturalHeight);
    overlay.setAttribute("viewBox", `0 0 ${bgImg.naturalWidth} ${bgImg.naturalHeight}`);

    bgInfo.textContent = file.name;
    fitDefaultPoints();
    enableButtons();
    render();
    updateMappedArea();
  };

  bgImg.src = bgUrl;
}

function setContent(file) {
  if (contentUrl) URL.revokeObjectURL(contentUrl);
  contentUrl = URL.createObjectURL(file);

  mapped.classList.remove("empty");
  mapImg.style.display = "none";
  mapVideo.style.display = "none";
  mapImg.removeAttribute("src");
  mapVideo.pause();
  mapVideo.removeAttribute("src");
  mapVideo.load();

  if (file.type.startsWith("video/")) {
    mapVideo.src = contentUrl;
    mapVideo.style.display = "block";
    mapVideo.play().catch(() => {});
    modeInfo.textContent = "영상 적용";
  } else {
    mapImg.src = contentUrl;
    mapImg.style.display = "block";
    modeInfo.textContent = "이미지 적용";
  }

  contentInfo.textContent = file.name;
  updateMappedArea();
}

function enableButtons() {
  [scanAreaButton, scanButton, addPointButton, deletePointButton, resetButton].forEach((b) => {
    b.disabled = false;
  });
}

function fitDefaultPoints() {
  const w = bgImg.naturalWidth;
  const h = bgImg.naturalHeight;
  points = [
    { x: w * 0.2, y: h * 0.22 },
    { x: w * 0.8, y: h * 0.22 },
    { x: w * 0.8, y: h * 0.78 },
    { x: w * 0.2, y: h * 0.78 },
  ];
}

function render() {
  stage.querySelectorAll(".pt").forEach((el) => el.remove());

  poly.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));

  if (scanBox) {
    scanRect.style.display = "block";
    scanRect.setAttribute("x", scanBox.x);
    scanRect.setAttribute("y", scanBox.y);
    scanRect.setAttribute("width", scanBox.w);
    scanRect.setAttribute("height", scanBox.h);
  } else {
    scanRect.style.display = "none";
  }

  points.forEach((point, index) => {
    const handle = document.createElement("button");
    handle.className = "pt";
    if (index === selectedPoint) handle.classList.add("selected");
    handle.style.left = `${point.x}px`;
    handle.style.top = `${point.y}px`;

    handle.onpointerdown = (e) => {
      e.stopPropagation();
      selectedPoint = index;
      dragPoint = index;
      render();
    };

    stage.appendChild(handle);
  });
}

function updateMappedArea() {
  if (!bgImg.src || points.length < 3) return;

  const box = getBounds(points);
  mapped.style.left = `${box.x}px`;
  mapped.style.top = `${box.y}px`;
  mapped.style.width = `${box.w}px`;
  mapped.style.height = `${box.h}px`;

  const clip = points.map((p) => `${p.x - box.x}px ${p.y - box.y}px`).join(", ");
  mapped.style.clipPath = `polygon(${clip})`;
}

function scanCurrentArea() {
  if (!bgImg.src) return;

  const box = scanBox || getBounds(points);
  const canvas = scanCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = bgImg.naturalWidth;
  canvas.height = bgImg.naturalHeight;
  ctx.drawImage(bgImg, 0, 0);

  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const w = Math.max(2, Math.floor(box.w));
  const h = Math.max(2, Math.floor(box.h));
  const image = ctx.getImageData(x0, y0, w, h);
  const data = image.data;

  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }

  const avg = total / (data.length / 4);
  const rows = 9;
  const left = [];
  const right = [];

  for (let r = 0; r < rows; r++) {
    const y = Math.floor((h - 1) * (r / (rows - 1)));
    let minX = null;
    let maxX = null;

    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const hit = b < avg - 18 || b < 95;

      if (hit) {
        if (minX === null) minX = x;
        maxX = x;
      }
    }

    if (minX !== null && maxX !== null && maxX - minX > w * 0.12) {
      left.push({ x: x0 + minX, y: y0 + y });
      right.push({ x: x0 + maxX, y: y0 + y });
    }
  }

  if (left.length >= 2 && right.length >= 2) {
    points = [...left, ...right.reverse()];
    points = simplifyPoints(points, 12);
    modeInfo.textContent = "영역 스캔 적용";
  } else {
    points = [
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + h },
      { x: x0, y: y0 + h },
    ];
    modeInfo.textContent = "스캔 실패 - 영역 기준 적용";
  }

  selectedPoint = -1;
}

function handleKeyMove(e) {
  if (selectedPoint < 0) return;

  const step = e.shiftKey ? 10 : 1;
  const p = points[selectedPoint];

  if (e.key === "ArrowLeft") p.x -= step;
  else if (e.key === "ArrowRight") p.x += step;
  else if (e.key === "ArrowUp") p.y -= step;
  else if (e.key === "ArrowDown") p.y += step;
  else if (e.key === "Delete" && points.length > 4) {
    points.splice(selectedPoint, 1);
    selectedPoint = -1;
  } else {
    return;
  }

  e.preventDefault();
  render();
  updateMappedArea();
}

function getStagePos(e) {
  const rect = stage.getBoundingClientRect();
  return {
    x: clamp((e.clientX - rect.left) / zoom, 0, bgImg.naturalWidth || 99999),
    y: clamp((e.clientY - rect.top) / zoom, 0, bgImg.naturalHeight || 99999),
  };
}

function normalizeBox(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function getBounds(arr) {
  const xs = arr.map((p) => p.x);
  const ys = arr.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
}

function sortClockwise(arr) {
  const c = arr.reduce((a, p) => ({ x: a.x + p.x / arr.length, y: a.y + p.y / arr.length }), { x: 0, y: 0 });
  return arr.slice().sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
}

function simplifyPoints(arr, max) {
  if (arr.length <= max) return arr;
  const result = [];
  for (let i = 0; i < max; i++) {
    result.push(arr[Math.floor(i * arr.length / max)]);
  }
  return result;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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
            all.push(...await readEntry(child));
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
