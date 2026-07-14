"use strict";

const draftKey = "elfRoastRecordDraft";
const historyKey = "elfRoastRecordHistory";
const logLength = 16;

const form = document.getElementById("roastForm");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const historyCount = document.getElementById("historyCount");
const historyCardTemplate = document.getElementById("historyCardTemplate");

const fields = {
  roastIdDisplay: document.getElementById("roastIdDisplay"),
  date: document.getElementById("date"),
  airTemperature: document.getElementById("airTemperature"),
  country: document.getElementById("country"),
  farm: document.getElementById("farm"),
  variety: document.getElementById("variety"),
  process: document.getElementById("process"),
  altitude: document.getElementById("altitude"),
  greenWeight: document.getElementById("greenWeight"),
  chargeTemperature: document.getElementById("chargeTemperature"),
  roastedWeight: document.getElementById("roastedWeight"),
  weightLoss: document.getElementById("weightLoss"),
  bottomTime: document.getElementById("bottomTime"),
  bottomTemp: document.getElementById("bottomTemp"),
  dryEndTime: document.getElementById("dryEndTime"),
  dryEndTemp: document.getElementById("dryEndTemp"),
  firstCrackTime: document.getElementById("firstCrackTime"),
  firstCrackTemp: document.getElementById("firstCrackTemp"),
  endTempTime: document.getElementById("endTempTime"),
  endTempTemp: document.getElementById("endTempTemp"),
  dryTime: document.getElementById("dryTime"),
  dryRatio: document.getElementById("dryRatio"),
  maillardTime: document.getElementById("maillardTime"),
  maillardRatio: document.getElementById("maillardRatio"),
  developmentTime: document.getElementById("developmentTime"),
  developmentRatio: document.getElementById("developmentRatio"),
  totalTime: document.getElementById("totalTime"),
  totalRatio: document.getElementById("totalRatio"),
  memo: document.getElementById("memo")
};

let currentRoastId = "";

function getTodayValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSelectedWeather() {
  const selectedWeather = form.querySelector("input[name='weather']:checked");
  return selectedWeather ? selectedWeather.value : "";
}

function setSelectedWeather(value) {
  form.querySelectorAll("input[name='weather']").forEach((input) => {
    input.checked = input.value === value;
  });
}

function createEmptyLogs() {
  // ログ表はVersion1仕様どおり0:00から15:00までの16行固定にする。
  return Array.from({ length: logLength }, (item, minute) => ({
    minute,
    temperature: "",
    ror: "",
    gas: "",
    damper: ""
  }));
}

function collectLogs() {
  const logs = createEmptyLogs();
  document.querySelectorAll("[data-log-index]").forEach((input) => {
    const index = Number(input.dataset.logIndex);
    const field = input.dataset.logField;
    logs[index][field] = input.value;
  });
  return logs;
}

function fillLogs(logs) {
  const safeLogs = Array.isArray(logs) ? logs : createEmptyLogs();
  document.querySelectorAll("[data-log-index]").forEach((input) => {
    const index = Number(input.dataset.logIndex);
    const field = input.dataset.logField;
    input.value = safeLogs[index] && safeLogs[index][field] ? safeLogs[index][field] : "";
  });
}

function getRoastData() {
  // 指定されたJSON構造にそろえて、保存や履歴で同じ形を使い回す。
  return {
    roastId: currentRoastId,
    date: fields.date.value,
    weather: getSelectedWeather(),
    airTemperature: fields.airTemperature.value,
    country: fields.country.value,
    farm: fields.farm.value,
    variety: fields.variety.value,
    process: fields.process.value,
    altitude: fields.altitude.value,
    greenWeight: fields.greenWeight.value,
    chargeTemperature: fields.chargeTemperature.value,
    roastedWeight: fields.roastedWeight.value,
    weightLoss: fields.weightLoss.value,
    events: {
      bottom: { time: fields.bottomTime.value, temp: fields.bottomTemp.value },
      dryEnd: { time: fields.dryEndTime.value, temp: fields.dryEndTemp.value },
      firstCrack: { time: fields.firstCrackTime.value, temp: fields.firstCrackTemp.value },
      endTemp: { time: fields.endTempTime.value, temp: fields.endTempTemp.value }
    },
    phases: {
      dry: { time: fields.dryTime.value, ratio: fields.dryRatio.value },
      maillard: { time: fields.maillardTime.value, ratio: fields.maillardRatio.value },
      development: { time: fields.developmentTime.value, ratio: fields.developmentRatio.value },
      total: fields.totalTime.value
    },
    logs: collectLogs(),
    memo: fields.memo.value
  };
}

