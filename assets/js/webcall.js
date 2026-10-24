window.WebCall = (function () {
  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  const RING_MS = 45000;
  const GRACE_MS = 7000;

  let sb = null, me = null, inbox = null;
  const outbox = new Map();
  let pc = null, local = null, state = 'idle';
  let peer = null, wantVideo = false, pendingOffer = null, queued = [];
  let ringTimer = null, graceTimer = null, tick = null, secs = 0;
  let outQ = [], sdpSent = false;
  let muted = false, camOff = false, ui = null;
  let onEnd = null;

  function css() {
    if (document.getElementById('wcall-css')) return;
    const s = document.createElement('style');
    s.id = 'wcall-css';
    s.textContent = `
.wcall{--w-bg:#ffffff;--w-panel:#f8fafc;--w-text:#111827;--w-muted:#6b7280;--w-line:rgba(15,23,42,.12);--w-a:#3b82f6;--w-red:#ef4444;--w-green:#3ecf8e}
body.dark .wcall,.wcall.dark{--w-bg:#0b0f19;--w-panel:#111827;--w-text:#f8fafc;--w-muted:rgba(248,250,252,.55);--w-line:rgba(248,250,252,.13)}
@media(prefers-color-scheme:dark){body:not(.light) .wcall{--w-bg:#0b0f19;--w-panel:#111827;--w-text:#f8fafc;--w-muted:rgba(248,250,252,.55);--w-line:rgba(248,250,252,.13)}}
.wcall *{box-sizing:border-box}
.wcall-ov{position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.6);backdrop-filter:blur(6px);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--w-text)}
.wcall-ov.show{display:flex}
.wcall-card{width:min(340px,92vw);background:var(--w-bg);border:1px solid var(--w-line);border-radius:16px;padding:28px 24px;text-align:center}
.wcall-av{width:68px;height:68px;border-radius:50%;margin:0 auto 14px;background:var(--w-a);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700}
.wcall-av.ring{animation:wcring 1.4s ease-in-out infinite}
@keyframes wcring{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.45)}50%{box-shadow:0 0 0 16px rgba(59,130,246,0)}}
.wcall-lbl{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--w-muted);margin-bottom:6px}
.wcall-name{font-size:20px;font-weight:700;margin-bottom:20px;word-break:break-word}
.wcall-row{display:flex;gap:14px;justify-content:center}
.wcall-btn{width:52px;height:52px;border-radius:50%;border:1px solid var(--w-line);background:var(--w-panel);color:var(--w-text);cursor:pointer;display:flex;align-items:center;justify-content:center}
.wcall-btn:hover{border-color:var(--w-a)}
.wcall-btn.on{background:var(--w-a);border-color:var(--w-a);color:#fff}
.wcall-btn.ok{background:var(--w-green);border-color:var(--w-green);color:#06281a}
.wcall-btn.end{background:var(--w-red);border-color:var(--w-red);color:#fff}
.wcall-btn svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wcall-full{position:fixed;inset:0;z-index:9000;display:none;flex-direction:column;background:var(--w-bg);color:var(--w-text);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.wcall-full.show{display:flex}
.wcall-top{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--w-line)}
.wcall-top b{font-size:15px}
.wcall-top span{font-size:13px;color:var(--w-muted);margin-left:auto;font-variant-numeric:tabular-nums}
.wcall-stage{flex:1;position:relative;background:#020617;display:flex;align-items:center;justify-content:center;overflow:hidden}
.wcall-stage video.remote{width:100%;height:100%;object-fit:contain;background:#020617}
.wcall-stage video.self{position:absolute;right:14px;bottom:14px;width:min(180px,32vw);aspect-ratio:4/3;object-fit:cover;border-radius:10px;border:1px solid var(--w-line);background:#0b0f19;transform:scaleX(-1)}
.wcall-voice{display:flex;flex-direction:column;align-items:center;gap:10px;color:#f8fafc}
.wcall-voice .wcall-av{width:96px;height:96px;font-size:34px;margin:0}
.wcall-bar{display:flex;gap:14px;justify-content:center;padding:14px;border-top:1px solid var(--w-line);background:var(--w-bg)}
`;
    document.head.appendChild(s);
  }

  const I = {
    phone: '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/></svg>',
    hang: '<svg viewBox="0 0 24 24"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-3-2.31M2 2l20 20"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v5M8 23h8"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
  };

  function build() {
    if (ui) return;
    css();
    const wrap = document.createElement('div');
    wrap.className = 'wcall';
    wrap.innerHTML = `
<div class="wcall-ov" id="wcIn"><div class="wcall-card">
  <div class="wcall-av ring" id="wcInAv">?</div>
  <div class="wcall-lbl" id="wcInLbl">Incoming call</div>
  <div class="wcall-name" id="wcInName"></div>
  <div class="wcall-row">
    <button class="wcall-btn end" id="wcDec" title="Decline">${I.hang}</button>
    <button class="wcall-btn ok" id="wcAns" title="Answer">${I.phone}</button>
  </div>
</div></div>
<div class="wcall-full" id="wcFull">
  <div class="wcall-top"><b id="wcPeer"></b><span id="wcState">Calling</span></div>
  <div class="wcall-stage" id="wcStage">
    <div class="wcall-voice" id="wcVoice"><div class="wcall-av ring" id="wcAv"></div><div id="wcVoiceName"></div></div>
    <video class="remote" id="wcRemote" autoplay playsinline style="display:none"></video>
    <video class="self" id="wcSelf" autoplay playsinline muted style="display:none"></video>
  </div>
  <div class="wcall-bar">
    <button class="wcall-btn" id="wcMute" title="Mute">${I.mic}</button>
    <button class="wcall-btn" id="wcCam" title="Camera" style="display:none">${I.cam}</button>
    <button class="wcall-btn end" id="wcEnd" title="Hang up">${I.hang}</button>
  </div>
</div>
<audio id="wcAudio" autoplay playsinline></audio>`;
    document.body.appendChild(wrap);
    const q = id => wrap.querySelector('#' + id);
    ui = {
      wrap, q,
      inOv: q('wcIn'), full: q('wcFull'), remote: q('wcRemote'), self: q('wcSelf'),
      audio: q('wcAudio'), voice: q('wcVoice'), av: q('wcAv'), state: q('wcState'),
      mute: q('wcMute'), cam: q('wcCam')
    };
    q('wcAns').onclick = answer;
    q('wcDec').onclick = decline;
    q('wcEnd').onclick = () => end(true);
    ui.mute.onclick = toggleMute;
    ui.cam.onclick = toggleCam;
  }

  function ini(n) { return (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

  function chanFor(id) {
    let c = outbox.get(id);
    if (c) return c;
    const ch = sb.channel('wc2:' + id, { config: { broadcast: { self: false, ack: false } } });
    const ready = new Promise(res => ch.subscribe(s => { if (s === 'SUBSCRIBED') res(); }));
    c = { ch, ready };
    outbox.set(id, c);
    return c;
  }

  async function signal(to, event, data) {
    const { ch, ready } = chanFor(to);
    await ready;
    await ch.send({ type: 'broadcast', event, payload: { from: me.id, name: me.name, ...data } });
  }

  function listen() {
    if (inbox) sb.removeChannel(inbox);
    inbox = sb.channel('wc2:' + me.id, { config: { broadcast: { self: false } } });
    inbox
      .on('broadcast', { event: 'offer' }, ({ payload }) => onOffer(payload))
      .on('broadcast', { event: 'answer' }, ({ payload }) => onAnswer(payload))
      .on('broadcast', { event: 'ice' }, ({ payload }) => onIce(payload))
      .on('broadcast', { event: 'hangup' }, ({ payload }) => { if (peer && payload.from === peer.id) end(false, 'Call ended'); })
      .on('broadcast', { event: 'decline' }, ({ payload }) => { if (peer && payload.from === peer.id) end(false, payload.reason === 'busy' ? 'Line is busy' : 'Call declined'); })
      .subscribe();
  }

  function init(opts) {
    sb = opts.sb;
    me = { id: opts.userId, name: opts.name || 'Me' };
    onEnd = opts.onEnd || null;
    build();
    listen();
  }

  function teardown() {
    clearTimeout(ringTimer); clearTimeout(graceTimer); clearInterval(tick);
    ringTimer = graceTimer = tick = null;
    if (pc) { pc.ontrack = pc.onicecandidate = pc.onconnectionstatechange = null; pc.close(); pc = null; }
    if (local) { local.getTracks().forEach(t => t.stop()); local = null; }
    ui.remote.srcObject = null; ui.audio.srcObject = null; ui.self.srcObject = null;
    ui.remote.style.display = ui.self.style.display = 'none';
    ui.voice.style.display = 'flex';
    ui.full.classList.remove('show'); ui.inOv.classList.remove('show');
    queued = []; pendingOffer = null; secs = 0; muted = camOff = false;
    ui.mute.classList.remove('on'); ui.cam.classList.remove('on');
  }

  function end(notify, msg) {
    const p = peer, dur = secs;
    if (notify && p) signal(p.id, 'hangup', {}).catch(() => {});
    teardown();
    state = 'idle'; peer = null;
    if (msg && window.toast) window.toast(msg);
    if (onEnd && p) onEnd({ peer: p, seconds: dur });
  }

  function flushIce() {
    sdpSent = true;
    const q = outQ; outQ = [];
    q.forEach(c => signal(peer.id, 'ice', { candidate: c }).catch(() => {}));
  }

  function makePc() {
    outQ = []; sdpSent = false;
    pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = e => {
      if (!e.candidate || !peer) return;
      if (sdpSent) signal(peer.id, 'ice', { candidate: e.candidate.toJSON() }).catch(() => {});
      else outQ.push(e.candidate.toJSON());
    };
    pc.ontrack = e => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (e.track.kind === 'video') {
        ui.remote.srcObject = stream;
        ui.remote.style.display = 'block';
        ui.voice.style.display = 'none';
      } else {
        ui.audio.srcObject = stream;
      }
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        clearTimeout(graceTimer);
        if (state !== 'active') {
          state = 'active';
          ui.state.textContent = '0:00';
          ui.av.classList.remove('ring');
          tick = setInterval(() => {
            secs++;
            ui.state.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
          }, 1000);
        }
      } else if (s === 'disconnected') {
        clearTimeout(graceTimer);
        graceTimer = setTimeout(() => { if (pc && pc.connectionState !== 'connected') end(true, 'Connection lost'); }, GRACE_MS);
      } else if (s === 'failed' || s === 'closed') {
        end(true, 'Connection failed');
      }
    };
  }

  async function media(video) {
    if (local) return;
    try {
      local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
    } catch (e) {
      if (video) {
        try {
          local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          wantVideo = false;
          if (window.toast) window.toast('Camera unavailable, continuing with audio only');
        } catch (e2) { throw e2; }
      } else { throw e; }
    }
  }

  function showCall(label) {
    ui.q('wcPeer').textContent = peer.name;
    ui.q('wcVoiceName').textContent = peer.name;
    ui.av.textContent = ini(peer.name);
    ui.av.classList.add('ring');
    ui.state.textContent = label;
    ui.cam.style.display = wantVideo ? '' : 'none';
    if (wantVideo && local) { ui.self.srcObject = local; ui.self.style.display = 'block'; }
    ui.full.classList.add('show');
  }

  async function call(target, video) {
    if (!sb || !me) return false;
    if (target.id === me.id) { if (window.toast) window.toast("You can't call yourself"); return false; }
    if (state !== 'idle') { if (window.toast) window.toast('Already in a call'); return false; }
    wantVideo = !!video;
    try { await media(wantVideo); } catch (e) { if (window.toast) window.toast('Microphone access was blocked'); return false; }
    state = 'calling'; peer = { id: target.id, name: target.name || 'User' };
    showCall(wantVideo ? 'Video calling' : 'Calling');
    makePc();
    local.getTracks().forEach(t => pc.addTrack(t, local));
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await signal(peer.id, 'offer', { sdp: offer, video: wantVideo });
      flushIce();
    } catch (e) { end(false, 'Could not start the call'); return false; }
    ringTimer = setTimeout(() => { if (state === 'calling') end(true, 'No answer'); }, RING_MS);
    return true;
  }

  function onOffer(p) {
    if (state !== 'idle') { signal(p.from, 'decline', { reason: 'busy' }).catch(() => {}); return; }
    state = 'ringing'; peer = { id: p.from, name: p.name || 'Someone' };
    pendingOffer = p.sdp; wantVideo = !!p.video; queued = [];
    ui.q('wcInAv').textContent = ini(peer.name);
    ui.q('wcInLbl').textContent = wantVideo ? 'Incoming video call' : 'Incoming call';
    ui.q('wcInName').textContent = peer.name;
    ui.inOv.classList.add('show');
    ringTimer = setTimeout(() => { if (state === 'ringing') { ui.inOv.classList.remove('show'); state = 'idle'; peer = null; pendingOffer = null; } }, RING_MS);
  }

  async function answer() {
    if (state !== 'ringing') return;
    clearTimeout(ringTimer);
    ui.inOv.classList.remove('show');
    try { await media(wantVideo); } catch (e) {
      if (window.toast) window.toast('Microphone access was blocked');
      signal(peer.id, 'decline', {}).catch(() => {});
      state = 'idle'; peer = null; pendingOffer = null; return;
    }
    state = 'connecting';
    showCall('Connecting');
    makePc();
    local.getTracks().forEach(t => pc.addTrack(t, local));
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      for (const c of queued) { try { await pc.addIceCandidate(c); } catch (e) {} }
      queued = [];
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await signal(peer.id, 'answer', { sdp: ans });
      flushIce();
    } catch (e) { end(true, 'Could not connect'); }
  }

  function decline() {
    if (state !== 'ringing') return;
    clearTimeout(ringTimer);
    signal(peer.id, 'decline', {}).catch(() => {});
    ui.inOv.classList.remove('show');
    state = 'idle'; peer = null; pendingOffer = null; queued = [];
  }

  async function onAnswer(p) {
    if (!pc || !peer || p.from !== peer.id || state !== 'calling') return;
    clearTimeout(ringTimer);
    state = 'connecting';
    ui.state.textContent = 'Connecting';
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
      for (const c of queued) { try { await pc.addIceCandidate(c); } catch (e) {} }
      queued = [];
    } catch (e) { end(true, 'Could not connect'); }
  }

  async function onIce(p) {
    if (!peer || p.from !== peer.id || !p.candidate) return;
    const c = new RTCIceCandidate(p.candidate);
    if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(c); } catch (e) {} }
    else queued.push(c);
  }

  function toggleMute() {
    if (!local) return;
    muted = !muted;
    local.getAudioTracks().forEach(t => { t.enabled = !muted; });
    ui.mute.classList.toggle('on', muted);
  }

  function toggleCam() {
    if (!local) return;
    camOff = !camOff;
    local.getVideoTracks().forEach(t => { t.enabled = !camOff; });
    ui.cam.classList.toggle('on', camOff);
  }

  return { init, call, hangup: () => end(true), busy: () => state !== 'idle', icons: I };
})();
