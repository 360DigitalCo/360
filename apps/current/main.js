import { supabase } from "./supabase.js";
import { encryptMessage, decryptMessage, hasIdentityKey } from "./crypto.js";

function getSession() {
  try { return JSON.parse(localStorage.getItem("current_session")); } catch { return null; }
}

let me = null, activeConv = null, activeMembers = [], replyTo = null;
let realtimeChannel = null, presenceChannel = null;
let typingTimeout = null, lastTypingSent = 0;
let decryptCache = {};

// ── Helpers ───────────────────────────────────────────────────────────────────
function toast(msg, type="info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
const fmtTime = ts => new Date(ts).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
function fmtConvTime(ts) {
  if(!ts) return "";
  const d=new Date(ts), diff=Date.now()-d;
  if(diff<86400000) return fmtTime(ts);
  if(diff<604800000) return d.toLocaleDateString([],{weekday:"short"});
  return d.toLocaleDateString([],{month:"short",day:"numeric"});
}
const initial = n => (n||"?")[0].toUpperCase();
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function linkify(t) { return esc(t).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">$1</a>').replace(/\n/g,"<br>"); }

// ── Auth ──────────────────────────────────────────────────────────────────────
async function getMe() {
  const s = getSession();
  if(!s?.id) { location.replace("landing.html"); return null; }
  const { data, error } = await supabase.from("current_profiles").select("*").eq("id", s.id).single();
  if(error||!data) { location.replace("landing.html"); return null; }
  return data;
}

// ── Theme ─────────────────────────────────────────────────────────────────────
if(localStorage.getItem("current_theme")==="dark") document.body.classList.add("dark");
document.getElementById("theme-btn").onclick = () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("current_theme", document.body.classList.contains("dark")?"dark":"light");
};

document.getElementById("signout-btn").onclick = async () => {
  if(me) await supabase.from("current_profiles").update({online:false}).eq("id",me.id);
  localStorage.removeItem("current_session");
  location.replace("landing.html");
};
document.getElementById("sidebar-settings").onclick = () => location.href="settings.html";

// ── Status ────────────────────────────────────────────────────────────────────
function openStatusModal() {
  document.getElementById("status-emoji-input").value = me.status_emoji||"🟢";
  document.getElementById("status-text-input").value  = me.status_text||"Available";
  document.getElementById("status-modal").style.display="flex";
}
document.getElementById("my-avatar").onclick = openStatusModal;
document.getElementById("my-status-text").onclick = openStatusModal;
document.getElementById("status-cancel").onclick = () => document.getElementById("status-modal").style.display="none";
document.querySelectorAll(".status-preset").forEach(btn => {
  btn.onclick = () => {
    document.getElementById("status-emoji-input").value = btn.dataset.emoji;
    document.getElementById("status-text-input").value  = btn.dataset.text;
  };
});
document.getElementById("status-save").onclick = async () => {
  const emoji = document.getElementById("status-emoji-input").value.trim()||"🟢";
  const text  = document.getElementById("status-text-input").value.trim()||"Available";
  await supabase.from("current_profiles").update({status_emoji:emoji,status_text:text}).eq("id",me.id);
  me.status_emoji=emoji; me.status_text=text;
  document.getElementById("my-status-text").textContent = `${emoji} ${text}`;
  document.getElementById("status-modal").style.display="none";
  toast("Status updated!","success");
};

// ── Load conversations ────────────────────────────────────────────────────────
async function loadConversations(filter="") {
  const { data: memberships, error: me2 } = await supabase
    .from("current_members").select("conversation_id,last_read_at,muted,archived").eq("user_id",me.id);
  if(me2||!memberships?.length) {
    document.getElementById("chat-list").innerHTML =
      `<div style="padding:24px 16px;color:var(--muted);font-size:13px;text-align:center;line-height:1.8">
        No conversations yet.<br>Tap <strong>✏️</strong> for DM or <strong>👥</strong> for group.
      </div>`;
    return;
  }

  const convIds = memberships.map(m=>m.conversation_id);
  const { data: convs } = await supabase.from("current_conversations").select("*").in("id",convIds);
  const convMap = {};
  for(const c of convs||[]) convMap[c.id]={...c,lastMsg:null,_otherId:null};

  // last message per conv
  await Promise.all(convIds.map(async cid => {
    const { data } = await supabase.from("current_messages")
      .select("id,sent_at,message_type,sender_id").eq("conversation_id",cid)
      .eq("deleted_for_all",false).order("sent_at",{ascending:false}).limit(1);
    if(data?.[0]) convMap[cid].lastMsg = data[0];
  }));

  // other member IDs for DMs
  const profileMap = {};
  await Promise.all(Object.values(convMap).filter(c=>c.type==="direct").map(async c => {
    const { data } = await supabase.from("current_members")
      .select("user_id").eq("conversation_id",c.id).neq("user_id",me.id);
    c._otherId = data?.[0]?.user_id||null;
  }));
  const otherIds=[...new Set(Object.values(convMap).map(c=>c._otherId).filter(Boolean))];
  if(otherIds.length) {
    const { data:profiles } = await supabase.from("current_profiles")
      .select("id,username,display_name,online,last_seen,avatar_color,status_emoji,status_text").in("id",otherIds);
    for(const p of profiles||[]) profileMap[p.id]=p;
  }

  const sorted = Object.values(convMap)
    .filter(c => {
      if(!filter) return true;
      const n = c.type==="direct" ? (profileMap[c._otherId]?.username||"") : (c.name||"");
      return n.toLowerCase().includes(filter);
    })
    .sort((a,b)=>(b.lastMsg?.sent_at||b.created_at)>(a.lastMsg?.sent_at||a.created_at)?1:-1);

  const list = document.getElementById("chat-list");
  if(!sorted.length) { list.innerHTML=`<div style="padding:20px;color:var(--muted);font-size:13px;text-align:center">No results</div>`; return; }

  list.innerHTML = sorted.map(c => {
    const other = c._otherId ? profileMap[c._otherId] : null;
    const name = c.type==="direct" ? (other?.display_name||other?.username||"Unknown") : (c.name||"Group");
    const tag  = c.type==="group" ? "👥 " : "";
    const preview = c.lastMsg?"🔐 Encrypted message":"No messages yet";
    const mem = memberships.find(m=>m.conversation_id===c.id);
    return `<div class="chat-item${activeConv?.id===c.id?" active":""}" data-conv-id="${c.id}" style="cursor:pointer">
      <div class="avatar sm" style="background:${other?.avatar_color||c.avatar_color||"#18a96b"};position:relative;flex-shrink:0">
        ${initial(name)}
        ${other?.online?`<span style="position:absolute;bottom:0;right:0;width:9px;height:9px;border-radius:50%;background:#18a96b;border:2px solid var(--bg)"></span>`:""}
      </div>
      <div class="chat-item-info">
        <strong>${tag}${esc(name)}${mem?.muted?" 🔇":""}</strong>
        <div class="chat-item-preview">${other?.status_emoji||""} ${preview}</div>
      </div>
      <div class="chat-item-meta"><div class="chat-item-time">${fmtConvTime(c.lastMsg?.sent_at||c.created_at)}</div></div>
    </div>`;
  }).join("");

  list.querySelectorAll(".chat-item").forEach(el => {
    el.onclick = () => {
      const c = convMap[el.dataset.convId]; if(!c) return;
      openConversation(c, c._otherId?profileMap[c._otherId]:null);
    };
  });
}

let searchT;
document.getElementById("search-input").oninput = e => {
  clearTimeout(searchT); searchT=setTimeout(()=>loadConversations(e.target.value.trim().toLowerCase()),250);
};

// ── Open conversation ─────────────────────────────────────────────────────────
async function openConversation(conv, otherProfile) {
  if(realtimeChannel) supabase.removeChannel(realtimeChannel);
  if(presenceChannel) supabase.removeChannel(presenceChannel);
  activeConv=conv; decryptCache={};

  document.getElementById("empty-state").style.display="none";
  document.getElementById("conversation-pane").style.display="flex";
  document.getElementById("conversation-pane").style.flexDirection="column";

  const name = conv.type==="direct"
    ? (otherProfile?.display_name||otherProfile?.username||"Unknown")
    : (conv.name||"Group");
  document.getElementById("conv-name").textContent = name;
  document.getElementById("conv-avatar").textContent = initial(name);
  document.getElementById("conv-avatar").style.background = otherProfile?.avatar_color||conv.avatar_color||"#18a96b";
  document.getElementById("conv-status").textContent = conv.type==="direct"&&otherProfile
    ? (otherProfile.online?`🟢 Online${otherProfile.status_text?" · "+otherProfile.status_text:""}`:`Last seen ${fmtConvTime(otherProfile.last_seen)}`)
    : conv.type==="group" ? `Group · ${conv.description||"E2EE"}`:"";

  // Load members
  const { data:mems } = await supabase.from("current_members").select("user_id,role").eq("conversation_id",conv.id);
  const { data:memProfiles } = await supabase.from("current_profiles")
    .select("id,username,display_name,identity_key,avatar_color,online")
    .in("id", mems?.map(m=>m.user_id)||[]);
  activeMembers = memProfiles||[];

  await loadMessages();
  await loadPins();
  subscribeToConv(conv.id);

  // Buttons
  document.getElementById("conv-disappear-btn").onclick = () => {
    document.getElementById("disappear-select").value=conv.disappear_after_seconds||"";
    document.getElementById("disappear-modal").style.display="flex";
  };
  document.getElementById("conv-block-btn").onclick = async () => {
    if(!otherProfile||conv.type==="group") { toast("Can only block users in DMs.","error"); return; }
    if(!confirm(`Block ${name}?`)) return;
    await supabase.from("current_blocks").upsert({blocker_id:me.id,blocked_id:otherProfile.id});
    toast("User blocked.","success");
  };
  document.getElementById("conv-mute-btn").onclick = async () => {
    const { data:mem } = await supabase.from("current_members").select("muted").eq("conversation_id",conv.id).eq("user_id",me.id).single();
    const muted = !mem?.muted;
    await supabase.from("current_members").update({muted}).eq("conversation_id",conv.id).eq("user_id",me.id);
    toast(muted?"Muted 🔇":"Unmuted 🔔","success");
    loadConversations();
  };
  document.getElementById("conv-info-btn").onclick = () => showInfoPanel(conv, otherProfile, mems||[]);
  document.getElementById("conv-header-click").onclick = () => showInfoPanel(conv, otherProfile, mems||[]);
  document.getElementById("conv-avatar").onclick = () => showInfoPanel(conv, otherProfile, mems||[]);

  await supabase.from("current_members").update({last_read_at:new Date().toISOString()})
    .eq("conversation_id",conv.id).eq("user_id",me.id);

  document.querySelectorAll(".chat-item").forEach(el=>el.classList.toggle("active",el.dataset.convId===conv.id));
  if(window.innerWidth<=700) {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("mobile-back").style.display="inline-flex";
  }
}

// ── Info panel ────────────────────────────────────────────────────────────────
function showInfoPanel(conv, otherProfile, mems) {
  const existing = document.getElementById("info-panel");
  if(existing) { existing.remove(); return; }
  const panel = document.createElement("div");
  panel.id = "info-panel";
  panel.style.cssText = `position:absolute;top:0;right:0;bottom:0;width:280px;z-index:10;
    background:var(--glass2);backdrop-filter:blur(30px);border-left:1px solid var(--border);
    display:flex;flex-direction:column;overflow-y:auto;animation:slideUp .2s`;

  const name = conv.type==="direct"
    ? (otherProfile?.display_name||otherProfile?.username||"Unknown") : (conv.name||"Group");

  let memberList = "";
  if(conv.type==="group") {
    memberList = `<div style="padding:16px 20px;border-top:1px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Members (${activeMembers.length})</div>
      ${activeMembers.map(m=>`
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0">
          <div class="avatar sm" style="background:${m.avatar_color||"#18a96b"}">${initial(m.display_name||m.username)}</div>
          <div>
            <div style="font-size:13px;font-weight:600">${esc(m.display_name||m.username)}</div>
            <div style="font-size:11px;color:var(--muted)">@${esc(m.username)} ${m.online?"🟢":""}</div>
          </div>
          ${mems.find(mm=>mm.user_id===m.id)?.role==="admin"?`<span style="margin-left:auto;font-size:10px;background:rgba(24,169,107,.15);color:var(--accent);padding:2px 8px;border-radius:999px">admin</span>`:""}
        </div>`).join("")}
      ${me.id===conv.created_by||mems.find(m=>m.user_id===me.id)?.role==="admin"?`
      <div style="margin-top:12px">
        <input type="text" id="add-member-input" placeholder="Add username…" style="width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:var(--glass);color:var(--text);font-size:13px;outline:none">
        <button class="button accent sm" id="add-member-btn" style="width:100%;margin-top:8px"><span>Add member</span></button>
      </div>`:""}
    </div>`;
  }

  panel.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <strong>${conv.type==="group"?"Group info":"Profile"}</strong>
      <button onclick="document.getElementById('info-panel').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);line-height:1">✕</button>
    </div>
    <div style="padding:24px 20px;text-align:center;border-bottom:1px solid var(--border)">
      <div class="avatar lg" style="margin:0 auto 12px;background:${otherProfile?.avatar_color||conv.avatar_color||"#18a96b"}">${initial(name)}</div>
      <div style="font-size:18px;font-weight:700">${esc(name)}</div>
      ${otherProfile?`<div style="font-size:13px;color:var(--muted);margin-top:2px">@${esc(otherProfile.username)}</div>`:""}
      ${otherProfile?.bio?`<div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.5">${esc(otherProfile.bio)}</div>`:""}
      ${otherProfile?.status_text?`<div style="font-size:13px;margin-top:8px">${esc(otherProfile.status_emoji||"")} ${esc(otherProfile.status_text)}</div>`:""}
      ${conv.description&&conv.type==="group"?`<div style="font-size:13px;color:var(--muted);margin-top:8px">${esc(conv.description)}</div>`:""}
    </div>
    <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Encryption</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.7">🔐 End-to-end encrypted<br>AES-256-GCM · ECDH P-256<br>Keys never leave your device</div>
    </div>
    ${memberList}
    ${conv.type==="direct"&&otherProfile?`
    <div style="padding:16px 20px">
      <button class="button danger sm" style="width:100%" onclick="document.getElementById('conv-block-btn').click();document.getElementById('info-panel').remove()"><span>🚫 Block user</span></button>
    </div>`:""}
  `;

  const pane = document.getElementById("conversation-pane");
  pane.style.position="relative";
  pane.appendChild(panel);

  // Add member handler
  const addBtn = panel.querySelector("#add-member-btn");
  if(addBtn) {
    addBtn.onclick = async () => {
      const username = panel.querySelector("#add-member-input").value.trim().toLowerCase();
      if(!username) return;
      const { data:u } = await supabase.from("current_profiles").select("id,username").eq("username",username).maybeSingle();
      if(!u) { toast("User not found.","error"); return; }
      await supabase.from("current_members").upsert({conversation_id:conv.id,user_id:u.id,role:"member"},{onConflict:"conversation_id,user_id"});
      toast(`${u.username} added!`,"success");
      panel.remove();
      openConversation(conv, null);
    };
  }
}

// ── Pins ──────────────────────────────────────────────────────────────────────
async function loadPins() {
  const { data } = await supabase.from("current_pins").select("message_id").eq("conversation_id",activeConv.id);
  const bar = document.getElementById("pin-bar");
  if(!data?.length) { bar.style.display="none"; return; }
  bar.style.display="flex";
  bar.innerHTML=`<span style="font-size:12px;color:var(--muted)">📌 ${data.length} pinned</span>
    <button class="button ghost sm" onclick="jumpToMsg('${data[data.length-1].message_id}')"><span>View</span></button>`;
}

function jumpToMsg(id) {
  const el=document.getElementById("msg-"+id);
  if(!el) return;
  el.scrollIntoView({behavior:"smooth",block:"center"});
  el.style.transition="background .3s";
  el.style.background="rgba(24,169,107,.2)";
  setTimeout(()=>el.style.background="",1500);
}

// ── Load messages ─────────────────────────────────────────────────────────────
async function loadMessages() {
  const area = document.getElementById("messages");
  area.innerHTML=`<div style="color:var(--muted);font-size:13px;text-align:center;padding:40px">Loading…</div>`;

  const { data:msgs, error } = await supabase
    .from("current_messages")
    .select("id,conversation_id,sender_id,ciphertext,iv,recipient_keys,message_type,reply_to,edited,edited_at,deleted_for_all,disappears_at,sent_at,pinned,sender:current_profiles(id,username,display_name,identity_key,avatar_color)")
    .eq("conversation_id",activeConv.id)
    .eq("deleted_for_all",false)
    .order("sent_at",{ascending:true})
    .limit(200);

  if(error) {
    console.error("loadMessages error:", error);
    area.innerHTML=`<div style="color:var(--danger);text-align:center;padding:20px">Failed to load: ${esc(error.message)}</div>`;
    return;
  }

  area.innerHTML="";
  let lastDate="", lastSender="";
  for(const msg of msgs||[]) {
    const d=new Date(msg.sent_at).toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});
    if(d!==lastDate) {
      lastDate=d; lastSender="";
      const div=document.createElement("div");
      div.className="msg-date-divider"; div.textContent=d;
      area.appendChild(div);
    }
    const grouped = msg.sender_id===lastSender;
    lastSender=msg.sender_id;
    await renderMessage(msg, false, grouped);
  }
  // scroll to bottom
  requestAnimationFrame(()=>{ area.scrollTop=area.scrollHeight; });

  // send read receipts
  const unread=(msgs||[]).filter(m=>m.sender_id!==me.id).map(m=>m.id);
  if(unread.length) {
    supabase.from("current_receipts").upsert(
      unread.map(id=>({message_id:id,user_id:me.id,status:"read"})),
      {onConflict:"message_id,user_id"}
    ).then(()=>{});
  }
}

// ── Render message ────────────────────────────────────────────────────────────
async function renderMessage(msg, scrollIntoView=true, grouped=false) {
  if(msg.disappears_at&&new Date(msg.disappears_at)<new Date()) return;
  const area=document.getElementById("messages");
  const isMine=msg.sender_id===me.id;
  const sender=msg.sender||activeMembers.find(m=>m.id===msg.sender_id)||{};

  // Decrypt with cache
  let text=decryptCache[msg.id];
  if(text===undefined) {
    if(msg.deleted_for_all) { text="🗑 This message was deleted"; }
    else {
      try {
        const key=isMine?me.identity_key:sender.identity_key;
        if(!key) throw new Error("no key");
        text=await decryptMessage(msg, me.id, key);
      } catch(e) {
        text=`🔒 [Cannot decrypt]`;
      }
    }
    decryptCache[msg.id]=text;
  }

  // Update existing
  const existing=document.getElementById("msg-"+msg.id);
  if(existing) {
    const t=existing.querySelector(".msg-text"); if(t) t.innerHTML=linkify(text); return;
  }

  const wrap=document.createElement("div");
  wrap.id="msg-"+msg.id;
  wrap.style.cssText=`display:flex;flex-direction:column;align-items:${isMine?"flex-end":"flex-start"};margin:${grouped?"1px 0":"8px 0 1px"};padding:0 4px`;

  // Sender label (group first in run)
  if(!isMine&&!grouped) {
    const lbl=document.createElement("div");
    lbl.style.cssText="display:flex;align-items:center;gap:6px;margin-bottom:3px;padding:0 2px";
    lbl.innerHTML=`<div class="avatar sm" style="background:${sender.avatar_color||"#18a96b"};width:22px;height:22px;font-size:10px">${initial(sender.display_name||sender.username)}</div>
      <span style="font-size:11px;font-weight:600;color:var(--accent)">${esc(sender.display_name||sender.username||"")}</span>`;
    wrap.appendChild(lbl);
  }

  const bubble=document.createElement("div");
  bubble.className="msg-bubble";
  bubble.style.cssText=`padding:9px 14px;border-radius:${isMine?"18px 18px 4px 18px":"18px 18px 18px 4px"};
    max-width:68%;font-size:14px;line-height:1.5;word-break:break-word;position:relative;
    background:${isMine?"var(--msg-out)":"var(--msg-in)"};animation:appear .2s ease;
    ${msg.deleted_for_all?"opacity:.5;font-style:italic":""}
    ${msg.pinned?"border-left:3px solid var(--accent)":""}`;

  let inner="";
  if(msg.reply_to) {
    const orig=document.getElementById("msg-"+msg.reply_to);
    const preview=orig?.querySelector(".msg-text")?.textContent?.slice(0,60)||"…";
    inner+=`<div class="msg-reply-preview" style="cursor:pointer" onclick="jumpToMsg('${msg.reply_to}')">↩ ${esc(preview)}</div>`;
  }
  inner+=`<div class="msg-text">${linkify(text)}</div>`;
  inner+=`<div class="msg-meta">
    <span class="msg-time">${fmtTime(msg.sent_at)}</span>
    ${msg.edited?`<span style="font-size:10px;color:var(--muted)"> edited</span>`:""}
    ${isMine?`<span class="msg-status${msg.read?" read":""}" id="status-${msg.id}">${msg.read?"✓✓":"✓"}</span>`:""}
    ${msg.disappears_at?`<span style="font-size:10px;color:var(--warn,#d97706)">⏳</span>`:""}
  </div>`;
  bubble.innerHTML=inner;

  bubble.addEventListener("contextmenu",e=>{e.preventDefault();showCtx(e.clientX,e.clientY,msg,text);});
  bubble.addEventListener("dblclick",()=>quickReact(msg.id,"❤️"));

  wrap.appendChild(bubble);

  const rxRow=document.createElement("div");
  rxRow.id="reactions-"+msg.id;
  rxRow.style.cssText="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px";
  wrap.appendChild(rxRow);

  area.appendChild(wrap);
  if(scrollIntoView) requestAnimationFrame(()=>wrap.scrollIntoView({behavior:"smooth",block:"end"}));

  if(msg.disappears_at) {
    const ms=new Date(msg.disappears_at)-Date.now();
    if(ms>0) setTimeout(()=>wrap.remove(),ms);
  }
  loadReactions(msg.id);
}

// ── Context menu ──────────────────────────────────────────────────────────────
let ctxCurrent=null;
function showCtx(x,y,msg,text) {
  ctxCurrent={msg,text};
  const m=document.getElementById("ctx-menu");
  m.style.display="block";
  m.style.left=Math.min(x,window.innerWidth-185)+"px";
  m.style.top=Math.min(y,window.innerHeight-220)+"px";

  document.getElementById("ctx-reply").onclick=()=>{
    replyTo=msg;
    document.getElementById("reply-banner").style.display="flex";
    document.getElementById("reply-name").textContent=msg.sender?.display_name||msg.sender?.username||"";
    document.getElementById("reply-preview").textContent=text.slice(0,55);
    document.getElementById("messageInput").focus();
    hideCtx();
  };
  document.getElementById("ctx-copy").onclick=()=>{ navigator.clipboard.writeText(text).then(()=>toast("Copied!","success")); hideCtx(); };
  document.getElementById("ctx-react").onclick=()=>{ hideCtx(); showRxPicker(x,y,msg.id); };
  document.getElementById("ctx-pin").onclick=async()=>{
    await supabase.from("current_pins").upsert({conversation_id:activeConv.id,message_id:msg.id,pinned_by:me.id},{onConflict:"conversation_id,message_id"});
    await supabase.from("current_messages").update({pinned:true}).eq("id",msg.id);
    loadPins(); toast("Pinned 📌","success"); hideCtx();
  };
  document.getElementById("ctx-delete").onclick=async()=>{
    if(msg.sender_id!==me.id){toast("Can only delete your own messages.","error");hideCtx();return;}
    if(!confirm("Delete for everyone?")){ hideCtx(); return; }
    await supabase.from("current_messages").update({deleted_for_all:true}).eq("id",msg.id);
    const el=document.getElementById("msg-"+msg.id);
    if(el){ const t=el.querySelector(".msg-text"); if(t) t.textContent="🗑 This message was deleted"; }
    hideCtx();
  };
}
function hideCtx() {
  document.getElementById("ctx-menu").style.display="none";
  document.getElementById("reaction-picker").style.display="none";
}
document.addEventListener("click",hideCtx);

// ── Reactions ─────────────────────────────────────────────────────────────────
async function quickReact(msgId,emoji) {
  await supabase.from("current_reactions").upsert({message_id:msgId,user_id:me.id,emoji},{onConflict:"message_id,user_id"});
  loadReactions(msgId);
}
function showRxPicker(x,y,msgId) {
  const p=document.getElementById("reaction-picker");
  p.style.cssText=`display:flex;position:fixed;left:${Math.min(x,window.innerWidth-220)}px;top:${Math.min(y,window.innerHeight-60)}px`;
  p.querySelectorAll(".emoji-quick").forEach(btn=>{
    btn.onclick=e=>{ e.stopPropagation(); quickReact(msgId,btn.dataset.emoji); hideCtx(); };
  });
}
async function loadReactions(msgId) {
  const { data } = await supabase.from("current_reactions").select("emoji,user_id").eq("message_id",msgId);
  const c=document.getElementById("reactions-"+msgId); if(!c) return;
  if(!data?.length){ c.innerHTML=""; return; }
  const groups={};
  for(const r of data){ if(!groups[r.emoji])groups[r.emoji]={n:0,mine:false}; groups[r.emoji].n++; if(r.user_id===me.id)groups[r.emoji].mine=true; }
  c.innerHTML=Object.entries(groups).map(([e,{n,mine}])=>
    `<span class="reaction-chip${mine?" mine":""}" data-emoji="${e}" data-msg="${msgId}" style="${mine?"border-color:var(--accent);background:rgba(24,169,107,.12)":""}">${e} ${n}</span>`
  ).join("");
  c.querySelectorAll(".reaction-chip").forEach(ch=>ch.onclick=()=>quickReact(ch.dataset.msg,ch.dataset.emoji));
}

// ── Quick emoji bar ───────────────────────────────────────────────────────────
document.querySelectorAll(".emoji-bar .emoji-quick").forEach(btn=>{
  btn.onclick=()=>{ const i=document.getElementById("messageInput"); i.value+=btn.dataset.emoji; i.focus(); };
});

// ── Composer ──────────────────────────────────────────────────────────────────
document.getElementById("send").onclick=sendMsg;
document.getElementById("messageInput").addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMsg(); }
});
const inp=document.getElementById("messageInput");
inp.addEventListener("input",()=>{
  inp.style.height="auto"; inp.style.height=Math.min(inp.scrollHeight,130)+"px";
  const now=Date.now();
  if(now-lastTypingSent>2000){ lastTypingSent=now; presenceChannel?.track({user_id:me.id,typing:true}); }
  clearTimeout(typingTimeout);
  typingTimeout=setTimeout(()=>presenceChannel?.track({user_id:me.id,typing:false}),2500);
});

async function sendMsg() {
  if(!activeConv) return;
  const text=inp.value.trim(); if(!text) return;
  inp.value=""; inp.style.height="auto";

  const recipients=activeMembers.filter(m=>m.identity_key).map(m=>({userId:m.id,publicKeyB64:m.identity_key}));
  if(!recipients.find(r=>r.userId===me.id)&&me.identity_key) recipients.push({userId:me.id,publicKeyB64:me.identity_key});
  if(!recipients.length){ toast("⚠️ No encryption keys found.","error"); inp.value=text; return; }

  try {
    const { ciphertext,iv,recipient_keys } = await encryptMessage(text,recipients);
    const msgData={ conversation_id:activeConv.id, sender_id:me.id, ciphertext, iv, recipient_keys, message_type:"text" };
    if(replyTo) msgData.reply_to=replyTo.id;
    if(activeConv.disappear_after_seconds)
      msgData.disappears_at=new Date(Date.now()+activeConv.disappear_after_seconds*1000).toISOString();

    const { data,error } = await supabase.from("current_messages").insert(msgData).select("id,conversation_id,sender_id,ciphertext,iv,recipient_keys,message_type,reply_to,edited,deleted_for_all,disappears_at,sent_at,pinned").single();
    if(error) throw error;
    decryptCache[data.id]=text;
    replyTo=null; document.getElementById("reply-banner").style.display="none";
    await renderMessage({...data,sender:me});
    loadConversations();
  } catch(e){ toast("Send failed: "+e.message,"error"); inp.value=text; }
}
document.getElementById("cancel-reply").onclick=()=>{ replyTo=null; document.getElementById("reply-banner").style.display="none"; };

// ── Message search ────────────────────────────────────────────────────────────
document.getElementById("conv-search-btn").onclick=()=>{
  const bar=document.getElementById("msg-search-bar");
  bar.style.display=bar.style.display==="none"?"flex":"none";
  if(bar.style.display==="flex") document.getElementById("msg-search-input").focus();
};
document.getElementById("msg-search-input").oninput=function() {
  const q=this.value.trim().toLowerCase();
  document.querySelectorAll(".msg-bubble").forEach(b=>{
    const t=b.querySelector(".msg-text")?.textContent?.toLowerCase()||"";
    b.classList.toggle("search-match",!!q&&t.includes(q));
  });
  if(q){ const f=document.querySelector(".msg-bubble.search-match"); if(f) f.scrollIntoView({behavior:"smooth",block:"center"}); }
};

// ── Realtime ──────────────────────────────────────────────────────────────────
function subscribeToConv(convId) {
  realtimeChannel=supabase.channel("conv:"+convId)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"current_messages",filter:`conversation_id=eq.${convId}`},async p=>{
      const msg=p.new;
      if(msg.sender_id===me.id){ const s=document.getElementById("status-"+msg.id); if(s){s.textContent="✓✓";s.classList.add("read");} return; }
      const sender=activeMembers.find(m=>m.id===msg.sender_id);
      await renderMessage({...msg,sender});
      supabase.from("current_receipts").upsert({message_id:msg.id,user_id:me.id,status:"read"},{onConflict:"message_id,user_id"}).then(()=>{});
      loadConversations();
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"current_messages",filter:`conversation_id=eq.${convId}`},p=>{
      const msg=p.new;
      if(msg.deleted_for_all){ const el=document.getElementById("msg-"+msg.id); if(el){const t=el.querySelector(".msg-text");if(t)t.textContent="🗑 This message was deleted";} }
    })
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"current_receipts"},p=>{
      if(p.new.status==="read"){ const s=document.getElementById("status-"+p.new.message_id); if(s){s.textContent="✓✓";s.classList.add("read");} }
    })
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"current_reactions"},p=>loadReactions(p.new.message_id))
    .subscribe();

  presenceChannel=supabase.channel("presence:"+convId,{config:{presence:{key:me.id}}})
    .on("presence",{event:"sync"},()=>{
      const state=presenceChannel.presenceState();
      const others=Object.values(state).flat().filter(u=>u.user_id!==me.id);
      const typing=others.some(u=>u.typing);
      document.getElementById("typing-area").style.display=typing?"block":"none";
      if(typing){ const t=activeMembers.find(m=>m.id===others.find(u=>u.typing)?.user_id); document.getElementById("typing-label").textContent=`${t?.display_name||"Someone"} is typing…`; }
    })
    .subscribe(async s=>{ if(s==="SUBSCRIBED") await presenceChannel.track({user_id:me.id,typing:false}); });
}

// ── New DM ────────────────────────────────────────────────────────────────────
document.getElementById("new-chat-btn").onclick=()=>{ document.getElementById("nc-username").value=""; document.getElementById("nc-result").innerHTML=""; document.getElementById("new-chat-modal").style.display="flex"; };
document.getElementById("nc-cancel").onclick=()=>document.getElementById("new-chat-modal").style.display="none";
document.getElementById("new-chat-modal").onclick=e=>{ if(e.target===document.getElementById("new-chat-modal"))document.getElementById("new-chat-modal").style.display="none"; };

let foundUser=null;
document.getElementById("nc-username").oninput=async function(){
  foundUser=null; const u=this.value.trim().toLowerCase(); const res=document.getElementById("nc-result");
  if(u.length<2){ res.innerHTML=""; return; }
  const { data } = await supabase.from("current_profiles").select("id,username,display_name,identity_key,avatar_color,online,status_emoji,status_text").eq("username",u).neq("id",me.id).maybeSingle();
  if(data){ foundUser=data; res.innerHTML=`<div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:10px;background:rgba(24,169,107,.08);border-radius:10px">
    <div class="avatar sm" style="background:${data.avatar_color||"#18a96b"}">${initial(data.display_name||data.username)}</div>
    <div><strong>${esc(data.display_name||data.username)}</strong><br><small style="color:var(--muted)">@${esc(data.username)} ${data.online?"🟢":""} ${esc(data.status_emoji||"")} ${esc(data.status_text||"")}</small></div>
  </div>`; }
  else res.innerHTML=`<div style="color:var(--danger);font-size:13px;margin-top:6px">User not found</div>`;
};
document.getElementById("nc-start").onclick=async()=>{
  if(!foundUser){ toast("Enter a valid username.","error"); return; }
  const { data:mine }=await supabase.from("current_members").select("conversation_id").eq("user_id",me.id);
  if(mine?.length){
    const { data:shared }=await supabase.from("current_members").select("conversation_id").eq("user_id",foundUser.id).in("conversation_id",mine.map(m=>m.conversation_id));
    if(shared?.length){
      const { data:conv }=await supabase.from("current_conversations").select("*").eq("id",shared[0].conversation_id).single();
      // verify it's a direct conv
      if(conv?.type==="direct"){ document.getElementById("new-chat-modal").style.display="none"; openConversation(conv,foundUser); return; }
    }
  }
  const { data:newConv,error }=await supabase.from("current_conversations").insert({type:"direct"}).select("*").single();
  if(error){ toast("Error: "+error.message,"error"); return; }
  await supabase.from("current_members").insert([{conversation_id:newConv.id,user_id:me.id,role:"admin"},{conversation_id:newConv.id,user_id:foundUser.id,role:"member"}]);
  document.getElementById("new-chat-modal").style.display="none";
  await loadConversations();
  openConversation(newConv,foundUser);
};

// ── New Group ─────────────────────────────────────────────────────────────────
document.getElementById("new-group-btn").onclick=()=>{ document.getElementById("ng-name").value=""; document.getElementById("ng-members").value=""; document.getElementById("ng-result").innerHTML=""; document.getElementById("new-group-modal").style.display="flex"; };
document.getElementById("ng-cancel").onclick=()=>document.getElementById("new-group-modal").style.display="none";
document.getElementById("new-group-modal").onclick=e=>{ if(e.target===document.getElementById("new-group-modal"))document.getElementById("new-group-modal").style.display="none"; };
document.getElementById("ng-create").onclick=async()=>{
  const name=document.getElementById("ng-name").value.trim();
  const desc=document.getElementById("ng-desc").value.trim();
  const membersRaw=document.getElementById("ng-members").value.trim();
  const res=document.getElementById("ng-result");
  if(!name){ res.innerHTML=`<span style="color:var(--danger)">Group name required.</span>`; return; }

  const btn=document.getElementById("ng-create"); btn.innerHTML="<span>Creating…</span>"; btn.disabled=true;

  const usernames=membersRaw.split(",").map(u=>u.trim().toLowerCase()).filter(Boolean);
  const memberProfiles=[{...me}];
  for(const u of usernames){
    const { data }=await supabase.from("current_profiles").select("id,username,display_name,identity_key,avatar_color").eq("username",u).maybeSingle();
    if(data) memberProfiles.push(data);
    else { res.innerHTML=`<span style="color:var(--danger)">User not found: ${esc(u)}</span>`; btn.innerHTML="<span>Create group</span>"; btn.disabled=false; return; }
  }

  const { data:newConv,error }=await supabase.from("current_conversations").insert({type:"group",name,description:desc||null,avatar_color:"#18a96b",created_by:me.id}).select("*").single();
  if(error){ toast("Error: "+error.message,"error"); btn.innerHTML="<span>Create group</span>"; btn.disabled=false; return; }

  await supabase.from("current_members").insert(
    memberProfiles.map((p,i)=>({conversation_id:newConv.id,user_id:p.id,role:i===0?"admin":"member"}))
  );

  // Send welcome message
  const allWithKeys=memberProfiles.filter(p=>p.identity_key).map(p=>({userId:p.id,publicKeyB64:p.identity_key}));
  if(allWithKeys.length){
    try{
      const { ciphertext,iv,recipient_keys }=await encryptMessage(`${me.display_name||me.username} created the group "${name}" 🎉`,allWithKeys);
      await supabase.from("current_messages").insert({conversation_id:newConv.id,sender_id:me.id,ciphertext,iv,recipient_keys,message_type:"system"});
    }catch(e){ console.warn("Welcome msg failed",e); }
  }

  document.getElementById("new-group-modal").style.display="none";
  btn.innerHTML="<span>Create group</span>"; btn.disabled=false;
  await loadConversations();
  openConversation(newConv,null);
};

// ── Disappearing ──────────────────────────────────────────────────────────────
document.getElementById("disappear-cancel").onclick=()=>document.getElementById("disappear-modal").style.display="none";
document.getElementById("disappear-save").onclick=async()=>{
  if(!activeConv) return;
  const secs=parseInt(document.getElementById("disappear-select").value)||null;
  await supabase.from("current_conversations").update({disappear_after_seconds:secs}).eq("id",activeConv.id);
  activeConv.disappear_after_seconds=secs;
  toast(secs?`Messages disappear after ${document.getElementById("disappear-select").selectedOptions[0].text}`:"Disappearing messages off","success");
  document.getElementById("disappear-modal").style.display="none";
};

// ── Mobile back ───────────────────────────────────────────────────────────────
document.getElementById("mobile-back").onclick=()=>{
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("conversation-pane").style.display="none";
  document.getElementById("empty-state").style.display="flex";
};

// ── Presence ──────────────────────────────────────────────────────────────────
async function setOnline(online) {
  if(!me) return;
  await supabase.from("current_profiles").update({online,last_seen:new Date().toISOString()}).eq("id",me.id);
}
document.addEventListener("visibilitychange",()=>setOnline(!document.hidden));
window.addEventListener("beforeunload",()=>setOnline(false));

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  me=await getMe(); if(!me) return;
  if(!(await hasIdentityKey())) toast("⚠️ No local key — messages can't decrypt. Settings → Key backup.","error");
  document.getElementById("my-avatar").textContent=initial(me.display_name||me.username);
  document.getElementById("my-username").textContent=me.display_name||me.username;
  document.getElementById("my-status-text").textContent=`${me.status_emoji||"🟢"} ${me.status_text||"Available"}`;
  await setOnline(true);
  await loadConversations();
  supabase.channel("global:"+me.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"current_messages"},()=>loadConversations())
    .subscribe();
}
init();