function fillForm(data) {
  const safeData = data || {};
  currentRoastId = safeData.roastId || "";
  fields.roastIdDisplay.value = currentRoastId || "未保存";
  fields.date.value = safeData.date || getTodayValue();
  setSelectedWeather(safeData.weather || "");
  fields.airTemperature.value = safeData.airTemperature || "";
  fields.country.value = safeData.country || "";
  fields.farm.value = safeData.farm || "";
  fields.variety.value = safeData.variety || "";
  fields.process.value = safeData.process || "";
  fields.altitude.value = safeData.altitude || "";
  fields.greenWeight.value = safeData.greenWeight || "";
  fields.chargeTemperature.value = safeData.chargeTemperature || "";
  fields.roastedWeight.value = safeData.roastedWeight || "";
  fields.weightLoss.value = safeData.weightLoss || "";
  fields.bottomTime.value = safeData.events?.bottom?.time || "";
  fields.bottomTemp.value = safeData.events?.bottom?.temp || "";
  fields.dryEndTime.value = safeData.events?.dryEnd?.time || "";
  fields.dryEndTemp.value = safeData.events?.dryEnd?.temp || "";
  fields.firstCrackTime.value = safeData.events?.firstCrack?.time || "";
  fields.firstCrackTemp.value = safeData.events?.firstCrack?.temp || "";
  fields.endTempTime.value = safeData.events?.endTemp?.time || "";
  fields.endTempTemp.value = safeData.events?.endTemp?.temp || "";
  fields.memo.value = safeData.memo || "";
  fillLogs(safeData.logs);
  calculateWeightLoss();
  calculatePhase();
}

function calculateWeightLoss() {
  const greenWeight = Number(fields.greenWeight.value);
  const roastedWeight = Number(fields.roastedWeight.value);

  if (greenWeight > 0 && roastedWeight >= 0) {
    const weightLoss = ((greenWeight - roastedWeight) / greenWeight) * 100;
    fields.weightLoss.value = weightLoss.toFixed(1);
    return;
  }

  fields.weightLoss.value = "";
}

function parseTimeToSeconds(value) {
  const trimmedValue = String(value).trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.includes(":")) {
    const parts = trimmedValue.split(":").map(Number);
    const minutes = parts[0];
    const seconds = parts[1];

    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return minutes * 60 + seconds;
    }
  }

  const minutesOnly = Number(trimmedValue);
  return Number.isFinite(minutesOnly) ? minutesOnly * 60 : null;
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatRatio(seconds, totalSeconds) {
  if (!Number.isFinite(seconds) || !Number.isFinite(totalSeconds) || totalSeconds <= 0 || seconds < 0) {
    return "";
  }

  return `${((seconds / totalSeconds) * 100).toFixed(1)}%`;
}

function calculatePhase() {
  // Bottomが未入力の場合は焙煎開始を0:00として扱う。
  const bottom = parseTimeToSeconds(fields.bottomTime.value) ?? 0;
  const dryEnd = parseTimeToSeconds(fields.dryEndTime.value);
  const firstCrack = parseTimeToSeconds(fields.firstCrackTime.value);
  const endTemp = parseTimeToSeconds(fields.endTempTime.value);

  if (dryEnd === null || firstCrack === null || endTemp === null || endTemp <= bottom) {
    fields.dryTime.value = "";
    fields.dryRatio.value = "";
    fields.maillardTime.value = "";
    fields.maillardRatio.value = "";
    fields.developmentTime.value = "";
    fields.developmentRatio.value = "";
    fields.totalTime.value = "";
    fields.totalRatio.value = "";
    return;
  }

  const drySeconds = dryEnd - bottom;
  const maillardSeconds = firstCrack - dryEnd;
  const developmentSeconds = endTemp - firstCrack;
  const totalSeconds = endTemp - bottom;

  fields.dryTime.value = formatSeconds(drySeconds);
  fields.dryRatio.value = formatRatio(drySeconds, totalSeconds);
  fields.maillardTime.value = formatSeconds(maillardSeconds);
  fields.maillardRatio.value = formatRatio(maillardSeconds, totalSeconds);
  fields.developmentTime.value = formatSeconds(developmentSeconds);
  fields.developmentRatio.value = formatRatio(developmentSeconds, totalSeconds);
  fields.totalTime.value = formatSeconds(totalSeconds);
  fields.totalRatio.value = "100.0%";
}

