const SUPABASE_URL = 'https://ynnqidfodgravvhxhbuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ziIy4oGXycJNYeZRKyqNKg_GwnJrz6f';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],
    // Workspace is stored in LocalStorage so it remembers which room you're in
    currentWorkspace: localStorage.getItem('active_workspace') || null,

    init: async function() {
        // 1. Listen for Auth changes (This handles "remember me" automatically)
        sb.auth.onAuthStateChange((event, session) => {
            if (session) {
                this.user = session.user;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        });
    },

    // --- AUTH ACTIONS ---
    register: async function() {
        const email = document.getElementById('user').value;
        const password = document.getElementById('pass').value;
        const { error } = await sb.auth.signUp({ email, password });
        if (error) alert(error.message);
        else alert("Check your email for a confirmation link!");
    },

    login: async function() {
        const email = document.getElementById('user').value;
        const password = document.getElementById('pass').value;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) alert("Login error: " + error.message);
    },

    logout: async function() {
        await sb.auth.signOut();
        localStorage.removeItem('active_workspace');
        location.reload();
    },

    // --- WORKSPACE ACTIONS ---
    joinWorkspace: function() {
        const id = document.getElementById('join-work-id').value.trim();
        if (id === "") {
            this.currentWorkspace = null;
            localStorage.removeItem('active_workspace');
            alert("Switched to Private Space");
        } else {
            this.currentWorkspace = id;
            localStorage.setItem('active_workspace', id);
            alert("Joined Workspace: " + id);
        }
        this.fetchTrackers();
    },

    // --- DATA ACTIONS ---
    fetchTrackers: async function() {
        let query = sb.from('trackers').select('*');

        // WORKSPACE LOGIC:
        // If in workspace: show items where workspace_id matches
        // If private: show items where user_id matches AND workspace_id is null
        if (this.currentWorkspace) {
            query = query.eq('workspace_id', this.currentWorkspace);
        } else {
            query = query.eq('user_id', this.user.id).is('workspace_id', null);
        }

        const { data, error } = await query.order('created_at', { ascending: true });
        
        if (error) console.error(error);
        else {
            this.trackers = data;
            this.render();
        }
    },

    createTracker: async function() {
        const name = document.getElementById('track-name').value;
        const type = document.getElementById('track-type').value;
        if (!name) return;

        const { error } = await sb.from('trackers').insert([{
            name: name,
            type: type,
            user_id: this.user.id,
            workspace_id: this.currentWorkspace, // Will be null if in private mode
            history_data: {}
        }]);

        if (error) alert(error.message);
        else {
            this.closeModal();
            this.fetchTrackers();
        }
    },

    logEntry: async function(trackerId, dateKey) {
        const tracker = this.trackers.find(t => t.id === trackerId);
        let history = { ...tracker.history_data };

        if (tracker.type === 'bool') {
            history[dateKey] = !history[dateKey];
        } else {
            const val = prompt(`Value for ${tracker.name}:`, history[dateKey] || "");
            if (val === null) return;
            history[dateKey] = val;
        }

        await sb.from('trackers').update({ history_data: history }).eq('id', trackerId);
        this.fetchTrackers();
    },

    // --- UI CONTROLS ---
    showDashboard: function() {
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        // Update Workspace Input UI to show current room
        document.getElementById('join-work-id').value = this.currentWorkspace || "";
        this.fetchTrackers();
    },

    showLogin: function() {
        document.getElementById('auth-overlay').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
    },

    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden'),

    render: function() {
        const container = document.getElementById('module-container');
        // Keep the AMVGG portal, remove everything else
        const staticMod = container.firstElementChild.outerHTML;
        container.innerHTML = staticMod;

        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = 'module';
            
            let calHtml = '';
            for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                const val = t.history_data[k];
                const active = val ? 'day-active' : '';
                const label = val ? (t.type === 'bool' ? '✓' : val) : d.getDate();
                calHtml += `<div class="day-box ${active}" onclick="app.logEntry(${t.id}, '${k}')">${label}</div>`;
            }

            card.innerHTML = `
                <div class="module-header">
                    <h3>${t.name} ${t.workspace_id ? '👥' : '🔒'}</h3>
                    <button class="neal-btn" style="background:red; padding:2px 8px" onclick="app.deleteTracker(${t.id})">×</button>
                </div>
                <div class="calendar-grid">${calHtml}</div>
            `;
            container.appendChild(card);
        });
    },

    deleteTracker: async function(id) {
        if (confirm("Delete this?")) {
            await sb.from('trackers').delete().eq('id', id);
            this.fetchTrackers();
        }
    }
};

// Fire it up
app.init();
