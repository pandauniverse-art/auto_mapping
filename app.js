const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");

const bgSelect = document.getElementById("bgSelect");
const contentSelect = document.getElementById("contentSelect");

const scanButton = document.getElementById("scanButton");
const addPointButton = document.getElementById("addPointButton");
const deletePointButton = document.getElementById("deletePointButton");
const resetButton = document.getElementById("resetButton");
const zoomSlider = document.getElementById("zoomSlider");

const stage = document.getElementById("stage");
const bgImg = document.getElementById("bgImg");

const mapped = document.getElementById("mapped");
const mapImg = document.getElementById("mapImg");
const mapVideo = document.getElementById("mapVideo");

const svg = document.getElementById("svg");
const poly = document.getElementById("poly");

const fileList = document.getElementById("fileList");
const bgInfo = document.getElementById("bgInfo");
const contentInfo = document.getElementById("contentInfo");
const modeInfo = document.getElementById("modeInfo");

const files = [];

let bgUrl = "";
let contentUrl = "";
let editMode = "move";
let currentZoom = 1;
let activePointIndex = -1;

let points = [
  { x: 160, y: 140 },
  { x: 620, y: 140 },
  { x: 620, y: 420 },
  { x: 160, y: 420 },
];

initialize();

function initialize() {
  mapped.classList.add("empty");

  fileInput.addEventListener("change", handleFileInput);
  folderInput.addEventListener("change", handleFolderInput);

  dropZone.addEventListener("dragover", handleDragOver);
  dropZone.addEventListener("dragleave", handleDragLeave);
  dropZone.addEventListener("drop", handleDrop);

  bgSelect.addEventListener("change", handleBackgroundSelect);
  contentSelect.addEventListener("change", handleContentSelect);

  scanButton.addEventListener("click", handleScan);
  addPointButton.addEventListener("click", toggleAddMode);
  deletePointButton.addEventListener("click", toggleDeleteMode);
  resetButton.addEventListener("click", resetPoints);
  zoomSlider.addEventListener("input", handleZoom);

  stage.addEventListener("click", handleStageClick);

  refreshFileUI();
  renderPoints();
}

function handleFileInput(event) {
  addFiles(Array.from(event.target.files || []));
  fileInput.value = "";
}

function handleFolderInput(event) {
  addFiles(Array.from(event.target.files || []));
  folderInput.value = "";
}

function handleDragOver(event) {
  event.preventDefault();
  dropZone.classList.add("over");
}

function handleDragLeave() {
  dropZone.classList.remove("over");
}

async function handleDrop(event) {
  event.preventDefault();
  dropZone.classList.remove("over");

  const droppedFiles = [];

  if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
    const items = Array.from(event.dataTransfer.items);

    for (const item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;

      if (entry) {
        const entryFiles = await readEntry(entry);
        droppedFiles.push(...entryFiles);
      } else {
        const file = item.getAsFile ? item.getAsFile() : null;
        if (file) droppedFiles.push(file);
      }
    }
  } else {
    droppedFiles.push(...Array.from(event.dataTransfer.files || []));
  }

  addFiles(droppedFiles);
}

function handleBackgroundSelect() {
  const index = Number(bgSelect.value);
  if (!Number.isNaN(index) && files[index]) {
    setBackground(files[index]);
  }
}

function handleContentSelect() {
  const index = Number(contentSelect.value);
  if (!Number.isNaN(index) && files[index]) {
    setContent(files[index]);
  }
}

function handleScan() {
  if (!bgImg.src) return;

  const width = bgImg.naturalWidth;
  const height = bgImg.naturalHeight;

  points = [
    { x: width * 0.18, y: height * 0.18 },
    { x: width * 0.82, y: height * 0.18 },
    { x: width * 0.82, y: height * 0.82 },
    { x: width * 0.18, y: height * 0.82 },
  ];

  modeInfo.textContent = "스캔 후보 적용";
  renderPoints();
  updateMapping();
}

function toggleAddMode() {
  if (editMode === "add") {
    editMode = "move";
    addPointButton.textContent = "포인트 추가";
    modeInfo.textContent = "이동";
  } else {
    editMode = "add";
    addPointButton.textContent = "포인트 추가 중";
    deletePointButton.textContent = "포인트 삭제";
    modeInfo.textContent = "포인트 추가";
  }

  renderPoints();
}

function toggleDeleteMode() {
  if (editMode === "delete") {
    editMode = "move";
    deletePointButton.textContent = "포인트 삭제";
    modeInfo.textContent = "이동";
  } else {
    editMode = "delete";
    deletePointButton.textContent = "포인트 삭제 중";
    addPointButton.textContent = "포인트 추가";
    modeInfo.textContent = "포인트 삭제";
  }

  renderPoints();
}

function resetPoints() {
  if (!bgImg.src) return;

  fitPointsToBackground();
  modeInfo.textContent = "초기화";
  renderPoints();
  updateMapping();
}

