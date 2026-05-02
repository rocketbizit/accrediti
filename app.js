// --- CONFIGURAZIONE GOOGLE SCRIPT ---
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMVy-zjw0yY8BR4LVSqSwSG6EA4GGb_N2SkSQyX9LSgVAkPyvLy7ndshRlm0QrhSoI/exec";

// --- STATO DELL'APPLICAZIONE ---
let database = JSON.parse(localStorage.getItem('event_db')) || [
    { id: "INV001", nome: "Esempio", cognome: "Mario", telefono: "", email: "", azienda: "", presente: false }
];

let html5QrCode;
let searchTimeout;
let isScansioneInPausa = false; 

// --- INIZIALIZZAZIONE ---
window.onload = async () => {
    console.log("🔄 Avvio dell'applicazione...");
    
    // 1. Tenta la lettura da Google Sheets
    await caricaDaGoogleSheet();
    
    // 2. Inizializza UI e Sensori
    aggiornaUI();
    checkConnection();
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    avviaScanner();

    // 3. Sincronizzazione automatica ogni 15 minuti (900.000 ms)
    setInterval(() => {
        console.log("⏱️ Avvio sincronizzazione automatica programmata...");
        sincronizzaConGoogleSheet(true); // passiamo true per farlo silenziosamente
    }, 900000);
};

// --- FUNZIONI DI RETE ---

function checkConnection() {
    const isOnline = navigator.onLine;
    document.getElementById('offlineAlert').classList.toggle('hidden', isOnline);
    console.log("🌐 Stato connessione:", isOnline ? "Online" : "Offline");
}

// Lettura iniziale (GET)
async function caricaDaGoogleSheet() {
    if (!navigator.onLine || GOOGLE_SCRIPT_URL.includes("INSERISCI")) {
        console.warn("⚠️ Caricamento da Google saltato (Offline o URL mancante).");
        return;
    }
    
    console.log("📥 Richiesta dati a Google Sheets...");
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        if (!response.ok) throw new Error("Risposta del server non valida");
        
        const data = await response.json();
        console.log("📄 Dati ricevuti:", data);
        
        if (data && data.length > 0) {
            database = data;
            console.log("✅ Database aggiornato dal Cloud.");
        }
    } catch (error) {
        console.error("❌ Errore nel caricamento Cloud:", error);
        // In caso di errore, il database resta quello caricato dal localStorage all'inizio
    }
}

// Scrittura (POST) - Usata sia per manuale che automatico
async function sincronizzaConGoogleSheet(isAutomatic = false) {
    if (!navigator.onLine || GOOGLE_SCRIPT_URL.includes("INSERISCI")) return;

    if (!isAutomatic) {
        mostraModal("🔄", "Sincronizzazione", "Salvataggio sul foglio Google...", "bg-blue-50");
    }

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Fondamentale per i permessi Google in scrittura
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(database)
        });

        console.log("📤 Dati inviati con successo.");
        if (!isAutomatic) {
            mostraModal("✅", "Sincronizzato", "Dati salvati correttamente!", "bg-green-50");
        }
    } catch (error) {
        console.error("❌ Errore sincronizzazione:", error);
        if (!isAutomatic) {
            mostraModal("❌", "Errore", "Impossibile salvare i dati online.", "bg-red-50");
        }
    }
}

// --- LOGICA SCANNER ---

function avviaScanner() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
        if (isScansioneInPausa) return;
        vibrateDevice();
        processaIngresso(decodedText);
    }).catch(err => {
        console.warn("Fotocamera non disponibile:", err);
    });
}

function processaIngresso(codice) {
    console.log("📷 Codice rilevato:", codice);
    // Controllo flessibile su ID o campo 'codice' se presente
    const utente = database.find(u => u.id == codice || u.codice == codice);
    
    if (!utente) {
        mostraModal("❌", "Non Trovato", "Questo codice non è in lista.", "bg-red-50");
        return;
    }

    if (utente.presente) {
        mostraModal("⚠️", "Già Entrato", `${utente.nome} ${utente.cognome} è già dentro.`, "bg-orange-50");
    } else {
        utente.presente = true;
        aggiornaUI();
        mostraModal("✅", "Benvenuto", `${utente.nome} ${utente.cognome}`, "bg-green-50");
        
        // Timeout di 5 secondi per evitare doppie letture accidentali
        isScansioneInPausa = true;
        setTimeout(() => { isScansioneInPausa = false; }, 5000);
    }
}

// --- GESTIONE DATI E UI ---

function aggiornaUI() {
    const pres = database.filter(i => i.presente).length;
    document.getElementById('statPresenti').innerText = pres;
    document.getElementById('statMancanti').innerText = database.length - pres;
    
    // Salva sempre una copia locale di sicurezza
    localStorage.setItem('event_db', JSON.stringify(database));
}

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
                <div class="text-left">
                    <p class="font-bold text-slate-800">${u.nome} ${u.cognome}</p>
                    <p class="text-xs text-slate-400">${u.azienda || 'Privato'}</p>
                </div>
                ${!u.presente ? `<button onclick="processaIngresso('${u.id}')" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md">Accredita</button>` : '<i class="fa-solid fa-circle-check text-green-500 text-xl mr-2"></i>'}
            `;
            res.appendChild(div);
        });
}

function aggiungiOspite(e) {
    e.preventDefault();
    const nuovo = {
        id: "W-" + Date.now(),
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
    
    mostraModal("➕", "Registrato", `${nuovo.nome} aggiunto e accreditato.`, "bg-blue-50");
}

// --- UTILITY ---

function mostraModal(icon, title, text, bgColor) {
    document.getElementById('modalIcon').innerText = icon;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalText').innerText = text;
    document.getElementById('modalContent').className = `bg-white w-full max-w-sm rounded-3xl p-8 text-center relative z-10 ${bgColor} shadow-2xl`;
    document.getElementById('modal').classList.remove('hidden');
}

function chiudiModal() {
    document.getElementById('modal').classList.add('hidden');
}

function esportaCSV() {
    let csv = "ID,Nome,Cognome,Telefono,Email,Azienda,Presente\n";
    database.forEach(u => {
        csv += `${u.id},"${u.nome}","${u.cognome}","${u.telefono}","${u.email}","${u.azienda}",${u.presente ? 'SI' : 'NO'}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `check-in-report.csv`);
    link.click();
}

function vibrateDevice() {
    if ("vibrate" in navigator) navigator.vibrate(100);
}
