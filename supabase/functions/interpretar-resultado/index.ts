// supabase/functions/interpretar-resultado/index.ts
//
// Edge Function con dos acciones:
//   accion = "generar_resultado" → calcula/valida la interpretación de IA y la
//            guarda en la tabla `resultados`.
//   accion = "reenviar_email"    → reenvía por correo un resultado ya generado
//            (usa lo que ya está guardado en `resultados`, no vuelve a llamar
//            a la IA).
//
// Decisión de seguridad clave de este paso: los COSTOS de universidades NUNCA
// se toman del payload que manda el cliente. El cliente solo manda los IDs de
// las universidades que su filtro de presupuesto (corrido en el navegador)
// dejó pasar; esta función vuelve a consultar Supabase con esos IDs para
// obtener el costo real. Así, aunque alguien llame a la Edge Function
// directamente con datos manipulados, nunca puede inyectar una cifra falsa
// en un resultado guardado — la garantía de "presupuesto real" vive en la
// base de datos, no en lo que el cliente afirma.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Tipos — reflejan el schema.sql ya definido
// ---------------------------------------------------------------------------

type Costo =
  | { tipo: "fijo"; valor: number }
  | { tipo: "variable_estrato"; valores: { estrato: number; costo: number }[] }
  | { tipo: "matricula_cero" };

interface Universidad {
  id: string;
  nombre: string;
  costo: Costo;
  ayuda_financiera: string | null;
  fuente: string;
}

interface RespuestaIA {
  resumen_perfil: string;
  explicacion_areas: string;
  nota_respuestas_no_conectadas: string | null;
  disclaimer: string;
}

interface ResultadoFinal {
  fuente: "ia" | "fallback";
  resumen_perfil: string;
  explicacion_areas: string;
  nota_respuestas_no_conectadas: string | null;
  disclaimer: string;
}

interface InputGenerar {
  accion: "generar_resultado";
  sesion_id: string;
  universidad_ids: string[];       // ya filtradas por presupuesto en el cliente
  perfil_dimensiones: string[];
  es_perfil_disperso: boolean;
  areas_candidatas: string[];      // nombres, ya resueltas por la tabla de mapeo
  email?: string;                  // opcional: si viene, se envía el correo al terminar
}

