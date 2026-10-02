# 🦖 Dino 1v1 Online — Carrera de Supervivencia en Tiempo Real

Juego multijugador online 1v1 en tiempo real basado en el juego del Dinosaurio de Google, con **0 ms de latencia percibida**, conexión directa P2P (WebRTC DataChannels) y arquitectura lista para desplegarse al **100% en Vercel sin costos de servidores ni cold starts**.

---

## ✨ Características

- **0 ms de Input Lag:** El salto y agache del jugador local se ejecutan instantáneamente en su navegador (`client-side prediction`).
- **Semilla Determinista Compartida:** Ambos jugadores enfrentan la misma secuencia de obstáculos sincronizados mediante un generador pseudoaleatorio (`Mulberry32 PRNG`).
- **Visualización en Doble Carril:**
  - **Carril Superior:** Tu dinosaurio y tus obstáculos.
  - **Carril Inferior:** El dinosaurio rival y su recorrido correspondiente.
- **Sin Fondos (Chroma Key Transparente):** Los sprites se extrajeron y procesaron con canal alfa 100% transparente directamente de la hoja de sprites original.
- **Personalización Completa:**
  - Nombre / Apodo editable.
  - Paleta de 8 colores vibrantes de identificación y aura.
  - Selector de Skins con vista previa en tiempo real: *T-Rex Clásico*, *T-Rex Fiesta 🥳*, *T-Rex Surfista 🏄*, *T-Rex Jinete 🐎*, *T-Rex Atleta 🏃*.
- **Salas Rápidas por Enlace o Código:**
  - Generación de sala con código de 4 letras.
  - Enlace de invitación con un solo clic (`?room=ABCD`) que conecta automáticamente al rival.
- **Controles Híbridos:**
  - **PC:** <kbd>Espacio</kbd> / <kbd>&uarr;</kbd> (Saltar), <kbd>&darr;</kbd> (Agacharse).
  - **Móvil:** Botones táctiles dedicados o toques en la pantalla.
- **Revancha Inmediata:** Botón de revancha para jugar una nueva carrera sin recargar la página.

---

## 🚀 Cómo Ejecutar en Local

1. Instalar dependencias:
```bash
npm install
```

2. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

3. Abrir dos pestañas en `http://localhost:5199`:
   - En la primera pestaña: Haz clic en **"Crear Sala Nueva"** y copia el link.
   - En la segunda pestaña: Pega el link para jugar en tiempo real.

---

## 🧪 Tests Automatizados (TDD)

Para ejecutar la suite de pruebas unitarias de física, PRNG determinista y colisiones AABB:
```bash
npm test
```

---

## ☁️ Despliegue en Vercel (100% Gratis)

El proyecto incluye [`vercel.json`](file:///C:/Users/HuGOD777/Desktop/Proyectos%20&%20Dev/jueguito%20online/vercel.json) configurado para construir y servir el cliente estático con Vite:

1. Sube este repositorio a tu GitHub o usa el CLI de Vercel:
```bash
npx vercel
```
2. ¡Listo! Al usar WebRTC Peer-to-Peer, no necesitas ningún backend ni base de datos activa.
