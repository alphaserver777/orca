/* PurpleFlow 0.10.0, 6476bf53c987b426418acad148b449ffbf4d4072
MIT License

Copyright (c) 2026 PurpleSchool

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var OrcaPurpleflow = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // integration/purpleflow/entry.tsx
  var entry_exports = {};
  __export(entry_exports, {
    PlanStageDrawer: () => PlanStageDrawer,
    mountPurpleflowDecision: () => mountPurpleflowDecision,
    mountPurpleflowTimeline: () => mountPurpleflowTimeline
  });

  // orca-native:react
  var React = OrcaTimelineReact();
  var react_default = React;
  var { useEffect, useState, useRef, forwardRef } = React;

  // orca-native:react-dom/client
  var createRoot = (...args) => OrcaTimelineClient().createRoot(...args);

  // orca-native:lucide-react
  var make = (d) => ({ size = 16, ...props }) => react_default.createElement("svg", { ...props, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, react_default.createElement("path", { d }));
  var ChevronRight = make("m9 5 7 7-7 7");
  var CircleCheck = make("M9 12l2 2 4-4 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0");
  var RotateCcw = make("M3 10a9 9 0 1 1 0 4 M3 4v6h6");
  var ClipboardCheck = make("M9 5H5v16h14V5h-4 M9 3h6v4H9z M9 14l2 2 4-4");
  var UserRoundCheck = make("M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M3 21v-2a7 7 0 0 1 12-5 M16 19l2 2 4-6");
  var MessageCircleQuestion = make("M21 11a9 9 0 0 1-9 9H3l1-5a9 9 0 1 1 17-4 M9 8a3 3 0 0 1 6 0c0 2-3 2-3 4 M12 15h.01");
  var Globe = make("M2 12h20 M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20 M12 2c6 6 6 14 0 20-6-6-6-14 0-20");
  var Wrench = make("m14 6 4 4 4-4a7 7 0 0 1-9 9L6 22l-4-4 7-7a7 7 0 0 1 9-9z");

  // integration/purpleflow/native.tsx
  var bridge = { platform: "linux" };
  var ms = (value) => value < 1e3 ? `${Math.floor(value)}\xA0\u043C\u0441` : value < 6e4 ? `${+(value / 1e3).toFixed(1)}\xA0\u0441` : value < 36e5 ? `${+(value / 6e4).toFixed(1)}\xA0\u043C\u0438\u043D` : `${+(value / 36e5).toFixed(1)}\xA0\u0447`;
  var activeClock = (run, now) => ({ total: Math.max(1e3, run.model.end - run.model.start), gaps: [], paused: 0 });
  var runStages = (run) => run.rows.map((r) => ({ id: r.id, title: r.label, gate: r.id === "approval" || r.id === "acceptance", hint: "\u041D\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0445 \u0441\u043E\u0431\u044B\u0442\u0438\u0439" }));
  var nodeState = (run, id) => {
    const attempts = run.rows.find((r) => r.id === id)?.attempts || [];
    if (attempts.some((a) => a.running && a.source === "Gate")) return "waiting";
    if (attempts.some((a) => a.running)) return "active";
    return attempts.length ? "done" : "idle";
  };
  var plannedRoute = () => ({});
  var stageBars = (run, clock, id) => {
    const span = Math.max(1e3, run.model.end - run.model.start);
    return (run.rows.find((r) => r.id === id)?.attempts || []).filter((a) => a.start !== null && a.end !== null).map((a, i) => ({
      attempt: { attempt: i + 1, stage: a.source === "Gate" ? "gate1" : id },
      kind: a.source === "Gate" ? a.running ? "wait-live" : "wait" : a.status === "failed" ? "fail" : a.running ? "live" : "done",
      left: 100 * (a.start - run.model.start) / span,
      width: 100 * (a.end - a.start) / span,
      took: a.duration,
      tip: a.source === "Gate" ? `\u0420\u0435\u0448\u0435\u043D\u0438\u0435 \u043F\u043E \u043F\u043B\u0430\u043D\u0443 \xB7 ${a.duration}` : `${a.label} \xB7 ${a.duration}`
    }));
  };
  var STAGE_ICON = new Proxy({}, { get: (_, id) => id === "approval" ? "\u25C7" : id === "acceptance" ? "\u2713" : "\xB7" });

  // integration/purpleflow/Timeline.tsx
  var LEGEND = [
    { kind: "done", label: "\u0420\u0430\u0431\u043E\u0442\u0430 \u0430\u0433\u0435\u043D\u0442\u0430 \u0438\u043B\u0438 \u043E\u0440\u043A\u0435\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430" },
    { kind: "live", label: "\u0418\u0434\u0451\u0442 \u0441\u0435\u0439\u0447\u0430\u0441" },
    { kind: "fail", label: "\u041D\u0435\u0443\u0434\u0430\u0447\u043D\u0430\u044F \u043F\u043E\u043F\u044B\u0442\u043A\u0430" },
    { kind: "wait", label: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430" }
  ];
  function useNow(run) {
    const live = run.status === "running" || run.status === "waiting";
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
      if (!live) return;
      const t = setInterval(() => setNow(Date.now()), 1e3);
      return () => clearInterval(t);
    }, [live]);
    return live ? now : Date.now();
  }
  var WORD = {
    idle: "\u0432\u043F\u0435\u0440\u0435\u0434\u0438",
    active: "\u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442",
    waiting: "\u0436\u0434\u0451\u0442 \u0432\u0430\u0441",
    done: "\u0433\u043E\u0442\u043E\u0432\u043E",
    failed: "\u043E\u0448\u0438\u0431\u043A\u0430",
    stopped: "\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
    stale: "\u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u043E"
  };
  var fits = (widthPct, text, trackWidth) => widthPct / 100 * trackWidth > text.length * 7 + 18;
  function Timeline({
    run,
    onSelect,
    selected = null,
    current = null,
    compact = false
  }) {
    const now = useNow(run);
    const clock = activeClock(run, now, { compressGates: true });
    const span = Math.max(1e3, clock.total);
    const axis = useRef(null), [axisWidth, setAxisWidth] = useState(0);
    useEffect(() => {
      const node = axis.current;
      if (!node) return;
      const observer = new ResizeObserver(() => setAxisWidth(node.clientWidth));
      observer.observe(node);
      return () => observer.disconnect();
    }, []);
    const divisions = axisWidth >= 300 ? 4 : axisWidth >= 180 ? 2 : 1;
    const ticks = Array.from({ length: divisions + 1 }, (_, i) => i / divisions);
    const plan = plannedRoute(run);
    const steps = runStages(run).map((s) => s.id).filter((id) => plan[id] === "planned");
    const reserve = steps.length ? steps.length * 20 + 8 : 0;
    const at = (pct) => reserve ? `calc((100% - ${reserve}px) * ${pct / 100})` : `${pct}%`;
    return /* @__PURE__ */ react_default.createElement("div", { className: `gantt is-large ${compact ? "is-compact" : ""}`, "aria-label": "\u0412\u0440\u0435\u043C\u044F \u043F\u043E \u0441\u0442\u0430\u0434\u0438\u044F\u043C" }, /* @__PURE__ */ react_default.createElement("div", { className: "gantt-grid", "aria-hidden": true }, ticks.map((f) => /* @__PURE__ */ react_default.createElement("i", { key: f, style: { left: at(f * 100) } }))), clock.gaps.length > 0 && /* @__PURE__ */ react_default.createElement("div", { className: "gantt-gaps" }, clock.gaps.map((g, i) => /* @__PURE__ */ react_default.createElement(
      "i",
      {
        key: i,
        style: { left: at(g.at / span * 100) },
        title: `\u041F\u0440\u043E\u0433\u043E\u043D \u0441\u0442\u043E\u044F\u043B ${ms(g.ms)} \u2014 \u043F\u043E\u0441\u043B\u0435 \u043E\u0448\u0438\u0431\u043A\u0438 \u0438\u043B\u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438. \u042D\u0442\u043E \u0432\u0440\u0435\u043C\u044F \u043D\u0435 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F.`
      }
    ))), runStages(run).map((st) => {
      const bars = stageBars(run, clock, st.id, now, 0.4);
      const state = nodeState(run, st.id);
      const planned = plan[st.id];
      const reachable = bars.length > 0 || st.id === run.next;
      const tries = bars.filter((b) => !b.attempt.stage.startsWith("gate") && b.attempt.stage !== "limit").length;
      return /* @__PURE__ */ react_default.createElement(
        "button",
        {
          key: st.id,
          "aria-current": current === st.id ? "step" : void 0,
          "aria-pressed": selected === st.id,
          className: `gantt-row is-click st-${state} ${planned ? `is-${planned}` : ""} ${selected === st.id ? "is-selected" : ""} ${current === st.id ? "is-current" : ""}`,
          onClick: () => onSelect?.(st.id),
          disabled: !reachable,
          title: reachable ? `\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0435\u0442\u0430\u043B\u0438 \xAB${st.title}\xBB` : st.hint
        },
        /* @__PURE__ */ react_default.createElement("span", { className: "gantt-label" }, /* @__PURE__ */ react_default.createElement("span", { className: `gantt-node ${st.gate ? "is-gate-node" : ""}` }, state === "active" ? /* @__PURE__ */ react_default.createElement("span", { className: "node-spin" }) : STAGE_ICON[st.id]), /* @__PURE__ */ react_default.createElement("span", { className: "gantt-name" }, /* @__PURE__ */ react_default.createElement("span", null, st.title, tries > 1 && /* @__PURE__ */ react_default.createElement("em", null, " \xD7", tries)), /* @__PURE__ */ react_default.createElement("small", { className: `w-${planned === "skip" ? "skip" : state}` }, planned === "skip" ? "\u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u0441\u044F" : planned && state === "stale" ? "\u043F\u0440\u043E\u0439\u0434\u0451\u0442 \u0441\u043D\u043E\u0432\u0430" : WORD[state]))),
        /* @__PURE__ */ react_default.createElement("span", { className: "gantt-track" }, planned === "planned" && /* @__PURE__ */ react_default.createElement(
          "i",
          {
            className: "gantt-ghost",
            style: { left: `calc(100% - ${reserve - 6 - steps.indexOf(st.id) * 20}px)`, width: 18 },
            title: `\u0414\u0430\u043B\u044C\u0448\u0435 \u043F\u043E \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0443: \u0448\u0430\u0433 ${steps.indexOf(st.id) + 1} \u0438\u0437 ${steps.length}`
          }
        ), bars.map((b, i) => {
          const full = `${bars.length > 1 ? `#${b.attempt.attempt} \xB7 ` : ""}${b.took}`;
          const label = compact || b.kind === "wait" || b.kind === "wait-live" ? "" : fits(b.width, full, axisWidth) ? full : fits(b.width, b.took, axisWidth) ? b.took : "";
          return /* @__PURE__ */ react_default.createElement("i", { key: i, className: `gantt-bar g-${b.kind}`, style: { left: at(b.left), width: at(b.width) }, title: b.tip }, label && /* @__PURE__ */ react_default.createElement("b", null, label));
        })),
        /* @__PURE__ */ react_default.createElement("span", { className: "gantt-go", "aria-hidden": true }, /* @__PURE__ */ react_default.createElement("span", null, "\u0414\u0435\u0442\u0430\u043B\u0438"), /* @__PURE__ */ react_default.createElement(ChevronRight, { size: 16 }))
      );
    }), /* @__PURE__ */ react_default.createElement("div", { ref: axis, className: "gantt-axis", style: reserve ? { marginRight: reserve } : void 0 }, ticks.map((f) => /* @__PURE__ */ react_default.createElement("span", { key: f }, f === 0 ? "0" : ms(span * f)))), /* @__PURE__ */ react_default.createElement("ul", { className: "gantt-legend" }, LEGEND.map((l) => /* @__PURE__ */ react_default.createElement("li", { key: l.kind }, /* @__PURE__ */ react_default.createElement("i", { className: `gantt-bar g-${l.kind}` }), l.label)), clock.gaps.length > 0 && /* @__PURE__ */ react_default.createElement("li", null, /* @__PURE__ */ react_default.createElement("i", { className: "gantt-gap-sample" }), "\u041F\u0430\u0443\u0437\u0430 \u043F\u043E\u0441\u043B\u0435 \u043E\u0448\u0438\u0431\u043A\u0438 \u0438\u043B\u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u2014 \u0432\u044B\u0440\u0435\u0437\u0430\u043D\u0430, ", ms(clock.paused))));
  }

  // integration/purpleflow/ui.tsx
  function Button({ tone = "ghost", icon, children, busy, className = "", ...rest }) {
    return /* @__PURE__ */ react_default.createElement("button", { ...rest, className: `btn btn-${tone} ${busy ? "is-busy" : ""} ${className}`, disabled: rest.disabled || busy }, busy ? /* @__PURE__ */ react_default.createElement("span", { className: "spinner", "aria-hidden": true }) : icon, children && /* @__PURE__ */ react_default.createElement("span", null, children));
  }
  var TextArea = forwardRef(function TextArea2({ className = "", ...rest }, ref) {
    return /* @__PURE__ */ react_default.createElement("textarea", { ref, ...rest, "aria-label": "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043A \u0440\u0435\u0434\u0430\u043A\u0446\u0438\u0438", maxLength: 8e3, className: `input textarea ${className}` });
  });

  // integration/purpleflow/keyboard.ts
  function isShortcutInput(target) {
    const input = target instanceof Element ? target.closest("input, textarea, [contenteditable]") : null;
    return input !== null && !input.matches(".monaco-editor textarea.inputarea");
  }

  // integration/purpleflow/GateBar.tsx
  function GateBar(props) {
    const { gate, comment, setComment, lineCount, busy, error } = props;
    const [open, setOpen] = useState(() => comment !== "");
    const keys = useRef(props);
    keys.current = props;
    useEffect(() => {
      const onKey = (e) => {
        if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.repeat) return;
        const p = keys.current;
        if (p.busy) return;
        const el = document.activeElement;
        const inGateComment = Boolean(el?.closest(".gate-comment"));
        if (!inGateComment && isShortcutInput(el)) return;
        const hasText = Boolean(p.comment.trim()) || p.lineCount > 0;
        const back = () => hasText ? p.onReject() : setOpen(true);
        const fix = () => hasText || (p.pickedCount ?? 0) > 0 ? p.onFix?.() : setOpen(true);
        e.preventDefault();
        e.stopPropagation();
        if (p.codeReview) return e.altKey ? fix() : e.shiftKey ? void 0 : p.onApprove();
        if (p.gate === "limit") return e.shiftKey ? void 0 : p.onApprove();
        if (e.altKey && p.gate === "gate2" && p.onFix) return fix();
        if (e.shiftKey) return back();
        if (inGateComment && hasText) return p.gate === "gate2" && p.onFix ? fix() : back();
        if (hasText) return setOpen(true);
        p.onApprove();
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, []);
    const mod = bridge.platform === "darwin" ? "\u2318" : "Ctrl+";
    if (props.codeReview) return /* @__PURE__ */ react_default.createElement(CodeReviewBar, { ...props, fixTo: props.codeReview.fixTo, findings: props.codeReview.findings, mod });
    const stuck = gate === "limit" && props.stuck?.length ? props.stuck : null;
    const title = gate === "gate1" ? "\u0423\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u043B\u0430\u043D\u0430" : gate === "gate2" ? "\u041F\u0440\u0438\u0451\u043C\u043A\u0430" : stuck ? "\u0425\u043E\u0434\u044F\u0442 \u043F\u043E \u043A\u0440\u0443\u0433\u0443" : "\u041F\u043E\u043F\u044B\u0442\u043A\u0438 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D\u044B";
    const needsComment = gate !== "limit";
    return /* @__PURE__ */ react_default.createElement("div", { className: "gatebar is-gate" }, /* @__PURE__ */ react_default.createElement("div", { className: "gate-sign", "aria-hidden": true }, gate === "gate2" ? /* @__PURE__ */ react_default.createElement(ClipboardCheck, { size: 17 }) : /* @__PURE__ */ react_default.createElement(UserRoundCheck, { size: 17 })), /* @__PURE__ */ react_default.createElement("div", { className: "gate-text" }, /* @__PURE__ */ react_default.createElement("strong", null, title), /* @__PURE__ */ react_default.createElement("span", null, gate === "gate1" && (props.diffShown ? lineCount ? `\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0439 \u043A \u043F\u043B\u0430\u043D\u0443: ${lineCount}. \u041E\u043D\u0438 \u0443\u0439\u0434\u0443\u0442 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0449\u0438\u043A\u0443 \u043F\u0440\u0438 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0435.` : "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043F\u043E\u043B\u0443\u0447\u0438\u0442 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0449\u0438\u043A \u043F\u0440\u0438 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0435." : "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u0440\u0435\u0434\u0430\u043A\u0446\u0438\u044E \u043F\u043B\u0430\u043D\u0430."), gate === "gate2" && (props.diffShown ? `\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0439 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430\u0445: ${lineCount}. \u041E\u043D\u0438 \u0443\u0439\u0434\u0443\u0442 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044E \u043F\u0440\u0438 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0435.` : "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u0434\u0438\u0444\u0444 \u0438 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0440\u0435\u0432\u044C\u044E\u0435\u0440\u0430."), gate === "limit" && (stuck ? "\u0420\u0435\u0432\u044C\u044E\u0435\u0440 \u0432\u0435\u0440\u043D\u0443\u043B \u0442\u0435 \u0436\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u0438\u0445 \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C. \u0420\u0430\u0437\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u043E\u0440: \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0435 \u0443\u0432\u0438\u0434\u044F\u0442 \u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C, \u0438 \u0440\u0435\u0432\u044C\u044E\u0435\u0440." : "\u041C\u043E\u0436\u043D\u043E \u0434\u0430\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044E \u0435\u0449\u0451 \u043E\u0434\u043D\u0443 \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u0441 \u0432\u0430\u0448\u0438\u043C \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u043C."))), stuck && /* @__PURE__ */ react_default.createElement("ul", { className: "gate-stuck", "aria-label": "\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043D\u0435 \u0441\u0434\u0432\u0438\u043D\u0443\u043B\u0438\u0441\u044C" }, stuck.map((i, n) => /* @__PURE__ */ react_default.createElement("li", { key: n }, i.file && /* @__PURE__ */ react_default.createElement("code", null, i.file, i.line ? `:${i.line}` : ""), " ", i.message.split("\n")[0]))), (open || gate === "limit") && /* @__PURE__ */ react_default.createElement(
      TextArea,
      {
        className: "gate-comment",
        rows: 2,
        autoFocus: open,
        placeholder: gate === "limit" ? stuck ? "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0435: \u0432 \u0447\u0451\u043C \u0440\u0435\u0432\u044C\u044E\u0435\u0440 \u043D\u0435 \u043F\u0440\u0430\u0432 \u0438\u043B\u0438 \u043A\u0430\u043A \u0438\u043C\u0435\u043D\u043D\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u2014 \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \xAB\u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043D\u0430 null \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0432 parse()\xBB" : "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044E (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)" : gate === "gate2" ? "\u0427\u0442\u043E \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u2014 \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \xAB\u043A\u043D\u043E\u043F\u043A\u0443 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0441\u0438\u043D\u0435\u0439\xBB, \xAB\u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0443\u0441\u0442\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435\xBB" : "\u0427\u0442\u043E \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C",
        value: comment,
        onChange: (e) => setComment(e.target.value)
      }
    ), /* @__PURE__ */ react_default.createElement("div", { className: "gate-actions" }, error && /* @__PURE__ */ react_default.createElement("span", { className: "actionbar-error" }, error), props.onOpenApp && /* @__PURE__ */ react_default.createElement(Button, { tone: "quiet", icon: /* @__PURE__ */ react_default.createElement(Globe, { size: 14 }), onClick: props.onOpenApp }, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435"), !props.diffShown && gate !== "limit" && /* @__PURE__ */ react_default.createElement(Button, { tone: "quiet", onClick: props.onOpenAccept }, gate === "gate1" ? "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043B\u0430\u043D" : "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0438\u0444\u0444"), gate === "limit" ? /* @__PURE__ */ react_default.createElement(react_default.Fragment, null, /* @__PURE__ */ react_default.createElement(Button, { tone: "quiet", busy: busy === "cancel", onClick: props.onCancel }, "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C"), props.onAccept && /* @__PURE__ */ react_default.createElement(
      Button,
      {
        tone: "ghost",
        icon: /* @__PURE__ */ react_default.createElement(ClipboardCheck, { size: 14 }),
        busy: busy === "accept",
        onClick: props.onAccept,
        title: props.acceptTo === "visual" ? "\u0411\u0435\u0437 \u043D\u043E\u0432\u044B\u0445 \u043F\u043E\u043F\u044B\u0442\u043E\u043A: \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430, \u0437\u0430\u0442\u0435\u043C \u043F\u0440\u0438\u0451\u043C\u043A\u0430 \u2014 \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u0437\u0430 \u0432\u0430\u043C\u0438" : "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0434\u0438\u0444\u0444 \u0438 \u0440\u0435\u0448\u0438\u0442\u044C \u0441\u0430\u043C\u043E\u043C\u0443 \u2014 \u0431\u0435\u0437 \u043D\u043E\u0432\u044B\u0445 \u043F\u043E\u043F\u044B\u0442\u043E\u043A"
      },
      props.acceptTo === "visual" ? "\u0414\u0430\u043B\u044C\u0448\u0435: \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430" : "\u041A \u043F\u0440\u0438\u0451\u043C\u043A\u0435 \u043A\u0430\u043A \u0435\u0441\u0442\u044C"
    ), /* @__PURE__ */ react_default.createElement(Button, { tone: "primary", icon: /* @__PURE__ */ react_default.createElement(RotateCcw, { size: 14 }), busy: busy === "approve", onClick: props.onApprove }, stuck ? "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0438 \u0435\u0449\u0451 \u043F\u043E\u043F\u044B\u0442\u043A\u0430" : "\u0415\u0449\u0451 \u043F\u043E\u043F\u044B\u0442\u043A\u0430", " ", /* @__PURE__ */ react_default.createElement("kbd", { className: "kbd-mini" }, mod, "\u21B5"))) : /* @__PURE__ */ react_default.createElement(react_default.Fragment, null, gate === "gate2" && props.onFix && (props.pickedCount ?? 0) > 0 && !open && lineCount === 0 && /* @__PURE__ */ react_default.createElement(
      Button,
      {
        tone: "ghost",
        icon: /* @__PURE__ */ react_default.createElement(Wrench, { size: 14 }),
        busy: busy === "fix",
        onClick: props.onFix,
        title: "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0440\u0435\u0432\u044C\u044E\u0435\u0440\u0430 \u2014 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044E: \u0440\u0435\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u2192 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u2192 \u0441\u043D\u043E\u0432\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430, \u0431\u0435\u0437 \u043D\u043E\u0432\u043E\u0433\u043E \u0440\u0435\u0432\u044C\u044E"
      },
      "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 (",
      props.pickedCount,
      ") ",
      /* @__PURE__ */ react_default.createElement("kbd", { className: "kbd-mini" }, mod, "\u2325\u21B5")
    ), needsComment && !open && lineCount === 0 ? /* @__PURE__ */ react_default.createElement(Button, { tone: "ghost", icon: /* @__PURE__ */ react_default.createElement(RotateCcw, { size: 14 }), onClick: () => setOpen(true), title: `${mod}\u21E7\u21B5` }, gate === "gate2" ? "\u0415\u0441\u0442\u044C \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F" : "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0441 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u043C") : /* @__PURE__ */ react_default.createElement(react_default.Fragment, null, gate === "gate2" && props.onFix && /* @__PURE__ */ react_default.createElement(
      Button,
      {
        tone: "ghost",
        icon: /* @__PURE__ */ react_default.createElement(Wrench, { size: 14 }),
        busy: busy === "fix",
        disabled: !comment.trim() && lineCount === 0 && !props.pickedCount,
        onClick: props.onFix,
        title: "\u041D\u0435\u0431\u043E\u043B\u044C\u0448\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u0432 \u0442\u043E\u0439 \u0436\u0435 \u0432\u0435\u0442\u043A\u0435: \u0440\u0435\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u2192 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u2192 \u0441\u043D\u043E\u0432\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430, \u0431\u0435\u0437 \u0440\u0435\u0432\u044C\u044E \u0438 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438"
      },
      "\u041F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C",
      lineCount || props.pickedCount ? ` (+${lineCount + (props.pickedCount ?? 0)})` : "",
      " ",
      /* @__PURE__ */ react_default.createElement("kbd", { className: "kbd-mini" }, mod, "\u2325\u21B5")
    ), /* @__PURE__ */ react_default.createElement(
      Button,
      {
        tone: "ghost",
        icon: /* @__PURE__ */ react_default.createElement(RotateCcw, { size: 14 }),
        busy: busy === "reject",
        disabled: !comment.trim() && lineCount === 0,
        onClick: props.onReject,
        title: gate === "gate2" ? "\u041F\u043E\u043B\u043D\u044B\u0439 \u043A\u0440\u0443\u0433: \u0440\u0435\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u2192 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u2192 \u0440\u0435\u0432\u044C\u044E \u2192 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430" : void 0
      },
      gate === "gate2" ? "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443" : `\u0412\u0435\u0440\u043D\u0443\u0442\u044C${lineCount ? ` (+${lineCount})` : ""}`,
      " ",
      /* @__PURE__ */ react_default.createElement("kbd", { className: "kbd-mini" }, mod, "\u21E7\u21B5")
    )), /* @__PURE__ */ react_default.createElement(Button, { tone: "approve", icon: /* @__PURE__ */ react_default.createElement(CircleCheck, { size: 15 }), busy: busy === "approve", onClick: props.onApprove }, gate === "gate1" ? "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u043F\u043B\u0430\u043D" : "\u041F\u0440\u0438\u043D\u044F\u0442\u044C", " ", /* @__PURE__ */ react_default.createElement("kbd", { className: "kbd-mini" }, mod, "\u21B5")))));
  }
  function CodeReviewBar(props) {
    const { comment, setComment, lineCount, busy, error, mod } = props;
    const picked = (props.pickedCount ?? 0) + lineCount;
    const [open, setOpen] = useState(() => comment !== "");
    const canFix = picked > 0 || Boolean(comment.trim());
    const clean = props.findings === 0;
    return /* @__PURE__ */ react_default.createElement("div", { className: "gatebar is-gate" }, /* @__PURE__ */ react_default.createElement("div", { className: "gate-sign", "aria-hidden": true }, /* @__PURE__ */ react_default.createElement(ClipboardCheck, { size: 17 })), /* @__PURE__ */ react_default.createElement("div", { className: "gate-text" }, /* @__PURE__ */ react_default.createElement("strong", null, clean ? "\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0439 \u043D\u0435\u0442" : "\u0420\u0430\u0437\u0431\u043E\u0440"), /* @__PURE__ */ react_default.createElement("span", null, clean ? "\u0420\u0435\u0432\u044C\u044E\u0435\u0440 \u043D\u0435 \u043D\u0430\u0448\u0451\u043B \u043F\u0440\u043E\u0431\u043B\u0435\u043C. \u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u043A\u043E\u0434 \u0441\u0430\u043C\u0438: \u0435\u0441\u043B\u0438 \u0447\u0442\u043E-\u0442\u043E \u043D\u0435 \u0442\u0430\u043A \u2014 \u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0435 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0435, \u0438\u043D\u0430\u0447\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0440\u0435\u0432\u044C\u044E." : `${props.diffShown ? "\u041E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043D\u0443\u0436\u043D\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C, \u0438\u043B\u0438 \u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u0432\u043E\u0438 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430\u0445." : "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u043A\u043E\u0434 \u0438 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0440\u0435\u0432\u044C\u044E\u0435\u0440\u0430."} ${props.fixTo === "chat" ? "\u0418\u0441\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0431\u0443\u0434\u0435\u0442 \u0447\u0430\u0442 \u043F\u0440\u044F\u043C\u043E \u0432 \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043A\u043E\u043F\u0438\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430." : "\u0418\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043F\u043E\u0439\u0434\u0443\u0442 \u043D\u043E\u0432\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0435\u0439 \u043E\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0433\u043E \u043A\u043E\u0434\u0430."}`)), open && /* @__PURE__ */ react_default.createElement(
      TextArea,
      {
        className: "gate-comment",
        rows: 2,
        autoFocus: true,
        placeholder: "\u0427\u0442\u043E \u0435\u0449\u0451 \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u2014 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u0441\u044F \u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F\u043C",
        value: comment,
        onChange: (e) => setComment(e.target.value)
      }
    ), /* @__PURE__ */ react_default.createElement("div", { className: "gate-actions" }, error && /* @__PURE__ */ react_default.createElement("span", { className: "actionbar-error" }, error), !props.diffShown && /* @__PURE__ */ react_default.createElement(Button, { tone: "quiet", onClick: props.onOpenAccept }, "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u0434"), !open && /* @__PURE__ */ react_default.createElement(Button, { tone: "quiet", onClick: () => setOpen(true) }, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439"), (!clean || canFix) && /* @__PURE__ */ react_default.createElement(
      Button,
      {
        tone: "ghost",
        icon: /* @__PURE__ */ react_default.createElement(Wrench, { size: 14 }),
        busy: busy === "fix",
        disabled: !canFix,
        onClick: props.onFix,
        title: props.fixTo === "chat" ? "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0440\u0435\u0432\u044C\u044E \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442 \u0441 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u043C \u2014 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0443\u0436\u0435 \u0432 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0438" : "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0440\u0435\u0432\u044C\u044E \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u043E\u0432\u0443\u044E \u0437\u0430\u0434\u0430\u0447\u0443 \u2014 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0443\u0436\u0435 \u0432 \u0435\u0451 \u0442\u0435\u043A\u0441\u0442\u0435"
      },
      props.fixTo === "chat" ? "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432 \u0447\u0430\u0442\u0435" : "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0435\u0439",
      picked ? ` (${picked})` : ""
    ), /* @__PURE__ */ react_default.createElement(Button, { tone: "approve", icon: /* @__PURE__ */ react_default.createElement(CircleCheck, { size: 15 }), busy: busy === "approve", onClick: props.onApprove }, "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C ", /* @__PURE__ */ react_default.createElement("kbd", { className: "kbd-mini" }, mod, "\u21B5"))));
  }

  // integration/purpleflow/entry.tsx
  function PlanStageDrawer({ entry, entries, pending, drafts, children, selectedGateId, onRevision }) {
    const item = entries.find((e) => e.gate.id === (selectedGateId ?? entry.gate.id)) || entry;
    return /* @__PURE__ */ react_default.createElement("div", { className: "details", "data-purpleflow": "StageDrawer" }, /* @__PURE__ */ react_default.createElement("header", { className: "drawer-head" }, /* @__PURE__ */ react_default.createElement("div", { className: "drawer-title" }, /* @__PURE__ */ react_default.createElement("strong", null, "\u0423\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u043B\u0430\u043D\u0430"), /* @__PURE__ */ react_default.createElement("span", null, pending ? "\u0416\u0434\u0451\u0442 \u0432\u0430\u0448\u0435\u0433\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u044F" : entry.answer?.decision === "accept" ? "\u041F\u043B\u0430\u043D \u043F\u0440\u0438\u043D\u044F\u0442" : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u043D\u043E\u0432\u0430\u044F \u0440\u0435\u0434\u0430\u043A\u0446\u0438\u044F"))), entries.length > 1 && /* @__PURE__ */ react_default.createElement("nav", { className: "attempts", "aria-label": "\u0420\u0435\u0434\u0430\u043A\u0446\u0438\u0438 \u043F\u043B\u0430\u043D\u0430" }, entries.map((e) => /* @__PURE__ */ react_default.createElement("button", { key: e.gate.id, "aria-label": "\u0420\u0435\u0434\u0430\u043A\u0446\u0438\u044F " + e.plan.revision, "aria-pressed": item === e, onClick: () => onRevision(e.gate.id) }, e.plan.revision))), /* @__PURE__ */ react_default.createElement("div", { className: "drawer-body" }, /* @__PURE__ */ react_default.createElement("article", { className: "doc" }, /* @__PURE__ */ react_default.createElement("header", { className: "doc-head" }, /* @__PURE__ */ react_default.createElement("h3", null, "\u0420\u0435\u0434\u0430\u043A\u0446\u0438\u044F ", item.plan.revision), /* @__PURE__ */ react_default.createElement("span", null, item.answer?.decision === "return" ? "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D\u0430" : item.answer?.decision === "accept" ? "\u041F\u0440\u0438\u043D\u044F\u0442\u0430" : item.gate.status === "pending" ? "\u041D\u0430 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u0438" : "\u0417\u0430\u043C\u0435\u043D\u0435\u043D\u0430")), /* @__PURE__ */ react_default.createElement("pre", { className: "tl-plan-text" }, item.plan.plan), item.answer?.comment && /* @__PURE__ */ react_default.createElement("p", null, "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439: ", item.answer.comment), item.gate.id !== entry.gate.id && drafts?.[item.gate.id] && drafts[item.gate.id] !== item.answer?.comment && /* @__PURE__ */ react_default.createElement("p", null, "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u044F (\u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D): ", drafts[item.gate.id]))), item.gate.id === entry.gate.id && children);
  }
  function mountPurpleflowTimeline(container, model, rows, onSelect, selected = "approval") {
    const root = createRoot(container);
    const draw = (model2, rows2, onSelect2, nextSelected = selected) => {
      selected = nextSelected;
      const run = { model: model2, rows: rows2, status: rows2.some((r) => r.attempts.some((a) => a.running)) ? "waiting" : "stopped", next: rows2.find((r) => r.attempts.some((a) => a.running))?.id };
      root.render(/* @__PURE__ */ react_default.createElement(Timeline, { run, current: model2.currentStage ?? run.next, selected, compact: true, onSelect: onSelect2 }));
    };
    draw(model, rows, onSelect);
    const stop = () => root.unmount();
    stop.update = draw;
    return stop;
  }
  function PlanDecision({ value, initialComment, onDraft, onAnswer, notice, drafts, initialSelectedGateId, onRevision }) {
    const [comment, setComment] = useState(initialComment), [busy, setBusy] = useState(null), [error, setError] = useState(null), [draftError, setDraftError] = useState("");
    const [selectedGateId, setSelectedGateId] = useState(initialSelectedGateId);
    const entry = value.current, pending = entry.gate.status === "pending";
    async function answer(decision) {
      if (busy) return;
      setBusy(decision === "accept" ? "approve" : "reject");
      setError(null);
      try {
        await onAnswer(decision, comment);
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(null);
      }
    }
    return /* @__PURE__ */ react_default.createElement(PlanStageDrawer, { key: entry.gate.id, entry, entries: value.entries, pending, drafts, selectedGateId, onRevision: (id) => {
      setSelectedGateId(id);
      onRevision(id);
    } }, pending && /* @__PURE__ */ react_default.createElement(
      GateBar,
      {
        gate: "gate1",
        comment,
        setComment: (s) => {
          setComment(s);
          setDraftError(onDraft(s) === false ? "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u044F." : "");
        },
        lineCount: 0,
        busy,
        error,
        diffShown: true,
        onApprove: () => answer("accept"),
        onReject: () => answer("return"),
        onCancel: () => {
        },
        onOpenAccept: () => {
        }
      }
    ), !pending && /* @__PURE__ */ react_default.createElement("p", { role: "status" }, entry.answer?.decision === "accept" ? "\u041F\u043B\u0430\u043D \u043F\u0440\u0438\u043D\u044F\u0442" : "\u041F\u043B\u0430\u043D \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0451\u043D. \u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u043D\u043E\u0432\u0430\u044F \u0440\u0435\u0434\u0430\u043A\u0446\u0438\u044F."), (notice || draftError) && /* @__PURE__ */ react_default.createElement("p", { className: "tl-note", role: "status" }, draftError || notice));
  }
  function mountPurpleflowDecision(container, props) {
    const root = createRoot(container);
    root.render(/* @__PURE__ */ react_default.createElement(PlanDecision, { key: props.value.current.gate.id, ...props }));
    return { update: (next) => root.render(/* @__PURE__ */ react_default.createElement(PlanDecision, { key: next.value.current.gate.id, ...next })), dispose: () => root.unmount() };
  }
  return __toCommonJS(entry_exports);
})();