function handleZoom() {
  currentZoom = Number(zoomSlider.value) / 100;
  stage.style.transform = `scale(${currentZoom})`;
}

function handleStageClick(event) {
  if (editMode !== "add") return;
  if (event.target.classList.contains("pt")) return;

  const position = getStagePositionFromEvent(event);

  points.push(position);
  points = sortPointsClockwise(points);

  renderPoints();
  updateMapping();
}

function addFiles(newFiles) {
  const validFiles = newFiles.filter((file) => {
    return file && (file.type.startsWith("image/") || file.type.startsWith("video/"));
  });

  for (const file of validFiles) {
    const exists = files.some((item) => {
      return item.name === file.name &&
        item.size === file.size &&
        item.type === file.type;
    });

    if (!exists) files.push(file);
  }

  refreshFileUI();
  autoSelectFirstFiles();
}

function refreshFileUI() {
  bgSelect.innerHTML = "";
  contentSelect.innerHTML = "";
  fileList.innerHTML = "";

  bgSelect.appendChild(createOption("", "배경을 선택하세요"));
  contentSelect.appendChild(createOption("", "콘텐츠를 선택하세요"));

  files.forEach((file, index) => {
    const typeLabel = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
    const name = file.webkitRelativePath || file.name;
    const label = `${typeLabel} - ${name}`;

    if (file.type.startsWith("image/")) {
      bgSelect.appendChild(createOption(String(index), label));
    }

    contentSelect.appendChild(createOption(String(index), label));

    const item = document.createElement("div");
    item.textContent = label;
    fileList.appendChild(item);
  });
}

function createOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function autoSelectFirstFiles() {
  const firstImageIndex = files.findIndex((file) => file.type.startsWith("image/"));

  const firstContentIndex = files.findIndex((file, index) => {
    return index !== firstImageIndex &&
      (file.type.startsWith("image/") || file.type.startsWith("video/"));
  });

  if (!bgImg.getAttribute("src") && firstImageIndex >= 0) {
    bgSelect.value = String(firstImageIndex);
    setBackground(files[firstImageIndex]);
  }

  if (!contentUrl) {
    const index = firstContentIndex >= 0 ? firstContentIndex : firstImageIndex;

    if (index >= 0) {
      contentSelect.value = String(index);
      setContent(files[index]);
    }
  }
}

function setBackground(file) {
  if (bgUrl) URL.revokeObjectURL(bgUrl);

  bgUrl = URL.createObjectURL(file);

  bgImg.onload = function () {
    stage.style.width = `${bgImg.naturalWidth}px`;
    stage.style.height = `${bgImg.naturalHeight}px`;

    svg.setAttribute("width", bgImg.naturalWidth);
    svg.setAttribute("height", bgImg.naturalHeight);
    svg.setAttribute("viewBox", `0 0 ${bgImg.naturalWidth} ${bgImg.naturalHeight}`);

    bgInfo.textContent = file.name;
    modeInfo.textContent = "배경 적용";

    fitPointsToBackground();
    enableWorkspaceButtons();
    renderPoints();
    updateMapping();
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
    mapVideo.muted = true;
    mapVideo.loop = true;
    mapVideo.playsInline = true;

    mapVideo.play().catch(function () {
      modeInfo.textContent = "영상 선택됨";
    });

    modeInfo.textContent = "영상 매핑";
  } else {
    mapImg.src = contentUrl;
    mapImg.style.display = "block";
    modeInfo.textContent = "이미지 매핑";
  }

  contentInfo.textContent = file.name;
  updateMapping();
}

function enableWorkspaceButtons() {
  scanButton.disabled = false;
  addPointButton.disabled = false;
  deletePointButton.disabled = false;
  resetButton.disabled = false;
}

function fitPointsToBackground() {
  const width = bgImg.naturalWidth;
  const height = bgImg.naturalHeight;

  points = [
    { x: width * 0.2, y: height * 0.25 },
    { x: width * 0.75, y: height * 0.25 },
    { x: width * 0.75, y: height * 0.75 },
    { x: width * 0.2, y: height * 0.75 },
  ];
}

function renderPoints() {
  const oldHandles = stage.querySelectorAll(".pt");
  oldHandles.forEach((handle) => handle.remove());

  poly.setAttribute(
    "points",
    points.map((point) => `${point.x},${point.y}`).join(" ")
  );

  points.forEach((point, index) => {
    const handle = document.createElement("button");
    handle.className = "pt";

    if (editMode === "delete") {
      handle.classList.add("del");
    }

    handle.style.left = `${point.x}px`;
    handle.style.top = `${point.y}px`;
    handle.title = `Point ${index + 1}`;

    handle.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
      event.preventDefault();

      if (editMode === "delete") {
        if (points.length <= 4) {
          modeInfo.textContent = "최소 4점 필요";
          return;
        }

        points.splice(index, 1);
        points = sortPointsClockwise(points);
        renderPoints();
        updateMapping();
        return;
      }

      activePointIndex = index;
      window.addEventListener("pointermove", handlePointMove);
      window.addEventListener("pointerup", handlePointUp);
    });

    stage.appendChild(handle);
  });
}

