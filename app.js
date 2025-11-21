// Router y navegación simple para el prototipo
(function() {
  function showScreen(id) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach((el) => {
      el.classList.remove('active');
      el.setAttribute('aria-hidden', 'true');
    });
    const target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
      target.removeAttribute('aria-hidden');
      if (location.hash !== '#' + id) {
        history.pushState(null, '', '#' + id);
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      const id = go.getAttribute('data-go');
      if (id) {
        e.preventDefault();
        showScreen(id);
      }
    }
  });

  window.addEventListener('popstate', () => {
    const id = (location.hash || '#home_screen').slice(1);
    showScreen(id);
  });

  const initial = (location.hash || '#home_screen').slice(1);
  showScreen(initial);

  // Exponer para debugging si se necesita
  window.showScreen = showScreen;
})();

// Estado y lógica del flujo de reporte por voz
// Utilidad global para feedback accesible
window.setVoiceFeedback = function(screenId, msg) {
  const map = {
    voice_report_screen: 'voice_feedback_location',
    voice_report_map_location_voice_screen: 'voice_feedback_map',
    voice_report_size_screen: 'voice_feedback_size',
    voice_report_review_voice_screen: 'voice_feedback_review'
  };
  const id = map[screenId];
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
};

(function() {
  const STORAGE_KEY = 'voiceReportState';
  let recognition; // movido arriba para uso global
  let state = {
    locationDescription: '',
    locationUsed: null, // true | false | null
    size: '',
    notes: ''
  };
  let voiceReportSessionActive = false;
  let lastVoiceScreen = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { ...state, ...parsed };
      }
    } catch(e) {
      console.warn('No se pudo cargar estado de voz', e);
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
  }

  function resetVoiceState() {
    state.locationDescription = '';
    state.locationUsed = null;
    state.size = '';
    state.notes = '';
    saveState();
    const p = document.getElementById('voice_location_transcription');
    if (p) p.textContent = '(Escuchando…)';
  }

  // Persistir reporte de voz como histórico en lista común
  const MANUAL_KEY = 'manualReports';
  function getManualReports(){ try { return JSON.parse(localStorage.getItem(MANUAL_KEY))||[]; } catch(_) { return []; } }
  function setManualReports(list){ try { localStorage.setItem(MANUAL_KEY, JSON.stringify(list)); } catch(_) {} }
  function mapVoiceLocation(raw){
    if(raw.locationUsed === true) return 'GPS';
    if(raw.locationUsed === false) return 'Omitida';
    return 'No indicada';
  }
  function saveVoiceReport(){
    try {
      const rawState = JSON.parse(localStorage.getItem(STORAGE_KEY))||{};
      if(!rawState.locationDescription && !rawState.size && rawState.locationUsed == null) return; // nada que guardar
      const list = getManualReports();
      // Evitar duplicado inmediato por mismo contenido si último es voz con misma descripción
      const last = list[list.length-1];
      if(last && last.source==='voz' && last.description===rawState.locationDescription) return;
      list.push({
        id: Date.now(),
        source: 'voz',
        location: mapVoiceLocation(rawState),
        size: rawState.size || '',
        description: rawState.locationDescription || '',
        date: new Date().toLocaleDateString('es-ES')
      });
      setManualReports(list);
    } catch(_) {}
  }

  loadState();

  // Actualiza UI de selección de tamaño
  function updateSizeUI() {
    document.querySelectorAll('.voice-size-option').forEach(btn => {
      const selected = btn.getAttribute('data-size') === state.size;
      btn.classList.toggle('ring-2', selected);
      btn.classList.toggle('ring-primary', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  // Actualiza pantalla de revisión
  function updateReview() {
    const locEl = document.getElementById('review_location_text');
    const sizeEl = document.getElementById('review_size_text');
    const notesEl = document.getElementById('review_notes_text');
    if (locEl) {
      let locDisplay = '';
      if (state.locationUsed === true) {
        // Placeholder cuando se usa ubicación (no mostrar la descripción original aquí)
        locDisplay = 'Ubicación actual (GPS)';
      } else if (state.locationUsed === false) {
        // Si se omitió, dejar vacío
        locDisplay = '';
      } else {
        // No indicado aún
        locDisplay = 'Ubicación no especificada';
      }
      locEl.textContent = locDisplay;
    }
    if (sizeEl) {
      sizeEl.textContent = state.size ? state.size : '—';
    }
    if (notesEl) {
      // Notas = descripción dictada (state.locationDescription)
      notesEl.textContent = state.locationDescription || '';
    }
  }

  // Integración básica con reconocimiento de voz (si existe) para la primera pantalla
  function startVoiceCapture(auto = false) {
    const p = document.getElementById('voice_location_transcription');
    if (!p) return;
    if (state.locationDescription && recognition) {
      p.textContent = state.locationDescription;
    }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      window.setVoiceFeedback('voice_report_screen', 'Se requiere HTTPS o localhost para el micrófono.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.setVoiceFeedback('voice_report_screen', 'API getUserMedia no disponible.');
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
      beginRecognition();
      if (!auto) window.setVoiceFeedback('voice_report_screen', 'Captura iniciada.');
      // Asegurar lectura de instrucciones tras activarse por comando "reportar"
      const current = (location.hash || '#home_screen').slice(1);
      if (current === 'voice_report_screen' && typeof speakVoiceScreenOptions === 'function' && !window.voiceDescSpoken) {
        window.voiceDescSpoken = true;
        setTimeout(() => speakVoiceScreenOptions('descripcion'), 250);
      }
    }).catch(err => {
      console.warn('Permiso micrófono denegado', err);
      window.setVoiceFeedback('voice_report_screen', 'Permiso de micrófono denegado.');
    });
  }

  function beginRecognition() {
    const p = document.getElementById('voice_location_transcription');
    if (!p) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Fallback simulando transcripción
      let demo = '(Escuchando…)';
      p.textContent = demo;
      const samples = [
        'Veo un bache en la Calle Principal cerca de la esquina de la Avenida del Roble',
        'Está frente a una panadería y es bastante profundo',
        'Podría ser peligroso para ciclistas'
      ];
      let i = 0;
      const interval = setInterval(() => {
        demo = samples.slice(0, ++i).join('. ') + '.';
        p.textContent = demo;
        state.locationDescription = demo;
        saveState();
        if (i >= samples.length) clearInterval(interval);
      }, 1400);
      return;
    }
    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.interimResults = true;
      recognition.continuous = true;
      let isPaused = false;
      let interimBuffer = '';
        recognition.onresult = (e) => {
          const currentScreen = (location.hash || '#home_screen').slice(1);
          const captureAllowedScreen = currentScreen === 'voice_report_screen';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            let segment = res[0].transcript;
            const lower = segment.toLowerCase();

            // Procesar comandos siempre
            handleInlineVoiceCommands(lower, res.isFinal);

            // Calcular si se permite capturar texto
            const captureAllowed = captureAllowedScreen && !window.ttsBusyFlag && !isPaused;

            // Control pausa
            if (/\bdetener\b/.test(lower)) {
              isPaused = true;
              window.setVoiceFeedback('voice_report_screen', 'Captura en pausa');
              continue;
            }
            if (isPaused && /\b(reanudar|continuar)\b/.test(lower)) {
              isPaused = false;
              window.setVoiceFeedback('voice_report_screen', 'Captura reanudada');
              continue;
            }
            if (isPaused) continue;

            if (captureAllowed) {
              if (res.isFinal) {
                segment = filterControlWords(segment);
                if (segment) appendFinal(segment);
                interimBuffer = '';
              } else {
                interimBuffer = filterControlWords(segment);
              }
            }
          }
          if (captureAllowedScreen) {
            const visual = (state.locationDescription + (interimBuffer ? ' ' + interimBuffer : '')).trim();
            p.textContent = visual || (isPaused ? '(Captura en pausa)' : '(Escuchando…)');
          }
          if (captureAllowedScreen && !window.ttsBusyFlag && !isPaused) saveState();
      };

      function filterControlWords(text) {
        return text
          .replace(/\b(siguiente|salir|detener|reanudar|continuar|usar ubicaci[oó]n|usar gps|omitir)\b/ig,'')
          .replace(/\s{2,}/g,' ')
          .trim();
      }

      function appendFinal(segment) {
        if (!segment) return;
        state.locationDescription = (state.locationDescription ? state.locationDescription + ' ' : '') + segment;
      }

      // Cooldown para evitar múltiples disparos por resultados interinos repetidos
      let inlineLast = 0;
      const INLINE_COOLDOWN = 1200;
      function canTriggerInline() { return Date.now() - inlineLast > INLINE_COOLDOWN; }
      function markInline() { inlineLast = Date.now(); }

      function currentScreenId() {
        return (location.hash || '#home_screen').slice(1);
      }

      function handleInlineVoiceCommands(lower, isFinal) {
        if (!canTriggerInline()) return;
        const screen = currentScreenId();
        // Mientras TTS habla permitir:
        // - Todos los comandos en descripción y revisión
        // - Solo selección de tamaño en pantalla de tamaño
        if (typeof ttsBusy !== 'undefined' && ttsBusy) {
          const sizeIntent = /\b(peque(?:ño|nito|no)|mediano|grande)\b/.test(lower);
          const allowAll = screen === 'voice_report_screen' || screen === 'voice_report_review_voice_screen';
          if (!allowAll && !(screen === 'voice_report_size_screen' && sizeIntent)) {
            return; // ignorar comandos hasta finalizar TTS
          }
        }
        // Global salir/home
        if (/\b(inicio|home|salir)\b/.test(lower)) {
          if (window.voiceReport && window.voiceReport.stopVoiceCapture) {
            window.voiceReport.stopVoiceCapture();
          }
          window.showScreen('home_screen');
          window.setVoiceFeedback(screen, 'Comando: Ir al inicio');
          markInline();
          return;
        }
        // Pausa/reanudar ya gestionadas arriba, no repetir
        if (/\bdetener\b/.test(lower) || /\b(reanudar|continuar)\b/.test(lower)) {
          markInline();
          return;
        }
        // Comandos de ubicación (usar / omitir) válidos en pantalla de descripción o mapa
        if (/usar ubicaci[oó]n|usar gps/.test(lower)) {
          try {
            const rawState = JSON.parse(localStorage.getItem('voiceReportState')) || {};
            rawState.locationUsed = true;
            localStorage.setItem('voiceReportState', JSON.stringify(rawState));
            // Sincronizar estado en memoria
            state.locationUsed = true;
            saveState();
            window.setVoiceFeedback(screen, 'Ubicación: GPS seleccionado');
          } catch(_) {}
          // Si estamos en la pantalla de descripción, avanzar al mapa
          if (screen === 'voice_report_screen') {
            window.showScreen('voice_report_map_location_voice_screen');
          } else if (screen === 'voice_report_map_location_voice_screen') {
            // Avanzar directamente a tamaño
            window.showScreen('voice_report_size_screen');
          }
          markInline();
          return;
        }
        if (/\bomitir\b|sin ubicaci[oó]n/.test(lower)) {
          try {
            const rawState = JSON.parse(localStorage.getItem('voiceReportState')) || {};
            rawState.locationUsed = false;
            localStorage.setItem('voiceReportState', JSON.stringify(rawState));
            state.locationUsed = false;
            saveState();
            window.setVoiceFeedback(screen, 'Ubicación: omitida');
          } catch(_) {}
          if (screen === 'voice_report_screen') {
            window.showScreen('voice_report_map_location_voice_screen');
          } else if (screen === 'voice_report_map_location_voice_screen') {
            window.showScreen('voice_report_size_screen');
          }
          markInline();
          return;
        }
        // Editar / cambiar ubicación desde tamaño o revisión
        if (/editar ubicaci[oó]n|cambiar ubicaci[oó]n|ajustar ubicaci[oó]n|repetir ubicaci[oó]n|regrabar ubicaci[oó]n/.test(lower)) {
          window.showScreen('voice_report_map_location_voice_screen');
          window.setVoiceFeedback(screen, 'Volviendo a pantalla de ubicación');
          markInline();
          return;
        }
        // Selección de tamaño por voz (solo efectiva en pantalla de tamaño o si llega antes se aplaza hasta esa pantalla)
        if (/\bpeque(?:ño|nito|no)\b/.test(lower)) {
          applySizeChoice('pequeño', screen);
          markInline();
          return;
        }
        if (/\bmediano\b/.test(lower)) {
          applySizeChoice('mediano', screen);
          markInline();
          return;
        }
        if (/\bgrande\b/.test(lower)) {
          applySizeChoice('grande', screen);
          markInline();
          return;
        }
        // Progresión "siguiente" / "continuar"
        if (/\b(siguiente|continuar)\b/.test(lower)) {
          if (screen === 'voice_report_screen') {
            window.showScreen('voice_report_map_location_voice_screen');
            window.setVoiceFeedback(screen, 'Avanzando a ubicación');
          } else if (screen === 'voice_report_map_location_voice_screen') {
            window.showScreen('voice_report_size_screen');
            window.setVoiceFeedback(screen, 'Avanzando a tamaño');
          } else if (screen === 'voice_report_size_screen') {
            window.showScreen('voice_report_review_voice_screen');
            window.setVoiceFeedback(screen, 'Avanzando a revisión');
          } else if (screen === 'voice_report_review_voice_screen') {
            // Opcional: continuar podría ser confirmar
            window.showScreen('report_submission_confirmation');
            window.setVoiceFeedback(screen, 'Reporte enviado');
          }
          markInline();
          return;
        }
        // Confirmar desde pantalla de tamaño salta directo a revisión
        if (/\bconfirmar\b/.test(lower) && screen === 'voice_report_size_screen') {
          window.showScreen('voice_report_review_voice_screen');
          window.setVoiceFeedback(screen, 'Confirmado tamaño, pasando a revisión');
          markInline();
          return;
        }
        // Confirmar o enviar en pantalla de revisión
        if (/\b(confirmar|enviar)\b/.test(lower) && screen === 'voice_report_review_voice_screen') {
          window.showScreen('report_submission_confirmation');
          window.setVoiceFeedback(screen, 'Reporte enviado');
          markInline();
          return;
        }
      }

      function applySizeChoice(sizeValue, currentScreen) {
        // Sincronizar con objeto en memoria y localStorage
        state.size = sizeValue;
        saveState();
        try {
          const rawState = JSON.parse(localStorage.getItem('voiceReportState')) || {};
          rawState.size = sizeValue;
          localStorage.setItem('voiceReportState', JSON.stringify(rawState));
        } catch(_) {}
        // Actualizar UI si estamos en la pantalla de tamaño
        if (currentScreen === 'voice_report_size_screen') {
          document.querySelectorAll('.voice-size-option').forEach(btn => {
            const match = btn.getAttribute('data-size') === sizeValue;
            btn.classList.toggle('ring-2', match);
            btn.classList.toggle('ring-primary', match);
            btn.setAttribute('aria-pressed', match ? 'true' : 'false');
          });
          window.setVoiceFeedback(currentScreen, 'Tamaño seleccionado: ' + sizeValue);
          // Confirmación hablada (no bloquea comandos de tamaño porque ttsBusy se gestiona arriba)
          if (typeof speak === 'function') speak('Tamaño ' + sizeValue + ' seleccionado');
        } else {
          window.setVoiceFeedback(currentScreen, 'Tamaño registrado para la siguiente pantalla: ' + sizeValue);
        }
      }
      recognition.onerror = (e) => console.warn('Error reconocimiento', e);
      recognition.start();
      toggleVoiceButtons(true);
    } catch(err) {
      console.warn('Fallo al iniciar reconocimiento', err);
      window.setVoiceFeedback('voice_report_screen', 'Error iniciando reconocimiento.');
    }
  }

  function stopVoiceCapture() {
    if (recognition) {
      try { recognition.stop(); } catch(e) {}
    }
    toggleVoiceButtons(false);
    window.setVoiceFeedback('voice_report_screen', 'Captura detenida.');
  }

  function toggleVoiceButtons(running) {
    const stopBtn = document.querySelector('[data-voice-stop]');
    if (stopBtn) stopBtn.disabled = !running;
  }

  // Escuchar navegación para activar lógica contextual
  const originalShow = window.showScreen;
  window.showScreen = function(id) {
    originalShow(id);
    // Detener reconocimiento si se abandona la pantalla de descripción
    if (lastVoiceScreen === 'voice_report_screen' && id !== 'voice_report_screen') {
      if (window.voiceReport && window.voiceReport.stopVoiceCapture) {
        try { window.voiceReport.stopVoiceCapture(); } catch(_) {}
      }
    }
    lastVoiceScreen = id;
    if (id === 'voice_report_screen') {
      // Nueva sesión si venimos desde home o sesión inactiva
      if (!voiceReportSessionActive) {
        resetVoiceState();
        voiceReportSessionActive = true;
      }
      // Inicio automático solo si no hay reconocimiento activo
      if (!window.voiceAutoStarted) {
        window.voiceAutoStarted = true;
        setTimeout(() => startVoiceCapture(true), 150);
      }
      speakVoiceScreenOptions('descripcion');
    } else if (id === 'voice_report_review_voice_screen') {
      updateReview();
      speakVoiceScreenOptions('revision');
      setTimeout(() => speakSummary(), 900);
    } else if (id === 'home_screen') {
      startHomeRecognition();
      voiceReportSessionActive = false; // terminar sesión al volver a home
    }
    if (id === 'voice_report_map_location_voice_screen') speakVoiceScreenOptions('ubicacion');
    if (id === 'voice_report_size_screen') speakVoiceScreenOptions('tamano');
    if (id === 'report_submission_confirmation') {
      // Fin de sesión tras envío
      if (window.voiceReport && window.voiceReport.stopVoiceCapture) {
        try { window.voiceReport.stopVoiceCapture(); } catch(_) {}
      }
      if (window.tts && window.tts.cancelSpeak) {
        window.tts.cancelSpeak();
      }
      window.ttsBusyFlag = false;
      // Guardar reporte de voz si el envío proviene del flujo de voz
      if(lastVoiceScreen && lastVoiceScreen.startsWith('voice_report_')) {
        saveVoiceReport();
      }
      voiceReportSessionActive = false;
      resetVoiceState();
    }
    // Manual flow: asegurar que reconocimiento de voz y TTS no interfieran
    if (id === 'location_input_screen' || id === 'pothole_details_input_screen' || id === 'review_and_submit_screen') {
      // Detener reconocimiento de voz activo
      if (window.voiceReport && window.voiceReport.stopVoiceCapture) {
        try { window.voiceReport.stopVoiceCapture(); } catch(_) {}
      }
      // Cancelar TTS en curso
      if (window.tts && window.tts.cancelSpeak) {
        window.tts.cancelSpeak();
      }
      // Detener escucha en home si seguía activa
      if (typeof stopHomeRecognition === 'function') {
        try { stopHomeRecognition(); } catch(_) {}
      }
    }
  };

  // Asegurar reconocimiento en home incluso si la sobreescritura ocurre después de la primera carga
  if ((location.hash || '#home_screen').slice(1) === 'home_screen') {
    // Defer para permitir finalizar carga y evitar condiciones de competencia
    setTimeout(() => startHomeRecognition(), 200);
  }

  // Fallback: iniciar reconocimiento tras primer gesto de usuario si no ha iniciado
  let homeGestureBound = false;
  function bindHomeGestureFallback() {
    if (homeGestureBound) return;
    homeGestureBound = true;
    const handler = () => {
      if ((location.hash || '#home_screen').slice(1) === 'home_screen') {
        startHomeRecognition();
      }
      window.removeEventListener('click', handler, { once: true });
      window.removeEventListener('keydown', handler, { once: true });
      window.removeEventListener('touchstart', handler, { once: true });
    };
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
  }
  bindHomeGestureFallback();
  // Botones inicio / detener voz
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-voice-stop]')) {
      stopVoiceCapture();
    }
    // Si se inicia flujo manual desde home, detener reconocimiento de home
    if (e.target.closest('[data-go="location_input_screen"]')) {
      if (typeof stopHomeRecognition === 'function') {
        try { stopHomeRecognition(); } catch(_) {}
      }
      if (window.tts && window.tts.cancelSpeak) window.tts.cancelSpeak();
      if (window.voiceReport && window.voiceReport.stopVoiceCapture) {
        try { window.voiceReport.stopVoiceCapture(); } catch(_) {}
      }
    }
    // Fallback: si aún no arrancó y estamos en pantalla de voz, iniciar tras interacción
    const current = (location.hash || '#home_screen').slice(1);
    if (current === 'voice_report_screen' && !recognition && !e.target.closest('[data-voice-stop]')) {
      startVoiceCapture(true);
      window.setVoiceFeedback('voice_report_screen','Captura iniciada tras interacción.');
    }
  });

  // Exponer para otros módulos
  window.voiceReport = { startVoiceCapture, stopVoiceCapture };

  // ---------- TTS (Text to Speech) Utility ----------
  const TTS_SUPPORT = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let ttsBusy = false;
  function speak(text, opts={}) {
    if (!TTS_SUPPORT || !text) return;
    if (opts.cancelFirst) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    u.rate = opts.rate || 1;
    u.pitch = opts.pitch || 1;
    ttsBusy = true;
    window.ttsBusyFlag = true;
    u.onend = () => { ttsBusy = false; window.ttsBusyFlag = false; };
    u.onerror = () => { ttsBusy = false; window.ttsBusyFlag = false; };
    speechSynthesis.speak(u);
      if (id === 'report_submission_confirmation') {
        if (window.voiceReport && window.voiceReport.stopVoiceCapture) { try { window.voiceReport.stopVoiceCapture(); } catch(_) {} }
        if (window.tts && window.tts.cancelSpeak) { window.tts.cancelSpeak(); }
        window.ttsBusyFlag = false;
      }
  }
  function cancelSpeak() { if (TTS_SUPPORT) speechSynthesis.cancel(); }

  function speakVoiceScreenOptions(tipo) {
    if (!TTS_SUPPORT) return;
    let text = '';
    switch(tipo) {
      case 'descripcion':
        text = 'Describe el bache. Comandos disponibles: usar ubicación, omitir, siguiente, detener.';
        break;
      case 'ubicacion':
        text = 'Pantalla de ubicación. Puedes decir: usar ubicación, omitir, siguiente, editar ubicación, detener.';
        break;
      case 'tamano':
        text = 'Pantalla de tamaño. Opciones: pequeño, mediano, grande. Comandos: confirmar, siguiente, editar ubicación, detener.';
        break;
      case 'revision':
        text = 'Pantalla de revisión. Comandos: confirmar, enviar, cambiar tamaño, editar ubicación, salir, detener.';
        break;
    }
    speak(text, { cancelFirst: true });
  }

  function speakSummary() {
    if (!TTS_SUPPORT) return;
    try {
      const rawState = JSON.parse(localStorage.getItem('voiceReportState')) || {};
      let locDisplay = '';
      if (rawState.locationUsed === true) locDisplay = 'Ubicación actual (GPS)';
      else if (rawState.locationUsed === false) locDisplay = '—';
      else locDisplay = 'No indicada';
      const sizeDisplay = rawState.size ? rawState.size : 'No seleccionado';
      const notesDisplay = rawState.locationDescription ? rawState.locationDescription.slice(0,180) : '';
      const summary = 'Resumen del reporte. Ubicación: ' + locDisplay + '. Tamaño: ' + sizeDisplay + '. Notas: ' + (notesDisplay || '');
      speak(summary, { cancelFirst: true, rate: 1 });
    } catch(_) {}
  }

  window.tts = { speak, cancelSpeak, speakSummary, speakVoiceScreenOptions };

  // Reconocimiento en pantalla de inicio para comando "reportar"
  let homeRec;
  let homeActive = false;
  function startHomeRecognition() {
    if (homeActive) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    try {
      homeRec = new SpeechRecognition();
      homeRec.lang = 'es-ES';
      homeRec.interimResults = true;
      homeRec.continuous = true;
      homeRec.onresult = (e) => {
        let combined = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          combined += e.results[i][0].transcript.toLowerCase();
        }
        if (/\breportar\b|\bnuevo reporte\b|\biniciar reporte\b/.test(combined)) {
          stopHomeRecognition();
          window.setVoiceFeedback('home_screen','Abriendo reporte por voz…');
          window.showScreen('voice_report_screen');
        }
      };
      homeRec.onerror = () => {};
      homeRec.start();
      homeActive = true;
      window.setVoiceFeedback('home_screen','Di "reportar" para empezar.');
    } catch(err) {}
  }
  function stopHomeRecognition() {
    if (homeRec) { try { homeRec.stop(); } catch(_) {} }
    homeActive = false;
  }
  // Detener reconocimiento de inicio al entrar al flujo de voz
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-go="voice_report_screen"]')) {
      stopHomeRecognition();
    }
  });

  // Listeners para elección de ubicación (GPS usado u omitido)
  document.addEventListener('click', (e) => {
    const choiceBtn = e.target.closest('[data-location-choice]');
    if (choiceBtn) {
      const val = choiceBtn.getAttribute('data-location-choice');
      state.locationUsed = val === 'use';
      saveState();
    }
    const sizeBtn = e.target.closest('.voice-size-option');
    if (sizeBtn) {
      state.size = sizeBtn.getAttribute('data-size');
      updateSizeUI();
      saveState();
    }
  });

  // Inicializar UI de tamaño si ya había estado
  document.addEventListener('DOMContentLoaded', updateSizeUI);
})();

  // ---- Flujo Manual: almacenamiento y edición ----
  (function(){
    const MANUAL_KEY = 'manualReports';
    let manualDraft = { location:'', size:'', description:'', date:'' };
    let editingId = null; // id del reporte que se está editando
    function loadManualReports(){ try { return JSON.parse(localStorage.getItem(MANUAL_KEY))||[]; } catch(_) { return []; } }
    function saveManualReports(list){ try { localStorage.setItem(MANUAL_KEY, JSON.stringify(list)); } catch(_) {} }
    function startManualDraftLocation(){
      const input = document.querySelector('#location_input_screen input');
      const candidates = Array.from(document.querySelectorAll('#location_input_screen .flex.flex-col.bg-white.rounded-DEFAULT p.text-text-main'));
      let picked = input && input.value.trim() ? input.value.trim() : '';
      if(!picked && candidates.length) picked = candidates[0].textContent.trim();
      manualDraft.location = picked || '(Sin ubicación)';
      manualDraft.date = new Date().toLocaleDateString('es-ES');
    }
    function finalizeManualDraft(){
      const sizeRadio = document.querySelector('#pothole_details_input_screen input[name="pothole-size"]:checked');
      manualDraft.size = sizeRadio ? sizeRadio.value.toLowerCase() : '';
      const desc = document.querySelector('#pothole_details_input_screen textarea');
      manualDraft.description = desc ? desc.value.trim() : '';
      if(!manualDraft.date) manualDraft.date = new Date().toLocaleDateString('es-ES');
      const list = loadManualReports();
      const id = Date.now();
      list.push({ id, ...manualDraft });
      saveManualReports(list);
    }
    function injectManualReview(report){
      if(!report) return;
      const locEl = document.getElementById('review_manual_location');
      const descEl = document.getElementById('review_manual_description');
      const sizeEl = document.getElementById('review_manual_size');
      if(locEl){ locEl.textContent = 'Ubicación: ' + report.location; locEl.classList.remove('hidden'); }
      if(descEl){ descEl.textContent = 'Descripción: ' + (report.description||'(Vacía)'); descEl.classList.remove('hidden'); }
      if(sizeEl){ sizeEl.textContent = 'Tamaño: ' + (report.size||'—'); sizeEl.classList.remove('hidden'); }
    }
    function populateManualEditScreen(report){
      if(!report) return;
      const descInput = document.getElementById('manual_edit_description_textarea');
      const locInput = document.getElementById('manual_edit_location_input');
      const sizeGroup = document.getElementById('manual_edit_size_group');
      const lEl = document.getElementById('manual_report_location');
      const sEl = document.getElementById('manual_report_size');
      const dateEl = document.getElementById('manual_report_date');
      if(descInput) descInput.value = report.description || '';
      if(locInput) locInput.value = report.location || '';
      if(sizeGroup){
        sizeGroup.querySelectorAll('input[name="manual-edit-size"]').forEach(r => {
          r.checked = r.value === (report.size || '').toLowerCase();
        });
      }
      if(lEl) lEl.textContent = report.location || '(Sin ubicación)';
      if(sEl) sEl.textContent = report.size || '—';
      if(dateEl) dateEl.textContent = report.date || '—';
    }
    function rebuildMyReportsList(){
      const container = document.getElementById('my_reports_dynamic_list');
      if(!container) return;
      container.innerHTML = '';
      const list = loadManualReports();
      if(!list.length){ container.innerHTML = '<p class="text-sm text-gray-500">No hay reportes manuales guardados.</p>'; }
      list.slice().reverse().forEach(r => {
        const div = document.createElement('div');
        div.className = 'bg-card-light dark:bg-card-dark rounded-lg shadow-sm overflow-hidden';
        div.innerHTML = `
          <div class=\"p-4 flex items-start gap-4\">\n          <span class=\"material-symbols-outlined text-primary text-4xl mt-1\">edit_note</span>\n          <div class=\"flex-1\">\n            <p class=\"text-base font-bold font-display\">Manual</p>\n            <p class=\"text-base mt-1\">${r.location}</p>\n            <p class=\"text-sm text-gray-600 dark:text-gray-400 mt-1\">${r.date}</p>\n          </div>\n        </div>\n        <div class=\"bg-gray-50 dark:bg-gray-700/50 px-4 py-3 flex justify-end gap-3\">\n          <button data-manual-edit=\"${r.id}\" class=\"flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-sm font-medium font-display\">Editar</button>\n          <button data-manual-review=\"${r.id}\" class=\"flex items-center justify-center rounded-lg h-12 px-5 border border-primary text-primary text-sm font-medium font-display\">Ver</button>\n        </div>`;
        container.appendChild(div);
      });
      // Agregar reporte de voz actual si existe información
      try {
        const vrRaw = localStorage.getItem('voiceReportState');
        if(vrRaw){
          const vr = JSON.parse(vrRaw);
          const hasVoiceData = vr && (vr.locationDescription || vr.size || vr.locationUsed !== null);
          if(hasVoiceData){
            const voiceDiv = document.createElement('div');
            voiceDiv.className = 'bg-card-light dark:bg-card-dark rounded-lg shadow-sm overflow-hidden border border-secondary/40';
            const locLabel = vr.locationUsed === true ? 'Ubicación: GPS' : (vr.locationUsed === false ? 'Ubicación omitida' : 'Ubicación no indicada');
            const sizeLabel = vr.size ? ('Tamaño: ' + vr.size) : 'Tamaño no seleccionado';
            const descPreview = (vr.locationDescription || '').slice(0,120) + ((vr.locationDescription||'').length > 120 ? '…' : '');
            const dateStr = new Date().toLocaleDateString('es-ES');
            voiceDiv.innerHTML = `
              <div class=\"p-4 flex items-start gap-4\">\n                <span class=\"material-symbols-outlined text-secondary text-4xl mt-1\">mic</span>\n                <div class=\"flex-1\">\n                  <p class=\"text-base font-bold font-display\">Reporte de Voz (temporal)</p>\n                  <p class=\"text-sm mt-1\">${locLabel}</p>\n                  <p class=\"text-sm mt-1\">${sizeLabel}</p>\n                  <p class=\"text-xs text-gray-600 dark:text-gray-400 mt-2\">${descPreview || '(Sin descripción capturada)'} </p>\n                  <p class=\"text-xs text-gray-500 mt-2\">Fecha: ${dateStr}</p>\n                </div>\n              </div>`;
            container.insertBefore(voiceDiv, container.firstChild);
          }
        }
      } catch(_) {}
    }

    // Integrar con clicks
    document.addEventListener('click', (e) => {
      if(e.target.closest('#location_input_screen [data-go="pothole_details_input_screen"]')) {
        startManualDraftLocation();
      }
      if(e.target.closest('#pothole_details_input_screen [data-go="review_and_submit_screen"]')) {
        finalizeManualDraft();
      }
      if(e.target.closest('[data-go="review_and_submit_screen"]')) {
        const list = loadManualReports();
        injectManualReview(list[list.length-1]);
      }
      const editBtn = e.target.closest('[data-manual-edit]');
      const viewBtn = e.target.closest('[data-manual-review]');
      if(editBtn || viewBtn){
        const attr = editBtn ? 'data-manual-edit' : 'data-manual-review';
        const id = parseInt((editBtn||viewBtn).getAttribute(attr),10);
        const list = loadManualReports();
        const report = list.find(r=>r.id===id);
        if(editBtn){ editingId = id; }
        populateManualEditScreen(report);
        if(report) window.showScreen('report_confirmation_and_editing');
      }
      // Guardar cambios del borrador manual
      if(e.target.closest('[data-manual-save]')){
        if(editingId == null) return;
        const list = loadManualReports();
        const idx = list.findIndex(r=>r.id===editingId);
        if(idx === -1) return;
        const descInput = document.getElementById('manual_edit_description_textarea');
        const locInput = document.getElementById('manual_edit_location_input');
        const sizeSelected = document.querySelector('#manual_edit_size_group input[name="manual-edit-size"]:checked');
        list[idx].description = descInput ? descInput.value.trim() : list[idx].description;
        list[idx].location = locInput ? locInput.value.trim() : list[idx].location;
        list[idx].size = sizeSelected ? sizeSelected.value.toLowerCase() : list[idx].size;
        saveManualReports(list);
        populateManualEditScreen(list[idx]);
        rebuildMyReportsList();
        // feedback
        let fb = document.getElementById('manual_edit_feedback');
        if(!fb){
          fb = document.createElement('div');
          fb.id = 'manual_edit_feedback';
          fb.className = 'mx-4 mt-1 text-sm text-green-600';
          const meta = document.getElementById('manual_report_meta');
          if(meta) meta.parentNode.insertBefore(fb, meta.nextSibling);
        }
        fb.textContent = 'Cambios guardados';
        setTimeout(()=>{ if(fb) fb.textContent=''; }, 3000);
      }
    });

    // Re-patch showScreen para reconstruir lista
    const originalShow2 = window.showScreen;
    window.showScreen = function(id){
      originalShow2(id);
      if(id === 'my_reports_screen') rebuildMyReportsList();
      if(id === 'report_confirmation_and_editing' && editingId != null){
        const list = loadManualReports();
        const report = list.find(r=>r.id===editingId);
        if(report) populateManualEditScreen(report);
      }
    };
  })();

