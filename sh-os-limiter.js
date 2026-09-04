/* SH-OS master limiter — an AudioWorklet fitted to Spence's FabFilter Pro-L 2 renders (Transparent style, 0.25 ms
   lookahead, ~1 ms release): the gain computer looks ahead over a short window, ramps down so it is fully applied
   when the peak arrives, recovers fast, and a soft ceiling catches what remains. Stereo-linked.
   Messages: { drive, ceiling, limCeiling, lookMs, relMs, soft } — all optional. */
class ShosLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.drive = 1; this.ceiling = 0.995; this.limCeiling = 1.0; this.soft = 0;
    this.setTimes(0.25, 1.0);
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.drive !== undefined) this.targetDrive = m.drive;
      if (m.ceiling !== undefined) this.ceiling = m.ceiling;
      if (m.limCeiling !== undefined) this.limCeiling = m.limCeiling;
      if (m.soft !== undefined) this.soft = m.soft;
      if (m.lookMs !== undefined || m.relMs !== undefined) this.setTimes(m.lookMs !== undefined ? m.lookMs : this.lookMs, m.relMs !== undefined ? m.relMs : this.relMs);
    };
    this.targetDrive = 1;
  }
  setTimes(lookMs, relMs) {
    this.lookMs = lookMs; this.relMs = relMs;
    const L = Math.max(1, Math.round(lookMs * sampleRate / 1000));
    this.L = L;
    this.relCoef = Math.exp(-1 / (Math.max(0.05, relMs) * sampleRate / 1000));
    this.delayL = new Float32Array(L * 4); this.delayR = new Float32Array(L * 4); this.dPos = 0;   // input delay = L samples
    this.reqBuf = new Float32Array(L * 4); this.rPos = 0;                                              // required gains, for the window-min
    this.rampSum = 0; this.rampBuf = new Float32Array(L); this.rampPos = 0; this.env = 1;
    this.rampBuf.fill(1); this.rampSum = L;
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp[0]) return true;
    const inL = inp[0], inR = inp[1] || inp[0], oL = out[0], oR = out[1] || out[0];
    const n = inL.length, L = this.L, D = this.delayL.length, R = this.reqBuf.length;
    const ceil = this.ceiling, lc = this.limCeiling, soft = this.soft, rel = this.relCoef;
    let drive = this.drive; const dStep = (this.targetDrive - drive) / n;
    for (let i = 0; i < n; i++) {
      drive += dStep;
      const xl = inL[i] * drive, xr = inR[i] * drive;
      // store input in the delay line; store the required gain for this sample
      this.delayL[this.dPos] = xl; this.delayR[this.dPos] = xr;
      const peak = Math.max(Math.abs(xl), Math.abs(xr));
      this.reqBuf[this.rPos] = peak > lc ? lc / peak : 1;
      // window-min of the required gain over the last L samples (= the next L samples relative to the delayed output)
      let gmin = 1;
      for (let k = 0; k < L; k++) { const v = this.reqBuf[(this.rPos - k + R) % R]; if (v < gmin) gmin = v; }
      // linear ramp: moving average of gmin over L samples
      this.rampSum += gmin - this.rampBuf[this.rampPos]; this.rampBuf[this.rampPos] = gmin; this.rampPos = (this.rampPos + 1) % L;
      const gatt = this.rampSum / L;
      // release: instant down, exponential recovery
      this.env = gatt < this.env ? gatt : gatt + (this.env - gatt) * rel;
      // output = delayed input × gain, then the ceiling
      const dIdx = (this.dPos - L + D) % D;
      let yl = this.delayL[dIdx] * this.env, yr = this.delayR[dIdx] * this.env;
      if (soft > 0) { const k = soft / ceil, norm = 1 / Math.tanh(soft); yl = ceil * Math.tanh(yl * k) * norm; yr = ceil * Math.tanh(yr * k) * norm; }
      oL[i] = yl > ceil ? ceil : (yl < -ceil ? -ceil : yl);
      oR[i] = yr > ceil ? ceil : (yr < -ceil ? -ceil : yr);
      this.dPos = (this.dPos + 1) % D; this.rPos = (this.rPos + 1) % R;
    }
    this.drive = this.targetDrive;
    return true;
  }
}
registerProcessor('shos-limiter', ShosLimiter);
