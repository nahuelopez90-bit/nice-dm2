"use client";

import React, { useMemo, useState } from "react";

type Comorbidity =
  | "none"
  | "ascvd"
  | "hf"
  | "ckd"
  | "obesity"
  | "earlyOnset"
  | "frailty";

type Mode = "nice_puro" | "nice_combinado";

type EgfrBand = "gt30" | "20to30" | "lt20" | "unknown";

type Recommendation = {
  scenario: Comorbidity | "combined";
  title: string;
  initial: string[]; // "baseline" / must-have
  addOns?: string[]; // add-ons
  ifMetforminNotSuitable?: string[];
  escalationIfNeeded: string[];
  notes?: string[];
  contraindications?: string[];
  conflicts?: string[];
};

const COLORS = {
  bg: "#f3f4f6",
  cardBorder: "#e5e7eb",
  cardBg: "#ffffff",
  text: "#1f2937", // negro suave
  textSoft: "#374151",
  blue: "#1d4ed8",
  warnBorder: "#fde68a",
  warnBg: "#fffbeb",
  warnText: "#92400e",
  errBorder: "#fecaca",
  errBg: "#fef2f2",
  errText: "#7f1d1d",
  badgeBg: "#f9fafb",
  dark: "#111827",
};

function classLabel(c: Comorbidity) {
  switch (c) {
    case "none":
      return "Sin comorbilidad relevante";
    case "ascvd":
      return "ASCVD";
    case "hf":
      return "Insuficiencia cardíaca (cualquier FE)";
    case "ckd":
      return "Enfermedad renal crónica (ERC)";
    case "obesity":
      return "Obesidad";
    case "earlyOnset":
      return "Early onset (<40 años)";
    case "frailty":
      return "Fragilidad";
  }
}

function computeEgfrBand(eGFR: string): EgfrBand {
  const v = Number(eGFR);
  if (!Number.isFinite(v)) return "unknown";
  if (v > 30) return "gt30";
  if (v >= 20 && v <= 30) return "20to30";
  return "lt20";
}

