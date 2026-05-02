// --- CONFIGURAZIONE GOOGLE SCRIPT ---
// Inserisci qui l'URL della Web App di Google Apps Script che hai creato
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxYC0C3eSpjpsdrRZJ6N5caWEZWjqWXFO4-e-PelrNkiuNh-fQMqRIi-z5vu8S33sse/exec";

// --- STATO DELL'APPLICAZIONE ---
let database = JSON.parse(localStorage.getItem('event_db')) || [
    { id: "INV001", nome: "Mario", cognome: "Rossi", telefono: "3331234567", email: "mario@rossi.it", azienda: "Tech Corp", presente: false },
    { id: "INV002", nome: "Giulia", cognome: "Verdi", telefono: "3339876543", email: "giulia@verdi.it", azienda: "Digital Agency", presente: false }
];

let html5QrCode;
let searchTimeout;

// --- INIZIALIZZAZIONE ---
window.onload = () => {
    aggiornaUI();
    checkConnection();
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    avviaScanner();
};

function checkConnection() {
    document.getElementById('offlineAlert').classList.toggle('hidden', navigator.onLine);
}

function aggiornaUI() {
    const pres = database.filter(i => i.presente).length;
    document.getElementById('statPresenti').innerText = pres;
    document.getElementById('statMancanti').innerText = database.length - pres;
    localStorage.setItem('event_db', JSON.stringify(database));
}

// --- LOGICA SCANNER ---
function avviaScanner() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
        vibrateDevice();
        processaIngresso(decodedText);
    }).catch(err => {
        console.log("Fotocamera già attiva o permessi negati: ", err);
    });
}

function processaIngresso(codice) {
    const utente = database.find(u => u.id === codice || u.codice === codice);
    
    if (!utente) {
        mostraModal("❌", "Errore", "Codice non trovato nel database.", "bg-red-50");
        return;
    }

    if (utente.presente) {
        mostraModal("⚠️", "Già Entrato", `${utente.nome} ${utente.cognome} ha già effettuato l'accesso.`, "bg-orange-50");
    } else {
        utente.presente = true;
        aggiornaUI();
        mostraModal("✅", "Benvenuto", `${utente.nome} ${utente.cognome}`, "bg-green-50");
    }
}

// --- RICERCA MANUALE ---
function cercaDebounced() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(eseguiRicerca, 300);
}

function eseguiRicerca() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const res = document.getElementById('risultatiRicerca');
    res.innerHTML = "";

    if (q.length < 2) return;

    database.filter(u => (u.nome + " " + u.cognome).toLowerCase().includes(q))
        .forEach(u => {
            const div = document.createElement('div');
            div.className = `p-4 rounded-2xl flex justify-between items-center ${u.presente ? 'bg-slate-100 opacity-60' : 'bg-white shadow-sm border border-slate-200'}`;
            div.innerHTML = `
                <div>
                    <p class="font-bold">${u.nome} ${u.cognome}</p>
                    <p class="text-xs text-slate-400">${u.email || ''} - ${u.telefono || ''}</p>
                </div>
                ${!u.presente ? `<button onclick="processaIngresso('${u.id}')" class="bg-indigo-100 text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold">Accredita</button>` : '<i class="fa-solid fa-check text-green-500 mr-3"></i>'}
            `;
            res.appendChild(div);
        });
}

// --- AGGIUNGI OSPITE LAST-MINUTE ---
function aggiungiOspite(e) {
    e.preventDefault();
    const nuovo = {
        id: "WALKIN-" + Date.now(),
        nome: document.getElementById('fn').value,
        cognome: document.getElementById('ln').value,
        telefono: document.getElementById('tel').value,
        email: document.getElementById('em').value,
        azienda: document.getElementById('az').value,
        presente: true
    };
    
    database.push(nuovo);
    aggiornaUI();
    e.target.reset();
    
    mostraModal("➕", "Registrato", `${nuovo.nome} è stato aggiunto e accreditato.`, "bg-blue-50");
}

// --- MODAL FEEDBACK ---
function mostraModal(icon, title, text, bgColor) {
    document.getElementById('modalIcon').innerText = icon;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalText').innerText = text;
    document.getElementById('modalContent').className = `bg-white w-full max-w-sm rounded-3xl p-8 text-center relative z-10 ${bgColor}`;
    document.getElementById('modal').classList.remove('hidden');
}

function chiudiModal() {
    document.getElementById('modal').classList.add('hidden');
}

// --- EXPORT E SINCRONIZZAZIONE ---
function esportaCSV() {
    let csv = "ID,Nome,Cognome,Telefono,Email,Azienda,Presente\n";
    database.forEach(u => {
        csv += `${u.id},${u.nome},${u.cognome},${u.telefono},${u.email},${u.azienda},${u.presente ? 'SI' : 'NO'}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `report-evento-${new Date().toLocaleDateString()}.csv`);
    a.click();
}

function vibrateDevice() {
    if ("vibrate" in navigator) navigator.vibrate(100);
}

// Funzione di comunicazione con Google Sheets
async function sincronizzaConGoogleSheet() {
    if (!navigator.onLine) {
        alert("Sei offline! Non è possibile sincronizzare con il cloud.");
        return;
    }
    
    if (GOOGLE_SCRIPT_URL === "INSERISCI_QUI_IL_TUO_URL_DI_GOOGLE_APPS_SCRIPT") {
        alert("Inserisci l'URL del tuo Google Apps Script nel file app.js");
        return;
    }

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Modalità necessaria per superare i blocchi CORS del browser
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(database)
        });
        alert("Dati sincronizzati con successo!");
    } catch (error) {
        console.error("Errore di sincronizzazione: ", error);
        alert("Si è verificato un errore durante la sincronizzazione dei dati.");
    }
}
