const SUPABASE_URL = 'https://ynnqidfodgravvhxhbuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ziIy4oGXycJNYeZRKyqNKg_GwnJrz6f';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],
    myWorkspaces: [],
    currentWorkspace: new URLSearchParams(window.location.search).get('space') || localStorage.getItem('active_workspace') || null,
    selectedDate: new Date().toISOString().split('T')[0],

    init: async function() {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            this.user = session.user;
            this.showDashboard();
        }

        sb.auth.onAuthStateChange((event, session) => {
            if (session) {
                this.user = session.user;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        });

        sb.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, () => this.fetchTrackers()).subscribe();
    },

    login: async () => {
        const { error } = await sb.auth.signInWithPassword({ email: document.getElementById('user').value, password: document.getElementById('pass').value });
        if (error) alert(error.message);
    },

    register: async () => {
        const { error } = await sb.auth.signUp({ email: document.getElementById('user').value, password: document.getElementById('pass').value });
        if (error) alert(error.message); else alert("Check email for verification!");
    },

    logout: async () => { await sb.auth.signOut(); localStorage.clear(); location.reload(); },

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
        await sb.from('trackers').insert([{ name, type, user_id: this.user.id, workspace_id: this.currentWorkspace, history_data: {} }]);
        this.closeModal();
    },

    logValue: async function(id, key, val) {
        const t = this.trackers.find(x => x.id === id);
        let history = { ...t.history_data };
        t.type === 'bool' ? history[key] = !history[key] : history[key] = val;
        await sb.from('trackers').update({ history_data: history }).eq('id', id);
    },

    render: function() {
        const container = document.getElementById('module-container');
        container.innerHTML = '';
        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = `module type-${t.type}`;
            if (t.type === 'bool' || t.type === 'text') card.innerHTML = this.getCalendarHTML(t);
            else if (t.type === 'pure-text') card.innerHTML = this.getNoteHTML(t);
            else if (t.type === 'drawing') card.innerHTML = this.getDrawingHTML(t);
            container.appendChild(card);
            if (t.type === 'drawing') this.initCanvas(t);
        });
    },

    getCalendarHTML: function(t) {
        let cal = '';
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const k = d.toISOString().split('T')[0];
            cal += `<div class="day-box ${t.history_data[k] ? 'day-active' : ''}" onclick="app.selectedDate='${k}'; app.render()">${d.getDate()}</div>`;
        }
        const val = t.history_data[this.selectedDate] || "";
        return `<div class="card-left"><strong>${t.name}</strong><div class="calendar-grid">${cal}</div></div>
                <div class="card-right"><small>${this.selectedDate}</small>
                ${t.type === 'bool' ? `<button class="neal-btn ${val ? 'primary' : ''}" onclick="app.logValue(${t.id},'${this.selectedDate}',true)">${val ? '✓' : 'DONE'}</button>` : 
                `<input type="text" class="neal-input" value="${val}" onchange="app.logValue(${t.id},'${this.selectedDate}',this.value)">`}
                <button onclick="app.deleteTracker(${t.id})" class="danger-text">Delete</button></div>`;
    },

    getNoteHTML: (t) => `<div class="card-full"><div class="card-header"><strong>${t.name}</strong><button onclick="app.deleteTracker(${t.id})">×</button></div>
                         <textarea class="note-area" onchange="app.logValue(${t.id},'note',this.value)">${t.history_data.note || ''}</textarea></div>`,

    getDrawingHTML: (t) => `<div class="card-full"><div class="card-header"><strong>${t.name}</strong><button onclick="app.deleteTracker(${t.id})">×</button></div>
                            <canvas id="canvas-${t.id}" class="draw-canvas" width="380" height="200"></canvas></div>`,

    initCanvas: function(t) {
        const canvas = document.getElementById(`canvas-${t.id}`);
        const ctx = canvas.getContext('2d');
        if (t.history_data.img) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = t.history_data.img; }
        let drawing = false;
        canvas.onmousedown = (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
        canvas.onmousemove = (e) => { if (drawing) { ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); } };
        canvas.onmouseup = async () => { drawing = false; await sb.from('trackers').update({ history_data: { img: canvas.toDataURL() } }).eq('id', t.id); };
    },

    deleteTracker: async (id) => { if (confirm("Delete?")) await sb.from('trackers').delete().eq('id', id); },
    showDashboard: function() { document.getElementById('auth-overlay').classList.add('hidden'); document.getElementById('main-content').classList.remove('hidden'); this.fetchTrackers(); },
    showLogin: function() { document.getElementById('auth-overlay').classList.remove('hidden'); document.getElementById('main-content').classList.add('hidden'); },
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden'),
    copyInviteLink: function() { navigator.clipboard.writeText(location.origin + location.pathname + '?space=' + this.currentWorkspace); alert("Copied!"); }
};
app.init();