function uniqKeepOrder(arr: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = x.trim();
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function hasScenario(selected: Comorbidity[], s: Comorbidity) {
  return selected.includes(s);
}

/**
 * Reglas NICE "por fila" (como antes).
 * Nota: No usamos moléculas salvo semaglutide SC para ASCVD (tal como en el resumen NICE).
 */
function buildRecommendationRow(
  scenario: Comorbidity,
  opts: {
    metforminNotSuitable: boolean;
    egfrBand: EgfrBand;
    needsIntensification: boolean;
    hyperglySymptoms: boolean;
    comorbiditiesSelected: Comorbidity[];
  }
): Recommendation {
  const { metforminNotSuitable, egfrBand, needsIntensification } = opts;

  const baseGuardrails: string[] = [
    "No combinar GLP-1 RA o tirzepatide con un inhibidor DPP-4.",
    "Considerar continuar iSGLT2 por beneficio CV/renal aun si no logra el objetivo glucémico.",
    "Escalonar secuencialmente y confirmar dosis máxima tolerada antes de pasar al siguiente paso.",
  ];

  const hyperglyNote = opts.hyperglySymptoms
    ? [
        "Síntomas de hiperglucemia: considerar tratamiento con insulina o sulfonilurea; revisar cuando la glucemia esté en objetivo.",
      ]
    : [];

  const escalate = (steps: string[]) =>
    needsIntensification ? steps : ["(No solicitado)"];

  let rec: Recommendation = {
    scenario,
    title: classLabel(scenario),
    initial: [],
    ifMetforminNotSuitable: [],
    escalationIfNeeded: [],
    notes: [...hyperglyNote],
    contraindications: [],
  };

  switch (scenario) {
    case "none": {
      rec.initial = ["Metformina (liberación modificada) + iSGLT2"];
      rec.ifMetforminNotSuitable = ["iSGLT2 en monoterapia"];
      rec.escalationIfNeeded = escalate([
        "Agregar inhibidor DPP-4",
        "Si DPP-4 no es adecuado/efectivo: ofrecer sulfonilurea o pioglitazona o tratamiento basado en insulina",
      ]);
      rec.notes = [...(rec.notes ?? []), ...baseGuardrails];
      break;
    }

    case "hf": {
      rec.initial = ["Metformina (liberación modificada) + iSGLT2"];
      rec.ifMetforminNotSuitable = ["iSGLT2 en monoterapia"];
      rec.escalationIfNeeded = escalate([
        "Agregar inhibidor DPP-4",
        "Si DPP-4 no es adecuado/efectivo: ofrecer sulfonilurea o tratamiento basado en insulina",
      ]);
      rec.contraindications = [
        "Pioglitazona: contraindicada en insuficiencia cardíaca.",
      ];
      rec.notes = [...(rec.notes ?? []), ...baseGuardrails];
      break;
    }

    case "ascvd": {
      rec.initial = [
        "Metformina (liberación modificada) + iSGLT2 + semaglutide subcutánea (GLP-1 RA)",
      ];
      rec.ifMetforminNotSuitable = [
        "iSGLT2 + semaglutide subcutánea (GLP-1 RA)",
      ];
      rec.escalationIfNeeded = escalate([
        "Agregar sulfonilurea o pioglitazona o tratamiento basado en insulina",
      ]);
      rec.notes = [
        ...(rec.notes ?? []),
        "ASCVD: NICE destaca semaglutide SC por beneficios cardiovasculares/renales además del control glucémico.",
        ...baseGuardrails,
      ];
      break;
    }

    case "ckd": {
      if (egfrBand === "unknown") {
        rec.initial = ["(Falta eGFR) Ingresá eGFR para aplicar el algoritmo de ERC."];
        rec.escalationIfNeeded = ["(Pendiente eGFR)"];
        rec.notes = [...(rec.notes ?? []), ...baseGuardrails];
        break;
      }

      if (egfrBand === "gt30") {
        rec.initial = ["Metformina (liberación modificada) + iSGLT2"];
        rec.ifMetforminNotSuitable = ["iSGLT2 en monoterapia"];
        rec.escalationIfNeeded = escalate([
          "Considerar agregar inhibidor DPP-4 (si no se usó)",
          "Si DPP-4 no es adecuado/efectivo o ya está: considerar pioglitazona o sulfonilurea (solo si eGFR >30) o tratamiento basado en insulina",
        ]);
      } else if (egfrBand === "20to30") {
        rec.initial = ["Inhibidor DPP-4 + (dapagliflozin o empagliflozin)"];
        rec.ifMetforminNotSuitable = [
          "Metformina suele no ser adecuada en eGFR <30: seguir rama ERC 20–30.",
        ];
        rec.escalationIfNeeded = escalate([
          "Si se requiere más control: considerar pioglitazona o insulina según tolerancia y contexto",
        ]);
      } else {
        rec.initial = ["Considerar inhibidor DPP-4 (eGFR <20)"];
        rec.ifMetforminNotSuitable = [
          "Metformina suele no ser adecuada en eGFR muy bajo: seguir rama ERC <20.",
        ];
        rec.escalationIfNeeded = escalate([
          "Si DPP-4 no es adecuado/efectivo: considerar pioglitazona o tratamiento basado en insulina",
        ]);
      }

      rec.notes = [
        ...(rec.notes ?? []),
        "ERC: el algoritmo cambia según eGFR (>30; 20–30; <20).",
        ...baseGuardrails,
      ];
      break;
    }

    case "obesity": {
      rec.initial = ["Metformina (liberación modificada) + iSGLT2"];
      rec.ifMetforminNotSuitable = ["iSGLT2 en monoterapia"];
      rec.escalationIfNeeded = needsIntensification
        ? [
            "Si el tratamiento inicial comenzó hace ≥3 meses: considerar agregar GLP-1 RA o tirzepatide",
            "Si GLP-1/tirzepatide no es adecuado/efectivo: agregar inhibidor DPP-4",
            "Si DPP-4 no es adecuado/efectivo: ofrecer sulfonilurea o pioglitazona o tratamiento basado en insulina",
          ]
        : ["(No solicitado)"];
      rec.notes = [...(rec.notes ?? []), ...baseGuardrails];
      break;
    }

    case "earlyOnset": {
      rec.initial = ["Metformina (liberación modificada) + iSGLT2"];
      rec.ifMetforminNotSuitable = ["iSGLT2 (monoterapia)"];
      rec.escalationIfNeeded = needsIntensification
        ? [
            "Considerar agregar GLP-1 RA o tirzepatide",
            "Si ya está con GLP-1/tirzepatide y requiere más: agregar sulfonilurea o pioglitazona o tratamiento basado en insulina",
            "Si GLP-1/tirzepatide no es adecuado: agregar inhibidor DPP-4",
          ]
        : ["(No solicitado)"];
      rec.notes = [
        ...(rec.notes ?? []),
        "Early onset: NICE propone considerar GLP-1 RA o tirzepatide tempranamente, además de metformina + iSGLT2.",
        ...baseGuardrails,
      ];
      break;
    }

    case "frailty": {
      rec.initial = ["Metformina (liberación modificada)"];
      rec.ifMetforminNotSuitable = [
        "Considerar iSGLT2 en monoterapia; si riesgo de eventos adversos (p. ej., hipotensión), considerar inhibidor DPP-4.",
      ];
      rec.escalationIfNeeded = needsIntensification
        ? [
            "Considerar agregar inhibidor DPP-4 (si no se usó)",
            "Si DPP-4 no es adecuado/efectivo o ya está: considerar pioglitazona o sulfonilurea o tratamiento basado en insulina",
            "Tener en cuenta riesgo de hipoglucemia y caídas con sulfonilureas e insulina.",
          ]
        : ["(No solicitado)"];
      rec.notes = [
        ...(rec.notes ?? []),
        "Fragilidad: solo agregar iSGLT2 a metformina si la fragilidad NO lo coloca en riesgo de eventos adversos (p. ej., hipotensión).",
        ...baseGuardrails,
      ];
      break;
    }
  }

  if (metforminNotSuitable) {
    if (rec.ifMetforminNotSuitable && rec.ifMetforminNotSuitable.length > 0) {
      rec.notes = [
        ...(rec.notes ?? []),
        "Metformina no adecuada: aplicando rama NICE sin metformina.",
      ];
    }
  }

  return rec;
}

/**
 * Motor "NICE combinado" (cruzar comorbilidades).
 * No reemplaza NICE: integra filas con reglas explícitas y muestra conflictos.
 */
function buildCombinedRecommendation(opts: {
  metforminNotSuitable: boolean;
  egfrBand: EgfrBand;
  needsIntensification: boolean;
  hyperglySymptoms: boolean;
  comorbiditiesSelected: Comorbidity[]; // incluye "none" si vacío
}): Recommendation {
  const {
    metforminNotSuitable,
    egfrBand,
    needsIntensification,
    hyperglySymptoms,
    comorbiditiesSelected,
  } = opts;

const selected = comorbiditiesSelected.filter(
  (c): c is Exclude<Comorbidity, "none"> => c !== "none"
);
const has = (c: Exclude<Comorbidity, "none">) => selected.includes(c);

  const notes: string[] = [];
  const conflicts: string[] = [];
  const contraindications: string[] = [];
  const base: string[] = [];
  const addOns: string[] = [];
  let ifNoMetformin: string[] = [];

  // Guardrails universales
  notes.push("Reglas de combinación: ERC define baseline por eGFR; IC obliga iSGLT2 y bloquea pioglitazona; ASCVD agrega GLP-1 RA (semaglutida SC); obesidad/early onset agregan considerar GLP-1 RA/tirzepatida; fragilidad agrega alertas de tolerancia.");
  notes.push("Guardrails: no GLP-1 RA/tirzepatida + DPP-4; considerar continuar iSGLT2 por beneficio CV/renal; escalamiento secuencial.");

  if (hyperglySymptoms) {
    notes.unshift(
      "Síntomas de hiperglucemia: considerar insulina o sulfonilurea; revisar cuando esté en objetivo."
    );
  }

  // 1) Baseline: si hay ERC, manda su fila por eGFR
  if (has("ckd")) {
    if (egfrBand === "unknown") {
      base.push("(Falta eGFR) Ingresá eGFR para aplicar el algoritmo de ERC.");
      conflicts.push("ERC seleccionada pero eGFR no está disponible.");
    } else if (egfrBand === "gt30") {
      base.push("Metformina (liberación modificada) + iSGLT2");
      ifNoMetformin = ["iSGLT2 en monoterapia"];
      notes.push("ERC: usando rama eGFR >30.");
    } else if (egfrBand === "20to30") {
      base.push("Inhibidor DPP-4 + (dapagliflozin o empagliflozin)");
      ifNoMetformin = ["Metformina suele no ser adecuada en eGFR <30: seguir rama ERC 20–30."];
      notes.push("ERC: usando rama eGFR 20–30.");
    } else {
      base.push("Considerar inhibidor DPP-4 (eGFR <20)");
      ifNoMetformin = ["Metformina suele no ser adecuada en eGFR muy bajo: seguir rama ERC <20."];
      notes.push("ERC: usando rama eGFR <20.");
    }
  } else {
    // Si NO hay ERC, baseline general (NICE muchas filas arrancan con Metformina MR + iSGLT2)
    // Pero fragilidad tiene baseline distinto.
    if (has("frailty")) {
      base.push("Metformina (liberación modificada)");
      ifNoMetformin = [
        "Considerar iSGLT2 en monoterapia; si riesgo de eventos adversos (p. ej., hipotensión), considerar inhibidor DPP-4.",
      ];
    } else {
      base.push("Metformina (liberación modificada) + iSGLT2");
      ifNoMetformin = ["iSGLT2 en monoterapia"];
    }
  }

  // 2) IC: obliga iSGLT2 y bloquea pioglitazona
  if (has("hf")) {
    // aseguramos que iSGLT2 esté presente en base o add-on
    const hasSglt2InBase = base.some((x) => x.toLowerCase().includes("isglt2"));
    const hasSglt2InAdd = addOns.some((x) => x.toLowerCase().includes("isglt2"));
    if (!hasSglt2InBase && !hasSglt2InAdd) {
      addOns.push("Asegurar iSGLT2 (por insuficiencia cardíaca)");
    }
    contraindications.push("Pioglitazona: contraindicada en insuficiencia cardíaca.");
  }

  // 3) ASCVD: agrega GLP-1 RA (semaglutida SC) además del baseline si corresponde
  if (has("ascvd")) {
    addOns.push("Agregar GLP-1 RA: semaglutide subcutánea (según NICE en ASCVD)");
  }

  // 4) Obesidad / Early onset: considerar GLP-1 RA o tirzepatida (si no está ya por ASCVD)
  if (has("obesity") || has("earlyOnset")) {
    if (!has("ascvd")) {
      addOns.push("Considerar GLP-1 RA o tirzepatide (según escenario obesidad/early onset)");
    } else {
      notes.push("Obesidad/early onset presentes: GLP-1 RA ya cubierto por ASCVD; considerar tirzepatide según contexto si corresponde.");
    }
  }

  // 5) Fragilidad: alertas de tolerancia (no anula CV/renal, pero exige cuidado)
  if (has("frailty")) {
    notes.push("Fragilidad: evaluar riesgo de hipotensión/caídas e hipoglucemia; ser conservador con sulfonilureas/insulina.");
    // Si baseline no tenía iSGLT2 y aparece por IC/ASCVD, avisamos cautela
    if (addOns.some((x) => x.toLowerCase().includes("isglt2"))) {
      conflicts.push("Fragilidad + iSGLT2: considerar tolerancia (hipotensión/volumen).");
    }
  }

  // 6) Guardrail: no GLP-1/tirzepatide + DPP-4
  // Si ERC 20–30 o <20 tiene DPP-4 en baseline y agregamos GLP-1, avisar.
  const baselineHasDpp4 = base.some((x) => x.toLowerCase().includes("dpp-4"));
  const addingGlp1 = addOns.some((x) => x.toLowerCase().includes("glp"));
  if (baselineHasDpp4 && addingGlp1) {
    conflicts.push("Baseline incluye DPP-4 y se sugiere GLP-1: NO combinar GLP-1 RA/tirzepatide con DPP-4. Requiere elección clínica.");
  }

  // Metformina no adecuada: aplicar rama sin metformina cuando exista
  if (metforminNotSuitable) {
    notes.push("Metformina no adecuada: aplicando rama sin metformina cuando corresponde.");
  }

  // Escalamiento integrado (con bloqueo de pioglitazona si HF)
  const escalation: string[] = [];
  if (!needsIntensification) {
    escalation.push("(No solicitado)");
  } else {
    // Estrategia: proponer escalones compatibles con los escenarios presentes.
    // 1) Si no hay DPP-4 y no hay GLP-1, DPP-4 suele ser un escalón frecuente (salvo cuando ya es baseline por CKD 20–30).
    if (!baselineHasDpp4 && !addingGlp1) {
      escalation.push("Agregar inhibidor DPP-4 (si no se usó)");
    } else if (!baselineHasDpp4 && addingGlp1) {
      escalation.push("Si se usa GLP-1 RA/tirzepatide, evitar sumar DPP-4 (guardrail).");
    }

    // 2) Opciones finales
    if (has("hf")) {
      escalation.push("Si requiere más control: ofrecer sulfonilurea o tratamiento basado en insulina (evitar pioglitazona por IC).");
    } else {
      escalation.push("Si requiere más control: ofrecer sulfonilurea o pioglitazona o tratamiento basado en insulina.");
    }

    // 3) CKD eGFR rules extras
    if (has("ckd") && egfrBand === "gt30") {
      escalation.push("ERC eGFR >30: sulfonilurea solo si eGFR >30 (según rama renal).");
    }
  }

  return {
    scenario: "combined",
    title: "NICE combinado (integración de comorbilidades)",
    initial: uniqKeepOrder(base),
    addOns: uniqKeepOrder(addOns),
    ifMetforminNotSuitable: metforminNotSuitable ? uniqKeepOrder(ifNoMetformin) : undefined,
    escalationIfNeeded: uniqKeepOrder(escalation),
    notes: uniqKeepOrder(notes),
    contraindications: uniqKeepOrder(contraindications),
    conflicts: uniqKeepOrder(conflicts),
  };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        background: COLORS.cardBg,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10, color: COLORS.blue }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 12,
        marginRight: 8,
        marginBottom: 8,
        background: COLORS.badgeBg,
        fontWeight: 800,
        color: COLORS.text,
      }}
    >
      {text}
    </span>
  );
}

