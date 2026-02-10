const SUPABASE_URL = 'https://ynnqidfodgravvhxhbuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ziIy4oGXycJNYeZRKyqNKg_GwnJrz6f';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],
    currentWorkspace: new URLSearchParams(window.location.search).get('space') || localStorage.getItem('active_workspace') || null,

    init: async function() {
        if (this.currentWorkspace) localStorage.setItem('active_workspace', this.currentWorkspace);
        
        // Auth State Listener
        sb.auth.onAuthStateChange((event, session) => {
            if (session) {
                this.user = session.user;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        });

        // Realtime Subscription
        sb.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, () => {
            this.fetchTrackers();
        }).subscribe();
    },

    // --- AUTH ---
    login: async () => {
        const email = document.getElementById('user').value;
        const pass = document.getElementById('pass').value;
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) alert(error.message);
    },

    register: async () => {
        const email = document.getElementById('user').value;
        const pass = document.getElementById('pass').value;
        const { error } = await sb.auth.signUp({ email, password: pass });
        if (error) alert(error.message);
        else alert("Check your email!");
    },

    logout: async () => {
        await sb.auth.signOut();
        localStorage.removeItem('active_workspace');
        window.location.search = ""; // Clear URL params
    },

    // --- WORKSPACE ---
    createNewWorkspace: function() {
        const id = Math.random().toString(36).substring(2, 8);
        if(confirm("Create new space: " + id + "?")) {
            this.currentWorkspace = id;
            localStorage.setItem('active_workspace', id);
            this.fetchTrackers();
        }
    },

    joinWorkspace: function() {
        const id = document.getElementById('join-work-id').value.trim();
        this.currentWorkspace = id || null;
        if(id) localStorage.setItem('active_workspace', id);
        else localStorage.removeItem('active_workspace');
        this.fetchTrackers();
    },

    copyInviteLink: function() {
        if(!this.currentWorkspace) return alert("Enter a workspace first!");
        const link = `${window.location.origin}${window.location.pathname}?space=${this.currentWorkspace}`;
        navigator.clipboard.writeText(link);
        alert("Invite link copied!");
    },

    // --- TRACKERS ---
    fetchTrackers: async function() {
        let query = sb.from('trackers').select('*');
        if (this.currentWorkspace) query = query.eq('workspace_id', this.currentWorkspace);
        else query = query.eq('user_id', this.user.id).is('workspace_id', null);

        const { data, error } = await query.order('created_at', { ascending: true });
        if (!error) { this.trackers = data; this.render(); }
    },

    createTracker: async function() {
        const name = document.getElementById('track-name').value;
        const type = document.getElementById('track-type').value;
        await sb.from('trackers').insert([{
            name, type, user_id: this.user.id,
            workspace_id: this.currentWorkspace, history_data: {}
        }]);
        this.closeModal();
    },

    deleteTracker: async function(id) {
        if(!confirm("Are you sure?")) return;
        const { error } = await sb.from('trackers').delete().eq('id', id);
        if (error) alert("Delete failed: " + error.message);
        // Realtime will trigger the UI refresh
    },

    logEntry: async function(trackerId, dateKey) {
        const t = this.trackers.find(x => x.id === trackerId);
        let history = { ...t.history_data };
        if (t.type === 'bool') history[dateKey] = !history[dateKey];
        else {
            const val = prompt("Entry:", history[dateKey] || "");
            if (val === null) return;
            history[dateKey] = val;
        }
        await sb.from('trackers').update({ history_data: history }).eq('id', trackerId);
    },

    // --- UI HELPERS ---
    render: function() {
        const container = document.getElementById('module-container');
        const staticMod = container.querySelector('.portal').outerHTML;
        container.innerHTML = staticMod;

        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = 'module';
            let calHtml = '';
            for (let i = 13; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                const active = t.history_data[k] ? 'day-active' : '';
                calHtml += `<div class="day-box ${active}" onclick="app.logEntry(${t.id}, '${k}')">${d.getDate()}</div>`;
            }
            card.innerHTML = `
                <div class="module-header">
                    <h3>${t.name}</h3>
                    <button class="neal-btn danger" style="padding:2px 8px" onclick="app.deleteTracker(${t.id})">×</button>
                </div>
                <div class="calendar-grid">${calHtml}</div>
            `;
            container.appendChild(card);
        });
    },

    showDashboard: () => {
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
    },

    showLogin: () => {
        document.getElementById('auth-overlay').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
    },

    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden')
};

app.init();