function saveDraft() {
  // 入力中の記録は常に下書きとして1件だけ保持する。
  localStorage.setItem(draftKey, JSON.stringify(getRoastData()));
}

function restoreDraft() {
  const draft = localStorage.getItem(draftKey);

  if (draft) {
    fillForm(JSON.parse(draft));
    return;
  }

  fillForm({ date: getTodayValue(), logs: createEmptyLogs() });
}

function loadHistory() {
  const history = localStorage.getItem(historyKey);
  return history ? JSON.parse(history) : [];
}

function storeHistory(history) {
  localStorage.setItem(historyKey, JSON.stringify(history));
}

function generateRoastId(dateValue) {
  // 同じ焙煎日の履歴件数からYYYYMMDD-001形式の連番を作る。
  const datePart = (dateValue || getTodayValue()).replaceAll("-", "");
  const history = loadHistory();
  const sameDateCount = history.filter((item) => item.roastId.startsWith(datePart)).length;
  return `${datePart}-${String(sameDateCount + 1).padStart(3, "0")}`;
}

function saveHistory() {
  const history = loadHistory();
  const data = getRoastData();

  if (!data.roastId) {
    data.roastId = generateRoastId(data.date);
    currentRoastId = data.roastId;
  }

  const existingIndex = history.findIndex((item) => item.roastId === data.roastId);

  if (existingIndex >= 0) {
    history[existingIndex] = data;
  } else {
    history.unshift(data);
  }

  storeHistory(history);
  fillForm(data);
  saveDraft();
  renderHistory();
}

function renderHistory() {
  // 履歴カードはtemplate要素を複製し、HTML文字列を組み立てない。
  const history = loadHistory();
  historyList.textContent = "";
  historyCount.textContent = `${history.length}件`;

  history.forEach((item) => {
    const card = historyCardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.roastId = item.roastId;
    card.querySelector(".history-date").textContent = item.date || "日付なし";
    card.querySelector(".history-country").textContent = item.country || "国名なし";
    card.querySelector(".history-variety").textContent = item.variety || "品種なし";
    historyList.appendChild(card);
  });
}

function restoreHistory(roastId) {
  const history = loadHistory();
  const selectedData = history.find((item) => item.roastId === roastId);

  if (selectedData) {
    fillForm(selectedData);
    saveDraft();
  }
}

function deleteHistory() {
  const confirmed = window.confirm("現在の記録を削除しますか？");

  if (!confirmed) {
    return;
  }

  if (currentRoastId) {
    const filteredHistory = loadHistory().filter((item) => item.roastId !== currentRoastId);
    storeHistory(filteredHistory);
  }

  localStorage.removeItem(draftKey);
  currentRoastId = "";
  fillForm({ date: getTodayValue(), logs: createEmptyLogs() });
  saveDraft();
  renderHistory();
}

function handleFormChange() {
  calculateWeightLoss();
  calculatePhase();
  saveDraft();
}

function bindEvents() {
  form.addEventListener("input", handleFormChange);
  form.addEventListener("change", handleFormChange);

  document.getElementById("saveButton").addEventListener("click", saveHistory);
  document.getElementById("historyButton").addEventListener("click", () => {
    historyPanel.hidden = !historyPanel.hidden;
    renderHistory();
  });
  document.getElementById("deleteButton").addEventListener("click", deleteHistory);

  historyList.addEventListener("click", (event) => {
    const card = event.target.closest(".history-card");

    if (card) {
      restoreHistory(card.dataset.roastId);
    }
  });
}

function initializeApp() {
  restoreDraft();
  renderHistory();
  bindEvents();
}

initializeApp();
