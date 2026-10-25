(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const client = typeof supabaseClient !== "undefined" ? supabaseClient : null;
  const btn = $("ai-profile-btn"), menu = $("ai-profile-menu"), backdrop = $("ai-settings-backdrop");
  const webToggle = $("ai-web-research-toggle"), scholarToggle = $("ai-scholar-mode-toggle");
  const isOn = (key) => localStorage.getItem(key) === "true";
  function openMenu(open) { if (!menu || !btn) return; menu.hidden = !open; btn.setAttribute("aria-expanded",String(open)); }
  function modelLabel() { const el=$("ai-settings-model-name"), label=$("model-picker-label"); if(el) el.textContent=(label?.textContent?.trim()||"Default")+" ›"; }
  function openSettings() { if(webToggle)webToggle.checked=isOn("ai360:webResearch"); if(scholarToggle)scholarToggle.checked=isOn("ai360:scholarMode"); modelLabel();openMenu(false);if(backdrop){backdrop.hidden=false;$ ("ai-settings-close")?.focus();} }
  function closeSettings() { if(backdrop)backdrop.hidden=true; }
  async function updateProfile(user) {
    let name=user?.user_metadata?.display_name||user?.user_metadata?.full_name||user?.user_metadata?.name||user?.user_metadata?.username||(user?.email?user.email.split("@")[0]:"Guest");
    let avatar=user?.user_metadata?.avatar_url||user?.user_metadata?.picture||"";
    if(client&&user?.id){try{const {data}=await client.from("profiles").select("username,avatar_url").eq("id",user.id).maybeSingle();if(data){name=data.username||name;avatar=data.avatar_url||avatar;}}catch(_) {}}
    const initials=String(name||"G").trim().slice(0,1).toUpperCase()||"G";
    [$ ("ai-profile-name"),$("ai-profile-menu-name")].forEach(el=>{if(el)el.textContent=name;});
    const subtitle=$("ai-profile-subtitle");if(subtitle)subtitle.textContent=user?"AI settings":"Guest session";
    const email=$("ai-profile-menu-email");if(email)email.textContent=user?.email||"Not signed in";
    [$ ("ai-profile-avatar"),$("ai-profile-menu-avatar")].filter(Boolean).forEach(el=>{el.replaceChildren();if(avatar&&/^https?:\/\//i.test(avatar)){const img=document.createElement("img");img.src=avatar;img.alt="";img.referrerPolicy="no-referrer";img.onerror=()=>{el.replaceChildren(document.createTextNode(initials));};el.append(img);}else el.textContent=initials;});
    const action=$("ai-profile-auth-action");if(action)action.textContent=user?"Sign out":"Sign in";
  }
  btn?.addEventListener("click",e=>{e.stopPropagation();openMenu(!!menu?.hidden);});
  document.addEventListener("click",e=>{if(menu&&!menu.hidden&&!menu.contains(e.target)&&!btn?.contains(e.target))openMenu(false);});
  $("ai-open-settings")?.addEventListener("click",openSettings);
  $("ai-open-models")?.addEventListener("click",()=>{openMenu(false);$("model-picker-btn")?.click();setTimeout(modelLabel,100);});
  $("ai-open-models-dialog")?.addEventListener("click",()=>{closeSettings();$("model-picker-btn")?.click();setTimeout(modelLabel,100);});
  $("ai-settings-close")?.addEventListener("click",closeSettings);
  backdrop?.addEventListener("click",e=>{if(e.target===backdrop)closeSettings();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeSettings();openMenu(false);}});
  webToggle?.addEventListener("change",()=>localStorage.setItem("ai360:webResearch",String(webToggle.checked)));
  scholarToggle?.addEventListener("change",()=>{localStorage.setItem("ai360:scholarMode",String(scholarToggle.checked));if(scholarToggle.checked&&webToggle){webToggle.checked=true;localStorage.setItem("ai360:webResearch","true");}});
  $("ai-sidebar-collapse")?.addEventListener("click",()=>$("ai-chat-sidebar-toggle")?.click());
  $("ai-profile-auth-action")?.addEventListener("click",async()=>{openMenu(false);if(!client){location.href="/account?from=%2Fai";return;}try{const {data}=await client.auth.getSession();if(data?.session){await client.auth.signOut();await updateProfile(null);}else location.href="/account?from=%2Fai";}catch(_){location.href="/account?from=%2Fai";}});
  if(client){client.auth.getSession().then(({data})=>updateProfile(data?.session?.user||null)).catch(()=>updateProfile(null));client.auth.onAuthStateChange((_e,session)=>{setTimeout(()=>updateProfile(session?.user||null),0);});}else updateProfile(null);
  $("model-picker-btn")?.addEventListener("click",()=>setTimeout(modelLabel,100));
})();
