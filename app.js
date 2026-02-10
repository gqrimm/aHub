const SUPABASE_URL = 'https://ynnqidfodgravvhxhbuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ziIy4oGXycJNYeZRKyqNKg_GwnJrz6f';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],
    // Priority: 1. URL (?space=id)  2. LocalStorage  3. Null
    currentWorkspace: new URLSearchParams(window.location.search).get('space') || 
                      localStorage.getItem('active_workspace') || null,

    init: async function() {
        // Save workspace to storage if it came from the URL
        if (new URLSearchParams(window.location.search).get('space')) {
            localStorage.setItem('active_workspace', this.currentWorkspace);
        }

        // Handle Session Persistence
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            this.user = session.user;
            this.showDashboard();
        }

        // Listen for Auth Changes (Login/Logout)
        sb.auth.onAuthStateChange((event, session) => {
            if (session) {
                this.user = session.user;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        });

        // LIVE UPDATE: Refresh UI when anyone in the workspace makes a change
        sb.channel('db-changes')
          .on('postgres_changes', 
              { event: '*', schema: 'public', table: 'trackers' }, 
              () => this.fetchTrackers())
          .subscribe();
    },

    // --- AUTH ---
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
        if (error) alert(error.message);
        else alert("Signup successful! Please check your email to confirm.");
    },

    // --- WORKSPACE ---
    copyInviteLink: function() {
        if (!this.currentWorkspace) return alert("Join a workspace first!");
        const url = `${window.location.origin}${window.location.pathname}?space=${this.currentWorkspace}`;
        navigator.clipboard.writeText(url);
        alert("Invite link copied to clipboard!");
    },

    joinWorkspace: function() {
        const id = document.getElementById('join-work-id').value.trim();
        this.currentWorkspace = id || null;
        if (id) localStorage.setItem('active_workspace', id);
        else localStorage.removeItem('active_workspace');
        this.fetchTrackers();
    },

    // --- TRACKERS ---
    fetchTrackers: async function() {
        let query = sb.from('trackers').select('*');
        if (this.currentWorkspace) {
            query = query.eq('workspace_id', this.currentWorkspace);
        } else {
            query = query.eq('user_id', this.user.id).is('workspace_id', null);
        }

        const { data, error } = await query.order('created_at', { ascending: true });
        if (!error) {
            this.trackers = data;
            this.render();
        }
    },

    createTracker: async function() {
        const name = document.getElementById('track-name').value;
        const type = document.getElementById('track-type').value;
        await sb.from('trackers').insert([{
            name, type, user_id: this.user.id, 
            workspace_id: this.currentWorkspace, history_data: {}
        }]);
        this.closeModal();
        this.fetchTrackers();
    },

    logEntry: async function(trackerId, dateKey) {
        const tracker = this.trackers.find(t => t.id === trackerId);
        let history = { ...tracker.history_data };

        if (tracker.type === 'bool') history[dateKey] = !history[dateKey];
        else {
            const val = prompt(`Value:`, history[dateKey] || "");
            if (val === null) return;
            history[dateKey] = val;
        }

        await sb.from('trackers').update({ history_data: history }).eq('id', trackerId);
        // fetchTrackers is called automatically by the Realtime listener!
    },

    // --- UI ---
    showDashboard: function() {
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('join-work-id').value = this.currentWorkspace || "";
        this.fetchTrackers();
    },

    showLogin: () => document.getElementById('auth-overlay').classList.remove('hidden'),
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden'),

    render: function() {
        const container = document.getElementById('module-container');
        const staticMod = container.firstElementChild.outerHTML;
        container.innerHTML = staticMod;

        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = 'module';
            let calHtml = '';
            for (let i = 13; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                const val = t.history_data[k];
                calHtml += `<div class="day-box ${val ? 'day-active' : ''}" 
                             onclick="app.logEntry(${t.id}, '${k}')">
                             ${val ? (t.type === 'bool' ? '✓' : val) : d.getDate()}
                             </div>`;
            }
            card.innerHTML = `<div class="module-header"><h3>${t.name}</h3></div><div class="calendar-grid">${calHtml}</div>`;
            container.appendChild(card);
        });
    }
};
app.init();
