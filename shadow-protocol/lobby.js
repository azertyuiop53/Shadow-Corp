// SHADOW PROTOCOL — salons multijoueurs (Supabase : Auth Google, tables, Realtime)
(() => {
  const C = window.SP_CONFIG || {}, $ = i => document.getElementById(i), pn = $("pn_mp");
  const sb = (C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase) ? supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  let user = null, prof = null, fT = null, lobby = null, ch = null, err = "", F = { mode: "", map: "" };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NAME = () => prof?.username || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Joueur";
  const ML = { pvp: "PVP", pve: "PVE", pvb: "Entraînement" };
  const MAPS = [["base", "Base militaire"], ["ville", "Ville"], ["desert", "Désert"], ["camp", "Camp d’entraînement"], ["rand", "Aléatoire"]];
  const opt = (a, v) => a.map(([k, t]) => `<option value="${k}"${k == v ? " selected" : ""}>${t}</option>`).join("");
  const draw = h => { pn.innerHTML = h + (err ? `<div class="err">${esc(err)}</div>` : ""); err = ""; };
  const call = async (p) => { const { data, error } = await p; if (error) { err = error.message; return null } return data; };

  async function init() {
    if (!sb) return view();
    const { data } = await sb.auth.getSession(); user = data.session?.user || null;
    sb.auth.onAuthStateChange((_e, s) => { user = s?.user || null; if (!user) prof = null; if (!lobby) view(); });
    setInterval(() => { if (user) sb.rpc("ensure_profile", { p_name: NAME() }); }, 60000);
    view();
  }
  async function view() {
    if (!sb) return draw('<h3>MULTIJOUEUR</h3><div class="hint">Supabase n’est pas encore configuré : renseigne <b>config.js</b> (voir README).</div>');
    if (!user) return draw('<h3>MULTIJOUEUR</h3><div class="hint">Connecte-toi pour créer ou rejoindre un salon.</div><button class="chip" id="gl">Se connecter avec Google</button>'), $("gl").onclick = () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    if (lobby) return room();
    clearInterval(fT);
    if (!prof) prof = await call(sb.rpc("ensure_profile", { p_name: NAME() }));
    const inv = await call(sb.rpc("list_invites")) || [];
    let q = sb.from("lobbies").select("*,lobby_players(count)").eq("is_public", true).eq("status", "waiting").order("created_at", { ascending: false }).limit(50);
    if (F.mode) q = q.eq("mode", F.mode); if (F.map) q = q.eq("map", F.map);
    const rows = await call(q) || [];
    draw(`<h3>SALONS · ${esc(NAME())}</h3>${inv.map(i => `<div class="row"><span>${esc(i.i_from)} t’invite : ${esc(i.i_name)}</span><button class="chip" data-i="${i.i_code}" data-d="${i.i_id}">Rejoindre</button><button class="chip" data-x="${i.i_id}">Ignorer</button></div>`).join("")}
<div class="row"><select id="fm"><option value="">Tous les modes</option>${opt(Object.entries(ML), F.mode)}</select><select id="fp"><option value="">Toutes les cartes</option>${opt(MAPS.slice(0, 4), F.map)}</select><button class="chip" id="rf">Rafraîchir</button><button class="chip" id="cr">+ Créer un salon</button><button class="chip" id="fr">Amis</button><button class="chip" id="lo">Déconnexion</button></div>
<div class="row"><input type="text" id="cd" placeholder="Code du salon" maxlength="6" size="10"><button class="chip" id="jc">Rejoindre avec un code</button></div>
<table><tr><th>Salon</th><th>Hôte</th><th>Mode</th><th>Carte</th><th>Joueurs</th><th>Région</th><th></th></tr>${rows.map(r => { const n = r.lobby_players?.[0]?.count || 0, full = n >= r.max_players || r.locked; return `<tr><td>${esc(r.name)}</td><td>${esc(r.host_name)}</td><td>${ML[r.mode]}</td><td>${esc(r.map)}</td><td>${n}/${r.max_players}</td><td>${esc(r.region)}</td><td><button class="chip" data-c="${r.code}"${full ? " disabled" : ""}>${full ? "Complet" : "Rejoindre"}</button></td></tr>` }).join("") || '<tr><td colspan="7" class="hint">Aucun salon public pour le moment.</td></tr>'}</table>`);
    $("fm").onchange = e => { F.mode = e.target.value; view() }; $("fp").onchange = e => { F.map = e.target.value; view() };
    $("rf").onclick = view; $("cr").onclick = form; $("lo").onclick = () => sb.auth.signOut();
    $("jc").onclick = () => join($("cd").value);
    $("fr").onclick = friends;
    pn.querySelectorAll("[data-i]").forEach(b => b.onclick = async () => { await call(sb.rpc("dismiss_invite", { p_id: b.dataset.d })); join(b.dataset.i); });
    pn.querySelectorAll("[data-x]").forEach(b => b.onclick = async () => { await call(sb.rpc("dismiss_invite", { p_id: b.dataset.x })); view(); });
    fT = setInterval(() => { if (!$("cd")?.value) view(); }, 20000);
    pn.querySelectorAll("[data-c]").forEach(b => b.onclick = () => join(b.dataset.c));
  }
  async function friends() {
    clearInterval(fT);
    const L = await call(sb.rpc("list_friends")) || [];
    const sec = (rel, t, fn) => { const r = L.filter(x => x.f_rel == rel); return r.length ? `<h3>${t}</h3><table>${r.map(fn).join("")}</table>` : ""; };
    draw(`<h3>AMIS · ${esc(NAME())}</h3>
<div class="row"><input type="text" id="un" placeholder="Pseudo d’un joueur" maxlength="16"><button class="chip" id="ad">Ajouter</button></div>
${sec("incoming", "DEMANDES REÇUES", x => `<tr><td>${esc(x.f_name)}</td><td><button class="chip" data-a="${x.f_id}">Accepter</button> <button class="chip" data-r="${x.f_id}">Refuser</button></td></tr>`)}
${sec("friend", "MES AMIS", x => `<tr><td>${x.f_online ? "🟢" : "⚫"} ${esc(x.f_name)}</td><td><button class="chip" data-d="${x.f_id}">Retirer</button></td></tr>`)}
${sec("outgoing", "EN ATTENTE", x => `<tr><td>${esc(x.f_name)}</td><td><button class="chip" data-d="${x.f_id}">Annuler</button></td></tr>`)}
${L.length ? "" : '<div class="hint">Aucun ami pour le moment : ajoute un joueur avec son pseudo.</div>'}
<div class="row"><input type="text" id="mn" placeholder="Changer mon pseudo" maxlength="16"><button class="chip" id="sn">Enregistrer</button><button class="chip" id="bk">Retour</button></div>`);
    $("ad").onclick = async () => { const r = await call(sb.rpc("send_friend_request", { p_username: $("un").value })); if (r) err = r; friends(); };
    $("sn").onclick = async () => { const r = await call(sb.rpc("set_username", { p_username: $("mn").value })); if (r) prof = r; friends(); };
    $("bk").onclick = view;
    pn.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => { await call(sb.rpc("respond_friend_request", { p_user: b.dataset.a, p_accept: true })); friends(); });
    pn.querySelectorAll("[data-r]").forEach(b => b.onclick = async () => { await call(sb.rpc("respond_friend_request", { p_user: b.dataset.r, p_accept: false })); friends(); });
    pn.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => { await call(sb.rpc("remove_friend", { p_user: b.dataset.d })); friends(); });
    fT = setInterval(() => { if (!$("un")?.value && !$("mn")?.value) friends(); }, 15000);
  }
  function form() {
    draw(`<h3>CRÉER UN SALON</h3><div class="row"><input type="text" id="n" placeholder="Nom du salon" maxlength="40" value="Salon de ${esc(NAME())}"></div>
<div class="row"><select id="m">${opt(Object.entries(ML), "pvp")}</select><select id="p">${opt(MAPS, "base")}</select><select id="x">${opt([4, 8, 12, 24, 32].map(n => [n, n + " joueurs"]), 8)}</select><select id="v"><option value="1">Public</option><option value="0">Privé (code)</option></select><select id="r">${opt(["Standard", "Sans limite de temps", "Sans compétences", "Personnalisé"].map(t => [t, t]), "Standard")}</select></div>
<label><input type="checkbox" id="b" checked> Autoriser l’ajout de bots</label><div class="row"><button class="chip" id="ok">Créer</button><button class="chip" id="bk">Annuler</button></div>`);
    $("bk").onclick = view;
    $("ok").onclick = async () => {
      const r = await call(sb.rpc("create_lobby", { p_name: $("n").value || "Salon", p_mode: $("m").value, p_map: $("p").value, p_max: +$("x").value, p_public: $("v").value == "1", p_bots: $("b").checked, p_rules: $("r").value, p_host_name: NAME() }));
      r ? enter(r) : view();
    };
  }
  async function join(code) { const r = await call(sb.rpc("join_lobby", { p_code: (code || "").trim(), p_name: NAME() })); r ? enter(r) : view(); }
  function enter(l) {
    lobby = l;
    ch = sb.channel("lobby:" + l.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "lobby_players", filter: "lobby_id=eq." + l.id }, room)
      .on("postgres_changes", { event: "*", schema: "public", table: "lobbies", filter: "id=eq." + l.id }, room)
      .subscribe();
    room();
  }
  async function room() {
    if (!lobby) return;
    const L = await call(sb.from("lobbies").select("*").eq("id", lobby.id).maybeSingle());
    const P = await call(sb.from("lobby_players").select("*").eq("lobby_id", lobby.id).order("joined_at")) || [];
    if (!L || !P.some(p => p.user_id == user.id)) { leaveLocal(); return view(); }
    lobby = L;
    const host = L.host_id == user.id, me = P.find(p => p.user_id == user.id);
    const FR = (await call(sb.rpc("list_friends")) || []).filter(x => x.f_rel == "friend" && !P.some(p => p.user_id == x.f_id));
    if (L.status == "playing") return launch(me);
    draw(`<h3>${esc(L.name)} · CODE <b style="color:#fff;letter-spacing:.2em">${L.code}</b></h3><div class="hint">${ML[L.mode]} · ${esc(L.map)} · ${P.length}/${L.max_players} · ${esc(L.rules)} · ${L.is_public ? "Public" : "Privé"}${L.locked ? " · Verrouillé" : ""}</div>
<table><tr><th>Joueur</th><th>Classe</th><th>Statut</th><th></th></tr>${P.map(p => `<tr><td>${esc(p.name)}${p.user_id == L.host_id ? " ★" : ""}</td><td>${esc(p.class)}</td><td>${p.ready ? "Prêt" : "En attente"}</td><td>${host && p.user_id != user.id ? `<button class="chip" data-k="${p.user_id}">Expulser</button>` : ""}</td></tr>`).join("")}</table>
<div class="row"><select id="cl">${opt([["assault", "Assaut"], ["scout", "Éclaireur"], ["support", "Soutien"], ["eng", "Ingénieur"], ["medic", "Médecin"]], me.class)}</select><button class="chip" id="rd">${me.ready ? "Pas prêt" : "Prêt"}</button>${host ? `<button class="chip" id="lk">${L.locked ? "Déverrouiller" : "Verrouiller"}</button><button class="big" id="st" style="padding:10px 28px;font-size:16px;margin:0">LANCER</button>` : ""}<button class="chip" id="lv">Quitter</button></div>
${FR.length ? `<div class="row"><select id="iv">${FR.map(x => `<option value="${x.f_id}">${x.f_online ? "🟢" : "⚫"} ${esc(x.f_name)}</option>`).join("")}</select><button class="chip" id="ib">Inviter un ami</button></div>` : ""}
<div class="hint">Les parties se lancent pour l’instant en mode solo avec bots ; la synchronisation en temps réel des joueurs est la prochaine étape.</div>`);
    if (FR.length) $("ib").onclick = () => call(sb.rpc("invite_friend", { p_lobby: L.id, p_user: $("iv").value }));
    $("cl").onchange = e => call(sb.from("lobby_players").update({ class: e.target.value }).eq("lobby_id", L.id).eq("user_id", user.id));
    $("rd").onclick = () => call(sb.from("lobby_players").update({ ready: !me.ready }).eq("lobby_id", L.id).eq("user_id", user.id));
    $("lv").onclick = async () => { await call(sb.rpc("leave_lobby", { p_lobby: L.id })); leaveLocal(); view(); };
    pn.querySelectorAll("[data-k]").forEach(b => b.onclick = () => call(sb.rpc("kick_player", { p_lobby: L.id, p_user: b.dataset.k })));
    if (host) { $("lk").onclick = () => call(sb.from("lobbies").update({ locked: !L.locked }).eq("id", L.id)); $("st").onclick = () => call(sb.from("lobbies").update({ status: "playing", locked: true }).eq("id", L.id)); }
  }
  function leaveLocal() { if (ch) sb.removeChannel(ch); ch = null; lobby = null; }
  function launch(me) {
    const L = lobby; leaveLocal();
    cfg.mode = L.mode; cfg.map = L.map == "rand" ? ["base", "ville", "desert", "camp"][Math.random() * 4 | 0] : L.map; cfg.cls = me?.class || "assault";
    start();
    setTimeout(() => { if (!document.pointerLockElement && playing && !pad0()) { paused = true; $("pause").hidden = false } }, 400);
  }
  init();
})();
