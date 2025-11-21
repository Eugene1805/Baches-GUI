# Flujo de Reporte por Voz (Prototipo Bachez GUI)

Este documento describe cómo usar el flujo de reporte por voz integrado en `index.html`, las pantallas involucradas, los comandos disponibles y detalles técnicos.

## Requisitos
- Navegador con soporte para Web Speech API (`SpeechRecognition` y `speechSynthesis`). Recomendado: Chrome/Edge recientes.
- Servir la aplicación vía `https://` o `http://localhost` para acceso al micrófono.
- Micrófono habilitado y permisos concedidos.

Si `SpeechRecognition` no está disponible, se activa un fallback que simula una transcripción (solo para demostración; no procesa comandos reales).

## Estado Persistente (localStorage)
Clave: `voiceReportState`
Campos:
- `locationDescription`: Texto acumulado dictado (descripción/notas).
- `locationUsed`: `true` si se eligió GPS, `false` si se omitió, `null` si no se indicó.
- `size`: `"pequeño" | "mediano" | "grande" | ""`.
- `notes`: (Actualmente se usa `locationDescription`; reservado para futuras notas separadas).

El estado se actualiza continuamente y se reutiliza si se recarga la página.

## Pantallas del Flujo
1. `home_screen` (Inicio)  
   - Espera que digas "reportar" (o "nuevo reporte" / "iniciar reporte") para entrar al flujo de voz.
2. `voice_report_screen` (Descripción)  
   - Dictas la descripción del bache. Se leen instrucciones iniciales.
3. `voice_report_map_location_voice_screen` (Ubicación)  
   - Decides usar GPS o omitir la ubicación.
4. `voice_report_size_screen` (Tamaño)  
   - Selección de tamaño del bache.
5. `voice_report_review_voice_screen` (Revisión)  
   - Se muestran valores consolidados y se leen instrucciones + resumen.
6. `report_submission_confirmation` (Confirmación)  
   - Mensaje final de envío.

## Comandos Globales
- `salir` / `inicio` / `home`: Regresa a `home_screen` y detiene captura.
- `detener`: Pausa la transcripción (no añade más texto).
- `reanudar` / `continuar`: Reanuda captura tras detener.

## Comando para Iniciar Flujo
(Desde `home_screen`):
- `reportar` | `nuevo reporte` | `iniciar reporte`

## Comandos por Pantalla
### Descripción (`voice_report_screen`)
- `usar ubicación` | `usar gps`: Marca `locationUsed = true` y avanza a ubicación.
- `omitir` | `sin ubicación`: Marca `locationUsed = false` y avanza a ubicación.
- `siguiente` | `continuar`: Avanza a pantalla de ubicación.
- (Globales: detener, reanudar, salir).

### Ubicación (`voice_report_map_location_voice_screen`)
- `usar ubicación` | `usar gps`: `locationUsed = true`; avanza a tamaño.
- `omitir` | `sin ubicación`: `locationUsed = false`; avanza a tamaño.
- `siguiente` | `continuar`: Avanza a tamaño.
- (Globales: detener, reanudar, salir).

### Tamaño (`voice_report_size_screen`)
- `pequeño` / `pequenito` / `pequeno`: Selecciona tamaño pequeño.
- `mediano`: Selecciona tamaño mediano.
- `grande`: Selecciona tamaño grande.
- `confirmar`: Salta directamente a revisión.
- `siguiente` | `continuar`: Avanza a revisión.
- `editar ubicación` / `cambiar ubicación`: Regresa a pantalla de ubicación.
- (Globales: detener, reanudar, salir).

### Revisión (`voice_report_review_voice_screen`)
- `confirmar` | `enviar`: Finaliza y muestra confirmación.
- `editar ubicación` / `cambiar ubicación`: Regresa a pantalla de ubicación.
- (Globales: detener, reanudar, salir).

Nota: El comando verbal "cambiar tamaño" no está implementado aún; para cambiar el tamaño, navega hacia atrás manualmente o implementa extensión.

## Lógica de Transcripción
- Se capturan solo resultados finales (`res.isFinal`) para evitar duplicados.
- Palabras de comando se filtran y no se agregan al texto acumulado.
- `detener` pausa; `reanudar` continúa.
- Mientras TTS lee instrucciones/resumen:
  - En Descripción y Revisión: los comandos siguen activos.
  - En Tamaño: solo comandos de tamaño permitidos durante la locución.

## Presentación en Revisión
- Ubicación: "Ubicación actual (GPS)" si `locationUsed = true`; "—" si `false`; "Ubicación no especificada" si `null`.
- Tamaño: valor seleccionado o "—".
- Notas: la descripción dictada (`locationDescription`).
- Resumen hablado incluye estos campos tras instrucciones.

## Flujo Típico (Ejemplo)
1. En inicio dices: "reportar".
2. Se abre Descripción y escuchas instrucciones.
3. Dictas: "Hay un bache profundo frente a la escuela".
4. Dices: "usar ubicación".
5. Pantalla Ubicación se procesa y avanza a Tamaño automáticamente.
6. Dices: "mediano".
7. Dices: "confirmar" (o "siguiente").
8. En Revisión escuchas instrucciones, luego el resumen: Ubicación actual (GPS), Tamaño mediano, Notas (tu descripción).
9. Dices: "enviar".
10. Aparece la confirmación final.

## Problemas Frecuentes
| Problema | Posible causa | Solución |
|----------|---------------|----------|
| No se oye TTS | Navegador sin Speech Synthesis | Probar Chrome/Edge recientes |
| No inicia micrófono | Falta HTTPS / permiso | Usar `localhost` o servir con HTTPS y conceder permiso |
| No reconoce comandos | Ruido ambiente / dicción | Hablar claro, pausar entre comandos |
| Ubicación no cambia tras "usar ubicación" | Regex no coincide | Revisar que se dijo exactamente "usar ubicación" o "usar gps" |

## Extensibilidad
Ideas para ampliar:
- Implementar comando "cambiar tamaño" desde revisión.
- Añadir recordatorio automático si el usuario está inactivo (repetir instrucciones cada X segundos).
- Integrar geolocalización real para rellenar coordenadas.
- Guardar también fotos capturadas por voz (tomar foto, etc.).
- Internacionalización (otros idiomas).

## Seguridad y Privacidad
- La transcripción de voz permanece en el navegador y se almacena en `localStorage` local. No se envía a un servidor en este prototipo.
- Borrar datos: limpiar el almacenamiento con `localStorage.removeItem('voiceReportState')` en la consola.

## Desarrollo Rápido
Abrir el archivo `index.html` en un servidor local (ej. extensión Live Server, o comando simple):

```bash
# Ejemplo con Node (instala previamente "serve")
npx serve .
```

Visitar `http://localhost:3000` (o el puerto que indique) y seguir el flujo por voz.

---

