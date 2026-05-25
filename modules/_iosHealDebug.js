"use strict";
/*
 * TEMPORARY (develop branch only): iOS screen-lock recovery + diagnostics.
 *
 * Why rAF: when a foreground Safari tab auto-locks, iOS often fires NONE of
 * visibilitychange / focus / pageshow, so an event-driven resume never runs.
 * requestAnimationFrame, however, reliably resumes after unlock (the page has
 * to repaint), so we drive recovery from it.
 *
 * Two freeze modes are handled:
 *   1) The core setInterval dies but coreTimerID stays set -> restart it.
 *   2) The AudioContext goes "suspended"/"interrupted"; the audio buffer fills,
 *      and audioUnderrunAdjustment throttles CPUCyclesTotal to 0 (frozen even
 *      though the timer fires) -> resume, and rebuild the audio graph if resume
 *      cannot recover it.
 *
 * Add #diag (or ?diag) to the URL to show an on-screen state overlay.
 */
(function () {
    var diag = { vis: 0, focus: 0, blur: 0, pageshow: 0, pagehide: 0, heals: 0, resumes: 0, rebuilds: 0 };
    var stuckSince = 0;

    function ctx() { try { return XAudioJSWebAudioContextHandle; } catch (e) { return null; } }
    function xaudio() { try { return IodineGUI.mixerInput.mixer.audio; } catch (e) { return null; } }
    function emu() { try { return IodineGUI.Iodine; } catch (e) { return null; } }

    function recoverAudio() {
        var c = ctx();
        if (c && c.state && c.state !== "running") {
            var now = +(new Date()).getTime();
            if (!stuckSince) { stuckSince = now; }
            try { c.resume(); diag.resumes++; } catch (e) {}
            if ((now - stuckSince) > 2000) {
                var xa = xaudio();
                if (xa && typeof xa.setupWebAudio === "function") {
                    try { xa.setupWebAudio(); diag.rebuilds++; } catch (e) {}
                }
                stuckSince = now; // throttle rebuild attempts to ~once per 2s
            }
        }
        else {
            stuckSince = 0;
        }
    }

    function heal() {
        try {
            if (typeof IodineGUI !== "undefined" && IodineGUI.isPlaying) {
                var now = +(new Date()).getTime();
                if (!IodineGUI.coreTimerID ||
                    (IodineGUI.lastTimerTick && (now - (+IodineGUI.lastTimerTick)) > 1000)) {
                    if (typeof restartCoreTimer === "function") { restartCoreTimer(); diag.heals++; }
                }
                recoverAudio();
            }
        } catch (e) {}
        requestAnimationFrame(heal);
    }
    requestAnimationFrame(heal);

    // Resume audio inside a real user gesture (iOS requires this after interruption):
    document.addEventListener("touchend", recoverAudio, true);
    document.addEventListener("click", recoverAudio, true);

    // Count what iOS actually fires on lock/unlock (visible in the overlay):
    document.addEventListener("visibilitychange", function () { diag.vis++; }, true);
    window.addEventListener("focus", function () { diag.focus++; }, true);
    window.addEventListener("blur", function () { diag.blur++; }, true);
    window.addEventListener("pageshow", function () { diag.pageshow++; }, true);
    window.addEventListener("pagehide", function () { diag.pagehide++; }, true);

    if (!/diag/.test(location.search) && !/diag/.test(location.hash)) { return; }

    var lastClk = 0, clkRate = 0, lastClkSample = 0;
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
        if ((now - lastClkSample) >= 500) { clkRate = clk - lastClk; lastClk = clk; lastClkSample = now; }
        box.textContent = [
            "playing:" + (IodineGUI.isPlaying ? "Y" : "N") + "  timer:" + (IodineGUI.coreTimerID ? "Y" : "N"),
            "timerAgo:" + (IodineGUI.lastTimerTick ? (now - IodineGUI.lastTimerTick) : "-") + "ms",
            "audio:" + (c ? c.state : "none") + "  audioFound:" + (e ? e.audioFound : "?"),
            "cycles:" + (e ? e.CPUCyclesTotal : "?") + "  clkMoving:" + (clkRate !== 0 ? "Y(" + clkRate + ")" : "N"),
            "heals:" + diag.heals + " resumes:" + diag.resumes + " rebuilds:" + diag.rebuilds,
            "vis:" + diag.vis + " foc:" + diag.focus + " blur:" + diag.blur +
                " psh:" + diag.pageshow + " phd:" + diag.pagehide
        ].join("\n");
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
})();
