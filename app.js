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
        if (session) {
            this.user = session.user;
            this.showDashboard();
        }

        sb.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                this.user = session.user;
                this.showDashboard();
            } else {
                this.user = null;
                this.showLogin();
            }
        });

        sb.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, () => this.fetchTrackers()).subscribe();
    },

    // --- WORKSPACE LOGIC ---
    createNewWorkspace: async function() {
        const name = prompt("Enter Space Name:");
        if (!name) return;
        const spaceId = Math.random().toString(36).substring(2, 9);
        
        const { error } = await sb.from('user_workspaces').insert([
            { user_id: this.user.id, workspace_id: spaceId, workspace_name: name }
        ]);

        if (error) alert(error.message);
        else {
            alert(`Space Created! ID: ${spaceId}`);
            this.switchWorkspace(spaceId);
        }
    },

    renameWorkspace: async function() {
        if (!this.currentWorkspace) return;
        const newName = prompt("Enter new space name:");
        if (!newName) return;

        const { error } = await sb.from('user_workspaces')
            .update({ workspace_name: newName })
            .eq('workspace_id', this.currentWorkspace)
            .eq('user_id', this.user.id);

        if (error) alert(error.message);
        else this.fetchWorkspaces();
    },

    deleteWorkspace: async function() {
        if (!this.currentWorkspace) return;
        if (!confirm("Remove this space from your list?")) return;

        const { error } = await sb.from('user_workspaces')
            .delete()
            .eq('workspace_id', this.currentWorkspace)
            .eq('user_id', this.user.id);

        if (error) alert(error.message);
        else this.switchWorkspace(null); 
    },

    fetchWorkspaces: async function() {
        const { data } = await sb.from('user_workspaces').select('*').eq('user_id', this.user.id);
        this.workspaces = data || [];
        const dropdown = document.getElementById('workspace-dropdown');
        const manageBox = document.getElementById('ws-manage-controls');
        
        dropdown.innerHTML = '<option value="">🏠 Private Space</option>';
        
        if (this.currentWorkspace) manageBox?.classList.remove('hidden');
        else manageBox?.classList.add('hidden');

        this.workspaces.forEach(ws => {
            const opt = document.createElement('option');
            opt.value = ws.workspace_id;
            opt.textContent = `🚀 ${ws.workspace_name}`;
            if (this.currentWorkspace === ws.workspace_id) opt.selected = true;
            dropdown.appendChild(opt);
        });
    },

    joinWorkspace: async function(id) {
        if (!id) return;
        const name = prompt("Name this space for your list:");
        const { error } = await sb.from('user_workspaces').insert([
            { user_id: this.user.id, workspace_id: id, workspace_name: name || id }
        ]);
        if (error) alert("Joined!");
        this.switchWorkspace(id);
    },

    switchWorkspace: function(id) {
        this.currentWorkspace = id || null;
        if (id) localStorage.setItem('active_workspace', id);
        else localStorage.removeItem('active_workspace');
        
        const url = new URL(window.location);
        id ? url.searchParams.set('space', id) : url.searchParams.delete('space');
        window.history.pushState({}, '', url);
        
        this.fetchTrackers();
        this.fetchWorkspaces();
    },

    copyInviteLink: function() {
        if (!this.currentWorkspace) return alert("Switch to a shared Space first!");
        const link = window.location.origin + window.location.pathname + '?space=' + this.currentWorkspace;
        navigator.clipboard.writeText(link);
        alert("Invite link copied!");
    },

    fetchTrackers: async function() {
        if (!this.user) return;
        let query = sb.from('trackers').select('*');
        if (this.currentWorkspace) query = query.eq('workspace_id', this.currentWorkspace);
        else query = query.eq('user_id', this.user.id).is('workspace_id', null);
        
        const { data } = await query.order('created_at', { ascending: true });
        this.trackers = data || [];
        this.render();
    },

    createTracker: async function() {
        const name = document.getElementById('track-name').value;
        const type = document.getElementById('track-type').value;
        if(!name) return alert("Enter a name");
        await sb.from('trackers').insert([{ 
            name, type, user_id: this.user.id, workspace_id: this.currentWorkspace, history_data: {} 
        }]);
        this.closeModal();
        this.fetchTrackers(); // Refresh immediately
    },

    login: async function() {
        const email = document.getElementById('user').value;
        const password = document.getElementById('pass').value;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
    },

    register: async function() {
        const email = document.getElementById('user').value;
        const password = document.getElementById('pass').value;
        const { error } = await sb.auth.signUp({ email, password });
        if (error) alert(error.message); else alert("Check email!");
    },

    logout: async function() { await sb.auth.signOut(); location.reload(); },

    render: function() {
        const container = document.getElementById('module-container');
        container.innerHTML = '';
        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = `module type-${t.type}`;
            card.innerHTML = `
                <div class="card-header">
                    <span>${t.name}</span>
                    <button onclick="app.deleteTracker(${t.id})" style="background:none; border:none; cursor:pointer;">✕</button>
                </div>
                <div class="card-body">
                    ${this.getTypeHTML(t)}
                </div>`;
            container.appendChild(card);
            if (t.type === 'drawing') this.initCanvas(t);
        });
    },

    getTypeHTML: function(t) {
        if (t.type === 'bool' || t.type === 'text') {
            let cal = '<div class="calendar-grid">';
            for (let i = 13; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                cal += `<div class="day-box ${t.history_data[k] ? 'day-active' : ''}" onclick="app.selectedDate='${k}'; app.render()">${d.getDate()}</div>`;
            }
            cal += '</div>';
            const val = t.history_data[this.selectedDate] || "";
            const input = t.type === 'bool' ? 
                `<button class="neal-btn ${val ? 'primary' : ''}" style="width:100%; margin-top:10px;" onclick="app.logValue(${t.id},'${this.selectedDate}',true)">${val ? '✓' : 'DONE'}</button>` :
                `<input type="text" class="neal-input" style="width:100%; margin-top:10px;" value="${val}" onchange="app.logValue(${t.id},'${this.selectedDate}',this.value)">`;
            return `<small>${this.selectedDate}</small>${cal}${input}`;
        }
        if (t.type === 'pure-text') return `<textarea class="note-area" onchange="app.logValue(${t.id},'note',this.value)">${t.history_data.note || ''}</textarea>`;
        if (t.type === 'drawing') return `<canvas id="canvas-${t.id}" class="draw-canvas"></canvas><button class="neal-btn" style="margin-top:5px; font-size:10px;" onclick="app.clearCanvas(${t.id})">Clear</button>`;
        if (t.type === 'code') {
    const code = t.history_data.code || "<h1>Hello!</h1><p>Edit me...</p>";
    return `
        <div style="flex-grow:1; display:flex; flex-direction:column; gap:10px;">
            <iframe id="preview-${t.id}" srcdoc="${code.replace(/"/g, '&quot;')}" style="border:2px solid #000; background:#fff; flex-grow:1; width:100%;"></iframe>
            <button class="neal-btn" onclick="app.editCode(${t.id})" style="font-size:10px;">Edit Source</button>
        </div>
    `;
}
    },

    logValue: async function(id, key, val) {
        const t = this.trackers.find(x => x.id === id);
        let history = { ...t.history_data };
        t.type === 'bool' ? (history[key] = !history[key]) : (history[key] = val);
        await sb.from('trackers').update({ history_data: history }).eq('id', id);
        this.fetchTrackers();
    },

    editCode: async function(id) {
    const t = this.trackers.find(x => x.id === id);
    const currentCode = t.history_data.code || "";
    const newCode = prompt("Paste your HTML/CSS code here:", currentCode);
    
    if (newCode !== null) {
        let history = { ...t.history_data, code: newCode };
        await sb.from('trackers').update({ history_data: history }).eq('id', id);
        this.fetchTrackers();
    }
},

    initCanvas: function(t) {
        const canvas = document.getElementById(`canvas-${t.id}`);
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        // Set internal resolution to match display size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        if (t.history_data.img) { const img = new Image(); img.onload = () => ctx.drawImage(img,0,0, canvas.width, canvas.height); img.src = t.history_data.img; }
        let draw = false;
        canvas.onmousedown = (e) => { draw = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
        canvas.onmousemove = (e) => { if(draw) { ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); } };
        canvas.onmouseup = async () => { draw = false; await sb.from('trackers').update({ history_data: { ...t.history_data, img: canvas.toDataURL() } }).eq('id', t.id); };
    },

    clearCanvas: async function(id) {
        const canvas = document.getElementById(`canvas-${id}`);
        canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
        const t = this.trackers.find(x => x.id === id);
        await sb.from('trackers').update({ history_data: { ...t.history_data, img: null } }).eq('id', id);
    },

    deleteTracker: async (id) => { if (confirm("Delete?")) await sb.from('trackers').delete().eq('id', id); },
    showDashboard: function() { 
        document.getElementById('auth-overlay').classList.add('hidden'); 
        document.getElementById('main-content').classList.remove('hidden'); 
        this.fetchWorkspaces();
        this.fetchTrackers(); 
    },
    showLogin: function() { document.getElementById('auth-overlay').classList.remove('hidden'); document.getElementById('main-content').classList.add('hidden'); },
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden')
};

app.init();