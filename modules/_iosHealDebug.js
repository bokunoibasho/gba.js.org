"use strict";
/*
 * TEMPORARY (develop branch only): on-screen diagnostics for the iOS screen-lock
 * recovery shipped in CoreGlueCode.js (startPlaybackWatchdog / rebuildAudio).
 * Read-only: this file does NOT do any recovery itself anymore — it only
 * displays runtime state and event counts so we can keep eyeballing B during
 * real use. Add #diag or ?diag to the URL to show the overlay.
 */
(function () {
    var ev = { vis: 0, focus: 0, blur: 0, pageshow: 0, pagehide: 0 };
    document.addEventListener("visibilitychange", function () { ev.vis++; }, true);
    window.addEventListener("focus", function () { ev.focus++; }, true);
    window.addEventListener("blur", function () { ev.blur++; }, true);
    window.addEventListener("pageshow", function () { ev.pageshow++; }, true);
    window.addEventListener("pagehide", function () { ev.pagehide++; }, true);

    if (!/diag/.test(location.search) && !/diag/.test(location.hash)) { return; }

    function ctx() { try { return XAudioJSWebAudioContextHandle; } catch (e) { return null; } }
    function emu() { try { return IodineGUI.Iodine; } catch (e) { return null; } }

    var lastClk = 0, clkRate = 0, lastSample = 0;
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;top:64px;left:4px;z-index:99999;background:rgba(0,0,0,.82);" +
        "color:#0f0;font:11px/1.35 monospace;padding:6px 8px;white-space:pre;pointer-events:none;" +
        "border-radius:4px;max-width:70vw;";
    document.body.appendChild(box);

    function render() {
        var now = +(new Date()).getTime();
        var e = emu();
        var c = ctx();
        var clk = (e && typeof e.clockCyclesSinceStart === "number") ? e.clockCyclesSinceStart : 0;
        if ((now - lastSample) >= 500) { clkRate = clk - lastClk; lastClk = clk; lastSample = now; }
        box.textContent = [
            "playing:" + (IodineGUI.isPlaying ? "Y" : "N") + "  timer:" + (IodineGUI.coreTimerID ? "Y" : "N"),
            "timerAgo:" + (IodineGUI.lastTimerTick ? (now - IodineGUI.lastTimerTick) : "-") + "ms",
            "audio:" + (c ? c.state : "none") + "  audioFound:" + (e ? e.audioFound : "?"),
            "cycles:" + (e ? e.CPUCyclesTotal : "?") + "  clkMoving:" + (clkRate !== 0 ? "Y" : "N"),
            "vis:" + ev.vis + " foc:" + ev.focus + " blur:" + ev.blur +
                " psh:" + ev.pageshow + " phd:" + ev.pagehide
        ].join("\n");
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
})();
