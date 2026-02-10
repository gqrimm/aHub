const app = {
    // 1. CONFIGURATION
    // Note: On a static GitHub site, these are visible in source code.
    creds: {
        user: "player1",
        pass: "start123",
        adminPass: "super-admin-99"
    },

    // 2. DATA STORE
    // Pulls from LocalStorage or starts empty
    trackers: JSON.parse(localStorage.getItem('user_modules')) || [],

    // 3. AUTHENTICATION
    login: function() {
        const u = document.getElementById('user').value;
        const p = document.getElementById('pass').value;

        if (u === this.creds.user && p === this.creds.pass) {
            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            this.render();
        } else {
            alert("Invalid Credentials. Access Denied.");
        }
    },

    showAdmin: function() {
        const p = prompt("Admin Password Required:");
        if (p === this.creds.adminPass) {
            const confirmWipe = confirm("ADMIN PANEL: Would you like to clear ALL saved tracker data?");
            if (confirmWipe) {
                localStorage.removeItem('user_modules');
                this.trackers = [];
                this.render();
            }
        } else {
            alert("Unauthorized.");
        }
    },

    // 4. MODAL LOGIC
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden'),

    // 5. TRACKER LOGIC
    createTracker: function() {
        const name = document.getElementById('track-name').value;
        const type = document.getElementById('track-type').value;

        if (!name) return alert("Please enter a name.");

        const newTracker = {
            id: 'trk_' + Date.now(),
            name: name,
            type: type,
            data: {} // Keyed by YYYY-MM-DD
        };

        this.trackers.push(newTracker);
        this.saveAndRefresh();
        this.closeModal();
        document.getElementById('track-name').value = '';
    },

    logEntry: function(trackerId, dateKey) {
        const tracker = this.trackers.find(t => t.id === trackerId);
        
        if (tracker.type === 'bool') {
            tracker.data[dateKey] = !tracker.data[dateKey];
        } else {
            const currentVal = tracker.data[dateKey] || 0;
            const newVal = prompt(`Enter value for ${tracker.name} (${tracker.type}):`, currentVal);
            if (newVal !== null) {
                tracker.data[dateKey] = newVal;
            }
        }
        this.saveAndRefresh();
    },

    deleteTracker: function(id) {
        if (confirm("Delete this module forever?")) {
            this.trackers = this.trackers.filter(t => t.id !== id);
            this.saveAndRefresh();
        }
    },

    saveAndRefresh: function() {
        localStorage.setItem('user_modules', JSON.stringify(this.trackers));
        this.render();
    },

    // 6. CORE RENDERER
    render: function() {
        const container = document.getElementById('module-container');
        
        // Remove all dynamic modules (keeping the first one, which is the Trade Checker)
        const modules = container.querySelectorAll('.module');
        for (let i = 1; i < modules.length; i++) {
            modules[i].remove();
        }

        this.trackers.forEach(tracker => {
            const card = document.createElement('div');
            card.className = 'module';
            
            // Generate 14-day calendar view
            let calendarHtml = '';
            for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateKey = d.toISOString().split('T')[0];
                const dayNum = d.getDate();
                
                const value = tracker.data[dateKey];
                const isActive = value ? 'day-active' : '';
                const displayVal = value ? (tracker.type === 'bool' ? '✓' : value) : dayNum;

                calendarHtml += `
                    <div class="day-box ${isActive}" onclick="app.logEntry('${tracker.id}', '${dateKey}')">
                        <span>${displayVal}</span>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="module-header">
                    <h3>${tracker.name}</h3>
                    <button class="delete-btn" onclick="app.deleteTracker('${tracker.id}')" style="border:none; background:none; cursor:pointer; font-size:1.2rem;">×</button>
                </div>
                <div class="calendar-grid">
                    ${calendarHtml}
                </div>
                <p style="font-size: 0.8rem; color: #666; margin-top: 15px;">Unit: ${tracker.type} (Click a day to log)</p>
            `;
            container.appendChild(card);
        });
    }
};
