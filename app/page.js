'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const SCALER_MEAN  = [0.42705773003349545, -0.02785356216022533, 0.2763273670815389, -0.257906840741695, 0.5];
const SCALER_SCALE = [1.5404885159821033,   1.5712256600666719,  1.3129388280146943,  1.3378783590515275, 0.3415650255319866];

export default function HeartbeatAI() {
  const canvasHeart = useRef(null);
  const canvasResp  = useRef(null);
  const canvasPhase = useRef(null);
  const wasmRef     = useRef(null);
  const stateRef    = useRef({ x1: 0.5, y1: 0.0, x2: 1.0, y2: 0.0 });
  const couplingRef = useRef({ alpha: 0.1, beta: 0.05 });
  const historyRef = useRef({ heart: [], heartY: [], resp: [], respY: [] });
  const animRef     = useRef(null);
  const lastApiCall = useRef(0);

  const [stress, setStress]     = useState(0);
  const [alpha, setAlpha]       = useState(0.1);
  const [beta, setBeta]         = useState(0.05);
  const [bpm, setBpm]           = useState(0);
  const [loaded, setLoaded]     = useState(false);
  const [status, setStatus]     = useState('Initializing WASM...');

  const HIST = 400;
  const DT   = 0.02;
  const STEPS_PER_FRAME = 3;

  // Load WASM
  useEffect(() => {
    async function loadWasm() {
      try {
        const mod = await import('../public/wasm/vdp_wasm.js');
        await mod.default('/wasm/vdp_wasm_bg.wasm');
        wasmRef.current = mod;
        setLoaded(true);
        setStatus('Running');
      } catch (e) {
        setStatus('WASM error: ' + e.message);
      }
    }
    loadWasm();
  }, []);

  // Fetch coupling from AI controller
  const fetchCoupling = useCallback(async (state, stressVal) => {
    try {
      const res = await fetch('/api/controller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state, stress: stressVal }),
      });
      const data = await res.json();
      if (data.alpha !== undefined) {
        couplingRef.current = { alpha: data.alpha, beta: data.beta };
        setAlpha(+data.alpha.toFixed(4));
        setBeta(+data.beta.toFixed(4));
      }
    } catch (_) {}
  }, []);

  // Draw waveform
  function drawWaveform(canvas, history, color, label) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#050d0d';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#0a2a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
    }
    for (let i = 0; i < H; i += 20) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }

    // Label
    ctx.fillStyle = color;
    ctx.font = '11px monospace';
    ctx.fillText(label, 10, 18);

    if (history.length < 2) return;

    // Glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = (i / HIST) * W;
      const y = H / 2 - (v * H * 0.22);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Draw phase portrait
  function drawPhase(canvas, h1x, h1y, h2x, h2y) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#050d0d';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#0a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();

    ctx.font = '11px monospace';
    ctx.fillStyle = '#1affb2';
    ctx.fillText('PHASE', 10, 18);

    // Heart orbit: x1 vs y1
    const drawOrbit = (xHist, yHist, color) => {
      if (xHist.length < 2) return;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      xHist.forEach((v, i) => {
        const x = W/2 + v * W * 0.11;
        const y = H/2 - yHist[i] * H * 0.11;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    drawOrbit(h1x, h1y, '#1affb2');
    drawOrbit(h2x, h2y, '#ff6b35');
  }

  // BPM estimation
  const bpmBuffer = useRef([]);
  function estimateBPM(history) {
    if (history.length < 50) return;
    const recent = history.slice(-200);
    let crosses = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i-1] < 0 && recent[i] >= 0) crosses++;
    }
    const seconds = (recent.length * DT) / STEPS_PER_FRAME;
    const estBPM = Math.round((crosses / seconds) * 60 / 2);
    if (estBPM > 20 && estBPM < 300) setBpm(estBPM);
  }

  // Main simulation loop
  useEffect(() => {
    if (!loaded) return;

    let frameCount = 0;

    function loop() {
      const wasm = wasmRef.current;
      const s = stateRef.current;
      const c = couplingRef.current;

      for (let i = 0; i < STEPS_PER_FRAME; i++) {
        const result = wasm.coupled_vdp_step(
          1.5 + stress * 2.0,
          0.5 + stress * 0.5,
          c.alpha, c.beta,
          s.x1, s.y1, s.x2, s.y2,
          DT
        );
        s.x1 = result[0]; s.y1 = result[1];
        s.x2 = result[2]; s.y2 = result[3];

        historyRef.current.heart.push(s.x1);
        historyRef.current.resp.push(s.x2);

        historyRef.current.heartY.push(s.y1);
        historyRef.current.respY.push(s.y2);
        if (historyRef.current.heart.length > HIST) historyRef.current.heart.shift();
        if (historyRef.current.resp.length  > HIST) historyRef.current.resp.shift();
        
        if (historyRef.current.heartY.length > HIST) historyRef.current.heartY.shift();
        if (historyRef.current.respY.length  > HIST) historyRef.current.respY.shift();

        if (historyRef.current.heart.length > HIST) historyRef.current.heart.shift();
        if (historyRef.current.resp.length  > HIST) historyRef.current.resp.shift();
      }

      // Draw
      if (canvasHeart.current) drawWaveform(canvasHeart.current, historyRef.current.heart, '#1affb2', 'CARDIAC');
      if (canvasResp.current)  drawWaveform(canvasResp.current,  historyRef.current.resp,  '#ff6b35', 'RESPIRATORY');
      if (canvasPhase.current) drawPhase(canvasPhase.current, historyRef.current.heart, historyRef.current.heartY, historyRef.current.resp, historyRef.current.respY);

      // Call AI controller every ~30 frames
      frameCount++;
      if (frameCount % 30 === 0) {
        fetchCoupling(stateRef.current, stress);
        estimateBPM(historyRef.current.heart);
      }

      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [loaded, stress, fetchCoupling]);

  return (
    <main className="min-h-screen bg-[#030a0a] text-[#1affb2] font-mono p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#0a3a3a] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[0.3em] text-[#1affb2]">CARDIAC AI</h1>
          <p className="text-xs text-[#0a7a5a] tracking-widest mt-1">COUPLED VAN DER POL · NEURAL COUPLING CONTROL</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${loaded ? 'bg-[#1affb2] animate-pulse' : 'bg-yellow-500'}`} />
          <span className="text-xs tracking-widest text-[#0a7a5a]">{status}</span>
        </div>
      </div>

      {/* Vitals */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'EST. BPM',   value: bpm || '---',          unit: 'bpm',  color: '#1affb2' },
          { label: 'STRESS',     value: stress.toFixed(2),      unit: 'σ',    color: '#ff6b35' },
          { label: 'α COUPLING', value: alpha.toFixed(4),       unit: 'H→R',  color: '#1affb2' },
          { label: 'β COUPLING', value: beta.toFixed(4),        unit: 'R→H',  color: '#ff6b35' },
        ].map(v => (
          <div key={v.label} className="border border-[#0a3a3a] bg-[#050d0d] p-4 flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.2em] text-[#0a7a5a]">{v.label}</span>
            <span className="text-3xl font-bold" style={{ color: v.color }}>{v.value}</span>
            <span className="text-[10px] text-[#0a5a4a]">{v.unit}</span>
          </div>
        ))}
      </div>

      {/* Waveforms */}
      <div className="flex flex-col gap-3">
        <canvas ref={canvasHeart} width={800} height={100}
          className="w-full border border-[#0a3a3a] rounded" />
        <canvas ref={canvasResp} width={800} height={100}
          className="w-full border border-[#0a3a3a] rounded" />
      </div>

      {/* Phase portrait */}
      <canvas ref={canvasPhase} width={800} height={200}
        className="w-full border border-[#0a3a3a] rounded" />

      {/* Stress control */}
      <div className="border border-[#0a3a3a] bg-[#050d0d] p-4 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-xs tracking-[0.2em] text-[#0a7a5a]">SYMPATHETIC DRIVE / STRESS INPUT</span>
          <span className="text-sm text-[#1affb2]">{stress.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          value={stress}
          onChange={e => setStress(parseFloat(e.target.value))}
          className="w-full accent-[#1affb2]"
        />
        <div className="flex justify-between text-[10px] text-[#0a5a4a]">
          <span>REST</span>
          <span>MODERATE</span>
          <span>MAX STRESS</span>
        </div>
      </div>

      <p className="text-[10px] text-[#0a4a3a] text-center tracking-widest">
        AI CONTROLLER UPDATES α, β EVERY 30 FRAMES · RESPIRATORY SINUS ARRHYTHMIA MODEL
      </p>
    </main>
  );
}