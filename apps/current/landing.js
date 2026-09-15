import { supabase } from "./supabase.js";
import { generateIdentityKeyPair, hasIdentityKey, importKeyBackup, bufToB64 } from "./crypto.js";

// ── Session helpers (localStorage-based, no Supabase Auth) ───────────────────
export function getSession() {
  try { return JSON.parse(localStorage.getItem("current_session")); } catch { return null; }
}
function saveSession(data) {
  localStorage.setItem("current_session", JSON.stringify(data));
}
export function clearSession() {
  localStorage.removeItem("current_session");
}

// ── Recovery code ─────────────────────────────────────────────────────────────
function genRecoveryCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = crypto.getRandomValues(new Uint8Array(32));
  const groups = [];
  for(let g=0;g<8;g++){
    let w=''; for(let c=0;c<4;c++) w+=chars[arr[g*4+c]%chars.length];
    groups.push(w);
  }
  return groups.join('-');
}
async function hashCode(code) {
  const clean = code.toUpperCase().replace(/-/g,'');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean));
  return bufToB64(buf);
}

// ── Demo animation ────────────────────────────────────────────────────────────
const msgs = document.getElementById("phone-messages");
const typing = document.getElementById("typing");
const demoConvo = [
  ["left","Hey, have you tried Current yet?"],
  ["right","Yeah — real E2EE this time 🔐"],
  ["left","And no email signup needed!"],
  ["right","Disappearing messages too. Finally."],
];
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function animChat(){
  for(const [type,text] of demoConvo){
    typing.style.display="flex"; await wait(900); typing.style.display="none";
    const div=document.createElement("div");
    div.style.cssText=`padding:10px 14px;border-radius:18px;max-width:80%;font-size:13px;
      background:${type==="right"?"var(--msg-out)":"var(--msg-in)"};
      align-self:${type==="right"?"flex-end":"flex-start"}`;
    msgs.style.display="flex"; msgs.style.flexDirection="column"; msgs.style.gap="8px";
    msgs.appendChild(div);
    for(const ch of text){ div.textContent+=ch; await wait(28+Math.random()*60); }
    await wait(500);
  }
  await wait(3000); msgs.innerHTML=""; animChat();
}
animChat();

// ── Ripple ────────────────────────────────────────────────────────────────────
document.querySelectorAll(".ripple-btn").forEach(btn=>{
  btn.onclick=e=>{
    const r=document.createElement("span"); r.className="ripple";
    const s=Math.max(btn.offsetWidth,btn.offsetHeight);
    r.style.cssText=`width:${s}px;height:${s}px;left:${e.offsetX-s/2}px;top:${e.offsetY-s/2}px`;
    btn.appendChild(r); setTimeout(()=>r.remove(),700);
  };
});

// ── Theme ─────────────────────────────────────────────────────────────────────
if(localStorage.getItem("current_theme")==="dark") document.body.classList.add("dark");
document.getElementById("theme").onclick=()=>{
  document.body.classList.toggle("dark");
  localStorage.setItem("current_theme", document.body.classList.contains("dark")?"dark":"light");
};

// ── Modals ────────────────────────────────────────────────────────────────────
const signupModal  = document.getElementById("signup-modal");
const signinModal  = document.getElementById("signin-modal");
const recoveryModal= document.getElementById("recovery-modal");
const rcModal      = document.getElementById("recovery-code-modal");

function openModal(m){ m.style.display="flex"; }
function closeModal(m){ m.style.display="none"; }

document.getElementById("open-signup").onclick  = ()=>openModal(signupModal);
document.getElementById("open-signin").onclick  = ()=>openModal(signinModal);
document.getElementById("hero-signup").onclick  = ()=>openModal(signupModal);
document.getElementById("hero-signin").onclick  = ()=>openModal(signinModal);
document.getElementById("su-cancel").onclick    = ()=>closeModal(signupModal);
document.getElementById("si-cancel").onclick    = ()=>closeModal(signinModal);
document.getElementById("rec-cancel").onclick   = ()=>closeModal(recoveryModal);
document.getElementById("si-forgot").onclick    = ()=>{ closeModal(signinModal); openModal(recoveryModal); };
[signupModal,signinModal,recoveryModal].forEach(m=>{
  m.onclick=e=>{ if(e.target===m) closeModal(m); };
});

