"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportedFieldDefinition, ImportedFieldOption } from "@/lib/imported-forms";

type ImportedFormFrameProps = {
  slug?: string;
  htmlSource: string;
  fields: ImportedFieldDefinition[];
  optionSets?: Record<string, ImportedFieldOption[]>;
  submitAction: (formData: FormData) => void | Promise<void>;
};

type ImportedFrameMessage =
  | {
      type: "vienovo-imported-submit";
      values: Record<string, unknown>;
      labels: Record<string, string>;
    }
  | {
      type: "vienovo-imported-draft";
      values: Record<string, unknown>;
      labels: Record<string, string>;
    }
  | { type: "vienovo-imported-ready" }
  | { type: "vienovo-imported-height"; height: number };

function safeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function injectBridgeScript(
  htmlSource: string,
  fields: ImportedFieldDefinition[],
  optionSets?: Record<string, ImportedFieldOption[]>,
  slug?: string,
) {
  const optionsByName = Object.fromEntries(
    fields.map((field) => [
      field.name,
      (field.options ?? []).map((option) => ({
        value: option.value,
        label: option.label,
      })),
    ])
  );
  const labelsByName = Object.fromEntries(fields.map((field) => [field.name, field.label]));
  const bridgeData = safeScriptJson({ optionsByName, optionSets: optionSets ?? {}, labelsByName, slug: slug ?? "" });

  const bridgeScript = `
<style>
  html, body {
    max-width: 100%;
    overflow: hidden;
  }
  .vf-search-shell {
    position: relative;
    width: 100%;
    margin-top: 4px;
  }
  .vf-search-input {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 10px 40px 10px 12px;
    font-size: 14px;
    line-height: 1.2;
    background: #fff;
    color: #0f172a;
  }
  .vf-search-menu {
    position: fixed;
    z-index: 9999;
    left: 0;
    width: 280px;
    max-height: 260px;
    overflow: auto;
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
    display: none;
  }
  .vf-search-menu[data-open="1"] {
    display: block;
  }
  .vf-search-menu[data-direction="down"] {
    transform-origin: top center;
  }
  .vf-search-item {
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.25;
    cursor: pointer;
    color: #0f172a;
  }
  .vf-search-item:hover {
    background: #eff6ff;
  }
  .vf-search-clear {
    position: absolute;
    right: 9px;
    top: 50%;
    transform: translateY(-50%);
    width: 22px;
    height: 22px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #fff;
    color: #64748b;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    line-height: 1;
  }
  .vf-search-clear[data-show="1"] {
    display: inline-flex;
  }
</style>
<script>
(function () {
  var bridge = ${bridgeData};
  var heightFrame = null;
  var draftTimer = null;

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function findOptions(name) {
    if (!name) return [];
    if (bridge.optionsByName[name]) return bridge.optionsByName[name];
    var key = normalize(name);
    var found = Object.keys(bridge.optionsByName).find(function (candidate) {
      var normalized = normalize(candidate);
      return normalized === key || normalized.indexOf(key) >= 0 || key.indexOf(normalized) >= 0;
    });
    return found ? bridge.optionsByName[found] : [];
  }

  function findOptionSet(name) {
    if (!name || !bridge.optionSets) return [];
    if (bridge.optionSets[name]) return bridge.optionSets[name];
    var key = normalize(name);
    var found = Object.keys(bridge.optionSets).find(function (candidate) {
      var normalized = normalize(candidate);
      return normalized === key || normalized.indexOf(key) >= 0 || key.indexOf(normalized) >= 0;
    });
    return found ? bridge.optionSets[found] : [];
  }

  function optionLabel(option) {
    return typeof option === "string" ? option : option.label || option.value || "";
  }

  function optionValue(option) {
    return typeof option === "string" ? option : option.value || option.label || "";
  }

  function isOtherText(value) {
    var normalized = String(value || "").trim().toLowerCase();
    return normalized === "other" || normalized === "others";
  }

  function sortOptionsOtherLast(options) {
    var regular = [];
    var others = [];
    (options || []).forEach(function (option) {
      var label = optionLabel(option);
      var value = optionValue(option);
      if (isOtherText(label) || isOtherText(value)) {
        others.push(option);
      } else {
        regular.push(option);
      }
    });
    return regular.concat(others);
  }

  function isSearchableField(name, select) {
    var key = normalize(name || "");
    if (select && String(select.getAttribute("data-searchable") || "").toLowerCase() === "true") return true;
    return key.indexOf("manager") >= 0 || key.indexOf("supervisor") >= 0 || key.indexOf("department") >= 0;
  }

  function updateSearchableSelectDisplay(select) {
    if (!select) return;
    var shell = select.nextElementSibling;
    if (!shell || !shell.classList || !shell.classList.contains("vf-search-shell")) return;
    var input = shell.querySelector(".vf-search-input");
    if (!input) return;
    var current = Array.prototype.slice.call(select.options || []).find(function (opt) {
      return opt.value === select.value;
    });
    input.value = current && current.value ? String(current.textContent || current.value || "") : "";
  }

  function attachSearchableSelect(select) {
    if (!select || select.dataset.vfSearchInit === "1") return;
    var name = select.getAttribute("name") || select.id || "";
    if (!isSearchableField(name, select)) return;
    select.dataset.vfSearchInit = "1";

    var shell = document.createElement("div");
    shell.className = "vf-search-shell";
    var input = document.createElement("input");
    input.type = "text";
    input.className = "vf-search-input";
    input.autocomplete = "off";
    input.placeholder = "Search " + (bridge.labelsByName[name] || name || "option");

    var menu = document.createElement("div");
    menu.className = "vf-search-menu";
    menu.setAttribute("data-open", "0");
    menu.setAttribute("data-direction", "down");
    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "vf-search-clear";
    clear.textContent = "x";
    clear.setAttribute("aria-label", "Clear search");
    clear.setAttribute("data-show", "0");
    shell.appendChild(input);
    shell.appendChild(clear);
    document.body.appendChild(menu);

    select.style.display = "none";
    select.parentNode && select.parentNode.insertBefore(shell, select.nextSibling);

    function allOptions() {
      return Array.prototype.slice.call(select.options || []).filter(function (opt) {
        return String(opt.value || "").trim() !== "";
      });
    }

    function positionMenu(direction) {
      var inputRect = input.getBoundingClientRect();
      var menuHeight = Math.min(menu.scrollHeight || 260, 260);
      var top = direction === "up"
        ? Math.max(8, inputRect.top - menuHeight - 4)
        : Math.min((window.innerHeight || 0) - menuHeight - 8, inputRect.bottom + 4);
      menu.style.left = Math.round(inputRect.left) + "px";
      menu.style.top = Math.round(top) + "px";
      menu.style.width = Math.round(inputRect.width) + "px";
    }

    function closeMenu() {
      menu.setAttribute("data-open", "0");
    }

    function render(query) {
      var q = normalize(String(query || ""));
      var options = allOptions().filter(function (opt) {
        return q ? normalize(opt.textContent || opt.value || "").indexOf(q) >= 0 : true;
      }).slice(0, 120);
      menu.innerHTML = "";
      options.forEach(function (opt) {
        var item = document.createElement("div");
        item.className = "vf-search-item";
        item.textContent = String(opt.textContent || opt.value || "");
        item.addEventListener("mousedown", function (event) {
          event.preventDefault();
          select.value = opt.value;
          input.value = item.textContent || "";
          menu.setAttribute("data-open", "0");
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        menu.appendChild(item);
      });
      var inputRect = input.getBoundingClientRect();
      var estimatedMenuHeight = Math.min(options.length * 36, 260);
      var spaceAbove = inputRect.top;
      var spaceBelow = (window.innerHeight || 0) - inputRect.bottom;
      var direction = (spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove) ? "down" : "up";
      menu.setAttribute("data-direction", direction);
      positionMenu(direction);
      menu.setAttribute("data-open", options.length ? "1" : "0");
      clear.setAttribute("data-show", q ? "1" : "0");
    }

    var current = allOptions().find(function (opt) { return opt.value === select.value; });
    if (current) input.value = String(current.textContent || current.value || "");

    input.addEventListener("focus", function () { render(input.value); });
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("blur", function () {
      setTimeout(closeMenu, 120);
    });
    clear.addEventListener("mousedown", function (event) {
      event.preventDefault();
      input.value = "";
      select.value = "";
      render("");
      input.focus();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    document.addEventListener("mousedown", function (event) {
      var target = event.target;
      if (shell.contains(target) || menu.contains(target)) return;
      closeMenu();
    });
    window.addEventListener("resize", function () {
      if (menu.getAttribute("data-open") !== "1") return;
      positionMenu(menu.getAttribute("data-direction") === "up" ? "up" : "down");
    });
    window.addEventListener("scroll", function () {
      if (menu.getAttribute("data-open") !== "1") return;
      positionMenu(menu.getAttribute("data-direction") === "up" ? "up" : "down");
    }, true);
    select.addEventListener("change", function () {
      updateSearchableSelectDisplay(select);
    });
  }

  function fillSelectOptions(select, options, placeholder) {
    if (!select) return;
    select.innerHTML = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder || "Select";
    select.appendChild(first);
    sortOptionsOtherLast(options).forEach(function (option) {
      var node = document.createElement("option");
      node.value = optionValue(option);
      node.textContent = optionLabel(option);
      select.appendChild(node);
    });
    updateSearchableSelectDisplay(select);
  }

  function populateNativeSelects() {
    Array.prototype.forEach.call(document.querySelectorAll("select[name], select[id]"), function (select) {
      var name = select.getAttribute("name") || select.id;
      var options = findOptions(name);
      if (!options.length) return;
      fillSelectOptions(select, options, select.required ? "Select" : "-- Select --");
      select.disabled = false;
      select.removeAttribute("readonly");
      attachSearchableSelect(select);
    });
  }

  function applyRequestForPaymentSupplierOptions() {
    if (String(bridge.slug || "") !== "request-for-payment") return;

    var supplier = document.getElementById("supplier");
    if (!supplier) return;

    var serviceOptions = findOptionSet("__rfpSupplierService");
    var rawOptions = findOptionSet("__rfpSupplierRawMatsDiesel");
    if (!serviceOptions.length && !rawOptions.length) return;

    function syncSupplierOptions() {
      var checked = document.querySelector('input[name="supplierType"]:checked');
      var supplierType = checked ? String(checked.value || "").trim() : "";
      var nextOptions = [];
      if (supplierType === "Service") nextOptions = serviceOptions;
      if (supplierType === "Raw Mats & Diesel") nextOptions = rawOptions;

      var previousValue = supplier.value;
      fillSelectOptions(supplier, nextOptions, supplierType ? "Select" : "Select supplier type first");
      supplier.disabled = !supplierType || !nextOptions.length;
      if (previousValue && nextOptions.some(function (option) { return optionValue(option) === previousValue; })) {
        supplier.value = previousValue;
      } else {
        supplier.value = "";
      }
      updateSearchableSelectDisplay(supplier);
      supplier.dispatchEvent(new Event("change", { bubbles: true }));
      queueHeightPost();
    }

    attachSearchableSelect(supplier);
    Array.prototype.forEach.call(document.querySelectorAll('input[name="supplierType"]'), function (radio) {
      if (radio.dataset.vfSupplierInit === "1") return;
      radio.dataset.vfSupplierInit = "1";
      radio.addEventListener("change", syncSupplierOptions);
      radio.addEventListener("input", syncSupplierOptions);
    });

    syncSupplierOptions();
  }

  function hideReferenceFieldsForControlLog() {
    if (String(bridge.slug || "") !== "fixed-assets-control-log-form") return;
    var patterns = ["reference", "refid", "ref id", "ref#"];
    var controls = document.querySelectorAll("input[name], input[id], textarea[name], textarea[id], select[name], select[id]");
    Array.prototype.forEach.call(controls, function (control) {
      var key = normalize((control.name || "") + " " + (control.id || ""));
      var labelText = normalize(labelFor(control));
      var isRef = patterns.some(function (p) {
        var n = normalize(p);
        return key.indexOf(n) >= 0 || labelText.indexOf(n) >= 0;
      });
      if (!isRef) return;
      var wrapper = control.closest("label") || control.closest(".form-group") || control.parentElement;
      if (wrapper) {
        wrapper.style.display = "none";
      } else {
        control.style.display = "none";
      }
    });
  }

  function findFieldContainer(control) {
    if (!control) return null;
    return (
      control.closest(".form-group") ||
      control.closest(".field") ||
      control.closest(".mb-3") ||
      control.closest(".mb-4") ||
      control.closest(".row") ||
      control.closest("td") ||
      control.closest("label") ||
      control.parentElement
    );
  }

  function setConditionalVisibility(control, visible) {
    if (!control) return;
    var container = findFieldContainer(control);
    if (container) {
      container.style.display = visible ? "" : "none";
    } else {
      control.style.display = visible ? "" : "none";
    }

    if (visible) {
      control.removeAttribute("data-vf-conditional-hidden");
      return;
    }

    control.setAttribute("data-vf-conditional-hidden", "1");
    var tagName = String(control.tagName || "").toLowerCase();
    var type = String(control.type || "").toLowerCase();
    if (tagName === "select" || tagName === "textarea" || ["text", "email", "number", "date", "time", "tel", "hidden"].indexOf(type) >= 0) {
      control.value = "";
    }
    if (type === "checkbox" || type === "radio") {
      control.checked = false;
    }
  }

  function setConditionalWrapperVisibility(wrapperId, controlId, visible) {
    var wrapper = document.getElementById(wrapperId);
    var control = document.getElementById(controlId);
    if (wrapper) {
      wrapper.style.display = visible ? "" : "none";
    } else {
      setConditionalVisibility(control, visible);
      return;
    }

    if (visible || !control) {
      if (control) control.removeAttribute("data-vf-conditional-hidden");
      return;
    }

    control.setAttribute("data-vf-conditional-hidden", "1");
    var tagName = String(control.tagName || "").toLowerCase();
    var type = String(control.type || "").toLowerCase();
    if (tagName === "select" || tagName === "textarea" || ["text", "email", "number", "date", "time", "tel", "hidden"].indexOf(type) >= 0) {
      control.value = "";
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (type === "checkbox" || type === "radio") {
      control.checked = false;
    }
  }

  function applyRequestForPaymentConditionalFields() {
    if (String(bridge.slug || "") !== "request-for-payment") return;

    var transactionTypeControl = document.getElementById("transactionType");
    if (!transactionTypeControl) return;

    function syncConditionalFields() {
      var transactionValue = String(transactionTypeControl.value || "").trim();
      var showExpense = transactionValue === "Operating Expense";
      var showCapex = transactionValue === "CAPEX";
      var showOthers = transactionValue === "Others";

      setConditionalWrapperVisibility("opExpenseWrap", "typeOfExpense", showExpense);
      setConditionalWrapperVisibility("natureCapexWrap", "natureOfCapex", showCapex);
      setConditionalWrapperVisibility("natureServicesWrap", "natureOfServices", showOthers);
      queueHeightPost();
    }

    if (transactionTypeControl.dataset.vfConditionalInit !== "1") {
      transactionTypeControl.dataset.vfConditionalInit = "1";
      transactionTypeControl.addEventListener("change", syncConditionalFields);
      transactionTypeControl.addEventListener("input", syncConditionalFields);
    }

    syncConditionalFields();
  }

  function labelFor(control) {
    var name = control.name || control.id || "";
    if (bridge.labelsByName[name]) return bridge.labelsByName[name];
    if (control.id) {
      var explicit = document.querySelector('label[for="' + CSS.escape(control.id) + '"]');
      if (explicit && explicit.textContent) return explicit.textContent.replace("*", "").trim();
    }
    var nearby = control.closest("label");
    if (nearby && nearby.textContent) return nearby.textContent.replace("*", "").trim();
    return name;
  }

  function collectValues() {
    var values = {};
    var labels = {};
    var controls = document.querySelectorAll("input[name], input[id], select[name], select[id], textarea[name], textarea[id]");
    Array.prototype.forEach.call(controls, function (control) {
      var name = control.name || control.id;
      if (!name || ["submit", "button", "reset", "image"].indexOf((control.type || "").toLowerCase()) >= 0) {
        return;
      }
      if (control.getAttribute("data-vf-conditional-hidden") === "1") {
        return;
      }
      labels[name] = labels[name] || labelFor(control);

      if ((control.type || "").toLowerCase() === "file") {
        values[name] = Array.prototype.map.call(control.files || [], function (file) { return file.name; });
        return;
      }

      if ((control.type || "").toLowerCase() === "checkbox") {
        if (control.value && control.value !== "on") {
          if (!Array.isArray(values[name])) values[name] = [];
          if (control.checked) values[name].push(control.value);
        } else {
          values[name] = control.checked ? "Yes" : "No";
        }
        return;
      }

      if ((control.type || "").toLowerCase() === "radio") {
        if (control.checked) values[name] = control.value;
        return;
      }

      values[name] = control.value == null ? "" : control.value;
    });
    return { values: values, labels: labels };
  }

  function applyValues(values) {
    values = values || {};
    Array.prototype.forEach.call(document.querySelectorAll("input[name], input[id], select[name], select[id], textarea[name], textarea[id]"), function (control) {
      var name = control.name || control.id;
      if (!name || !(name in values)) return;
      var value = values[name];
      var type = (control.type || "").toLowerCase();

      if (type === "checkbox") {
        if (Array.isArray(value)) control.checked = value.indexOf(control.value) >= 0;
        else control.checked = value === "Yes" || value === true || value === control.value;
        control.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (type === "radio") {
        control.checked = String(control.value) === String(value);
        if (control.checked) control.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (type === "file") return;
      control.value = Array.isArray(value) ? value.join(", ") : String(value == null ? "" : value);
      control.dispatchEvent(new Event("change", { bubbles: true }));
      updateSearchableSelectDisplay(control);
    });
    applyRequestForPaymentSupplierOptions();
    applyRequestForPaymentConditionalFields();
    queueHeightPost();
  }

  function postDraft() {
    draftTimer = null;
    var payload = collectValues();
    window.parent.postMessage({
      type: "vienovo-imported-draft",
      values: payload.values,
      labels: payload.labels
    }, "*");
  }

  function queueDraftPost() {
    if (draftTimer) window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(postDraft, 450);
  }

  function postHeight() {
    heightFrame = null;
    var body = document.body;
    var root = document.documentElement;
    var height = Math.max(
      body ? body.scrollHeight : 0,
      root ? root.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      root ? root.offsetHeight : 0
    );
    window.parent.postMessage({ type: "vienovo-imported-height", height: height }, "*");
  }

  function queueHeightPost() {
    if (heightFrame != null) return;
    if (window.requestAnimationFrame) {
      heightFrame = window.requestAnimationFrame(postHeight);
      return;
    }
    heightFrame = window.setTimeout(postHeight, 16);
  }

  function submitToParent() {
    var payload = collectValues();
    window.parent.postMessage({
      type: "vienovo-imported-submit",
      values: payload.values,
      labels: payload.labels
    }, "*");
  }

  function createGoogleScriptRunStub() {
    var successHandler = null;
    var failureHandler = null;
    var api = {};
    var proxy = new Proxy(api, {
      get: function (_target, prop) {
        if (prop === "withSuccessHandler") {
          return function (handler) {
            successHandler = typeof handler === "function" ? handler : null;
            return proxy;
          };
        }
        if (prop === "withFailureHandler") {
          return function (handler) {
            failureHandler = typeof handler === "function" ? handler : null;
            return proxy;
          };
        }
        return function () {
          try {
            var name = String(prop);
            var options = findOptions(name);
            var result = options.length ? options.map(optionLabel) : bridge.optionsByName;
            if (successHandler) setTimeout(function () { successHandler(result); }, 0);
          } catch (error) {
            if (failureHandler) failureHandler(error);
          }
          return proxy;
        };
      }
    });
    return proxy;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = window.google.script.run || createGoogleScriptRunStub();

  window.addEventListener("load", function () {
    populateNativeSelects();
    hideReferenceFieldsForControlLog();
    applyRequestForPaymentSupplierOptions();
    applyRequestForPaymentConditionalFields();
    window.parent.postMessage({ type: "vienovo-imported-ready" }, "*");
    queueHeightPost();
    setTimeout(queueHeightPost, 300);
    setTimeout(queueHeightPost, 1000);
  });

  window.addEventListener("message", function (event) {
    var message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "vienovo-imported-restore") {
      applyValues(message.values || {});
    }
  });

  document.addEventListener("input", queueDraftPost, true);
  document.addEventListener("change", queueDraftPost, true);

  document.addEventListener("submit", function (event) {
    event.preventDefault();
    submitToParent();
  }, true);

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("button, input[type=submit]") : null;
    if (!target) return;
    var type = (target.getAttribute("type") || "submit").toLowerCase();
    var text = (target.textContent || target.value || "").toLowerCase();
    if (type === "submit" || text.indexOf("submit") >= 0 || text.indexOf("send") >= 0) {
      event.preventDefault();
      submitToParent();
    }
  }, true);

  if (window.ResizeObserver) {
    new ResizeObserver(queueHeightPost).observe(document.documentElement);
  }
})();
</script>`;

  if (/<\/body>/i.test(htmlSource)) {
    return htmlSource.replace(/<\/body>/i, `${bridgeScript}</body>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8" /></head><body>${htmlSource}${bridgeScript}</body></html>`;
}

export function ImportedFormFrame({ slug: _slug, htmlSource, fields, optionSets, submitAction }: ImportedFormFrameProps) {
  const [height, setHeight] = useState(900);
  const [draftSavedAt, setDraftSavedAt] = useState<string>("");
  const heightRef = useRef(900);
  const payloadRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(
    () => injectBridgeScript(htmlSource, fields, optionSets, _slug),
    [fields, htmlSource, optionSets, _slug],
  );
  const draftKey = `vienovo:imported-draft:${_slug || "unknown"}`;

  useEffect(() => {
    function onMessage(event: MessageEvent<ImportedFrameMessage>) {
      const message = event.data;
      if (!message || typeof message !== "object") return;

      if (message.type === "vienovo-imported-height") {
        const nextHeight = Math.min(Math.max(Number(message.height) || 900, 500), 3000);
        if (nextHeight !== heightRef.current) {
          heightRef.current = nextHeight;
          setHeight(nextHeight);
        }
        return;
      }

      if (message.type === "vienovo-imported-ready") {
        try {
          const saved = window.localStorage.getItem(draftKey);
          if (saved && iframeRef.current?.contentWindow) {
            const parsed = JSON.parse(saved) as { values?: Record<string, unknown> };
            iframeRef.current.contentWindow.postMessage({
              type: "vienovo-imported-restore",
              values: parsed.values ?? {},
            }, "*");
            setDraftSavedAt(parsed ? "Restored local draft" : "");
          }
        } catch {
          // Ignore damaged local drafts; the form remains usable.
        }
        return;
      }

      if (message.type === "vienovo-imported-draft") {
        try {
          window.localStorage.setItem(
            draftKey,
            JSON.stringify({
              values: message.values ?? {},
              labels: message.labels ?? {},
              savedAt: new Date().toISOString(),
            }),
          );
          setDraftSavedAt("Draft saved locally");
        } catch {
          setDraftSavedAt("");
        }
        return;
      }

      if (message.type === "vienovo-imported-submit") {
        if (!payloadRef.current || !formRef.current) return;
        payloadRef.current.value = JSON.stringify({
          values: message.values ?? {},
          labels: message.labels ?? {},
        });
        try {
          window.localStorage.removeItem(draftKey);
        } catch {}
        formRef.current.requestSubmit();
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      <iframe
        ref={iframeRef}
        title="Imported legacy form"
        sandbox="allow-scripts allow-forms"
        srcDoc={srcDoc}
        className="w-full rounded-xl border border-brand-100 bg-white"
        scrolling="no"
        style={{ height, overflow: "hidden" }}
      />
      <form ref={formRef} action={submitAction} className="hidden">
        <input ref={payloadRef} type="hidden" name="__payload" />
      </form>
      {draftSavedAt ? <p className="mt-2 text-xs text-surface-muted">{draftSavedAt}</p> : null}
    </>
  );
}
