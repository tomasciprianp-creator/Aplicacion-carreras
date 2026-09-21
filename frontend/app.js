// app.js
//
// Orquesta las 5 pantallas del test (intro, likert, abiertas, cargando,
// resultado) usando ÚNICAMENTE las funciones ya probadas en test-engine.js.
// Esta capa no calcula nada por su cuenta — solo recolecta respuestas del
// usuario y llama al motor determinístico.

import {
  cargarPreguntasLikert,
  cargarPreguntasAbiertas,
  completarTest,
} from "./test-engine.js";

// ---------------------------------------------------------------------
// Estado del flujo
// ---------------------------------------------------------------------

const estado = {
  presupuesto: null,       // { presupuestoMax, estrato, sisbenGrupo, ciudadPreferida, email }
  preguntasLikert: [],     // catálogo completo, cargado una vez
  preguntasAbiertas: [],   // catálogo completo, cargado una vez
  capitulos: [],           // preguntasLikert agrupadas por dimensión, en orden de aparición
  capituloActual: 0,
  respuestasLikert: new Map(),   // pregunta_id -> valor (1-5)
  respuestasAbiertas: new Map(), // pregunta_id -> texto
};

const ETIQUETAS_ESCALA = [
  "Muy en desacuerdo",
  "En desacuerdo",
  "Neutral",
  "De acuerdo",
  "Muy de acuerdo",
];

// ---------------------------------------------------------------------
// Utilidades de navegación entre pantallas
// ---------------------------------------------------------------------

