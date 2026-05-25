"use strict";
/*
 * TEMPORARY (develop branch only): iOS screen-lock recovery + diagnostics.
 *
 * Confirmed on-device cause (see ?diag readout while frozen):
 *   timer:Y timerAgo:~1ms, audio:running, but cycles:0 / clkMoving:N.
 * After an iOS lock interruption the AudioContext returns to "running" yet the
 * ScriptProcessor node never fires again, so the audio buffer stays full and
 * Emulator.audioUnderrunAdjustment() throttles CPUCyclesTotal to 0 -> the core
 * iterates but advances 0 cycles = frozen, inputs dead.
 *
 * Fix: detect that emulation is not progressing (clockCyclesSinceStart frozen
 * while playing) and rebuild the audio graph (XAudioServer.setupWebAudio),
 * which makes a fresh node and resets the buffer so pacing recovers. Also keep
 * a dead-timer restart (other iOS versions) and a gesture/timer audio resume.
 *
 * requestAnimationFrame drives it because it reliably resumes after unlock.
 * Add #diag (or ?diag) to the URL to show the on-screen state overlay.
 */
(function () {
    var diag = { vis: 0, focus: 0, blur: 0, pageshow: 0, pagehide: 0, heals: 0, resumes: 0, rebuilds: 0 };
    var lastClk = -1, stalledSince = 0;

    function ctx() { try { return XAudioJSWebAudioContextHandle; } catch (e) { return null; } }
    function xaudio() { try { return IodineGUI.mixerInput.mixer.audio; } catch (e) { return null; } }
    function emu() { try { return IodineGUI.Iodine; } catch (e) { return null; } }

    function resumeAudioState() {
        var c = ctx();
        if (c && c.state && c.state !== "running") {
            try { c.resume(); diag.resumes++; } catch (e) {}
        }
    }
    function rebuildAudio() {
        var xa = xaudio();
        if (xa && typeof xa.setupWebAudio === "function") {
            try { xa.setupWebAudio(); diag.rebuilds++; } catch (e) {}
        }
    }

    function heal() {
        try {
            if (typeof IodineGUI !== "undefined" && IodineGUI.isPlaying) {
                var now = +(new Date()).getTime();
                // (a) Dead core timer (seen on some iOS versions): restart it.
                if (!IodineGUI.coreTimerID ||
                    (IodineGUI.lastTimerTick && (now - (+IodineGUI.lastTimerTick)) > 1000)) {
                    if (typeof restartCoreTimer === "function") { restartCoreTimer(); diag.heals++; }
                }
                // (b) Emulation stalled though the timer runs (dead audio node):
                //     rebuild the audio graph to clear the buffer-overrun throttle.
                var e = emu();
                var clk = (e && typeof e.clockCyclesSinceStart === "number") ? e.clockCyclesSinceStart : null;
                if (clk !== null) {
                    if (clk !== lastClk) {
                        lastClk = clk;
                        stalledSince = now;
                    } else if (stalledSince && (now - stalledSince) > 700) {
                        rebuildAudio();
                        resumeAudioState();
                        stalledSince = now; // retry window ~700ms
                    }
                }
            } else {
                lastClk = -1;
                stalledSince = 0;
            }
        } catch (e) {}
        requestAnimationFrame(heal);
    }
    requestAnimationFrame(heal);

    // Resume audio inside a real user gesture (iOS needs this after interruption):
    document.addEventListener("touchend", resumeAudioState, true);
    document.addEventListener("click", resumeAudioState, true);

    // Count what iOS actually fires on lock/unlock (shown in the overlay):
    document.addEventListener("visibilitychange", function () { diag.vis++; }, true);
    window.addEventListener("focus", function () { diag.focus++; }, true);
    window.addEventListener("blur", function () { diag.blur++; }, true);
    window.addEventListener("pageshow", function () { diag.pageshow++; }, true);
    window.addEventListener("pagehide", function () { diag.pagehide++; }, true);

    if (!/diag/.test(location.search) && !/diag/.test(location.hash)) { return; }

    var rLastClk = 0, clkRate = 0, rLastSample = 0;
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
        if ((now - rLastSample) >= 500) { clkRate = clk - rLastClk; rLastClk = clk; rLastSample = now; }
        box.textContent = [
            "playing:" + (IodineGUI.isPlaying ? "Y" : "N") + "  timer:" + (IodineGUI.coreTimerID ? "Y" : "N"),
            "timerAgo:" + (IodineGUI.lastTimerTick ? (now - IodineGUI.lastTimerTick) : "-") + "ms",
            "audio:" + (c ? c.state : "none") + "  audioFound:" + (e ? e.audioFound : "?"),
            "cycles:" + (e ? e.CPUCyclesTotal : "?") + "  clkMoving:" + (clkRate !== 0 ? "Y" : "N"),
            "stalled:" + (stalledSince ? (now - stalledSince) : 0) + "ms",
            "heals:" + diag.heals + " resumes:" + diag.resumes + " rebuilds:" + diag.rebuilds,
            "vis:" + diag.vis + " foc:" + diag.focus + " blur:" + diag.blur +
                " psh:" + diag.pageshow + " phd:" + diag.pagehide
        ].join("\n");
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
})();