interface InputReenviarEmail {
  accion: "reenviar_email";
  sesion_id: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Cliente Supabase (service role — esta función corre en el backend)
// ---------------------------------------------------------------------------

function obtenerClienteSupabase(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Variables de entorno de Supabase no configuradas");
  return createClient(url, serviceKey);
}

// ---------------------------------------------------------------------------
// Prompt fijo
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un asistente de orientación vocacional para estudiantes colombianos de bachillerato. Tu única función es interpretar datos que ya fueron calculados y filtrados por un sistema determinístico, y redactar una explicación clara, honesta y personalizada para el estudiante.

REGLAS ESTRICTAS — no negociables:

1. NUNCA inventes ni modifiques costos, universidades, becas o programas de ayuda financiera. Usa exclusivamente los datos en "universidades_filtradas". Algunas universidades tienen costo fijo, otras varían por estrato (cita el valor del estrato correspondiente tal como aparece, nunca un promedio inventado), y otras están cubiertas por Matrícula Cero (dilo explícitamente, no muestres cifra).

2. NUNCA sugieras una universidad que no esté en la lista "universidades_filtradas". Esa lista ya fue filtrada por presupuesto real del estudiante — agregar otra opción rompe la garantía de accesibilidad financiera que ofrece la plataforma.

3. NUNCA cambies ni reinterpretes las "areas_candidatas". Esas áreas ya fueron determinadas por una tabla de mapeo fija a partir del perfil de dimensiones. Tu trabajo es explicar POR QUÉ esas áreas tienen sentido dado el perfil, no elegir otras.

4. Usa las "respuestas_abiertas" del estudiante para personalizar y dar ejemplos concretos — cita o parafrasea lo que el estudiante escribió cuando conecte con un área candidata. Si una respuesta abierta NO conecta claramente con ninguna área candidata, dilo explícitamente en vez de forzar una conexión artificial.

5. Si "es_perfil_disperso" es true, comunica esto honestamente: explica que su perfil no muestra una inclinación dominante clara, que esto no es un problema sino información válida, y que puede significar intereses amplios o exploración en curso — no fuerces una narrativa de claridad que los datos no respaldan.

6. Incluye siempre, al final, un recordatorio de que: (a) este no es un test psicométrico certificado, es una herramienta de orientación inicial, y (b) los datos de costos y ayudas financieras deben confirmarse en la fuente oficial de cada universidad antes de tomar cualquier decisión.

7. Tono: directo, cálido pero no condescendiente, sin frases de relleno de IA ("profundicemos", "exploremos juntos"). Escribe como alguien que respeta la inteligencia del estudiante y no le vende nada.

8. Extensión: máximo 300-400 palabras.

FORMATO DE SALIDA (JSON, exactamente estas 4 claves, sin texto fuera del JSON):
{
  "resumen_perfil": "1-2 frases sobre lo que muestra su perfil",
  "explicacion_areas": "conexión entre perfil + respuestas abiertas + áreas candidatas",
  "nota_respuestas_no_conectadas": "string o null si todas conectaron",
  "disclaimer": "el recordatorio del punto 6"
}`;

function formatearCosto(u: Universidad): string {
  if (u.costo.tipo === "matricula_cero") return "cubierto por Matrícula Cero (gratuito para estratos 1-3 / Sisbén A-C)";
  if (u.costo.tipo === "fijo") return `$${u.costo.valor.toLocaleString("es-CO")} por semestre`;
  const valores = u.costo.valores.map((v) => `estrato ${v.estrato}: $${v.costo.toLocaleString("es-CO")}`);
  return `variable por estrato (${valores.join(", ")})`;
}

// ---------------------------------------------------------------------------
// Datos autoritativos desde Supabase (nunca se confía en lo que manda el cliente)
// ---------------------------------------------------------------------------

async function obtenerUniversidadesPorIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Universidad[]> {
  if (ids.length === 0) return [];

  const { data: filas, error } = await supabase
    .from("universidades")
    .select("id, nombre, tipo_costo, costo_fijo, ayuda_financiera, fuente, costos_por_estrato(estrato, costo)")
    .in("id", ids);

  if (error) throw new Error(`Error consultando universidades: ${error.message}`);

  return (filas ?? []).map((fila: Record<string, unknown>) => {
    let costo: Costo;
    if (fila.tipo_costo === "fijo") {
      costo = { tipo: "fijo", valor: Number(fila.costo_fijo) };
    } else if (fila.tipo_costo === "matricula_cero") {
      costo = { tipo: "matricula_cero" };
    } else {
      const valores = (fila.costos_por_estrato as { estrato: number; costo: number }[] | null) ?? [];
      costo = { tipo: "variable_estrato", valores };
    }

    return {
      id: fila.id as string,
      nombre: fila.nombre as string,
      costo,
      ayuda_financiera: fila.ayuda_financiera as string | null,
      fuente: fila.fuente as string,
    };
  });
}

async function obtenerRespuestasAbiertas(
  supabase: SupabaseClient,
  sesionId: string,
): Promise<{ pregunta: string; respuesta: string }[]> {
  const { data, error } = await supabase
    .from("respuestas_abiertas")
    .select("respuesta, preguntas_abiertas(texto, orden)")
    .eq("sesion_id", sesionId)
    .order("preguntas_abiertas(orden)");

  if (error) throw new Error(`Error consultando respuestas abiertas: ${error.message}`);

  return (data ?? []).map((fila: Record<string, unknown>) => ({
    pregunta: (fila.preguntas_abiertas as { texto: string }).texto,
    respuesta: fila.respuesta as string,
  }));
}

const TTL_CACHE_MS = 5 * 60 * 1000;
let cacheCatalogos: { universidades: string[]; areas: string[]; cargadoEn: number } | null = null;

async function obtenerCatalogos(supabase: SupabaseClient): Promise<{ universidades: string[]; areas: string[] }> {
  const ahora = Date.now();
  if (cacheCatalogos && ahora - cacheCatalogos.cargadoEn < TTL_CACHE_MS) return cacheCatalogos;

  const [{ data: universidades, error: e1 }, { data: areas, error: e2 }] = await Promise.all([
    supabase.from("universidades").select("nombre"),
    supabase.from("areas_carrera").select("nombre"),
  ]);

  if (e1 || e2) {
    if (cacheCatalogos) {
      console.error("Fallo al refrescar catálogos, usando caché vencido:", e1, e2);
      return cacheCatalogos;
    }
    throw new Error("No se pudieron cargar los catálogos de universidades/áreas");
  }

  cacheCatalogos = {
    universidades: (universidades ?? []).map((u: { nombre: string }) => u.nombre),
    areas: (areas ?? []).map((a: { nombre: string }) => a.nombre),
    cargadoEn: ahora,
  };
  return cacheCatalogos;
}

// ---------------------------------------------------------------------------
// Llamada al modelo
// ---------------------------------------------------------------------------

function construirUserPrompt(
  perfil_dimensiones: string[],
  es_perfil_disperso: boolean,
  areas_candidatas: string[],
  universidades: Universidad[],
  respuestas_abiertas: { pregunta: string; respuesta: string }[],
): string {
  const universidadesTexto = universidades
    .map((u) => `- ${u.nombre}: ${formatearCosto(u)}. Ayuda financiera: ${u.ayuda_financiera ?? "no especificada"}.`)
    .join("\n");

  return `Perfil de dimensiones del estudiante: ${perfil_dimensiones.join(", ")}
¿Perfil disperso?: ${es_perfil_disperso}
Áreas de carrera candidatas (ya determinadas, no cambiar): ${areas_candidatas.join(", ")}
Universidades disponibles según su presupuesto (ya filtradas, no cambiar):
${universidadesTexto}

Respuestas abiertas del estudiante:
${respuestas_abiertas.map((r) => `- ${r.pregunta}: ${r.respuesta}`).join("\n")}

Genera la interpretación siguiendo exactamente las reglas del system prompt y el formato JSON especificado.`;
}

async function llamarModelo(userPrompt: string, temperature: number): Promise<unknown> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      temperature,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) throw new Error(`Llamada al modelo falló: ${response.status}`);

  const data = await response.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("Respuesta del modelo sin bloque de texto");

  const limpio = textBlock.text.replace(/```json|```/g, "").trim();
  return JSON.parse(limpio);
}

// ---------------------------------------------------------------------------
// Validación programática
// ---------------------------------------------------------------------------

function extraerCifrasValidas(u: Universidad): string[] {
  if (u.costo.tipo === "fijo") return [u.costo.valor.toLocaleString("es-CO")];
  if (u.costo.tipo === "variable_estrato") return u.costo.valores.map((v) => v.costo.toLocaleString("es-CO"));
  return [];
}

function validarRespuestaIA(
  raw: unknown,
  universidadesFiltradas: Universidad[],
  areasCandidatas: string[],
  catalogos: { universidades: string[]; areas: string[] },
): { valido: true; data: RespuestaIA } | { valido: false; razon: string } {
  if (typeof raw !== "object" || raw === null) return { valido: false, razon: "La respuesta no es un objeto JSON" };

  const r = raw as Record<string, unknown>;
  const claves = ["resumen_perfil", "explicacion_areas", "nota_respuestas_no_conectadas", "disclaimer"];
  for (const clave of claves) {
    if (!(clave in r)) return { valido: false, razon: `Falta la clave requerida: ${clave}` };
  }

  if (
    typeof r.resumen_perfil !== "string" ||
    typeof r.explicacion_areas !== "string" ||
    typeof r.disclaimer !== "string" ||
    (r.nota_respuestas_no_conectadas !== null && typeof r.nota_respuestas_no_conectadas !== "string")
  ) {
    return { valido: false, razon: "Tipos de dato incorrectos en una o más claves" };
  }

  if (r.resumen_perfil.trim() === "" || r.explicacion_areas.trim() === "" || r.disclaimer.trim() === "") {
    return { valido: false, razon: "Una o más claves de texto están vacías" };
  }

  const textoCompleto = `${r.resumen_perfil} ${r.explicacion_areas} ${r.nota_respuestas_no_conectadas ?? ""}`;

  const nombresPermitidos = new Set(universidadesFiltradas.map((u) => u.nombre));
  for (const nombre of catalogos.universidades) {
    if (textoCompleto.includes(nombre) && !nombresPermitidos.has(nombre)) {
      return { valido: false, razon: `Mencionó una universidad fuera de la lista filtrada: ${nombre}` };
    }
  }

  const todasLasCifrasValidas = new Set(
    universidadesFiltradas.flatMap((u) => extraerCifrasValidas(u)).map((c) => c.replace(/[.,]/g, "")),
  );
  const cifrasEncontradas = textoCompleto.match(/\$\s?[\d.,]{4,}/g) ?? [];
  for (const cifra of cifrasEncontradas) {
    const normalizada = cifra.replace(/[$\s.,]/g, "");
    if (!todasLasCifrasValidas.has(normalizada)) {
      return { valido: false, razon: `Mencionó una cifra de costo no verificable: ${cifra}` };
    }
  }

  for (const u of universidadesFiltradas) {
    if (u.costo.tipo !== "matricula_cero") continue;
    const idx = textoCompleto.indexOf(u.nombre);
    if (idx === -1) continue;
    const ventana = textoCompleto.slice(idx, idx + u.nombre.length + 80);
    if (/\$\s?[\d.,]{4,}/.test(ventana)) {
      return { valido: false, razon: `Citó una cifra de costo junto a ${u.nombre}, que es Matrícula Cero` };
    }
  }

  for (const area of catalogos.areas) {
    if (textoCompleto.includes(area) && !areasCandidatas.includes(area)) {
      return { valido: false, razon: `Mencionó un área de carrera no candidata: ${area}` };
    }
  }

  return { valido: true, data: r as unknown as RespuestaIA };
}

function generarFallback(
  perfil_dimensiones: string[],
  es_perfil_disperso: boolean,
  areas_candidatas: string[],
  universidades: Universidad[],
): ResultadoFinal {
  const listaUniversidades = universidades.map((u) => `${u.nombre} (${formatearCosto(u)})`).join(", ");

  return {
    fuente: "fallback",
    resumen_perfil: es_perfil_disperso
      ? `Tu perfil combina varias dimensiones (${perfil_dimensiones.join(", ")}) sin una inclinación dominante clara.`
      : `Tu perfil muestra mayor afinidad con: ${perfil_dimensiones.join(" y ")}.`,
    explicacion_areas: `Con base en tu perfil, las áreas de carrera que mejor se ajustan son: ${areas_candidatas.join(", ")}. Las universidades a tu alcance según tu presupuesto son: ${listaUniversidades || "ninguna dentro de los filtros actuales"}.`,
    nota_respuestas_no_conectadas: null,
    disclaimer: "Este resultado se generó con el motor determinístico (sin interpretación de IA) porque la capa de validación no pudo confirmar la respuesta generada. Este no es un test psicométrico certificado — es una herramienta de orientación inicial. Confirma siempre los datos de costos y ayudas financieras en la fuente oficial de cada universidad.",
  };
}

// ---------------------------------------------------------------------------
// Envío de email (Resend). Requiere RESEND_API_KEY y EMAIL_REMITENTE en env.
// ---------------------------------------------------------------------------

async function enviarEmailResultado(
  destinatario: string,
  resultado: ResultadoFinal,
  areasCandidatas: string[],
  universidades: Universidad[],
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const remitente = Deno.env.get("EMAIL_REMITENTE");
  if (!apiKey || !remitente) throw new Error("Configuración de email no disponible (RESEND_API_KEY/EMAIL_REMITENTE)");

  const listaUniversidadesHtml = universidades
    .map((u) => `<li>${u.nombre} — ${formatearCosto(u)}</li>`)
    .join("");

  const html = `
    <h2>Tu resultado de orientación vocacional</h2>
    <p>${resultado.resumen_perfil}</p>
    <h3>Áreas de carrera sugeridas</h3>
    <p>${areasCandidatas.join(", ")}</p>
    <p>${resultado.explicacion_areas}</p>
    ${resultado.nota_respuestas_no_conectadas ? `<p>${resultado.nota_respuestas_no_conectadas}</p>` : ""}
    <h3>Universidades a tu alcance</h3>
    <ul>${listaUniversidadesHtml}</ul>
    <p><small>${resultado.disclaimer}</small></p>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: remitente,
      to: destinatario,
      subject: "Tu resultado de orientación vocacional",
      html,
    }),
  });

  if (!response.ok) throw new Error(`Envío de email falló: ${response.status}`);
}