// ── Sign Up ───────────────────────────────────────────────────────────────────
document.getElementById("su-submit").onclick = async () => {
  const username = document.getElementById("su-username").value.trim().toLowerCase();
  const password = document.getElementById("su-password").value;
  const errEl    = document.getElementById("su-error");
  errEl.style.color="var(--danger)"; errEl.textContent="";

  const btn = document.getElementById("su-submit");
  btn.innerHTML="<span>Creating…</span>"; btn.disabled=true;

  try {
    const identityKey    = await generateIdentityKeyPair();
    const recoveryCode   = genRecoveryCode();
    const recoveryHash   = await hashCode(recoveryCode);

    const { data, error } = await supabase.rpc("current_register", {
      p_username:      username,
      p_password:      password,
      p_identity_key:  identityKey,
      p_recovery_hash: recoveryHash,
    });

    if(error) throw new Error(error.message || JSON.stringify(error));
    if(data?.error) throw new Error(data.error);

    // Save session locally
    saveSession({ id: data.id, username: data.username });

    // Show recovery code — must be saved before continuing
    closeModal(signupModal);
    showRecoveryCode(recoveryCode, () => location.replace("main.html"));

  } catch(e) {
    errEl.textContent = e.message || "Sign up failed.";
    btn.innerHTML="<span>Create account</span>"; btn.disabled=false;
  }
};

function showRecoveryCode(code, onDone) {
  document.getElementById("rc-code").textContent = code;
  openModal(rcModal);
  document.getElementById("rc-copy").onclick = () => {
    navigator.clipboard.writeText(code);
    document.getElementById("rc-copy").innerHTML="<span>✓ Copied!</span>";
  };
  document.getElementById("rc-done").onclick = () => { closeModal(rcModal); onDone(); };
}

// ── Sign In ───────────────────────────────────────────────────────────────────
document.getElementById("si-submit").onclick = async () => {
  const username = document.getElementById("si-username").value.trim().toLowerCase();
  const password = document.getElementById("si-password").value;
  const errEl    = document.getElementById("si-error");
  errEl.style.color="var(--danger)"; errEl.textContent="";

  const btn = document.getElementById("si-submit");
  btn.innerHTML="<span>Signing in…</span>"; btn.disabled=true;

  try {
    const { data, error } = await supabase.rpc("current_login", {
      p_username: username,
      p_password: password,
    });

    if(error) throw new Error(error.message || JSON.stringify(error));
    if(data?.error) throw new Error(data.error);

    saveSession({ id: data.id, username: data.username });

    if(!(await hasIdentityKey())) {
      errEl.style.color="var(--warn,#d97706)";
      errEl.textContent="⚠️ No local key — old messages won't decrypt. Restore a key backup in Settings.";
      await wait(2000);
    }
    location.replace("main.html");

  } catch(e) {
    errEl.textContent = e.message || "Sign in failed.";
    btn.innerHTML="<span>Sign in</span>"; btn.disabled=false;
  }
};

// ── Account Recovery ──────────────────────────────────────────────────────────
document.getElementById("rec-submit").onclick = async () => {
  const username    = document.getElementById("rec-username").value.trim().toLowerCase();
  const code        = document.getElementById("rec-code").value.trim();
  const newPassword = document.getElementById("rec-newpassword").value;
  const errEl       = document.getElementById("rec-error");
  errEl.style.color="var(--danger)"; errEl.textContent="";

  const btn = document.getElementById("rec-submit");
  btn.innerHTML="<span>Verifying…</span>"; btn.disabled=true;

  try {
    if(!username || !code || newPassword.length < 8)
      throw new Error("Fill all fields. Password min 8 chars.");

    const recoveryHash = await hashCode(code);
    const { data, error } = await supabase.rpc("current_recover", {
      p_username:      username,
      p_recovery_hash: recoveryHash,
      p_new_password:  newPassword,
    });

    if(error) throw new Error(error.message || JSON.stringify(error));
    if(data?.error) throw new Error(data.error);

    errEl.style.color="var(--accent)";
    errEl.textContent="✓ Password reset! Signing you in…";
    await wait(1200);

    // Auto sign in with new password
    const { data: loginData, error: loginErr } = await supabase.rpc("current_login", {
      p_username: username, p_password: newPassword,
    });
    if(!loginErr && !loginData?.error) {
      saveSession({ id: loginData.id, username: loginData.username });
      location.replace("main.html");
    } else {
      closeModal(recoveryModal); openModal(signinModal);
    }

  } catch(e) {
    errEl.textContent = e.message || "Recovery failed.";
    btn.innerHTML="<span>Recover account</span>"; btn.disabled=false;
  }
};
