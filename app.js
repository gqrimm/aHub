const SUPABASE_URL = 'https://ynnqidfodgravvhxhbuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ziIy4oGXycJNYeZRKyqNKg_GwnJrz6f';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],
    workspaces: [],
    currentWorkspace: new URLSearchParams(window.location.search).get('space') || localStorage.getItem('active_workspace') || null,
    selectedDate: new Date().toISOString().split('T')[0],

    init: async function() {
        const { data: { session } } = await sb.auth.getSession();
        if (session) { this.user = session.user; this.showDashboard(); }
        sb.auth.onAuthStateChange(async (event, session) => {
            if (session) { this.user = session.user; this.showDashboard(); }
            else { this.user = null; this.showLogin(); }
        });
        sb.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, () => this.fetchTrackers()).subscribe();
    },

    // --- WORKSPACE LOGIC ---
    createNewWorkspace: async function() {
        const name = prompt("Enter Space Name:");
        if (!name) return;
        const spaceId = Math.random().toString(36).substring(2, 9);
        await sb.from('user_workspaces').insert([{ user_id: this.user.id, workspace_id: spaceId, workspace_name: name }]);
        this.switchWorkspace(spaceId);
    },

    joinWorkspaceManually: function() {
        const id = document.getElementById('join-id-input').value.trim();
        if(id) this.switchWorkspace(id);
    },

    renameWorkspace: async function() {
        if (!this.currentWorkspace) return;
        const newName = prompt("New space name:");
        if (!newName) return;
        await sb.from('user_workspaces').update({ workspace_name: newName }).eq('workspace_id', this.currentWorkspace);
        this.fetchWorkspaces();
    },

    deleteWorkspace: async function() {
        if (!this.currentWorkspace || !confirm("Delete this entire space?")) return;
        await sb.from('user_workspaces').delete().eq('workspace_id', this.currentWorkspace);
        this.switchWorkspace(null);
    },

    copyInviteLink: function() {
        if (!this.currentWorkspace) return alert("Select a space first!");
        const url = window.location.origin + window.location.pathname + "?space=" + this.currentWorkspace;
        navigator.clipboard.writeText(url).then(() => alert("Link copied! ID: " + this.currentWorkspace));
    },

    switchWorkspace: function(id) {
        this.currentWorkspace = id || null;
        id ? localStorage.setItem('active_workspace', id) : localStorage.removeItem('active_workspace');
        const url = new URL(window.location);
        id ? url.searchParams.set('space', id) : url.searchParams.delete('space');
        window.history.pushState({}, '', url);
        this.fetchTrackers();
        this.fetchWorkspaces();
    },

    fetchWorkspaces: async function() {
        const { data } = await sb.from('user_workspaces').select('*').eq('user_id', this.user.id);
        this.workspaces = data || [];
        const dropdown = document.getElementById('workspace-dropdown');
        if(!dropdown) return;
        dropdown.innerHTML = '<option value="">🏠 Private Space</option>';
        this.workspaces.forEach(ws => {
            const opt = document.createElement('option');
            opt.value = ws.workspace_id;
            opt.textContent = `🚀 ${ws.workspace_name}`;
            if (this.currentWorkspace === ws.workspace_id) opt.selected = true;
            dropdown.appendChild(opt);
        });
        const controls = document.getElementById('ws-manage-controls');
        if (controls) controls.style.display = this.currentWorkspace ? 'flex' : 'none';
    },

    // --- TRACKER LOGIC ---
    fetchTrackers: async function() {
        if (!this.user) return;
        let query = sb.from('trackers').select('*');
        if (this.currentWorkspace) query = query.eq('workspace_id', this.currentWorkspace);
        else query = query.eq('user_id', this.user.id).is('workspace_id', null);
        const { data } = await query;
        this.trackers = (data || []).sort((a, b) => (a.history_data.order || 0) - (b.history_data.order || 0));
        this.render();
    },

    createTracker: async function() {
        const name = document.getElementById('track-name').value;
        const type = document.getElementById('track-type').value;
        if(!name) return alert("Enter a name");
        let initialData = { order: this.trackers.length, w: 300, h: 250 }; // Default pixel size
        if (type === 'code') initialData.code = "<h1>New Code Card</h1>";
        await sb.from('trackers').insert([{ name, type, user_id: this.user.id, workspace_id: this.currentWorkspace, history_data: initialData }]);
        this.closeModal();
        this.fetchTrackers(); 
    },

    render: function() {
        const container = document.getElementById('module-container');
        container.innerHTML = '';
        this.trackers.forEach(t => {
            const h = t.history_data || {};
            const card = document.createElement('div');
            card.className = `module type-${t.type}`;
            card.id = `card-${t.id}`;

            // NO GRID SPANS - Just Pixels
            if(h.w) card.style.width = h.w + 'px';
            if(h.h) card.style.height = h.h + 'px';

            card.innerHTML = `
                <div class="card-header" draggable="true">
                    <span>${t.name}</span>
                    <button onclick="app.deleteTracker(${t.id})" style="background:none; border:none; cursor:pointer;">✕</button>
                </div>
                <div class="card-body">${this.getTypeHTML(t)}</div>`;

            // Drag to Move (Swapping Order)
            const header = card.querySelector('.card-header');
            header.ondragstart = (e) => { card.classList.add('dragging'); e.dataTransfer.setData('text/plain', t.id); };
            header.ondragend = () => card.classList.remove('dragging');

            card.ondragover = (e) => {
                e.preventDefault();
                const draggingCard = document.querySelector('.dragging');
                if (!draggingCard || draggingCard === card) return;
                const siblings = [...container.querySelectorAll('.module:not(.dragging)')];
                const nextSibling = siblings.find(s => {
                    const r = s.getBoundingClientRect();
                    return e.clientY <= r.top + r.height / 2 && e.clientX <= r.left + r.width / 2;
                });
                container.insertBefore(draggingCard, nextSibling);
            };
            card.ondrop = () => this.saveNewOrder();

            // RESIZE LOGIC (Pure Pixels, No Snapping)
            card.onmouseup = async () => {
                // Just save the raw pixels
                if (card.offsetWidth !== h.w || card.offsetHeight !== h.h) {
                    t.history_data.w = card.offsetWidth;
                    t.history_data.h = card.offsetHeight;
                    await sb.from('trackers').update({ history_data: t.history_data }).eq('id', t.id);
                }
            };

            container.appendChild(card);
            if (t.type === 'drawing') this.initCanvas(t);
        });
    },

    saveNewOrder: async function() {
        const cardElements = [...document.querySelectorAll('.module')];
        const updates = cardElements.map((el, index) => {
            const id = el.id.replace('card-', '');
            const tracker = this.trackers.find(t => t.id == id);
            tracker.history_data.order = index;
            return sb.from('trackers').update({ history_data: tracker.history_data }).eq('id', id);
        });
        await Promise.all(updates);
    },

    getTypeHTML: function(t) {
        const history = t.history_data || {};
        if (t.type === 'bool' || t.type === 'text') {
            let cal = '<div class="calendar-grid">';
            for (let i = 13; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                cal += `<div class="day-box ${history[k] ? 'day-active' : ''}" onclick="app.selectedDate='${k}'; app.render()">${d.getDate()}</div>`;
            }
            cal += '</div>';
            const val = history[this.selectedDate] || "";
            return `<small>${this.selectedDate}</small>${cal}` + (t.type === 'bool' ? 
                `<button class="neal-btn ${val ? 'primary' : ''}" style="width:100%; margin-top:10px;" onclick="app.logValue(${t.id},'${this.selectedDate}',true)">${val ? '✓' : 'DONE'}</button>` :
                `<input type="text" class="neal-input" style="width:100%; margin-top:10px;" value="${val}" onchange="app.logValue(${t.id},'${this.selectedDate}',this.value)">`);
        }
        if (t.type === 'pure-text') return `<textarea class="note-area" onchange="app.logValue(${t.id},'note',this.value)">${history.note || ''}</textarea>`;
        if (t.type === 'drawing') return `<canvas id="canvas-${t.id}" class="draw-canvas"></canvas><button class="neal-btn" style="margin-top:5px; font-size:10px;" onclick="app.clearCanvas(${t.id})">Clear</button>`;
        if (t.type === 'code') return `<div style="flex-grow:1; display:flex; flex-direction:column; gap:10px; height:100%;"><iframe srcdoc="${(history.code || '').replace(/"/g, '&quot;')}" style="border:1px solid #000; background:#fff; flex-grow:1; width:100%;"></iframe><button class="neal-btn" onclick="app.editCode(${t.id})" style="font-size:10px;">Edit Source</button></div>`;
        return '';
    },

    logValue: async function(id, key, val) {
        const t = this.trackers.find(x => x.id === id);
        let history = { ...t.history_data };
        t.type === 'bool' ? (history[key] = !history[key]) : (history[key] = val);
        await sb.from('trackers').update({ history_data: history }).eq('id', id);
        this.fetchTrackers();
    },

    editCode: function(id) {
        const t = this.trackers.find(x => x.id === id);
        const editorDiv = document.createElement('div');
        editorDiv.className = 'overlay';
        editorDiv.innerHTML = `<div class="auth-card" style="max-width: 80%; width: 800px; height: 80%;"><textarea id="code-editor-area" style="width:100%; height:80%; font-family:monospace; padding:10px; border:2px solid #000;">${t.history_data.code || ""}</textarea><div style="margin-top:20px; display:flex; gap:10px; justify-content: flex-end;"><button class="neal-btn" id="close-editor">Cancel</button><button class="neal-btn primary" id="save-code">Save</button></div></div>`;
        document.body.appendChild(editorDiv);
        document.getElementById('save-code').onclick = async () => {
            const newCode = document.getElementById('code-editor-area').value;
            await sb.from('trackers').update({ history_data: { ...t.history_data, code: newCode } }).eq('id', id);
            document.body.removeChild(editorDiv);
            this.fetchTrackers();
        };
        document.getElementById('close-editor').onclick = () => document.body.removeChild(editorDiv);
    },

    initCanvas: function(t) {
        const canvas = document.getElementById(`canvas-${t.id}`);
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
        if (t.history_data.img) { const img = new Image(); img.onload = () => ctx.drawImage(img,0,0, canvas.width, canvas.height); img.src = t.history_data.img; }
        let draw = false;
        canvas.onmousedown = (e) => { draw = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
        canvas.onmousemove = (e) => { if(draw) { ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); } };
        canvas.onmouseup = async () => { draw = false; await sb.from('trackers').update({ history_data: { ...t.history_data, img: canvas.toDataURL() } }).eq('id', t.id); };
    },

    clearCanvas: async function(id) {
        const canvas = document.getElementById(`canvas-${id}`);
        if (!canvas) return;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        const t = this.trackers.find(x => x.id === id);
        await sb.from('trackers').update({ history_data: { ...t.history_data, img: null } }).eq('id', id);
    },

    deleteTracker: async (id) => { if (confirm("Delete?")) await sb.from('trackers').delete().eq('id', id); },
    showDashboard: function() { document.getElementById('auth-overlay').classList.add('hidden'); document.getElementById('main-content').classList.remove('hidden'); this.fetchWorkspaces(); this.fetchTrackers(); },
    showLogin: function() { document.getElementById('auth-overlay').classList.remove('hidden'); document.getElementById('main-content').classList.add('hidden'); },
    login: async function() { const email = document.getElementById('user').value, pass = document.getElementById('pass').value; const { error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) alert(error.message); },
    register: async function() { const email = document.getElementById('user').value, pass = document.getElementById('pass').value; const { error } = await sb.auth.signUp({ email, password: pass }); if (error) alert(error.message); else alert("Check email!"); },
    logout: async function() { await sb.auth.signOut(); location.reload(); },
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden')
};

app.init();