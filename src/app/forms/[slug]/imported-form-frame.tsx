"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ImportedFieldDefinition } from "@/lib/imported-forms";

type ImportedFormFrameProps = {
  slug?: string;
  htmlSource: string;
  fields: ImportedFieldDefinition[];
  submitAction: (formData: FormData) => void | Promise<void>;
};

type ImportedFrameMessage =
  | {
      type: "vienovo-imported-submit";
      values: Record<string, unknown>;
      labels: Record<string, string>;
    }
  | { type: "vienovo-imported-height"; height: number };

function safeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function injectBridgeScript(htmlSource: string, fields: ImportedFieldDefinition[], slug = "") {
  const isSalaryLoan = String(slug).trim().toLowerCase() === "salary-loan-application";
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
  const bridgeData = safeScriptJson({ optionsByName, labelsByName });

  const bridgeScript = `
<style>
  html, body {
    max-width: 100%;
    overflow: hidden;
  }
  *, *::before, *::after {
    box-sizing: border-box;
  }
  img, svg, canvas, video, iframe, table, input, select, textarea {
    max-width: 100%;
  }
  .vf-search-shell {
    position: relative;
    width: 100%;
    margin-top: 4px;
  }
  .vf-search-input {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 11px 40px 11px 12px;
    font-size: 14px;
    line-height: 1.2;
    background: #fff;
    color: #0f172a;
  }
  .vf-search-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }
  .vf-search-menu {
    position: absolute;
    z-index: 40;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
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
  body.vf-salary-loan {
    background: #f8fafc;
    padding: 14px 10px 8px;
  }
  body.vf-salary-loan form {
    max-width: 820px;
    margin: 0 auto;
    border: 1px solid #d6e3ef;
    border-radius: 16px;
    background: #ffffff;
    padding: 20px 18px 14px;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07);
  }
  body.vf-salary-loan h1,
  body.vf-salary-loan h2,
  body.vf-salary-loan h3,
  body.vf-salary-loan label,
  body.vf-salary-loan p,
  body.vf-salary-loan span {
    color: #0f172a;
  }
  body.vf-salary-loan label {
    display: inline-block;
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  body.vf-salary-loan input,
  body.vf-salary-loan select,
  body.vf-salary-loan textarea {
    border-radius: 12px !important;
    border-color: #bfd1e2 !important;
    min-height: 44px;
    padding-left: 12px !important;
    padding-right: 12px !important;
    background: #fff !important;
    box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
  }
  body.vf-salary-loan input:focus,
  body.vf-salary-loan select:focus,
  body.vf-salary-loan textarea:focus,
  body.vf-salary-loan .vf-search-input:focus {
    border-color: #0f766e !important;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12) !important;
    outline: none !important;
  }
  body.vf-salary-loan .vf-search-shell {
    margin-top: 2px;
  }
  body.vf-salary-loan .vf-search-input {
    min-height: 44px;
    border: 1px solid #bfd1e2;
    border-radius: 12px;
    font-size: 15px;
    color: #0f172a;
    background: #fff;
  }
  body.vf-salary-loan .vf-search-menu {
    border: 1px solid #c8d7e7;
    border-radius: 12px;
    box-shadow: 0 16px 34px rgba(15, 23, 42, 0.12);
    max-height: 270px;
  }
  body.vf-salary-loan .vf-search-item {
    padding: 9px 12px;
    border-bottom: 1px solid #edf2f7;
    font-size: 14px;
  }
  body.vf-salary-loan .vf-search-item:last-child {
    border-bottom: none;
  }
  body.vf-salary-loan .vf-search-item:hover {
    background: #ecfeff;
    color: #0f172a;
  }
  body.vf-salary-loan .vf-search-clear {
    border-color: #c8d7e7;
    color: #475569;
    background: #f8fafc;
  }
</style>
<script>
(function () {
  var bridge = ${bridgeData};
  var hasSubmittedToParent = false;
  var suppressAutoSubmitUntil = 0;

  function markAutoSubmitSuppressed() {
    suppressAutoSubmitUntil = Date.now() + 300;
  }

  function shouldSuppressAutoSubmit() {
    return Date.now() < suppressAutoSubmitUntil;
  }

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

  function optionLabel(option) {
    return typeof option === "string" ? option : option.label || option.value || "";
  }

  function optionValue(option) {
    return typeof option === "string" ? option : option.value || option.label || "";
  }

  function isSearchableField(name) {
    var key = normalize(name || "");
    return key.indexOf("manager") >= 0 || key.indexOf("supervisor") >= 0 || key.indexOf("department") >= 0;
  }

  function attachSearchableSelect(select) {
    if (!select || select.dataset.vfSearchInit === "1") return;
    var name = select.getAttribute("name") || select.id || "";
    if (!isSearchableField(name)) return;
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
    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "vf-search-clear";
    clear.textContent = "×";
    clear.setAttribute("aria-label", "Clear search");
    clear.setAttribute("data-show", "0");
    shell.appendChild(input);
    shell.appendChild(clear);
    shell.appendChild(menu);

    select.style.display = "none";
    select.parentNode && select.parentNode.insertBefore(shell, select.nextSibling);

    function allOptions() {
      return Array.prototype.slice.call(select.options || []).filter(function (opt) {
        return String(opt.value || "").trim() !== "";
      });
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
      menu.setAttribute("data-open", options.length ? "1" : "0");
      clear.setAttribute("data-show", q ? "1" : "0");
    }

    var current = allOptions().find(function (opt) { return opt.value === select.value; });
    if (current) input.value = String(current.textContent || current.value || "");

    input.addEventListener("focus", function () { render(input.value); });
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("blur", function () {
      setTimeout(function () { menu.setAttribute("data-open", "0"); }, 120);
    });
    clear.addEventListener("mousedown", function (event) {
      event.preventDefault();
      input.value = "";
      select.value = "";
      render("");
      input.focus();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function populateNativeSelects() {
    Array.prototype.forEach.call(document.querySelectorAll("select[name], select[id]"), function (select) {
      var name = select.getAttribute("name") || select.id;
      var options = findOptions(name);
      if (!options.length) return;
      select.innerHTML = select.required ? "" : '<option value="">-- Select --</option>';
      options.forEach(function (option) {
        var node = document.createElement("option");
        node.value = optionValue(option);
        node.textContent = optionLabel(option);
        select.appendChild(node);
      });
      select.disabled = false;
      select.removeAttribute("readonly");
      attachSearchableSelect(select);
    });
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
    var controls = document.querySelectorAll(
      "input[name], input[id], select[name], select[id], textarea[name], textarea[id]"
    );
    Array.prototype.forEach.call(controls, function (control) {
      var name = control.name || control.id;
      if (!name || ["submit", "button", "reset", "image"].indexOf((control.type || "").toLowerCase()) >= 0) {
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

  function postHeight() {
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

  function normalizeKey(value) {
    return normalize(String(value || ""));
  }

  function looksLikeSubmitMethod(prop) {
    var name = normalizeKey(prop);
    return (
      name.indexOf("submit") >= 0 ||
      name.indexOf("save") >= 0 ||
      name.indexOf("send") >= 0 ||
      name.indexOf("create") >= 0 ||
      name.indexOf("process") >= 0 ||
      name.indexOf("request") >= 0
    );
  }

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function mergeIntoPayload(target, source) {
    if (!isPlainObject(source)) return;
    Object.keys(source).forEach(function (key) {
      if (!key) return;
      var value = source[key];
      if (value == null) {
        target[key] = "";
        return;
      }
      if (Array.isArray(value)) {
        target[key] = value.map(function (item) { return String(item ?? ""); });
        return;
      }
      target[key] = String(value);
    });
  }

  function collectSubmitArgs(args) {
    var values = {};
    Array.prototype.forEach.call(args || [], function (arg) {
      if (!arg) return;
      if (arg instanceof HTMLFormElement) {
        var formData = new FormData(arg);
        formData.forEach(function (value, key) {
          if (value instanceof File) {
            values[key] = value.name || "";
            return;
          }
          values[key] = String(value ?? "");
        });
        return;
      }
      if (arg instanceof Event && arg.target instanceof HTMLFormElement) {
        var eventFormData = new FormData(arg.target);
        eventFormData.forEach(function (value, key) {
          if (value instanceof File) {
            values[key] = value.name || "";
            return;
          }
          values[key] = String(value ?? "");
        });
        return;
      }
      if (isPlainObject(arg)) {
        mergeIntoPayload(values, arg);
      }
    });
    return values;
  }

  function submitToParent() {
    if (hasSubmittedToParent) return;
    hasSubmittedToParent = true;
    var payload = collectValues();
    window.parent.postMessage({
      type: "vienovo-imported-submit",
      values: payload.values,
      labels: payload.labels
    }, "*");
  }

  function submitArgsToParent(args) {
    if (hasSubmittedToParent) return;
    hasSubmittedToParent = true;
    var payload = collectValues();
    mergeIntoPayload(payload.values, collectSubmitArgs(args));
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
            var args = arguments;
            if (looksLikeSubmitMethod(name)) {
              submitArgsToParent(args);
              if (successHandler) setTimeout(function () { successHandler(); }, 0);
              return proxy;
            }
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

  var nativeSubmit = HTMLFormElement.prototype.submit;
  var nativeRequestSubmit = HTMLFormElement.prototype.requestSubmit;

  HTMLFormElement.prototype.submit = function () {
    if (shouldSuppressAutoSubmit()) {
      postHeight();
      return;
    }
    submitArgsToParent([this]);
  };

  if (nativeRequestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function (submitter) {
      if (shouldSuppressAutoSubmit()) {
        postHeight();
        return;
      }
      submitArgsToParent([this, submitter]);
    };
  }

  window.addEventListener("load", function () {
    if (${JSON.stringify(isSalaryLoan)}) {
      document.body.classList.add("vf-salary-loan");
    }
    populateNativeSelects();
    postHeight();
    setTimeout(postHeight, 300);
    setTimeout(postHeight, 1000);
  });

  document.addEventListener("submit", function (event) {
    event.preventDefault();
    if (shouldSuppressAutoSubmit()) {
      postHeight();
      return;
    }
    submitToParent();
  }, true);

  document.addEventListener("change", function (event) {
    var target = event.target;
    if (!target || !target.tagName) return;
    var tagName = String(target.tagName).toLowerCase();
    if (tagName === "select") {
      markAutoSubmitSuppressed();
      setTimeout(postHeight, 0);
      return;
    }
    if (tagName === "input" || tagName === "textarea") {
      var type = String(target.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        markAutoSubmitSuppressed();
        setTimeout(postHeight, 0);
      }
    }
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
    new ResizeObserver(postHeight).observe(document.documentElement);
  }
})();
</script>`;

  if (/<\/body>/i.test(htmlSource)) {
    return htmlSource.replace(/<\/body>/i, `${bridgeScript}</body>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8" /></head><body>${htmlSource}${bridgeScript}</body></html>`;
}

export function ImportedFormFrame({ slug, htmlSource, fields, submitAction }: ImportedFormFrameProps) {
  const [height, setHeight] = useState(320);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const payloadRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitLockRef = useRef(false);
  const srcDoc = useMemo(() => injectBridgeScript(htmlSource, fields, slug), [fields, htmlSource, slug]);

  useEffect(() => {
    function onMessage(event: MessageEvent<ImportedFrameMessage>) {
      const message = event.data;
      if (!message || typeof message !== "object") return;

      if (message.type === "vienovo-imported-height") {
        const measured = Number(message.height) || 320;
        const withPadding = measured + 2;
        setHeight(Math.min(Math.max(withPadding, 120), 1400));
        return;
      }

      if (message.type === "vienovo-imported-submit") {
        if (!payloadRef.current || !formRef.current) return;
        if (submitLockRef.current) return;
        submitLockRef.current = true;
        setIsSubmitting(true);
        payloadRef.current.value = JSON.stringify({
          values: message.values ?? {},
          labels: message.labels ?? {},
        });
        formRef.current.requestSubmit();
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      {isSubmitting ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
          <div className="rounded-xl border border-surface-border bg-white px-5 py-4 text-sm font-semibold text-surface-text shadow-xl">
            Submitting request...
          </div>
        </div>
      ) : null}
      <iframe
        title="Imported legacy form"
        sandbox="allow-scripts allow-forms"
        srcDoc={srcDoc}
        className="w-full overflow-hidden rounded-xl border border-brand-100 bg-white"
        scrolling="no"
        style={{ height }}
      />
      <form ref={formRef} action={submitAction} className="hidden">
        <input ref={payloadRef} type="hidden" name="__payload" />
        <SubmitStateSync onPendingChange={(pending) => setIsSubmitting(pending)} />
      </form>
    </>
  );
}

function SubmitStateSync({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) {
  const { pending } = useFormStatus();

  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);

  return null;
}
