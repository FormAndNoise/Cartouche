#!/usr/bin/env node
/**
 * Live Visual Desktop Usability Controller for Cartouche (Tauri 2 / WebView2 CDP).
 * Connects to `127.0.0.1:9222` (exposed via WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"),
 * renders a visible animated cursor, target highlight box, click ripple, and live Agent HUD banner
 * directly inside the native Cartouche desktop window so a human observer can watch every action.
 *
 * Commands:
 *   node tools/ui_ctl.mjs observe [note]
 *   node tools/ui_ctl.mjs click <id> [note]
 *   node tools/ui_ctl.mjs type <id> <text> [note]
 *   node tools/ui_ctl.mjs select <id> <value> [note]
 *   node tools/ui_ctl.mjs key <KeyName> [note]
 *   node tools/ui_ctl.mjs hud <message>
 */

import fs from "node:fs";
import path from "node:path";

const CDP_PORT = Number(process.env.CARTOUCHE_CDP_PORT || 9222);
const SCREENSHOT_PATH = path.resolve(process.cwd(), "tools", "latest_screen.jpg");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageTarget() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  if (!res.ok) {
    throw new Error(`CDP HTTP ${res.status} on port ${CDP_PORT}`);
  }
  const targets = await res.json();
  const page = targets.find(
    (t) =>
      t.type === "page" &&
      (t.url.includes("localhost:1420") ||
        t.url.includes("tauri") ||
        t.title.includes("Cartouche")),
  );
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error(
      `No Cartouche WebView2 target found on port ${CDP_PORT}. Targets: ${JSON.stringify(targets.map((t) => ({ type: t.type, url: t.url, title: t.title })))}`,
    );
  }
  return page;
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.seq = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        /* ignore */
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.text ||
          res.exceptionDetails.exception?.description ||
          "Eval exception",
      );
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

const INJECT_HELPER = `
(() => {
  if (!window.__cartoucheAgentOverlay) {
    const root = document.createElement("div");
    root.id = "__cartouche-agent-overlay";
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:'IBM Plex Mono',monospace;";

    const cursor = document.createElement("div");
    cursor.id = "__cartouche-agent-cursor";
    cursor.style.cssText = "position:fixed;left:640px;top:400px;width:22px;height:22px;border-radius:50%;background:rgba(212,85,0,0.88);border:2.5px solid #fff;box-shadow:0 0 16px rgba(212,85,0,0.9);transform:translate(-50%,-50%);transition:left 0.42s cubic-bezier(0.22,1,0.36,1),top 0.42s cubic-bezier(0.22,1,0.36,1),transform 0.15s ease;pointer-events:none;";

    const ring = document.createElement("div");
    ring.id = "__cartouche-agent-ring";
    ring.style.cssText = "position:fixed;border:2px solid #D45500;background:rgba(212,85,0,0.12);border-radius:6px;pointer-events:none;transition:all 0.3s ease;opacity:0;";

    const hud = document.createElement("div");
    hud.id = "__cartouche-agent-hud";
    hud.style.cssText = "position:fixed;left:18px;bottom:18px;max-width:680px;background:rgba(20,20,20,0.94);color:#F6F1EA;border:1.5px solid #D45500;border-left:5px solid #D45500;padding:10px 16px;border-radius:8px;font-size:12.5px;line-height:1.4;box-shadow:0 8px 28px rgba(0,0,0,0.45);pointer-events:none;";
    hud.innerHTML = "<strong style='color:#FF7A29'>🤖 FLASH USABILITY AGENT</strong> · <span id='__cartouche-agent-hud-text'>Connected to live Cartouche window</span>";

    const badges = document.createElement("div");
    badges.id = "__cartouche-agent-badges";
    badges.style.cssText = "position:fixed;inset:0;pointer-events:none;";

    root.appendChild(badges);
    root.appendChild(ring);
    root.appendChild(cursor);
    root.appendChild(hud);
    document.body.appendChild(root);
    window.__cartoucheAgentOverlay = { root, cursor, ring, hud, badges };
  }

  window.__setAgentHud = (text) => {
    const el = document.getElementById("__cartouche-agent-hud-text");
    if (el && text) el.textContent = text;
  };

  window.__scanInteractiveElements = () => {
    const badgesContainer = document.getElementById("__cartouche-agent-badges");
    if (badgesContainer) badgesContainer.innerHTML = "";

    const selector = [
      "button",
      "input",
      "select",
      "textarea",
      "a[href]",
      "[role='button']",
      "[role='tab']",
      "[data-testid]",
      ".socket-card"
    ].join(",");

    const raw = Array.from(document.querySelectorAll(selector));
    const seen = new Set();
    const list = [];
    let idx = 1;

    for (const el of raw) {
      if (seen.has(el)) continue;
      if (el.closest("#__cartouche-agent-overlay")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;

      seen.add(el);
      const id = idx++;
      el.setAttribute("data-agent-id", String(id));

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || tag;
      const aria = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      const placeholder = el.getAttribute("placeholder") || "";
      const text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80);
      const label = aria || text || placeholder || title || el.getAttribute("data-testid") || tag;

      let value = "";
      if (tag === "input" || tag === "textarea" || tag === "select") {
        value = String(el.value ?? "").slice(0, 60);
      }
      let options = [];
      if (tag === "select") {
        options = Array.from(el.options).map((o) => o.value).slice(0, 12);
      }

      if (badgesContainer) {
        const b = document.createElement("div");
        b.textContent = String(id);
        b.style.cssText = \`position:fixed;left:\${Math.max(2, Math.round(rect.left))}px;top:\${Math.max(2, Math.round(rect.top))}px;background:#3F6E8C;color:#fff;font-size:10px;font-weight:700;padding:1px 4px;border-radius:3px;border:1px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);opacity:0.88;\`;
        badgesContainer.appendChild(b);
      }

      list.push({
        id,
        tag,
        role,
        label,
        value,
        disabled: Boolean(el.disabled),
        options: options.length ? options : undefined,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }

    const toasts = Array.from(document.querySelectorAll(".toast, [role='alert'], .error-box"))
      .map((t) => (t.innerText || t.textContent || "").replace(/\\s+/g, " ").trim())
      .filter(Boolean);

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((h) => (h.innerText || h.textContent || "").replace(/\\s+/g, " ").trim())
      .filter(Boolean);

    return {
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      headings,
      toasts,
      elements: list,
    };
  };

  window.__highlightElement = (id, note) => {
    if (note) window.__setAgentHud(note);
    const el = document.querySelector(\`[data-agent-id="\${id}"]\`);
    if (!el) return null;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = el.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);

    const cursor = document.getElementById("__cartouche-agent-cursor");
    const ring = document.getElementById("__cartouche-agent-ring");
    if (cursor) {
      cursor.style.left = cx + "px";
      cursor.style.top = cy + "px";
      cursor.style.transform = "translate(-50%,-50%) scale(1.25)";
      setTimeout(() => {
        cursor.style.transform = "translate(-50%,-50%) scale(0.9)";
      }, 380);
    }
    if (ring) {
      ring.style.left = Math.round(rect.left - 3) + "px";
      ring.style.top = Math.round(rect.top - 3) + "px";
      ring.style.width = Math.round(rect.width + 6) + "px";
      ring.style.height = Math.round(rect.height + 6) + "px";
      ring.style.opacity = "1";
    }
    return {
      cx,
      cy,
      tag: el.tagName.toLowerCase(),
      label: (el.innerText || el.getAttribute("aria-label") || el.value || "").trim().slice(0, 60),
    };
  };
})();
`;

