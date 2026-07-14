(function () {
  "use strict";

  var STORAGE_KEY = "elfRoastRecordFinal.v1";
  var DRAFT_KEY = "elfRoastRecordFinal.draft.v1";
  var EVENTS = [
    { key: "bottom", label: "ボトム" },
    { key: "dryEnd", label: "ドライエンド" },
    { key: "firstCrack", label: "FC（First Crack）" },
    { key: "endTemp", label: "END Temp" }
  ];
  var PHASES = ["Dry", "Maillard", "Development", "TOTAL"];

  var form = document.getElementById("roastForm");
  var statusBadge = document.getElementById("statusBadge");
  var eventsBody = document.getElementById("eventsBody");
  var phasesBody = document.getElementById("phasesBody");
  var logBody = document.getElementById("logBody");
  var weightLoss = document.getElementById("weightLoss");
  var weightNotice = document.getElementById("weightNotice");
  var phaseNotice = document.getElementById("phaseNotice");
  var historyList = document.getElementById("historyList");
  var historySearch = document.getElementById("historySearch");
  var historyCount = document.getElementById("historyCount");

  var currentId = "";
  var saveTimer = 0;

  initTables();
  bindEvents();
  loadInitialData();
  renderHistory();
  updateComputedFields();

  function bindEvents() {
    form.addEventListener("input", function (event) {
      if (event.target.matches("input, textarea")) {
        markEditing();
        updateComputedFields();
        scheduleDraftSave();
      }
    });

    form.addEventListener("change", function () {
      markEditing();
      updateComputedFields();
      scheduleDraftSave();
    });

    form.addEventListener("blur", function (event) {
      if (event.target.classList.contains("time-input")) {
        event.target.value = formatTimeInput(event.target.value);
        updateComputedFields();
        saveDraft();
      }
    }, true);

    form.addEventListener("focusin", function (event) {
      if (event.target.matches("input, textarea")) {
        setTimeout(function () {
          event.target.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 80);
      }
    });

    document.getElementById("saveHistoryBtn").addEventListener("click", saveHistory);
    document.getElementById("saveDraftBtn").addEventListener("click", saveDraft);
    document.getElementById("newRecordBtn").addEventListener("click", newRecord);
    document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
    document.getElementById("printBtn").addEventListener("click", function () {
      window.print();
    });
    document.getElementById("deleteCurrentBtn").addEventListener("click", deleteCurrent);
    historySearch.addEventListener("input", renderHistory);
  }

  function initTables() {
    EVENTS.forEach(function (eventItem) {
      var row = document.createElement("tr");
      row.innerHTML = [
        "<td>" + eventItem.label + "</td>",
        "<td><input class=\"time-input\" type=\"text\" inputmode=\"numeric\" autocomplete=\"off\" data-event-time=\"" + eventItem.key + "\" aria-label=\"" + eventItem.label + " 時間\" placeholder=\"m:ss\"></td>",
        "<td><input type=\"number\" step=\"0.1\" inputmode=\"decimal\" data-event-temp=\"" + eventItem.key + "\" aria-label=\"" + eventItem.label + " 温度\"></td>"
      ].join("");
      eventsBody.appendChild(row);
    });

    PHASES.forEach(function (phase) {
      var row = document.createElement("tr");
      row.dataset.phase = phase;
      row.innerHTML = "<td>" + phase + "</td><td></td><td></td>";
      phasesBody.appendChild(row);
    });

    for (var minute = 0; minute <= 15; minute += 1) {
      var logRow = document.createElement("tr");
      var label = minute + ":00";
      logRow.innerHTML = [
        "<td>" + label + "</td>",
        "<td><input type=\"number\" step=\"0.1\" inputmode=\"decimal\" data-log=\"temp\" data-minute=\"" + minute + "\" aria-label=\"" + label + " 温度\"></td>",
        "<td><input type=\"text\" data-log=\"ror\" data-minute=\"" + minute + "\" aria-label=\"" + label + " ROR\" readonly></td>",
        "<td><input type=\"text\" inputmode=\"decimal\" data-log=\"gas\" data-minute=\"" + minute + "\" aria-label=\"" + label + " ガス圧\"></td>",
        "<td><input type=\"text\" inputmode=\"decimal\" data-log=\"damper\" data-minute=\"" + minute + "\" aria-label=\"" + label + " ダンパー\"></td>"
      ].join("");
      logBody.appendChild(logRow);
    }
  }

  function loadInitialData() {
    var draft = readJson(DRAFT_KEY, null);
    if (draft) {
      applyRecord(draft);
      setStatus("下書き保存済み");
      return;
    }
    document.getElementById("roastDate").value = todayString();
    setStatus("下書き保存済み");
  }

  function collectRecord() {
    var record = {
      id: currentId,
      updatedAt: new Date().toISOString(),
      basic: {
        roastDate: valueOf("roastDate"),
        weather: checkedWeather(),
        airTemp: valueOf("airTemp")
      },
      bean: {
        country: valueOf("country"),
        farm: valueOf("farm"),
        variety: valueOf("variety"),
        process: valueOf("process"),
        altitude: valueOf("altitude")
      },
      charge: {
        greenWeight: valueOf("greenWeight"),
        chargeTemp: valueOf("chargeTemp"),
        roastedWeight: valueOf("roastedWeight"),
        weightLoss: weightLoss.value
      },
      events: {},
      phases: calculatePhases().values,
      logs: [],
      memo: valueOf("memo")
    };

    EVENTS.forEach(function (eventItem) {
      record.events[eventItem.key] = {
        time: getEventTimeInput(eventItem.key).value,
        temp: getEventTempInput(eventItem.key).value
      };
    });

    for (var minute = 0; minute <= 15; minute += 1) {
      record.logs.push({
        time: minute + ":00",
        temp: getLogInput(minute, "temp").value,
        ror: getLogInput(minute, "ror").value,
        gas: getLogInput(minute, "gas").value,
        damper: getLogInput(minute, "damper").value
      });
    }

    return record;
  }

  function applyRecord(record) {
    currentId = record.id || "";
    setValue("roastDate", record.basic && record.basic.roastDate);
    setWeather(record.basic && record.basic.weather);
    setValue("airTemp", record.basic && record.basic.airTemp);
    setValue("country", record.bean && record.bean.country);
    setValue("farm", record.bean && record.bean.farm);
    setValue("variety", record.bean && record.bean.variety);
    setValue("process", record.bean && record.bean.process);
    setValue("altitude", record.bean && record.bean.altitude);
    setValue("greenWeight", record.charge && record.charge.greenWeight);
    setValue("chargeTemp", record.charge && record.charge.chargeTemp);
    setValue("roastedWeight", record.charge && record.charge.roastedWeight);
    setValue("memo", record.memo);

    EVENTS.forEach(function (eventItem) {
      var eventValue = record.events && record.events[eventItem.key] ? record.events[eventItem.key] : {};
      getEventTimeInput(eventItem.key).value = eventValue.time || "";
      getEventTempInput(eventItem.key).value = eventValue.temp || "";
    });

    for (var minute = 0; minute <= 15; minute += 1) {
      var log = record.logs && record.logs[minute] ? record.logs[minute] : {};
      getLogInput(minute, "temp").value = log.temp || "";
      getLogInput(minute, "ror").value = log.ror || "";
      getLogInput(minute, "gas").value = log.gas || "";
      getLogInput(minute, "damper").value = log.damper || "";
    }

    updateComputedFields();
  }

  function updateComputedFields() {
    updateWeightLoss();
    updateRor();
    renderPhases();
  }

  function updateWeightLoss() {
    var green = numberValue("greenWeight");
    var roasted = numberValue("roastedWeight");
    weightLoss.value = "";
    weightNotice.textContent = "";
    weightNotice.classList.remove("danger-text");

    if (!isFinite(green) || !isFinite(roasted) || green <= 0) {
      return;
    }

    if (roasted > green) {
      weightNotice.textContent = "焙煎後重量が生豆重量を超えています。入力値を確認してください。";
      weightNotice.classList.add("danger-text");
      return;
    }

    weightLoss.value = (((green - roasted) / green) * 100).toFixed(1);
  }

  function updateRor() {
    var previousTemp = null;
    for (var minute = 0; minute <= 15; minute += 1) {
      var tempInput = getLogInput(minute, "temp");
      var rorInput = getLogInput(minute, "ror");
      var currentTemp = tempInput.value.trim() === "" ? null : Number(tempInput.value);

      rorInput.value = "";
      if (currentTemp !== null && Number.isFinite(currentTemp) && previousTemp !== null) {
        rorInput.value = (currentTemp - previousTemp).toFixed(1);
      }
      if (currentTemp !== null && Number.isFinite(currentTemp)) {
        previousTemp = currentTemp;
      }
    }
  }

  function calculatePhases() {
    var dryEnd = parseTimeToSeconds(getEventTimeInput("dryEnd").value);
    var fc = parseTimeToSeconds(getEventTimeInput("firstCrack").value);
    var end = parseTimeToSeconds(getEventTimeInput("endTemp").value);
    var invalidOrder = false;
    var values = {
      Dry: null,
      Maillard: null,
      Development: null,
      TOTAL: null
    };

    if (dryEnd !== null && fc !== null && dryEnd > fc) {
      invalidOrder = true;
    }
    if (fc !== null && end !== null && fc > end) {
      invalidOrder = true;
    }
    if (dryEnd !== null && end !== null && dryEnd > end) {
      invalidOrder = true;
    }

    if (invalidOrder) {
      return { invalidOrder: true, values: values };
    }

    if (end !== null && end > 0) {
      values.TOTAL = { seconds: end, ratio: 100 };
      if (dryEnd !== null) {
        values.Dry = { seconds: dryEnd, ratio: (dryEnd / end) * 100 };
      }
      if (dryEnd !== null && fc !== null) {
        values.Maillard = { seconds: fc - dryEnd, ratio: ((fc - dryEnd) / end) * 100 };
      }
      if (fc !== null) {
        values.Development = { seconds: end - fc, ratio: ((end - fc) / end) * 100 };
      }
    }

    return { invalidOrder: false, values: values };
  }

  function renderPhases() {
    var result = calculatePhases();
    phaseNotice.textContent = result.invalidOrder ? "イベント時間の順序を確認してください" : "";

    PHASES.forEach(function (phase) {
      var row = phasesBody.querySelector("[data-phase=\"" + phase + "\"]");
      var value = result.invalidOrder ? null : result.values[phase];
      row.children[1].textContent = value ? secondsToTime(value.seconds) : "";
      row.children[2].textContent = value ? value.ratio.toFixed(1) + "%" : "";
    });
  }

  function formatTimeInput(rawValue) {
    var seconds = parseTimeToSeconds(rawValue);
    return seconds === null ? "" : secondsToTime(seconds);
  }

  function parseTimeToSeconds(rawValue) {
    var value = String(rawValue || "").trim();
    var minutes;
    var seconds;

    if (!value) {
      return null;
    }

    if (/^\d{1,2}:\d{1,2}$/.test(value)) {
      var parts = value.split(":");
      minutes = Number(parts[0]);
      seconds = Number(parts[1]);
    } else if (/^\d{1,4}$/.test(value)) {
      if (value.length <= 2) {
        minutes = 0;
        seconds = Number(value);
      } else {
        minutes = Number(value.slice(0, -2));
        seconds = Number(value.slice(-2));
      }
    } else {
      return null;
    }

    if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds > 59) {
      return null;
    }
    return minutes * 60 + seconds;
  }

  function secondsToTime(totalSeconds) {
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function saveDraft() {
    var record = collectRecord();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(record));
    setStatus("下書き保存済み");
  }

  function scheduleDraftSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 500);
  }

  function saveHistory() {
    window.clearTimeout(saveTimer);
    var records = readJson(STORAGE_KEY, []);
    var record = collectRecord();
    var existingIndex;

    record.id = currentId || createId();
    record.savedAt = new Date().toISOString();
    currentId = record.id;
    existingIndex = records.findIndex(function (item) {
      return item.id === record.id;
    });

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    localStorage.setItem(DRAFT_KEY, JSON.stringify(record));
    setStatus("履歴保存済み");
    renderHistory();
  }

  function newRecord() {
    if (!window.confirm("入力中の内容をクリアして新規作成しますか？")) {
      return;
    }
    currentId = "";
    form.reset();
    document.getElementById("roastDate").value = todayString();
    localStorage.removeItem(DRAFT_KEY);
    updateComputedFields();
    setStatus("編集中");
  }

  function deleteCurrent() {
    var records;
    if (!currentId) {
      newRecord();
      return;
    }
    if (!window.confirm("編集中の記録を履歴から削除しますか？")) {
      return;
    }
    records = readJson(STORAGE_KEY, []).filter(function (item) {
      return item.id !== currentId;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    currentId = "";
    form.reset();
    document.getElementById("roastDate").value = todayString();
    localStorage.removeItem(DRAFT_KEY);
    updateComputedFields();
    setStatus("編集中");
    renderHistory();
  }

  function renderHistory() {
    var records = readJson(STORAGE_KEY, []);
    var query = historySearch.value.trim().toLowerCase();
    var filtered = records.filter(function (record) {
      return recordToSearchText(record).toLowerCase().indexOf(query) !== -1;
    });

    historyCount.textContent = filtered.length + "件";
    historyList.innerHTML = "";

    if (!filtered.length) {
      var empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "保存済みの履歴はありません。";
      historyList.appendChild(empty);
      return;
    }

    filtered.forEach(function (record) {
      var item = document.createElement("article");
      item.className = "history-item";
      item.innerHTML = [
        "<div class=\"history-main\">",
        "<h3>" + escapeHtml(historyTitle(record)) + "</h3>",
        "<p>" + escapeHtml(historySummary(record)) + "</p>",
        "</div>",
        "<div class=\"history-actions\">",
        "<button type=\"button\" data-load=\"" + record.id + "\">編集</button>",
        "<button type=\"button\" data-copy=\"" + record.id + "\">複製</button>",
        "<button type=\"button\" class=\"danger\" data-delete=\"" + record.id + "\">削除</button>",
        "</div>"
      ].join("");
      historyList.appendChild(item);
    });

    historyList.querySelectorAll("[data-load]").forEach(function (button) {
      button.addEventListener("click", function () {
        loadHistory(button.dataset.load, false);
      });
    });
    historyList.querySelectorAll("[data-copy]").forEach(function (button) {
      button.addEventListener("click", function () {
        loadHistory(button.dataset.copy, true);
      });
    });
    historyList.querySelectorAll("[data-delete]").forEach(function (button) {
      button.addEventListener("click", function () {
        deleteHistory(button.dataset.delete);
      });
    });
  }

  function loadHistory(id, asCopy) {
    var record = readJson(STORAGE_KEY, []).find(function (item) {
      return item.id === id;
    });
    if (!record) {
      return;
    }
    applyRecord(record);
    if (asCopy) {
      currentId = "";
      setStatus("編集中");
    } else {
      setStatus("編集中");
    }
    saveDraft();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteHistory(id) {
    var records;
    records = readJson(STORAGE_KEY, []).filter(function (item) {
      return item.id !== id;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    if (currentId === id) {
      currentId = "";
      localStorage.removeItem(DRAFT_KEY);
    }
    renderHistory();
    setStatus("履歴保存済み");
  }

  function exportCsv() {
    window.clearTimeout(saveTimer);
    var records = readJson(STORAGE_KEY, []);
    if (!records.length) {
      window.alert("CSV出力できる履歴がありません。");
      return;
    }

    var headers = [
      "保存日時", "焙煎日", "天気", "気温", "国名", "農園", "品種", "プロセス", "標高",
      "生豆重量", "投入温度", "焙煎後重量", "重量減少率",
      "ボトム時間", "ボトム温度", "ドライエンド時間", "ドライエンド温度",
      "FC時間", "FC温度", "END Temp時間", "END Temp温度",
      "Dry時間", "Dry割合", "Maillard時間", "Maillard割合", "Development時間", "Development割合", "TOTAL時間", "TOTAL割合",
      "メモ"
    ];
    for (var minute = 0; minute <= 15; minute += 1) {
      headers.push(minute + ":00 温度", minute + ":00 ROR", minute + ":00 ガス圧", minute + ":00 ダンパー");
    }
    var rows = records.map(recordToCsvRow);
    var csv = [headers].concat(rows).map(function (row) {
      return row.map(csvCell).join(",");
    }).join("\n");
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "elf-roast-record.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("CSV出力済み");
  }

  function recordToCsvRow(record) {
    var phases = record.phases || {};
    var row = [
      record.savedAt || record.updatedAt || "",
      record.basic.roastDate,
      record.basic.weather,
      record.basic.airTemp,
      record.bean.country,
      record.bean.farm,
      record.bean.variety,
      record.bean.process,
      record.bean.altitude,
      record.charge.greenWeight,
      record.charge.chargeTemp,
      record.charge.roastedWeight,
      record.charge.weightLoss,
      valueAt(record, "events.bottom.time"),
      valueAt(record, "events.bottom.temp"),
      valueAt(record, "events.dryEnd.time"),
      valueAt(record, "events.dryEnd.temp"),
      valueAt(record, "events.firstCrack.time"),
      valueAt(record, "events.firstCrack.temp"),
      valueAt(record, "events.endTemp.time"),
      valueAt(record, "events.endTemp.temp"),
      phaseCsv(phases.Dry, "time"),
      phaseCsv(phases.Dry, "ratio"),
      phaseCsv(phases.Maillard, "time"),
      phaseCsv(phases.Maillard, "ratio"),
      phaseCsv(phases.Development, "time"),
      phaseCsv(phases.Development, "ratio"),
      phaseCsv(phases.TOTAL, "time"),
      phaseCsv(phases.TOTAL, "ratio"),
      record.memo
    ];
    for (var minute = 0; minute <= 15; minute += 1) {
      var log = record.logs && record.logs[minute] ? record.logs[minute] : {};
      row.push(log.temp || "", log.ror || "", log.gas || "", log.damper || "");
    }
    return row;
  }

  function phaseCsv(phase, type) {
    if (!phase) {
      return "";
    }
    if (type === "time") {
      return secondsToTime(phase.seconds);
    }
    return phase.ratio.toFixed(1) + "%";
  }

  function markEditing() {
    setStatus("編集中");
  }

  function setStatus(text) {
    statusBadge.textContent = text;
  }

  function valueOf(id) {
    return document.getElementById(id).value.trim();
  }

  function setValue(id, value) {
    document.getElementById(id).value = value || "";
  }

  function numberValue(id) {
    var value = Number(valueOf(id));
    return Number.isFinite(value) ? value : NaN;
  }

  function checkedWeather() {
    var checked = form.querySelector("input[name=\"weather\"]:checked");
    return checked ? checked.value : "";
  }

  function setWeather(value) {
    form.querySelectorAll("input[name=\"weather\"]").forEach(function (input) {
      input.checked = input.value === value;
    });
  }

  function getEventTimeInput(key) {
    return eventsBody.querySelector("[data-event-time=\"" + key + "\"]");
  }

  function getEventTempInput(key) {
    return eventsBody.querySelector("[data-event-temp=\"" + key + "\"]");
  }

  function getLogInput(minute, key) {
    return logBody.querySelector("[data-minute=\"" + minute + "\"][data-log=\"" + key + "\"]");
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function todayString() {
    var date = new Date();
    var offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }

  function createId() {
    return "record-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function historyTitle(record) {
    var date = record.basic && record.basic.roastDate ? record.basic.roastDate : "日付未入力";
    var country = record.bean && record.bean.country ? record.bean.country : "国名未入力";
    var farm = record.bean && record.bean.farm ? record.bean.farm : "";
    return [date, country, farm].filter(Boolean).join(" / ");
  }

  function historySummary(record) {
    var values = [];
    if (record.bean && record.bean.process) {
      values.push(record.bean.process);
    }
    if (record.charge && record.charge.greenWeight) {
      values.push("生豆 " + record.charge.greenWeight + "g");
    }
    if (record.charge && record.charge.weightLoss) {
      values.push("減少率 " + record.charge.weightLoss + "%");
    }
    if (record.events && record.events.endTemp && record.events.endTemp.time) {
      values.push("TOTAL " + record.events.endTemp.time);
    }
    return values.length ? values.join(" / ") : "詳細未入力";
  }

  function recordToSearchText(record) {
    return [
      historyTitle(record),
      historySummary(record),
      record.memo || "",
      record.basic && record.basic.weather || "",
      record.bean && record.bean.variety || ""
    ].join(" ");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function csvCell(value) {
    return "\"" + String(value || "").replace(/"/g, "\"\"") + "\"";
  }

  function valueAt(object, path) {
    return path.split(".").reduce(function (current, key) {
      return current && current[key] !== undefined ? current[key] : "";
    }, object);
  }
})();