export default function Page() {
  const [mode, setMode] = useState<Mode>("nice_combinado");

  const [hypergly, setHypergly] = useState(false);
  const [metforminNotSuitable, setMetforminNotSuitable] = useState(false);
  const [needsIntensification, setNeedsIntensification] = useState(false);

  const [ckdSelected, setCkdSelected] = useState(false);
  const [egfr, setEgfr] = useState("");

  const [ascvd, setAscvd] = useState(false);
  const [hf, setHf] = useState(false);
  const [obesity, setObesity] = useState(false);
  const [earlyOnset, setEarlyOnset] = useState(false);
  const [frailty, setFrailty] = useState(false);

  const comorbiditiesSelected = useMemo<Comorbidity[]>(() => {
    const list: Comorbidity[] = [];
    if (ascvd) list.push("ascvd");
    if (hf) list.push("hf");
    if (ckdSelected) list.push("ckd");
    if (obesity) list.push("obesity");
    if (earlyOnset) list.push("earlyOnset");
    if (frailty) list.push("frailty");
    if (list.length === 0) list.push("none");
    return list;
  }, [ascvd, hf, ckdSelected, obesity, earlyOnset, frailty]);

  const egfrBand = useMemo(() => computeEgfrBand(egfr), [egfr]);

  const multiCount = useMemo(
    () => comorbiditiesSelected.filter((c) => c !== "none").length,
    [comorbiditiesSelected]
  );

  // NICE puro: si multimorbilidad, requerimos "priorizar".
  const [priority, setPriority] = useState<Comorbidity | null>(null);
  const [showPrioritize, setShowPrioritize] = useState(false);

  // Resetea prioridad si cambian comorbilidades
  React.useEffect(() => {
    if (multiCount <= 1) setPriority(null);
  }, [multiCount]);

  const effectivePriority = useMemo<Comorbidity>(() => {
    if (multiCount === 0) return "none";
    if (multiCount === 1) {
      const only = comorbiditiesSelected.find((c) => c !== "none");
      return (only ?? "none") as Comorbidity;
    }
    return (priority ?? "none") as Comorbidity;
  }, [multiCount, comorbiditiesSelected, priority]);

  const canGenerate = useMemo(() => {
    if (ckdSelected && egfrBand === "unknown") return false;
    if (mode === "nice_puro" && multiCount >= 2 && !priority) return false;
    return true;
  }, [ckdSelected, egfrBand, mode, multiCount, priority]);

  // Fila NICE (para comparación)
  const recComparisons = useMemo(() => {
    return comorbiditiesSelected
      .filter((c) => c !== "none")
      .map((c) =>
        buildRecommendationRow(c, {
          metforminNotSuitable,
          egfrBand,
          needsIntensification,
          hyperglySymptoms: hypergly,
          comorbiditiesSelected,
        })
      );
  }, [
    comorbiditiesSelected,
    metforminNotSuitable,
    egfrBand,
    needsIntensification,
    hypergly,
  ]);

  // Recomendación final según modo
  const recFinal = useMemo<Recommendation>(() => {
    if (mode === "nice_combinado") {
      return buildCombinedRecommendation({
        metforminNotSuitable,
        egfrBand,
        needsIntensification,
        hyperglySymptoms: hypergly,
        comorbiditiesSelected,
      });
    }

    // NICE puro:
    return buildRecommendationRow(effectivePriority, {
      metforminNotSuitable,
      egfrBand,
      needsIntensification,
      hyperglySymptoms: hypergly,
      comorbiditiesSelected,
    });
  }, [
    mode,
    metforminNotSuitable,
    egfrBand,
    needsIntensification,
    hypergly,
    comorbiditiesSelected,
    effectivePriority,
  ]);

  function requestGenerate() {
    if (mode === "nice_puro" && multiCount >= 2 && !priority) {
      setShowPrioritize(true);
    }
  }

  async function copySummary() {
    const lines: string[] = [];
    lines.push(`NICE DM2 Assistant (${mode === "nice_combinado" ? "Combinado" : "Puro"})`);
    lines.push("");

    lines.push(`Comorbilidades: ${comorbiditiesSelected.map(classLabel).join(" + ")}`);
    if (mode === "nice_puro" && multiCount >= 2) {
      lines.push(`Priorizada: ${classLabel(effectivePriority)}`);
    }
    lines.push("");

    if (hypergly) lines.push("⚠ Síntomas hiperglucemia: considerar insulina o sulfonilurea; revisar luego.");
    lines.push("");

    lines.push("Tratamiento inicial (baseline):");
    recFinal.initial.forEach((s) => lines.push(`- ${s}`));

    if (recFinal.addOns?.length) {
      lines.push("");
      lines.push("Add-ons por comorbilidades:");
      recFinal.addOns.forEach((s) => lines.push(`- ${s}`));
    }

    if (metforminNotSuitable && recFinal.ifMetforminNotSuitable?.length) {
      lines.push("");
      lines.push("Rama sin metformina:");
      recFinal.ifMetforminNotSuitable.forEach((s) => lines.push(`- ${s}`));
    }

    lines.push("");
    lines.push("Escalamiento si requiere:");
    recFinal.escalationIfNeeded.forEach((s) => lines.push(`- ${s}`));

    if (recFinal.contraindications?.length) {
      lines.push("");
      lines.push("Contraindicaciones / alertas:");
      recFinal.contraindications.forEach((s) => lines.push(`- ${s}`));
    }

    if (recFinal.conflicts?.length) {
      lines.push("");
      lines.push("Conflictos / requiere decisión clínica:");
      recFinal.conflicts.forEach((s) => lines.push(`- ${s}`));
    }

    if (recFinal.notes?.length) {
      lines.push("");
      lines.push("Notas:");
      recFinal.notes.forEach((s) => lines.push(`- ${s}`));
    }

    await navigator.clipboard.writeText(lines.join("\n"));
    alert("Resumen copiado al portapapeles.");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        padding: 20,
        color: COLORS.text,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 950, color: COLORS.blue }}>
            NICE DM2 Assistant
          </div>
          <div style={{ color: COLORS.textSoft, marginTop: 4, fontWeight: 800 }}>
            {mode === "nice_combinado"
              ? "Modo combinado: integra comorbilidades (con conflictos explícitos)."
              : "Modo NICE puro: selecciona una fila (priorizar si hay multimorbilidad)."}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          <Card title="0) Modo de decisión">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setMode("nice_combinado")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border:
                    mode === "nice_combinado"
                      ? `2px solid ${COLORS.dark}`
                      : `1px solid ${COLORS.cardBorder}`,
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 950,
                  color: COLORS.text,
                }}
              >
                NICE combinado
              </button>
              <button
                onClick={() => setMode("nice_puro")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border:
                    mode === "nice_puro"
                      ? `2px solid ${COLORS.dark}`
                      : `1px solid ${COLORS.cardBorder}`,
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 950,
                  color: COLORS.text,
                }}
              >
                NICE puro
              </button>
            </div>

            <div style={{ marginTop: 10, fontWeight: 800, color: COLORS.textSoft, fontSize: 13 }}>
              Recomendación práctica: usar <b>NICE combinado</b> para tu práctica diaria y dejar <b>NICE puro</b> como comparación/auditoría.
            </div>
          </Card>

          <Card title="1) Datos mínimos">
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input
                  type="checkbox"
                  checked={hypergly}
                  onChange={(e) => setHypergly(e.target.checked)}
                />
                Síntomas de hiperglucemia
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input
                  type="checkbox"
                  checked={metforminNotSuitable}
                  onChange={(e) => setMetforminNotSuitable(e.target.checked)}
                />
                Metformina contraindicada / no tolerada
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input
                  type="checkbox"
                  checked={needsIntensification}
                  onChange={(e) => setNeedsIntensification(e.target.checked)}
                />
                Requiere intensificación para alcanzar objetivo glucémico individual
              </label>
            </div>
          </Card>

          <Card title="2) Comorbilidades (múltiple)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input type="checkbox" checked={ascvd} onChange={(e) => setAscvd(e.target.checked)} />
                ASCVD
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input type="checkbox" checked={hf} onChange={(e) => setHf(e.target.checked)} />
                Insuficiencia cardíaca
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input type="checkbox" checked={ckdSelected} onChange={(e) => setCkdSelected(e.target.checked)} />
                ERC (CKD)
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input type="checkbox" checked={obesity} onChange={(e) => setObesity(e.target.checked)} />
                Obesidad
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input type="checkbox" checked={earlyOnset} onChange={(e) => setEarlyOnset(e.target.checked)} />
                Early onset (&lt;40 años)
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
                <input type="checkbox" checked={frailty} onChange={(e) => setFrailty(e.target.checked)} />
                Fragilidad
              </label>
            </div>

            {ckdSelected && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: COLORS.textSoft, marginBottom: 6, fontWeight: 900 }}>
                  eGFR (obligatorio para aplicar rama ERC)
                </div>
                <input
                  value={egfr}
                  onChange={(e) => setEgfr(e.target.value)}
                  placeholder="Ej: 45"
                  style={{
                    width: 180,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: `1px solid ${COLORS.cardBorder}`,
                    fontWeight: 900,
                    color: COLORS.text,
                    background: "#fff",
                  }}
                  inputMode="decimal"
                />
                <div style={{ marginTop: 8, fontSize: 12, color: COLORS.textSoft, fontWeight: 900 }}>
                  Banda eGFR detectada:{" "}
                  <b style={{ color: COLORS.text }}>
                    {egfrBand === "unknown"
                      ? "—"
                      : egfrBand === "gt30"
                      ? ">30"
                      : egfrBand === "20to30"
                      ? "20–30"
                      : "<20"}
                  </b>
                </div>
              </div>
            )}
          </Card>

          <Card title="3) Resultado">
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: COLORS.textSoft, fontWeight: 950 }}>
                Comorbilidades seleccionadas
              </div>
              <div style={{ marginTop: 6 }}>
                {comorbiditiesSelected.map((c, idx) => (
                  <Badge key={idx} text={classLabel(c)} />
                ))}
              </div>
            </div>

            {mode === "nice_puro" && multiCount >= 2 && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${COLORS.warnBorder}`,
                  background: COLORS.warnBg,
                  marginBottom: 12,
                  color: COLORS.text,
                }}
              >
                <div style={{ fontWeight: 950, marginBottom: 6, color: COLORS.warnText }}>
                  Multimorbilidad (modo NICE puro): requiere priorizar 1 comorbilidad
                </div>
                <div style={{ fontSize: 13, marginBottom: 10, fontWeight: 900 }}>
                  Elegí cuál fila NICE vas a seguir hoy.
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {comorbiditiesSelected
                    .filter((c) => c !== "none")
                    .map((c) => (
                      <button
                        key={c}
                        onClick={() => setPriority(c)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 12,
                          border:
                            priority === c
                              ? `2px solid ${COLORS.dark}`
                              : `1px solid ${COLORS.cardBorder}`,
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 950,
                          color: COLORS.text,
                        }}
                      >
                        Priorizar: {classLabel(c)}
                      </button>
                    ))}
                </div>

                {!priority && (
                  <div style={{ marginTop: 10, fontSize: 12, color: COLORS.warnText, fontWeight: 950 }}>
                    Elegí una para habilitar la recomendación final.
                  </div>
                )}
              </div>
            )}

            {!canGenerate ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${COLORS.errBorder}`,
                  background: COLORS.errBg,
                  color: COLORS.errText,
                  fontSize: 13,
                  fontWeight: 950,
                }}
              >
                Falta información para generar:{" "}
                {ckdSelected && egfrBand === "unknown"
                  ? "ingresá eGFR."
                  : mode === "nice_puro" && multiCount >= 2 && !priority
                  ? "priorizá una comorbilidad."
                  : "verificá campos."}
              </div>
            ) : (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${COLORS.cardBorder}`,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 12, color: COLORS.textSoft, fontWeight: 950 }}>
                  Recomendación final ({mode === "nice_combinado" ? "combinada" : "fila NICE"})
                </div>

                <div style={{ fontSize: 18, fontWeight: 950, marginTop: 4, color: COLORS.text }}>
                  {recFinal.title}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 950, marginBottom: 6, color: COLORS.blue }}>
                    Baseline (tratamiento inicial)
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 900 }}>
                    {recFinal.initial.map((s, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {recFinal.addOns?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 950, marginBottom: 6, color: COLORS.blue }}>
                      Add-ons por comorbilidades
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 900 }}>
                      {recFinal.addOns.map((s, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {metforminNotSuitable && recFinal.ifMetforminNotSuitable?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 950, marginBottom: 6, color: COLORS.blue }}>
                      Rama sin metformina
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 900 }}>
                      {recFinal.ifMetforminNotSuitable.map((s, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 950, marginBottom: 6, color: COLORS.blue }}>
                    Escalamiento si se requiere
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 900 }}>
                    {recFinal.escalationIfNeeded.map((s, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {recFinal.contraindications?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 950, marginBottom: 6, color: COLORS.errText }}>
                      Contraindicaciones / alertas
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 950, color: COLORS.errText }}>
                      {recFinal.contraindications.map((s, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {recFinal.conflicts?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 950, marginBottom: 6, color: COLORS.warnText }}>
                      Conflictos / requiere decisión clínica
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 950, color: COLORS.warnText }}>
                      {recFinal.conflicts.map((s, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {recFinal.notes?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 950, marginBottom: 6, color: COLORS.blue }}>
                      Notas
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 900 }}>
                      {recFinal.notes.map((s, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button
                    onClick={copySummary}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${COLORS.dark}`,
                      background: COLORS.dark,
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 950,
                    }}
                  >
                    Copiar resumen
                  </button>

                  <button
                    onClick={requestGenerate}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${COLORS.cardBorder}`,
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 950,
                      color: COLORS.text,
                    }}
                  >
                    Validar / Re-generar
                  </button>
                </div>
              </div>
            )}
          </Card>

          {comorbiditiesSelected.filter((c) => c !== "none").length >= 1 ? (
            <Card title="4) Comparación (filas NICE individuales)">
              <div style={{ fontSize: 13, color: COLORS.textSoft, fontWeight: 850, marginBottom: 10 }}>
                Esto muestra las filas por comorbilidad (para auditoría). El modo “combinado” integra y marca conflictos.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                {recComparisons.map((r, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: `1px solid ${COLORS.cardBorder}`,
                      borderRadius: 12,
                      padding: 12,
                      background: COLORS.badgeBg,
                      color: COLORS.text,
                    }}
                  >
                    <div style={{ fontWeight: 950 }}>{r.title}</div>

                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 950, marginBottom: 4, color: COLORS.blue }}>Inicial</div>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>{r.initial.join(" / ")}</div>
                    </div>

                    {metforminNotSuitable && r.ifMetforminNotSuitable?.length ? (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 950, marginBottom: 4, color: COLORS.blue }}>
                          Rama sin metformina
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 900 }}>
                          {r.ifMetforminNotSuitable.join(" / ")}
                        </div>
                      </div>
                    ) : null}

                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 950, marginBottom: 4, color: COLORS.blue }}>
                        Escalamiento (si requiere)
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>
                        {r.escalationIfNeeded.join(" | ")}
                      </div>
                    </div>

                    {r.contraindications?.length ? (
                      <div style={{ marginTop: 8, color: COLORS.errText }}>
                        <div style={{ fontWeight: 950, marginBottom: 4 }}>Alertas específicas</div>
                        <div style={{ fontSize: 13, fontWeight: 950 }}>
                          {r.contraindications.join(" | ")}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <div style={{ color: COLORS.textSoft, fontSize: 12, padding: "0 6px", fontWeight: 850 }}>
            * Herramienta de apoyo basada en NICE NG28 (actualización Feb 2026). No reemplaza el juicio clínico.
          </div>
        </div>

        {showPrioritize && mode === "nice_puro" && multiCount >= 2 && !priority && (
          <div
            onClick={() => setShowPrioritize(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(520px, 100%)",
                background: "#fff",
                borderRadius: 16,
                padding: 16,
                border: `1px solid ${COLORS.cardBorder}`,
                color: COLORS.text,
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 16, color: COLORS.blue }}>
                Priorizar una comorbilidad (modo NICE puro)
              </div>
              <div style={{ marginTop: 8, color: COLORS.textSoft, fontSize: 13, fontWeight: 850 }}>
                Seleccionaste más de una. Elegí cuál fila NICE vas a seguir hoy.
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {comorbiditiesSelected
                  .filter((c) => c !== "none")
                  .map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setPriority(c);
                        setShowPrioritize(false);
                      }}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.cardBorder}`,
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 950,
                        color: COLORS.text,
                      }}
                    >
                      {classLabel(c)}
                    </button>
                  ))}
              </div>

              <button
                onClick={() => setShowPrioritize(false)}
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${COLORS.cardBorder}`,
                  background: COLORS.badgeBg,
                  cursor: "pointer",
                  fontWeight: 950,
                  color: COLORS.text,
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}