function mostrarPantalla(nombre) {
  document.querySelectorAll(".screen").forEach((el) => {
    el.hidden = el.dataset.screen !== nombre;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarError(error) {
  console.error(error);
  document.getElementById("error-mensaje").textContent =
    error?.message || "Error desconocido. Intenta de nuevo en unos minutos.";
  mostrarPantalla("error");
}

// ---------------------------------------------------------------------
// Rastreador de capítulos (header)
// ---------------------------------------------------------------------

function inicializarRastreador(totalCapitulos) {
  const tracker = document.getElementById("chapter-tracker");
  tracker.innerHTML = "";
  for (let i = 0; i < totalCapitulos; i++) {
    const tick = document.createElement("div");
    tick.className = "chapter-tracker__tick";
    tick.dataset.index = String(i);
    tracker.appendChild(tick);
  }
  tracker.hidden = false;
}

function actualizarRastreador(indiceActual) {
  document.querySelectorAll(".chapter-tracker__tick").forEach((tick) => {
    const i = Number(tick.dataset.index);
    if (i < indiceActual) tick.dataset.state = "done";
    else if (i === indiceActual) tick.dataset.state = "current";
    else tick.dataset.state = "";
  });
}

// ---------------------------------------------------------------------
// Pantalla 1 — Intro / presupuesto
// ---------------------------------------------------------------------

document.getElementById("form-presupuesto").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;

  estado.presupuesto = {
    presupuestoMax: Number(form.presupuestoMax.value),
    estrato: form.estrato.value ? Number(form.estrato.value) : null,
    sisbenGrupo: form.sisbenGrupo.value || null,
    ciudadPreferida: form.ciudadPreferida.value.trim() || null,
    email: form.email.value.trim() || null,
  };

  const boton = form.querySelector("button[type=submit]");
  boton.disabled = true;
  boton.textContent = "Cargando preguntas…";

  try {
    const [preguntasLikert, preguntasAbiertas] = await Promise.all([
      cargarPreguntasLikert(),
      cargarPreguntasAbiertas(),
    ]);

    estado.preguntasLikert = preguntasLikert;
    estado.preguntasAbiertas = preguntasAbiertas;
    estado.capitulos = agruparPorDimension(preguntasLikert);
    estado.capituloActual = 0;

    inicializarRastreador(estado.capitulos.length);
    renderCapituloLikert();
    mostrarPantalla("likert");
  } catch (error) {
    mostrarError(error);
  } finally {
    boton.disabled = false;
    boton.textContent = "Comenzar el test";
  }
});

function agruparPorDimension(preguntas) {
  const orden = [];
  const grupos = new Map(); // nombre dimensión -> preguntas[]

  for (const pregunta of preguntas) {
    const nombreDimension = pregunta.dimensiones.nombre;
    if (!grupos.has(nombreDimension)) {
      grupos.set(nombreDimension, []);
      orden.push(nombreDimension);
    }
    grupos.get(nombreDimension).push(pregunta);
  }

  return orden.map((nombre) => ({ dimension: nombre, preguntas: grupos.get(nombre) }));
}

// ---------------------------------------------------------------------
// Pantalla 2 — Likert, un capítulo (dimensión) a la vez
// ---------------------------------------------------------------------

function renderCapituloLikert() {
  const capitulo = estado.capitulos[estado.capituloActual];
  actualizarRastreador(estado.capituloActual);

  document.getElementById("likert-chapter-label").textContent =
    `Capítulo ${estado.capituloActual + 1} de ${estado.capitulos.length}`;
  document.getElementById("likert-dimension-name").textContent = capitulo.dimension;

  const contenedor = document.getElementById("likert-questions");
  contenedor.innerHTML = "";

  for (const pregunta of capitulo.preguntas) {
    contenedor.appendChild(renderPreguntaLikert(pregunta));
  }

  document.getElementById("btn-likert-back").disabled = estado.capituloActual === 0;
  actualizarTextoBotonSiguiente();
}

function renderPreguntaLikert(pregunta) {
  const wrapper = document.createElement("div");
  wrapper.className = "likert-item";

  const prompt = document.createElement("p");
  prompt.className = "likert-item__prompt";
  prompt.textContent = pregunta.texto;
  wrapper.appendChild(prompt);

  const scale = document.createElement("div");
  scale.className = "likert-scale";

  const valorGuardado = estado.respuestasLikert.get(pregunta.id);

  for (let valor = 1; valor <= 5; valor++) {
    const option = document.createElement("label");
    option.className = "likert-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = `pregunta-${pregunta.id}`;
    input.value = String(valor);
    if (valorGuardado === valor) input.checked = true;
    input.addEventListener("change", () => {
      estado.respuestasLikert.set(pregunta.id, valor);
      actualizarTextoBotonSiguiente();
    });

    const span = document.createElement("span");
    span.textContent = String(valor);

    option.appendChild(input);
    option.appendChild(span);
    scale.appendChild(option);
  }

  wrapper.appendChild(scale);

  const labels = document.createElement("div");
  labels.className = "likert-scale-labels";
  labels.innerHTML = `<span>${ETIQUETAS_ESCALA[0]}</span><span>${ETIQUETAS_ESCALA[4]}</span>`;
  wrapper.appendChild(labels);

  return wrapper;
}

function capituloEstaCompleto() {
  const capitulo = estado.capitulos[estado.capituloActual];
  return capitulo.preguntas.every((p) => estado.respuestasLikert.has(p.id));
}

function actualizarTextoBotonSiguiente() {
  const boton = document.getElementById("btn-likert-next");
  const esUltimo = estado.capituloActual === estado.capitulos.length - 1;
  boton.textContent = esUltimo ? "Continuar a preguntas abiertas" : "Siguiente";
}

document.getElementById("btn-likert-back").addEventListener("click", () => {
  if (estado.capituloActual === 0) return;
  estado.capituloActual -= 1;
  renderCapituloLikert();
});

document.getElementById("btn-likert-next").addEventListener("click", () => {
  if (!capituloEstaCompleto()) {
    alert("Responde todas las preguntas de este capítulo antes de continuar.");
    return;
  }

  if (estado.capituloActual < estado.capitulos.length - 1) {
    estado.capituloActual += 1;
    renderCapituloLikert();
    return;
  }

  renderPreguntasAbiertas();
  mostrarPantalla("abiertas");
});

// ---------------------------------------------------------------------
// Pantalla 3 — Preguntas abiertas
// ---------------------------------------------------------------------

function renderPreguntasAbiertas() {
  const contenedor = document.getElementById("abiertas-questions");
  contenedor.innerHTML = "";

  for (const pregunta of estado.preguntasAbiertas) {
    const wrapper = document.createElement("div");
    wrapper.className = "abierta-item";

    const label = document.createElement("label");
    label.setAttribute("for", `abierta-${pregunta.id}`);
    label.textContent = pregunta.texto;

    const textarea = document.createElement("textarea");
    textarea.id = `abierta-${pregunta.id}`;
    textarea.value = estado.respuestasAbiertas.get(pregunta.id) || "";
    textarea.addEventListener("input", () => {
      estado.respuestasAbiertas.set(pregunta.id, textarea.value);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(textarea);
    contenedor.appendChild(wrapper);
  }
}

document.getElementById("btn-abiertas-back").addEventListener("click", () => {
  estado.capituloActual = estado.capitulos.length - 1;
  renderCapituloLikert();
  mostrarPantalla("likert");
});

document.getElementById("btn-abiertas-submit").addEventListener("click", async () => {
  const todasRespondidas = estado.preguntasAbiertas.every((p) => {
    const texto = estado.respuestasAbiertas.get(p.id);
    return texto && texto.trim().length > 0;
  });

  if (!todasRespondidas) {
    alert("Responde las tres preguntas antes de continuar.");
    return;
  }

  mostrarPantalla("cargando");

  try {
    const respuestasLikert = [...estado.respuestasLikert.entries()].map(([pregunta_id, valor]) => ({
      pregunta_id,
      valor,
    }));
    const respuestasAbiertas = [...estado.respuestasAbiertas.entries()].map(([pregunta_id, respuesta]) => ({
      pregunta_id,
      respuesta,
    }));

    const { resultado } = await completarTest({
      presupuestoMax: estado.presupuesto.presupuestoMax,
      estrato: estado.presupuesto.estrato,
      sisbenGrupo: estado.presupuesto.sisbenGrupo,
      ciudadPreferida: estado.presupuesto.ciudadPreferida,
      respuestasLikert,
      preguntasLikert: estado.preguntasLikert,
      respuestasAbiertas,
      email: estado.presupuesto.email,
    });

    renderResultado(resultado);
    mostrarPantalla("resultado");
  } catch (error) {
    mostrarError(error);
  }
});

// ---------------------------------------------------------------------
// Pantalla 5 — Resultado
//
// El formato exacto del objeto `resultado` lo define la Edge Function
// (interpretar-resultado/index.ts). Este render asume una forma razonable
// {perfil, areas_candidatas, universidades[], interpretacion} y se ajusta
// cuando se confirme el contrato final de la Edge Function.
// ---------------------------------------------------------------------

function renderResultado(resultado) {
  const contenedor = document.getElementById("resultado-contenido");
  contenedor.innerHTML = "";

  if (resultado.interpretacion) {
    contenedor.appendChild(
      bloqueResultado("Interpretación", `<p>${escapeHtml(resultado.interpretacion)}</p>`),
    );
  }

  if (resultado.areas_candidatas?.length) {
    const chips = resultado.areas_candidatas
      .map((area) => `<span class="chip">${escapeHtml(area)}</span>`)
      .join("");
    contenedor.appendChild(bloqueResultado("Áreas afines a tu perfil", `<div class="chip-row">${chips}</div>`));
  }

  if (resultado.universidades?.length) {
    const cards = resultado.universidades
      .map(
        (u) => `
        <div class="universidad-card">
          <p class="universidad-card__nombre">${escapeHtml(u.nombre)}</p>
          <p class="universidad-card__meta">${escapeHtml(u.ciudad || "")}${u.costo ? " · $" + Number(u.costo).toLocaleString("es-CO") + "/semestre" : ""}</p>
        </div>`,
      )
      .join("");
    contenedor.appendChild(
      bloqueResultado(`Universidades dentro de tu presupuesto (${resultado.universidades.length})`, cards),
    );
  } else {
    contenedor.appendChild(
      bloqueResultado(
        "Universidades dentro de tu presupuesto",
        "<p>No encontramos universidades que califiquen con los datos que diste. Prueba ajustando ciudad o presupuesto.</p>",
      ),
    );
  }
}

function bloqueResultado(titulo, htmlInterno) {
  const bloque = document.createElement("div");
  bloque.className = "resultado-bloque";
  bloque.innerHTML = `<h3>${escapeHtml(titulo)}</h3>${htmlInterno}`;
  return bloque;
}

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Pantalla de error — volver al inicio
// ---------------------------------------------------------------------

document.getElementById("btn-error-reintentar").addEventListener("click", () => {
  mostrarPantalla("intro");
});
