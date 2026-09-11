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
  var BASE_CHART_MAX_MINUTE = 12;
  var PHASES = ["Dry", "Maillard", "Development", "TOTAL"];
  var AREA_ORDER = ["南米", "中南米", "アジア", "アフリカ", "その他"];
  var AREA_COUNTRIES = {
    "南米": ["brazil", "brasil", "ブラジル", "colombia", "コロンビア", "peru", "ペルー", "bolivia", "ボリビア", "ecuador", "エクアドル"],
    "中南米": ["guatemala", "グアテマラ", "costa rica", "costarica", "コスタリカ", "panama", "パナマ", "el salvador", "elsalvador", "エルサルバドル", "honduras", "ホンジュラス", "nicaragua", "ニカラグア", "mexico", "メキシコ", "jamaica", "ジャマイカ", "dominican", "ドミニカ"],
    "アジア": ["indonesia", "インドネシア", "thailand", "タイ", "china", "中国", "india", "インド", "vietnam", "ベトナム", "papua new guinea", "papuanewguinea", "png", "パプアニューギニア", "myanmar", "ミャンマー", "laos", "ラオス", "philippines", "フィリピン"],
    "アフリカ": ["ethiopia", "エチオピア", "kenya", "ケニア", "rwanda", "ルワンダ", "burundi", "ブルンジ", "tanzania", "タンザニア", "uganda", "ウガンダ", "congo", "コンゴ", "malawi", "マラウイ", "zambia", "ザンビア"]
  };
  var PROCESS_RULES = [
    { category: "アナエロビック", patterns: ["anaerobic", "アナエロビック"] },
    { category: "その他発酵系", patterns: ["carbonic", "maceration", "cm", "lactic", "yeast", "thermal shock", "extended fermentation", "co-ferment", "coferment", "infused", "mosto", "fermentation", "ファーメンテーション", "発酵"] },
    { category: "ウォッシュト", patterns: ["washed", "fully washed", "ウォッシュト", "ウォッシュド"] },
    { category: "ナチュラル", patterns: ["natural", "dry process", "ナチュラル"] },
    { category: "ハニー", patterns: ["honey", "yellow honey", "red honey", "black honey", "white honey", "ハニー"] }
  ];

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
  var historyBreadcrumb = document.getElementById("historyBreadcrumb");
  var viewMode = document.getElementById("viewMode");
  var viewTitle = document.getElementById("view-title");
  var viewOverview = document.getElementById("viewOverview");
  var viewEvents = document.getElementById("viewEvents");
  var viewLogBody = document.getElementById("viewLogBody");
  var viewMemo = document.getElementById("viewMemo");
  var viewProfileEvents = document.getElementById("viewProfileEvents");
  var viewerRoastChartCanvas = document.getElementById("viewerRoastChart");

  var currentId = "";
  var currentMode = "edit";
  var activeViewTab = "overview";
  var viewingRecord = null;
  var historyMode = "all";
  var historyPath = [];
  var saveTimer = 0;
  var statusTimer = 0;
  let roastChartCanvas = null;
  let roastChartContext = null;
  let chartResizeObserver = null;
  let chartUpdateTimer = 0;
  let chartPrintMode = false;

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
    document.getElementById("editRecordBtn").addEventListener("click", enterEditModeFromView);
    document.getElementById("viewNewRecordBtn").addEventListener("click", newRecord);
    document.getElementById("viewPrintBtn").addEventListener("click", function () {
      window.print();
    });
    document.getElementById("viewExportCsvBtn").addEventListener("click", exportCsv);
    viewMode.querySelectorAll("[data-view-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setViewTab(tab.dataset.viewTab);
      });
      tab.addEventListener("keydown", handleViewTabKeydown);
    });
    document.querySelectorAll("[data-history-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        historyMode = button.dataset.historyMode;
        historyPath = [];
        renderHistory();
      });
    });
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
    setMode("edit");
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
    enterViewMode(record, "overview");
  }

  function newRecord() {
    if (!window.confirm("入力中の内容をクリアして新規作成しますか？")) {
      return;
    }
    currentId = "";
    viewingRecord = null;
    form.reset();
    document.getElementById("roastDate").value = todayString();
    localStorage.removeItem(DRAFT_KEY);
    updateComputedFields();
    clearRoastChart(true);
    setMode("edit");
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
    viewingRecord = null;
    form.reset();
    document.getElementById("roastDate").value = todayString();
    localStorage.removeItem(DRAFT_KEY);
    updateComputedFields();
    clearRoastChart(true);
    setMode("edit");
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
    updateHistoryModeTabs();
    renderHistoryBreadcrumb();

    if (historyMode !== "all") {
      renderHistoryFolders(filtered);
      return;
    }

    renderHistoryRecords(filtered);
  }

  function renderHistoryRecords(records) {
    if (!records.length) {
      var empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "保存済みの履歴はありません。";
      historyList.appendChild(empty);
      return;
    }

    records.forEach(function (record) {
      var item = document.createElement("article");
      item.className = "history-item";
      item.innerHTML = [
        "<div class=\"history-main\">",
        "<h3>" + escapeHtml(historyTitle(record)) + "</h3>",
        "<p>" + escapeHtml(historySummary(record)) + "</p>",
        "</div>",
        "<div class=\"history-actions\">",
        "<button type=\"button\" data-load=\"" + record.id + "\">開く</button>",
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

  function renderHistoryFolders(records) {
    var folders = getHistoryFolderItems(records);
    if (folders.type === "records") {
      renderHistoryRecords(folders.records);
      return;
    }
    if (!folders.items.length) {
      var empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "該当するフォルダはありません。";
      historyList.appendChild(empty);
      return;
    }
    folders.items.forEach(function (folder) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "folder-item";
      button.innerHTML = [
        "<span class=\"folder-name\">" + escapeHtml(folder.label) + "</span>",
        "<span class=\"folder-meta\">" + folder.count + "件 <b aria-hidden=\"true\">›</b></span>"
      ].join("");
      button.addEventListener("click", function () {
        historyPath = historyPath.concat(folder.key);
        renderHistory();
      });
      historyList.appendChild(button);
    });
  }

  function getHistoryFolderItems(records) {
    if (historyMode === "area") {
      return getAreaFolderItems(records);
    }
    if (historyMode === "process") {
      return getProcessFolderItems(records);
    }
    if (historyMode === "variety") {
      return getVarietyFolderItems(records);
    }
    return { type: "records", records: records };
  }

  function getAreaFolderItems(records) {
    if (historyPath.length === 0) {
      return {
        type: "folders",
        items: AREA_ORDER.map(function (area) {
          return { key: area, label: area, count: records.filter(function (record) {
            return getRecordAreas(record).indexOf(area) !== -1;
          }).length };
        }).filter(function (folder) {
          return folder.count > 0;
        })
      };
    }
    if (historyPath.length === 1) {
      var area = historyPath[0];
      var countryMap = {};
      records.forEach(function (record) {
        if (getRecordAreas(record).indexOf(area) === -1) {
          return;
        }
        getCountries(record).forEach(function (country) {
          var label = country || "国名未入力";
          countryMap[label] = countryMap[label] || [];
          countryMap[label].push(record);
        });
      });
      return { type: "folders", items: objectKeys(countryMap).map(function (country) {
        return { key: country, label: country, count: uniqueRecords(countryMap[country]).length };
      }).sort(sortFoldersByLabel) };
    }
    return {
      type: "records",
      records: records.filter(function (record) {
        return getRecordAreas(record).indexOf(historyPath[0]) !== -1 &&
          getCountries(record).indexOf(historyPath[1]) !== -1;
      })
    };
  }

  function getProcessFolderItems(records) {
    if (historyPath.length === 0) {
      var categories = ["ウォッシュト", "ナチュラル", "ハニー", "アナエロビック", "その他発酵系", "その他"];
      return { type: "folders", items: categories.map(function (category) {
        return { key: category, label: category, count: records.filter(function (record) {
          return getProcessCategory(valueAt(record, "bean.process")) === category;
        }).length };
      }).filter(function (folder) {
        return folder.count > 0;
      }) };
    }
    return { type: "records", records: records.filter(function (record) {
      return getProcessCategory(valueAt(record, "bean.process")) === historyPath[0];
    }) };
  }

  function getVarietyFolderItems(records) {
    if (historyPath.length === 0) {
      var varietyMap = {};
      records.forEach(function (record) {
        getVarieties(valueAt(record, "bean.variety")).forEach(function (variety) {
          varietyMap[variety] = varietyMap[variety] || [];
          varietyMap[variety].push(record);
        });
      });
      return { type: "folders", items: objectKeys(varietyMap).map(function (variety) {
        return { key: variety, label: variety, count: uniqueRecords(varietyMap[variety]).length };
      }).sort(sortFoldersByLabel) };
    }
    return { type: "records", records: records.filter(function (record) {
      return getVarieties(valueAt(record, "bean.variety")).indexOf(historyPath[0]) !== -1;
    }) };
  }

  function updateHistoryModeTabs() {
    document.querySelectorAll("[data-history-mode]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.historyMode === historyMode);
    });
  }

  function renderHistoryBreadcrumb() {
    var labels = {
      all: "すべて",
      area: "エリア",
      process: "プロセス",
      variety: "品種"
    };
    var parts = ["履歴", labels[historyMode]].concat(historyPath);
    historyBreadcrumb.innerHTML = parts.map(function (part, index) {
      if (index === parts.length - 1 || index === 0) {
        return "<span>" + escapeHtml(part) + "</span>";
      }
      return "<button type=\"button\" data-breadcrumb-index=\"" + index + "\">" + escapeHtml(part) + "</button>";
    }).join("<span aria-hidden=\"true\"> &gt; </span>");
    historyBreadcrumb.querySelectorAll("[data-breadcrumb-index]").forEach(function (button) {
      button.addEventListener("click", function () {
        var index = Number(button.dataset.breadcrumbIndex);
        historyPath = historyPath.slice(0, Math.max(0, index - 1));
        renderHistory();
      });
    });
  }

  function getRecordAreas(record) {
    var countries = getCountries(record);
    var areas = countries.map(getAreaFromCountry);
    return uniqueValues(areas.length ? areas : ["その他"]);
  }

  function getCountries(record) {
    var country = valueAt(record, "bean.country");
    var countries = splitMultiValue(country).filter(Boolean);
    if (!countries.length) {
      return ["国名未入力"];
    }
    return countries;
  }

  function getAreaFromCountry(country) {
    var normalized = normalizeText(country);
    var matched = "";
    AREA_ORDER.some(function (area) {
      return (AREA_COUNTRIES[area] || []).some(function (pattern) {
        if (normalized.indexOf(normalizeText(pattern)) !== -1) {
          matched = area;
          return true;
        }
        return false;
      });
    });
    return matched || "その他";
  }

  function getProcessCategory(process) {
    var normalized = normalizeText(process);
    if (!normalized) {
      return "その他";
    }
    var matched = "その他";
    PROCESS_RULES.some(function (rule) {
      return rule.patterns.some(function (pattern) {
        if (normalized.indexOf(normalizeText(pattern)) !== -1) {
          matched = rule.category;
          return true;
        }
        return false;
      });
    });
    return matched;
  }

  function getVarieties(variety) {
    var values = splitMultiValue(variety);
    return values.length ? uniqueValues(values) : ["品種未入力"];
  }

  function splitMultiValue(value) {
    return String(value || "")
      .replace(/\band\b/gi, "/")
      .split(/\s*(?:\/|／|,|，|\+|＋|・|&|、)\s*/g)
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function uniqueRecords(records) {
    var seen = {};
    return records.filter(function (record) {
      var id = record.id || JSON.stringify(record);
      if (seen[id]) {
        return false;
      }
      seen[id] = true;
      return true;
    });
  }

  function uniqueValues(values) {
    var seen = {};
    return values.filter(function (value) {
      if (seen[value]) {
        return false;
      }
      seen[value] = true;
      return true;
    });
  }

  function objectKeys(object) {
    return Object.keys(object);
  }

  function sortFoldersByLabel(a, b) {
    return a.label.localeCompare(b.label, "ja");
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
      viewingRecord = null;
      setStatus("編集中");
      setMode("edit");
      saveDraft();
    } else {
      enterViewMode(record, "overview");
      setStatus("履歴保存済み");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function enterViewMode(record, tabName) {
    viewingRecord = record;
    applyRecord(record);
    renderViewMode(record);
    setMode("view");
    setViewTab(tabName || "overview");
  }

  function enterEditModeFromView() {
    if (viewingRecord) {
      applyRecord(viewingRecord);
    }
    setMode("edit");
    setStatus("編集中");
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(function () {
      drawRoastChart();
    });
  }

  function setMode(mode) {
    currentMode = mode;
    document.body.classList.toggle("mode-view", mode === "view");
    document.body.classList.toggle("mode-edit", mode !== "view");
  }

  function renderViewMode(record) {
    var safeRecord = record || collectRecord();
    viewTitle.textContent = historyTitle(safeRecord);
    viewOverview.innerHTML = [
      viewerCard("基本情報", [
        ["焙煎日", valueAt(safeRecord, "basic.roastDate")],
        ["天気", valueAt(safeRecord, "basic.weather")],
        ["気温", withUnit(valueAt(safeRecord, "basic.airTemp"), "℃")]
      ]),
      viewerCard("生豆情報", [
        ["国名", valueAt(safeRecord, "bean.country")],
        ["農園", valueAt(safeRecord, "bean.farm")],
        ["品種", valueAt(safeRecord, "bean.variety")],
        ["プロセス", valueAt(safeRecord, "bean.process")],
        ["標高", withUnit(valueAt(safeRecord, "bean.altitude"), "m")]
      ]),
      viewerCard("投入条件", [
        ["生豆重量", withUnit(valueAt(safeRecord, "charge.greenWeight"), "g")],
        ["投入温度", withUnit(valueAt(safeRecord, "charge.chargeTemp"), "℃")],
        ["焙煎後重量", withUnit(valueAt(safeRecord, "charge.roastedWeight"), "g")],
        ["重量減少率", withUnit(valueAt(safeRecord, "charge.weightLoss"), "%")]
      ])
    ].join("");

    viewEvents.innerHTML = [
      viewerCard("イベント", EVENTS.map(function (eventItem) {
        return [eventDisplayLabel(eventItem), eventValue(safeRecord, eventItem.key)];
      })),
      viewerCard("フェーズ", PHASES.map(function (phase) {
        return [phase, phaseValue(safeRecord, phase)];
      }))
    ].join("");

    viewProfileEvents.innerHTML = EVENTS.map(function (eventItem) {
      return "<span>" + escapeHtml(eventDisplayLabel(eventItem)) + " " + escapeHtml(eventValue(safeRecord, eventItem.key)) + "</span>";
    }).join("");

    renderViewLog(safeRecord);
    viewMemo.textContent = safeRecord.memo ? safeRecord.memo : "メモはありません";
  }

  function viewerCard(title, rows) {
    return [
      "<article class=\"viewer-card\">",
      "<h3>" + escapeHtml(title) + "</h3>",
      "<div class=\"viewer-values\">",
      rows.map(function (row) {
        return [
          "<div class=\"viewer-value\">",
          "<span class=\"viewer-label\">" + escapeHtml(row[0]) + "</span>",
          "<span class=\"viewer-data\">" + escapeHtml(row[1] || "未入力") + "</span>",
          "</div>"
        ].join("");
      }).join(""),
      "</div>",
      "</article>"
    ].join("");
  }

  function renderViewLog(record) {
    var rows = [];
    for (var minute = 0; minute <= 15; minute += 1) {
      var log = record.logs && record.logs[minute] ? record.logs[minute] : {};
      rows.push([
        "<tr>",
        "<td>" + minute + ":00</td>",
        "<td>" + escapeHtml(log.temp || "") + "</td>",
        "<td>" + escapeHtml(log.ror || "") + "</td>",
        "<td>" + escapeHtml(log.gas || "") + "</td>",
        "<td>" + escapeHtml(log.damper || "") + "</td>",
        "</tr>"
      ].join(""));
    }
    viewLogBody.innerHTML = rows.join("");
  }

  function setViewTab(tabName) {
    activeViewTab = tabName || "overview";
    viewMode.querySelectorAll("[data-view-tab]").forEach(function (tab) {
      var isActive = tab.dataset.viewTab === activeViewTab;
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });
    viewMode.querySelectorAll("[data-view-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.viewPanel !== activeViewTab;
    });
    if (activeViewTab === "profile") {
      requestAnimationFrame(function () {
        drawRoastChart();
      });
    }
  }

  function handleViewTabKeydown(event) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    var tabs = Array.prototype.slice.call(viewMode.querySelectorAll("[data-view-tab]"));
    var index = tabs.indexOf(event.currentTarget);
    var nextIndex = event.key === "ArrowRight" ? index + 1 : index - 1;
    if (nextIndex < 0) {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex >= tabs.length) {
      nextIndex = 0;
    }
    tabs[nextIndex].focus();
    setViewTab(tabs[nextIndex].dataset.viewTab);
  }

  function eventDisplayLabel(eventItem) {
    if (eventItem.key === "bottom") {
      return "BOTTOM";
    }
    if (eventItem.key === "dryEnd") {
      return "DRY END";
    }
    if (eventItem.key === "firstCrack") {
      return "FC";
    }
    return "END";
  }

  function eventValue(record, key) {
    var value = record.events && record.events[key] ? record.events[key] : {};
    var parts = [];
    if (value.time) {
      parts.push(value.time);
    }
    if (value.temp) {
      parts.push(value.temp + "℃");
    }
    return parts.length ? parts.join(" / ") : "";
  }

  function phaseValue(record, phase) {
    var value = record.phases && record.phases[phase] ? record.phases[phase] : null;
    if (!value) {
      return "";
    }
    if (phase === "TOTAL") {
      return secondsToTime(value.seconds);
    }
    return secondsToTime(value.seconds) + " / " + value.ratio.toFixed(1) + "%";
  }

  function withUnit(value, unit) {
    return value ? value + unit : "";
  }

  function deleteHistory(id) {
    var records;
    records = readJson(STORAGE_KEY, []).filter(function (item) {
      return item.id !== id;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    if (currentId === id) {
      currentId = "";
      viewingRecord = null;
      localStorage.removeItem(DRAFT_KEY);
      setMode("edit");
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
    if (roastChartCanvas) {
      roastChartContext = roastChartCanvas.getContext("2d");
    }
    if (viewerRoastChartCanvas) {
      viewerRoastChartCanvas._chartContext = viewerRoastChartCanvas.getContext("2d");
    }

    if (window.ResizeObserver) {
      chartResizeObserver = new ResizeObserver(resizeRoastChart);
      getChartTargets().forEach(function (target) {
        chartResizeObserver.observe(target.canvas.parentElement);
      });
    } else {
      window.addEventListener("resize", resizeRoastChart);
    }
    window.addEventListener("beforeprint", prepareChartForPrint);
    window.addEventListener("afterprint", restoreChartAfterPrint);
  }

  function collectChartData() {
    let temperatures = [];
    const rors = [];
    const events = [
      { key: "bottom", label: "BOTTOM" },
      { key: "dryEnd", label: "DRY END" },
      { key: "firstCrack", label: "FC" },
      { key: "endTemp", label: "END" }
    ];
    const endPoint = getEndChartPoint();

    for (let minute = 0; minute <= 15; minute += 1) {
      const temp = parseChartNumber(getLogInput(minute, "temp").value);
      const ror = parseChartNumber(getLogInput(minute, "ror").value);
      temperatures.push({ minute: minute, value: temp });
      rors.push({ minute: minute, value: ror });
    }

    temperatures = applyEndPointToTemperatures(temperatures, endPoint);

    const chartEvents = events.map(function (eventItem) {
      const seconds = parseTimeToSeconds(getEventTimeInput(eventItem.key).value);
      return {
        key: eventItem.key,
        label: eventItem.label,
        minute: seconds === null ? null : seconds / 60,
        temp: parseChartNumber(getEventTempInput(eventItem.key).value)
      };
    }).filter(function (eventItem) {
      return eventItem.minute !== null && eventItem.minute >= 0;
    });
    const xMax = getChartXMax(temperatures, chartEvents);

    return {
      temperatures: temperatures.filter(function (point) {
        return point.minute <= xMax;
      }),
      rors: rors.filter(function (point) {
        return point.minute <= xMax;
      }),
      events: chartEvents.filter(function (eventItem) {
        return eventItem.minute <= xMax;
      }),
      xMax: xMax
    };
  }

  function getEndChartPoint() {
    const seconds = parseTimeToSeconds(getEventTimeInput("endTemp").value);
    const temp = parseChartNumber(getEventTempInput("endTemp").value);

    if (seconds === null || temp === null) {
      return null;
    }
    return {
      minute: seconds / 60,
      value: temp
    };
  }

  function applyEndPointToTemperatures(points, endPoint) {
    if (!endPoint) {
      return points;
    }

    let replaced = false;
    let adjusted = points.reduce(function (result, point) {
      if (point.minute > endPoint.minute) {
        return result;
      }
      if (Math.abs(point.minute - endPoint.minute) < 0.0001) {
        result.push({
          minute: point.minute,
          value: endPoint.value,
          isEndPoint: true
        });
        replaced = true;
        return result;
      }
      result.push(point);
      return result;
    }, []);

    const lastTemperatureBeforeEnd = adjusted.reduce(function (latest, point) {
      if (point.value === null || point.isEndPoint) {
        return latest;
      }
      return !latest || point.minute > latest.minute ? point : latest;
    }, null);

    if (lastTemperatureBeforeEnd) {
      adjusted = adjusted.filter(function (point) {
        return point.value !== null || point.minute <= lastTemperatureBeforeEnd.minute;
      });
    }

    if (!replaced) {
      adjusted.push({
        minute: endPoint.minute,
        value: endPoint.value,
        isEndPoint: true
      });
    }

    return adjusted.sort(function (a, b) {
      return a.minute - b.minute;
    });
  }

  function getChartXMax(temperatures, events) {
    const endEvent = events.find(function (eventItem) {
      return eventItem.key === "endTemp";
    });
    if (endEvent && endEvent.minute > BASE_CHART_MAX_MINUTE) {
      return Math.ceil(endEvent.minute);
    }
    return BASE_CHART_MAX_MINUTE;
  }

  function drawRoastChart() {
    getChartTargets().forEach(drawRoastChartForTarget);
  }

  function drawRoastChartForTarget(target) {
    const data = collectChartData();
    const hasTemperature = data.temperatures.some(function (point) {
      return point.value !== null;
    });
    const hasRor = data.rors.some(function (point) {
      return point.value !== null;
    });
    const canvas = target.canvas;
    const context = target.context;
    const wrapper = canvas.parentElement;

    if (!hasTemperature && !hasRor) {
      wrapper.classList.remove("has-data");
      clearChartTarget(target, true);
      return;
    }

    wrapper.classList.add("has-data");
    const size = resizeChartTarget(target, false);
    const ctx = context;
    const isPrint = isChartPrintMode();
    const plot = {
      left: isPrint ? 34 : (size.width < 560 ? 30 : 44),
      right: isPrint ? 34 : (size.width < 560 ? 30 : 42),
      top: isPrint ? 12 : 18,
      bottom: isPrint ? 20 : (size.width < 560 ? 30 : 38)
    };
    plot.width = size.width - plot.left - plot.right;
    plot.height = size.height - plot.top - plot.bottom;

    const scales = buildChartScales(data, plot);
    clearChartTarget(target, false);
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
    ctx.font = (isChartPrintMode() ? "8px" : (isNarrow ? "10px" : "12px")) + " -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let minute = 0; minute <= scales.xMax; minute += 1) {
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
      width: isChartPrintMode() ? 1.8 : 2.6,
      dash: []
    });
  }

  function drawRorLine(ctx, plot, scales, points) {
    drawSegmentedLine(ctx, points, scales.x, scales.rorY, {
      color: "#7b6a56",
      width: isChartPrintMode() ? 1.6 : 2.2,
      dash: [7, 5]
    });
  }

  function drawEventMarkers(ctx, plot, scales, events) {
    const labelRows = {};

    ctx.save();
    ctx.strokeStyle = "rgba(35, 75, 54, 0.48)";
    ctx.fillStyle = "#234b36";
    ctx.lineWidth = 1;
    ctx.font = (isChartPrintMode() ? "8px" : "10px") + " -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.setLineDash([3, 4]);

    events.forEach(function (eventItem) {
      const x = scales.x(eventItem.minute);
      const slot = Math.round(x / 34);
      labelRows[slot] = (labelRows[slot] || 0) + 1;
      const labelY = plot.top + 3 + ((labelRows[slot] - 1) % 3) * (isChartPrintMode() ? 9 : 13);

      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.stroke();
      ctx.fillText(eventItem.label, x, labelY);
      if (eventItem.key === "endTemp" && eventItem.temp !== null) {
        drawEndEventPoint(ctx, plot, scales, eventItem);
      }
    });
    ctx.restore();
  }

  function drawEndEventPoint(ctx, plot, scales, eventItem) {
    const x = scales.x(eventItem.minute);
    const y = scales.tempY(eventItem.temp);
    const label = formatAxisNumber(eventItem.temp) + "℃";
    const labelY = Math.max(plot.top + 2, Math.min(plot.top + plot.height - 12, y - 18));

    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = "#234b36";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, isChartPrintMode() ? 3 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#234b36";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, Math.max(plot.left + 14, Math.min(plot.left + plot.width - 14, x)), labelY);
    ctx.restore();
  }

  function resizeRoastChart(redraw) {
    var size = { width: 0, height: 0 };
    getChartTargets().forEach(function (target) {
      size = resizeChartTarget(target, redraw);
    });
    return size;
  }

  function resizeChartTarget(target, redraw) {
    const rect = target.canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(isChartPrintMode() ? 90 : 180, Math.round(rect.height));
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);

    if (target.canvas.width !== pixelWidth || target.canvas.height !== pixelHeight) {
      target.canvas.width = pixelWidth;
      target.canvas.height = pixelHeight;
    }
    target.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (redraw !== false) {
      updateRoastChart();
    }
    return { width: width, height: height };
  }

  function clearRoastChart(resetState) {
    getChartTargets().forEach(function (target) {
      clearChartTarget(target, resetState);
    });
  }

  function clearChartTarget(target, resetState) {
    if (resetState) {
      window.clearTimeout(chartUpdateTimer);
      target.canvas.parentElement.classList.remove("has-data");
    }
    const ratio = window.devicePixelRatio || 1;
    target.context.clearRect(0, 0, target.canvas.width / ratio, target.canvas.height / ratio);
  }

  function updateRoastChart() {
    if (!getChartTargets().length) {
      return;
    }
    window.clearTimeout(chartUpdateTimer);
    chartUpdateTimer = window.setTimeout(drawRoastChart, 80);
  }

  function prepareChartForPrint() {
    chartPrintMode = true;
    window.clearTimeout(chartUpdateTimer);
    drawRoastChart();
  }

  function restoreChartAfterPrint() {
    chartPrintMode = false;
    window.clearTimeout(chartUpdateTimer);
    drawRoastChart();
  }

  function isChartPrintMode() {
    return chartPrintMode || (window.matchMedia && window.matchMedia("print").matches);
  }

  function getChartTargets() {
    var targets = [];
    if (roastChartCanvas && roastChartContext) {
      targets.push({ canvas: roastChartCanvas, context: roastChartContext });
    }
    if (viewerRoastChartCanvas && viewerRoastChartCanvas._chartContext) {
      targets.push({ canvas: viewerRoastChartCanvas, context: viewerRoastChartCanvas._chartContext });
    }
    return targets;
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
        return plot.left + (minute / data.xMax) * plot.width;
      },
      tempY: function (value) {
        return plot.top + ((tempRange.max - value) / (tempRange.max - tempRange.min)) * plot.height;
      },
      rorY: function (value) {
        return plot.top + ((rorRange.max - value) / (rorRange.max - rorRange.min)) * plot.height;
      },
      xMax: data.xMax,
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