async function captureAndPrintState(cdp, note) {
  await cdp.eval(INJECT_HELPER);
  if (note) {
    await cdp.eval(`window.__setAgentHud(${JSON.stringify(note)})`);
  }
  const state = await cdp.eval(`window.__scanInteractiveElements()`);

  try {
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 68,
    });
    if (shot?.data) {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(shot.data, "base64"));
    }
  } catch {
    /* ignore screenshot error */
  }

  console.log(
    `=== CARTOUCHE LIVE WINDOW (${state.viewport.width}x${state.viewport.height}) ===`,
  );
  if (state.headings.length) {
    console.log(`HEADINGS: ${state.headings.join(" | ")}`);
  }
  if (state.toasts.length) {
    console.log(`ALERTS / TOASTS: ${state.toasts.join(" | ")}`);
  }
  console.log(`SCREENSHOT SAVED: ${SCREENSHOT_PATH}`);
  console.log(`INTERACTIVE ELEMENTS (${state.elements.length}):`);
  for (const el of state.elements) {
    const valPart = el.value ? ` value=${JSON.stringify(el.value)}` : "";
    const optPart = el.options ? ` options=${JSON.stringify(el.options)}` : "";
    const disPart = el.disabled ? " [DISABLED]" : "";
    console.log(
      `  [${el.id}] <${el.tag}> ${JSON.stringify(el.label)}${valPart}${optPart}${disPart} @(${el.x},${el.y})`,
    );
  }
}

