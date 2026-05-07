"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportedFieldDefinition } from "@/lib/imported-forms";

type ImportedFormFrameProps = {
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
  *, *::before, *::after {
    box-sizing: border-box;
  }
  img, svg, canvas, video, iframe, table, input, select, textarea {
    max-width: 100%;
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

export function ImportedFormFrame({ htmlSource, fields, submitAction }: ImportedFormFrameProps) {
  const [height, setHeight] = useState(900);
  const payloadRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const srcDoc = useMemo(() => injectBridgeScript(htmlSource, fields), [fields, htmlSource]);

  useEffect(() => {
    function onMessage(event: MessageEvent<ImportedFrameMessage>) {
      const message = event.data;
      if (!message || typeof message !== "object") return;

      if (message.type === "vienovo-imported-height") {
        setHeight(Math.min(Math.max(Number(message.height) || 900, 500), 3000));
        return;
      }

      if (message.type === "vienovo-imported-submit") {
        if (!payloadRef.current || !formRef.current) return;
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
      </form>
    </>
  );
}
