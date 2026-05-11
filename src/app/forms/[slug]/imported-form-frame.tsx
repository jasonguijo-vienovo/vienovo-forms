"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function injectBridgeScript(htmlSource: string, fields: ImportedFieldDefinition[]) {
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
    var controls = document.querySelectorAll("input[name], select[name], textarea[name]");
    Array.prototype.forEach.call(controls, function (control) {
      var name = control.name;
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

  function applyValues(values) {
    values = values || {};
    Array.prototype.forEach.call(document.querySelectorAll("input[name], select[name], textarea[name]"), function (control) {
      var name = control.name;
      if (!name || !(name in values)) return;
      var value = values[name];
      var type = (control.type || "").toLowerCase();

      if (type === "checkbox") {
        if (Array.isArray(value)) control.checked = value.indexOf(control.value) >= 0;
        else control.checked = value === "Yes" || value === true || value === control.value;
        return;
      }
      if (type === "radio") {
        control.checked = String(control.value) === String(value);
        return;
      }
      if (type === "file") return;
      control.value = Array.isArray(value) ? value.join(", ") : String(value == null ? "" : value);
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
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

export function ImportedFormFrame({ slug: _slug, htmlSource, fields, submitAction }: ImportedFormFrameProps) {
  const [height, setHeight] = useState(900);
  const [draftSavedAt, setDraftSavedAt] = useState<string>("");
  const heightRef = useRef(900);
  const payloadRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => injectBridgeScript(htmlSource, fields), [fields, htmlSource]);
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