// ---------------------------------------------------------------------------
// Orquestación principal: generar resultado
// ---------------------------------------------------------------------------

async function generarYGuardarResultado(
  supabase: SupabaseClient,
  input: InputGenerar,
): Promise<ResultadoFinal> {
  const [universidades, respuestasAbiertas, catalogos] = await Promise.all([
    obtenerUniversidadesPorIds(supabase, input.universidad_ids),
    obtenerRespuestasAbiertas(supabase, input.sesion_id),
    obtenerCatalogos(supabase).catch((err) => {
      console.error("Fallo cargando catálogos:", err);
      return null;
    }),
  ]);

  let resultado: ResultadoFinal;

  if (!catalogos) {
    resultado = generarFallback(input.perfil_dimensiones, input.es_perfil_disperso, input.areas_candidatas, universidades);
  } else {
    resultado = await (async () => {
      const userPrompt = construirUserPrompt(
        input.perfil_dimensiones, input.es_perfil_disperso, input.areas_candidatas, universidades, respuestasAbiertas,
      );

      for (const temperature of [0.7, 0.2]) {
        try {
          const raw = await llamarModelo(userPrompt, temperature);
          const validacion = validarRespuestaIA(raw, universidades, input.areas_candidatas, catalogos);
          if (validacion.valido) {
            return {
              fuente: "ia" as const,
              resumen_perfil: validacion.data.resumen_perfil,
              explicacion_areas: validacion.data.explicacion_areas,
              nota_respuestas_no_conectadas: validacion.data.nota_respuestas_no_conectadas,
              disclaimer: validacion.data.disclaimer,
            };
          }
          console.warn(`Validación falló (temp=${temperature}): ${validacion.razon}`);
        } catch (err) {
          console.error(`Error en llamada al modelo (temp=${temperature}):`, err);
        }
      }
      return generarFallback(input.perfil_dimensiones, input.es_perfil_disperso, input.areas_candidatas, universidades);
    })();
  }

  // Guardar snapshot en `resultados` y marcar la sesión como completada.
  const { error: errorInsert } = await supabase.from("resultados").insert({
    sesion_id: input.sesion_id,
    perfil_dimensiones: input.perfil_dimensiones,
    es_perfil_disperso: input.es_perfil_disperso,
    areas_candidatas: input.areas_candidatas,
    universidades_filtradas: universidades,
    fuente_interpretacion: resultado.fuente,
    resumen_perfil: resultado.resumen_perfil,
    explicacion_areas: resultado.explicacion_areas,
    nota_respuestas_no_conectadas: resultado.nota_respuestas_no_conectadas,
    disclaimer: resultado.disclaimer,
  });
  if (errorInsert) console.error("Error guardando resultado:", errorInsert);

  await supabase.from("sesiones_test").update({ completado: true }).eq("id", input.sesion_id);

  // Envío de email si el estudiante lo pidió al momento de generar el resultado.
  if (input.email) {
    try {
      await enviarEmailResultado(input.email, resultado, input.areas_candidatas, universidades);
      await supabase
        .from("sesiones_test")
        .update({ email: input.email, email_enviado: true, email_enviado_en: new Date().toISOString() })
        .eq("id", input.sesion_id);
    } catch (err) {
      console.error("Error enviando email:", err);
      // No se revierte el resultado ya generado — el envío de email es best-effort,
      // no debe bloquear que el estudiante vea su resultado en pantalla.
      await supabase.from("sesiones_test").update({ email: input.email }).eq("id", input.sesion_id);
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Orquestación: reenviar email de un resultado ya guardado
// ---------------------------------------------------------------------------

async function reenviarEmail(supabase: SupabaseClient, input: InputReenviarEmail): Promise<void> {
  const { data: resultadoGuardado, error } = await supabase
    .from("resultados")
    .select("resumen_perfil, explicacion_areas, nota_respuestas_no_conectadas, disclaimer, areas_candidatas, universidades_filtradas, fuente_interpretacion")
    .eq("sesion_id", input.sesion_id)
    .single();

  if (error || !resultadoGuardado) throw new Error("No se encontró un resultado guardado para esta sesión");

  const resultado: ResultadoFinal = {
    fuente: resultadoGuardado.fuente_interpretacion,
    resumen_perfil: resultadoGuardado.resumen_perfil,
    explicacion_areas: resultadoGuardado.explicacion_areas,
    nota_respuestas_no_conectadas: resultadoGuardado.nota_respuestas_no_conectadas,
    disclaimer: resultadoGuardado.disclaimer,
  };

  await enviarEmailResultado(
    input.email,
    resultado,
    resultadoGuardado.areas_candidatas,
    resultadoGuardado.universidades_filtradas as Universidad[],
  );

  await supabase
    .from("sesiones_test")
    .update({ email: input.email, email_enviado: true, email_enviado_en: new Date().toISOString() })
    .eq("id", input.sesion_id);
}

// ---------------------------------------------------------------------------
// Handler HTTP
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: InputGenerar | InputReenviarEmail;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON de entrada inválido" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = obtenerClienteSupabase();

  try {
    if (body.accion === "generar_resultado") {
      const camposRequeridos: (keyof InputGenerar)[] = [
        "sesion_id", "universidad_ids", "perfil_dimensiones", "es_perfil_disperso", "areas_candidatas",
      ];
      for (const campo of camposRequeridos) {
        if (!(campo in body)) {
          return new Response(JSON.stringify({ error: `Falta campo: ${campo}` }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }
      }
      const resultado = await generarYGuardarResultado(supabase, body);
      return new Response(JSON.stringify(resultado), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (body.accion === "reenviar_email") {
      if (!body.sesion_id || !body.email) {
        return new Response(JSON.stringify({ error: "Faltan sesion_id o email" }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      await reenviarEmail(supabase, body);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Acción no reconocida" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("Error no manejado:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
});
