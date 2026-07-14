(function () {
  "use strict";

  var STORAGE_KEY = "elfRoastRecordFinal.v1";
  var DRAFT_KEY = "elfRoastRecordFinal.draft.v1";
  var EVENTS = [
    { key: "bottom", label: "ボトム", placeholder: "1:20" },
    { key: "dryEnd", label: "ドライエンド", placeholder: "5:00" },
    { key: "firstCrack", label: "FC（First Crack）", placeholder: "8:30" },
    { key: "endTemp", label: "END Temp", placeholder: "10:15" }
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
  var statusTimer = 0;
  let roastChartCanvas = null;
  let roastChartContext = null;
  let chartResizeObserver = null;
  let chartUpdateTimer = 0;

  initTables();
  initializeRoastChart();
  applyInputHints();
  bindEvents();
  loadInitialData();
  renderHistory();
  updateComputedFields();

  function bindEvents() {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });

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
        setActiveSection(event.target);
        setTimeout(function () {
          event.target.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 80);
      }
    });

    form.addEventListener("focusout", function (event) {
      if (event.target.matches("input, textarea")) {
        window.setTimeout(clearActiveSection, 0);
      }
    });

    form.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && shouldMoveOnEnter(event.target)) {
        event.preventDefault();
        moveToNextInput(event.target);
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
        "<td><input class=\"time-input\" type=\"text\" inputmode=\"numeric\" autocomplete=\"off\" data-event-time=\"" + eventItem.key + "\" aria-label=\"" + eventItem.label + " 時間\" placeholder=\"" + eventItem.placeholder + "\"></td>",
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
        "<td><input type=\"text\" inputmode=\"decimal\" data-log=\"ror\" data-minute=\"" + minute + "\" aria-label=\"" + label + " ROR\" readonly tabindex=\"-1\"></td>",
        "<td><input type=\"text\" inputmode=\"decimal\" data-log=\"gas\" data-minute=\"" + minute + "\" aria-label=\"" + label + " ガス圧\"></td>",
        "<td><input type=\"text\" inputmode=\"decimal\" data-log=\"damper\" data-minute=\"" + minute + "\" aria-label=\"" + label + " ダンパー\"></td>"
      ].join("");
      logBody.appendChild(logRow);
    }
  }

  function applyInputHints() {
    getMoveTargets().forEach(function (input, index, inputs) {
      input.setAttribute("enterkeyhint", index === inputs.length - 1 ? "done" : "next");
    });
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
    updateRoastChart();
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
      } else {
        previousTemp = null;
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
    clearRoastChart(true);
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
    clearRoastChart(true);
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
    window.clearTimeout(statusTimer);
    statusBadge.textContent = text;
  }

  function shouldMoveOnEnter(target) {
    return target.matches("input, select") &&
      !target.matches("[type=\"button\"], [type=\"submit\"], [type=\"reset\"], [type=\"radio\"], [readonly], [disabled]");
  }

  function moveToNextInput(currentInput) {
    var inputs = getMoveTargets();
    var index = inputs.indexOf(currentInput);
    if (index >= 0 && index < inputs.length - 1) {
      inputs[index + 1].focus();
      if (typeof inputs[index + 1].select === "function") {
        inputs[index + 1].select();
      }
    }
  }

  function getMoveTargets() {
    return Array.prototype.slice.call(form.querySelectorAll("input, select, textarea"))
      .filter(function (input) {
        return !input.matches("[type=\"button\"], [type=\"submit\"], [type=\"reset\"], [type=\"radio\"], [readonly], [disabled], [tabindex=\"-1\"]");
      });
  }

  function initializeRoastChart() {
    roastChartCanvas = document.getElementById("roastChart");
    if (!roastChartCanvas) {
      return;
    }

    roastChartContext = roastChartCanvas.getContext("2d");
    if (window.ResizeObserver) {
      chartResizeObserver = new ResizeObserver(resizeRoastChart);
      chartResizeObserver.observe(roastChartCanvas.parentElement);
    } else {
      window.addEventListener("resize", resizeRoastChart);
    }
  }

  function collectChartData() {
    const temperatures = [];
    const rors = [];
    const events = [
      { key: "bottom", label: "BOTTOM" },
      { key: "dryEnd", label: "DRY END" },
      { key: "firstCrack", label: "FC" },
      { key: "endTemp", label: "END" }
    ];

    for (let minute = 0; minute <= 15; minute += 1) {
      const temp = parseChartNumber(getLogInput(minute, "temp").value);
      const ror = parseChartNumber(getLogInput(minute, "ror").value);
      temperatures.push({ minute: minute, value: temp });
      rors.push({ minute: minute, value: ror });
    }

    return {
      temperatures: temperatures,
      rors: rors,
      events: events.map(function (eventItem) {
        const seconds = parseTimeToSeconds(getEventTimeInput(eventItem.key).value);
        return {
          key: eventItem.key,
          label: eventItem.label,
          minute: seconds === null ? null : seconds / 60
        };
      }).filter(function (eventItem) {
        return eventItem.minute !== null && eventItem.minute >= 0 && eventItem.minute <= 15;
      })
    };
  }

  function drawRoastChart() {
    if (!roastChartCanvas || !roastChartContext) {
      return;
    }

    const data = collectChartData();
    const hasTemperature = data.temperatures.some(function (point) {
      return point.value !== null;
    });
    const hasRor = data.rors.some(function (point) {
      return point.value !== null;
    });
    const wrapper = roastChartCanvas.parentElement;

    if (!hasTemperature && !hasRor) {
      wrapper.classList.remove("has-data");
      clearRoastChart(true);
      return;
    }

    wrapper.classList.add("has-data");
    const size = resizeRoastChart(false);
    const ctx = roastChartContext;
    const plot = {
      left: size.width < 560 ? 38 : 52,
      right: size.width < 560 ? 38 : 50,
      top: 18,
      bottom: size.width < 560 ? 32 : 40
    };
    plot.width = size.width - plot.left - plot.right;
    plot.height = size.height - plot.top - plot.bottom;

    const scales = buildChartScales(data, plot);
    clearRoastChart(false);
    drawAxes(ctx, plot, scales, size);
    drawEventMarkers(ctx, plot, scales, data.events);
    drawTemperatureLine(ctx, plot, scales, data.temperatures);
    drawRorLine(ctx, plot, scales, data.rors);
  }

  function drawAxes(ctx, plot, scales, size) {
    const isNarrow = size.width < 560;
    const xLabelStep = isNarrow ? 2 : 1;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e8eee9";
    ctx.fillStyle = "#68746d";
    ctx.font = (isNarrow ? "10px" : "12px") + " -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let minute = 0; minute <= 15; minute += 1) {
      const x = scales.x(minute);
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.stroke();
      if (minute % xLabelStep === 0) {
        ctx.fillText(String(minute), x, plot.top + plot.height + 8);
      }
    }

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    scales.tempTicks.forEach(function (tick) {
      const y = scales.tempY(tick);
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
      ctx.stroke();
      ctx.fillText(formatAxisNumber(tick), plot.left - 7, y);
    });

    ctx.textAlign = "left";
    scales.rorTicks.forEach(function (tick) {
      ctx.fillText(formatAxisNumber(tick), plot.left + plot.width + 7, scales.rorY(tick));
    });

    ctx.strokeStyle = "#cfd8d2";
    ctx.beginPath();
    ctx.moveTo(plot.left, plot.top);
    ctx.lineTo(plot.left, plot.top + plot.height);
    ctx.lineTo(plot.left + plot.width, plot.top + plot.height);
    ctx.lineTo(plot.left + plot.width, plot.top);
    ctx.stroke();

    ctx.fillStyle = "#17201b";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("温度 ℃", plot.left, 0);
    ctx.textAlign = "right";
    ctx.fillText("ROR", plot.left + plot.width, 0);
    ctx.restore();
  }

  function drawTemperatureLine(ctx, plot, scales, points) {
    drawSegmentedLine(ctx, points, scales.x, scales.tempY, {
      color: "#234b36",
      width: 2.6,
      dash: []
    });
  }

  function drawRorLine(ctx, plot, scales, points) {
    drawSegmentedLine(ctx, points, scales.x, scales.rorY, {
      color: "#7b6a56",
      width: 2.2,
      dash: [7, 5]
    });
  }

  function drawEventMarkers(ctx, plot, scales, events) {
    const labelRows = {};

    ctx.save();
    ctx.strokeStyle = "rgba(35, 75, 54, 0.48)";
    ctx.fillStyle = "#234b36";
    ctx.lineWidth = 1;
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.setLineDash([3, 4]);

    events.forEach(function (eventItem) {
      const x = scales.x(eventItem.minute);
      const slot = Math.round(x / 34);
      labelRows[slot] = (labelRows[slot] || 0) + 1;
      const labelY = plot.top + 4 + ((labelRows[slot] - 1) % 3) * 13;

      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.stroke();
      ctx.fillText(eventItem.label, x, labelY);
    });
    ctx.restore();
  }

  function resizeRoastChart(redraw) {
    if (!roastChartCanvas || !roastChartContext) {
      return { width: 0, height: 0 };
    }

    const rect = roastChartCanvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(180, Math.round(rect.height));
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);

    if (roastChartCanvas.width !== pixelWidth || roastChartCanvas.height !== pixelHeight) {
      roastChartCanvas.width = pixelWidth;
      roastChartCanvas.height = pixelHeight;
    }
    roastChartContext.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (redraw !== false) {
      updateRoastChart();
    }
    return { width: width, height: height };
  }

  function clearRoastChart(resetState) {
    if (!roastChartCanvas || !roastChartContext) {
      return;
    }
    if (resetState) {
      window.clearTimeout(chartUpdateTimer);
      roastChartCanvas.parentElement.classList.remove("has-data");
    }
    const ratio = window.devicePixelRatio || 1;
    roastChartContext.clearRect(0, 0, roastChartCanvas.width / ratio, roastChartCanvas.height / ratio);
  }

  function updateRoastChart() {
    if (!roastChartCanvas) {
      return;
    }
    window.clearTimeout(chartUpdateTimer);
    chartUpdateTimer = window.setTimeout(drawRoastChart, 80);
  }

  function drawSegmentedLine(ctx, points, xScale, yScale, options) {
    let drawing = false;

    ctx.save();
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(options.dash);
    ctx.beginPath();

    points.forEach(function (point) {
      if (point.value === null) {
        drawing = false;
        return;
      }

      const x = xScale(point.minute);
      const y = yScale(point.value);
      if (!drawing) {
        ctx.moveTo(x, y);
        drawing = true;
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    ctx.restore();
  }

  function buildChartScales(data, plot) {
    const tempValues = data.temperatures
      .map(function (point) { return point.value; })
      .filter(function (value) { return value !== null; });
    const rorValues = data.rors
      .map(function (point) { return point.value; })
      .filter(function (value) { return value !== null; });
    const tempRange = paddedRange(tempValues, 20, 220, 0.08);
    const rorRange = paddedRange(rorValues, -5, 20, 0.16);

    return {
      x: function (minute) {
        return plot.left + (minute / 15) * plot.width;
      },
      tempY: function (value) {
        return plot.top + ((tempRange.max - value) / (tempRange.max - tempRange.min)) * plot.height;
      },
      rorY: function (value) {
        return plot.top + ((rorRange.max - value) / (rorRange.max - rorRange.min)) * plot.height;
      },
      tempTicks: makeTicks(tempRange.min, tempRange.max, 5),
      rorTicks: makeTicks(rorRange.min, rorRange.max, 5)
    };
  }

  function parseChartNumber(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return null;
    }
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
  }

  function paddedRange(values, fallbackMin, fallbackMax, paddingRatio) {
    if (!values.length) {
      return { min: fallbackMin, max: fallbackMax };
    }

    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (min === max) {
      min -= 5;
      max += 5;
    }

    const padding = Math.max((max - min) * paddingRatio, 1);
    return {
      min: niceFloor(min - padding),
      max: niceCeil(max + padding)
    };
  }

  function niceFloor(value) {
    return Math.floor(value / 5) * 5;
  }

  function niceCeil(value) {
    return Math.ceil(value / 5) * 5;
  }

  function makeTicks(min, max, count) {
    const ticks = [];
    const step = (max - min) / (count - 1);
    for (let index = 0; index < count; index += 1) {
      ticks.push(min + step * index);
    }
    return ticks;
  }

  function formatAxisNumber(value) {
    return Math.abs(value) >= 10 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
  }

  function flashStatus(text, fallback) {
    window.clearTimeout(statusTimer);
    statusBadge.textContent = text;
    statusTimer = window.setTimeout(function () {
      statusBadge.textContent = fallback;
    }, 1000);
  }

  function setActiveSection(target) {
    clearActiveSection();
    var section = target.closest(".record-section");
    if (section) {
      section.classList.add("is-active");
    }
  }

  function clearActiveSection() {
    if (form.querySelector(":focus")) {
      return;
    }
    form.querySelectorAll(".record-section.is-active").forEach(function (section) {
      section.classList.remove("is-active");
    });
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