async function main() {
  const [, , cmd = "observe", arg1, arg2, arg3] = process.argv;
  const target = await getPageTarget();
  const cdp = new CdpSession(target.webSocketDebuggerUrl);
  await cdp.connect();

  try {
    await cdp.eval(INJECT_HELPER);
    await cdp. eval(`window.__scanInteractiveElements()`);

    if (cmd === "observe") {
      await captureAndPrintState(cdp, arg1 || "Observing current screen...");
    } else if (cmd === "hud") {
      await cdp.eval(`window.__setAgentHud(${JSON.stringify(arg1 || "")})`);
      console.log(`Updated HUD: ${arg1}`);
    } else if (cmd === "click") {
      const id = Number(arg1);
      const note = arg2 || `Clicking [${id}]...`;
      const info = await cdp.eval(
        `window.__highlightElement(${id}, ${JSON.stringify(note)})`,
      );
      if (!info) {
        throw new Error(`Element [${id}] not found on screen. Run 'observe' first.`);
      }
      await sleep(550);
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: info.cx,
        y: info.cy,
      });
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: info.cx,
        y: info.cy,
        button: "left",
        clickCount: 1,
      });
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: info.cx,
        y: info.cy,
        button: "left",
        clickCount: 1,
      });
      // Also trigger DOM click for React synthetic event reliability
      await cdp.eval(`
        (() => {
          const el = document.querySelector('[data-agent-id="${id}"]');
          if (el && typeof el.click === 'function') el.click();
        })()
      `);
      await sleep(550);
      console.log(`Clicked [${id}] (${info.tag}: ${info.label})`);
      await captureAndPrintState(cdp, `Clicked [${id}] ${info.label}`);
    } else if (cmd === "type") {
      const id = Number(arg1);
      const text = String(arg2 ?? "");
      const note = arg3 || `Typing "${text}" into [${id}]...`;
      const info = await cdp.eval(
        `window.__highlightElement(${id}, ${JSON.stringify(note)})`,
      );
      if (!info) {
        throw new Error(`Element [${id}] not found on screen.`);
      }
      await sleep(450);
      await cdp.eval(`
        (() => {
          const el = document.querySelector('[data-agent-id="${id}"]');
          if (!el) return;
          el.focus();
          const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) {
            setter.call(el, ${JSON.stringify(text)});
          } else {
            el.value = ${JSON.stringify(text)};
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `);
      await sleep(450);
      console.log(`Typed ${JSON.stringify(text)} into [${id}]`);
      await captureAndPrintState(cdp, `Typed "${text}" into [${id}]`);
    } else if (cmd === "select") {
      const id = Number(arg1);
      const val = String(arg2 ?? "");
      const note = arg3 || `Selecting "${val}" in [${id}]...`;
      const info = await cdp.eval(
        `window.__highlightElement(${id}, ${JSON.stringify(note)})`,
      );
      if (!info) {
        throw new Error(`Element [${id}] not found on screen.`);
      }
      await sleep(450);
      await cdp.eval(`
        (() => {
          const el = document.querySelector('[data-agent-id="${id}"]');
          if (!el) return;
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(el, ${JSON.stringify(val)});
          } else {
            el.value = ${JSON.stringify(val)};
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `);
      await sleep(450);
      console.log(`Selected ${JSON.stringify(val)} in [${id}]`);
      await captureAndPrintState(cdp, `Selected "${val}" in [${id}]`);
    } else if (cmd === "scroll") {
      const target = arg1 === "top" ? 0 : Number(arg1 || 0);
      const note = arg2 || `Scrolling to ${arg1}...`;
      await cdp.eval(`window.__setAgentHud(${JSON.stringify(note)})`);
      await cdp.eval(`
        (() => {
          window.scrollTo({ top: ${target}, behavior: 'smooth' });
          document.documentElement.scrollTop = ${target};
          document.body.scrollTop = ${target};
          const scrollables = document.querySelectorAll('*');
          for (const s of scrollables) {
            if (s.scrollTop > 0) s.scrollTop = ${target};
          }
        })()
      `);
      await sleep(500);
      await captureAndPrintState(cdp, note);
    } else if (cmd === "eval") {
      const code = String(arg1 || "");
      const note = arg2 || `Evaluating script...`;
      if (note) await cdp.eval(`window.__setAgentHud(${JSON.stringify(note)})`);
      const res = await cdp.eval(code);
      console.log("EVAL RESULT:", res);
      await captureAndPrintState(cdp, note);
    } else if (cmd === "key") {
      const key = String(arg1 || "Enter");
      const note = arg2 || `Pressing key "${key}"...`;
      await cdp.eval(`window.__setAgentHud(${JSON.stringify(note)})`);
      await cdp.eval(`
        (() => {
          const target = document.activeElement || document.body;
          target.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
          target.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(key)}, bubbles: true }));
        })()
      `);
      await sleep(450);
      await captureAndPrintState(cdp, `Pressed key "${key}"`);
    } else {
      throw new Error(`Unknown command: ${cmd}`);
    }
  } finally {
    cdp.close();
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message || err);
  process.exit(1);
});
