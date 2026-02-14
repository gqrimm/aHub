const SUPABASE_URL = 'https://ynnqidfodgravvhxhbuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ziIy4oGXycJNYeZRKyqNKg_GwnJrz6f';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],
    currentWorkspace: new URLSearchParams(window.location.search).get('space') || localStorage.getItem('active_workspace') || null,
    selectedDate: new Date().toISOString().split('T')[0],

    init: async function() {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            this.user = session.user;
            this.showDashboard();
        }

        sb.auth.onAuthStateChange(async (event, session) => {
            if (event === "PASSWORD_RECOVERY") {
                const newPassword = prompt("Enter your new password:");
                if (newPassword) {
                    const { error } = await sb.auth.updateUser({ password: newPassword });
                    if (error) alert("Error: " + error.message);
                    else alert("Password updated! You can now log in.");
                }
            }
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

    // --- AUTH FUNCTIONS ---
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
        if (error) alert(error.message); else alert("Check email for verification!");
    },

    forgotPassword: async function() {
        const email = document.getElementById('user').value;
        if (!email) { alert("Please type your email address first."); return; }
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname,
        });
        if (error) alert("Error: " + error.message);
        else alert("Reset link sent!");
    },

    logout: async function() { await sb.auth.signOut(); localStorage.clear(); location.reload(); },

    // --- CORE LOGIC ---
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

    // --- VIEW RENDERING ---
    render: function() {
        const container = document.getElementById('module-container');
        if (!container) return;
        container.innerHTML = '';
        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = `module sticky-note type-${t.type}`;
            
            // Shared Header with Pin and Close
            let content = `
                <div class="pin"></div>
                <div class="card-header">
                    <strong>${t.name}</strong>
                    <button class="close-btn" onclick="app.deleteTracker(${t.id})">×</button>
                </div>
                <div class="card-body">
            `;

            if (t.type === 'bool' || t.type === 'text') content += this.getCalendarHTML(t);
            else if (t.type === 'pure-text') content += this.getNoteHTML(t);
            else if (t.type === 'drawing') content += this.getDrawingHTML(t);

            content += `</div>`; // Close card-body
            card.innerHTML = content;
            container.appendChild(card);
            if (t.type === 'drawing') this.initCanvas(t);
        });
    },

    getCalendarHTML: function(t) {
        let cal = '<div class="calendar-grid">';
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const k = d.toISOString().split('T')[0];
            cal += `<div class="day-box ${t.history_data[k] ? 'day-active' : ''}" onclick="app.selectedDate='${k}'; app.render()">${d.getDate()}</div>`;
        }
        cal += '</div>';
        const val = t.history_data[this.selectedDate] || "";
        const action = t.type === 'bool' ? 
            `<button class="neal-btn ${val ? 'primary' : ''}" onclick="app.logValue(${t.id},'${this.selectedDate}',true)">${val ? '✓' : 'DONE'}</button>` :
            `<input type="text" class="neal-input" placeholder="Type here..." value="${val}" onchange="app.logValue(${t.id},'${this.selectedDate}',this.value)">`;
        
        return `<small>${this.selectedDate}</small>${cal}${action}`;
    },

    getNoteHTML: (t) => `<textarea class="note-area" onchange="app.logValue(${t.id},'note',this.value)" placeholder="Write your note here...">${t.history_data.note || ''}</textarea>`,

    getDrawingHTML: (t) => `<canvas id="canvas-${t.id}" class="draw-canvas" width="350" height="180"></canvas>
                            <button class="neal-btn small" onclick="app.clearCanvas(${t.id})" style="margin-top:5px; font-size:10px;">Clear</button>`,

    initCanvas: function(t) {
        const canvas = document.getElementById(`canvas-${t.id}`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (t.history_data.img) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = t.history_data.img; }
        let drawing = false;
        canvas.onmousedown = (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
        canvas.onmousemove = (e) => { if (drawing) { ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); } };
        canvas.onmouseup = async () => { drawing = false; await sb.from('trackers').update({ history_data: { img: canvas.toDataURL() } }).eq('id', t.id); };
    },

    clearCanvas: async function(id) {
        const canvas = document.getElementById(`canvas-${id}`);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await sb.from('trackers').update({ history_data: { img: null } }).eq('id', id);
    },

    deleteTracker: async (id) => { if (confirm("Delete this sticky?")) await sb.from('trackers').delete().eq('id', id); },
    showDashboard: function() { document.getElementById('auth-overlay').classList.add('hidden'); document.getElementById('main-content').classList.remove('hidden'); this.fetchTrackers(); },
    showLogin: function() { document.getElementById('auth-overlay').classList.remove('hidden'); document.getElementById('main-content').classList.add('hidden'); },
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden'),
    copyInviteLink: function() { navigator.clipboard.writeText(location.origin + location.pathname + '?space=' + this.currentWorkspace); alert("Copied!"); }
};

app.init();