function handlePointMove(event) {
  if (activePointIndex < 0) return;

  points[activePointIndex] = getStagePositionFromEvent(event);
  points = sortPointsClockwise(points);

  renderPoints();
  updateMapping();
}

function handlePointUp() {
  activePointIndex = -1;
  window.removeEventListener("pointermove", handlePointMove);
  window.removeEventListener("pointerup", handlePointUp);
}

function getStagePositionFromEvent(event) {
  const rect = stage.getBoundingClientRect();

  return {
    x: clamp((event.clientX - rect.left) / currentZoom, 0, bgImg.naturalWidth),
    y: clamp((event.clientY - rect.top) / currentZoom, 0, bgImg.naturalHeight),
  };
}

function updateMapping() {
  if (!bgImg.src || points.length < 4) return;

  const sourceWidth = 320;
  const sourceHeight = 180;
  const quad = getBoundingQuadFromPoints();

  const matrix = getProjectiveTransform(
    [
      { x: 0, y: 0 },
      { x: sourceWidth, y: 0 },
      { x: sourceWidth, y: sourceHeight },
      { x: 0, y: sourceHeight },
    ],
    quad
  );

  mapped.style.width = `${sourceWidth}px`;
  mapped.style.height = `${sourceHeight}px`;
  mapped.style.transform = matrixToCss(matrix);

  const clipPolygon = points.map((point) => `${point.x}px ${point.y}px`).join(", ");
  mapped.style.clipPath = `polygon(${clipPolygon})`;
}

function getBoundingQuadFromPoints() {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  const minX = Math.min.apply(null, xs);
  const maxX = Math.max.apply(null, xs);
  const minY = Math.min.apply(null, ys);
  const maxY = Math.max.apply(null, ys);

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function sortPointsClockwise(inputPoints) {
  const center = inputPoints.reduce(function (acc, point) {
    return {
      x: acc.x + point.x / inputPoints.length,
      y: acc.y + point.y / inputPoints.length,
    };
  }, { x: 0, y: 0 });

  return inputPoints.slice().sort(function (a, b) {
    const angleA = Math.atan2(a.y - center.y, a.x - center.x);
    const angleB = Math.atan2(b.y - center.y, b.x - center.x);
    return angleA - angleB;
  });
}

function getProjectiveTransform(sourcePoints, targetPoints) {
  const matrix = [];
  const vector = [];

  for (let i = 0; i < 4; i++) {
    const x = sourcePoints[i].x;
    const y = sourcePoints[i].y;
    const u = targetPoints[i].x;
    const v = targetPoints[i].y;

    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);

    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }

  const h = solveLinearSystem(matrix, vector);
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

function solveLinearSystem(matrix, vector) {
  const n = vector.length;

  for (let i = 0; i < n; i++) {
    let maxRow = i;

    for (let k = i + 1; k < n; k++) {
      if (Math.abs(matrix[k][i]) > Math.abs(matrix[maxRow][i])) {
        maxRow = k;
      }
    }

    const tempRow = matrix[i];
    matrix[i] = matrix[maxRow];
    matrix[maxRow] = tempRow;

    const tempValue = vector[i];
    vector[i] = vector[maxRow];
    vector[maxRow] = tempValue;

    const pivot = matrix[i][i] || 1e-12;

    for (let k = i + 1; k < n; k++) {
      const factor = matrix[k][i] / pivot;

      for (let j = i; j < n; j++) {
        matrix[k][j] -= factor * matrix[i][j];
      }

      vector[k] -= factor * vector[i];
    }
  }

  const result = new Array(n).fill(0);

  for (let i = n - 1; i >= 0; i--) {
    let sum = vector[i];

    for (let j = i + 1; j < n; j++) {
      sum -= matrix[i][j] * result[j];
    }

    result[i] = sum / (matrix[i][i] || 1e-12);
  }

  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readEntry(entry) {
  return new Promise(function (resolve) {
    if (entry.isFile) {
      entry.file(function (file) {
        resolve([file]);
      }, function () {
        resolve([]);
      });
      return;
    }

    if (entry.isDirectory) {
      const reader = entry.createReader();
      const allFiles = [];

      function readBatch() {
        reader.readEntries(async function (entries) {
          if (!entries.length) {
            resolve(allFiles);
            return;
          }

          for (const child of entries) {
            const childFiles = await readEntry(child);
            allFiles.push(...childFiles);
          }

          readBatch();
        }, function () {
          resolve(allFiles);
        });
      }

      readBatch();
      return;
    }

    resolve([]);
  });
}
