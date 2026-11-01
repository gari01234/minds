/* Window · Projektakte skills (browser copy).
   The block between the markers is byte-identical to supabase/functions/_shared/akte-skills.mjs;
   tests/window-akte-skills.test.mjs enforces it. */
(function(root){
'use strict';
/* akte-skills:begin */
const AKTE_SKILLS_VERSION=1;
const AKTE_SKILL_PREFIX='akte-';
const AKTE_SKILLS=[
  {slug:'thema-fortsetzen',prompt:'thema_fortsetzen',name:'Thema fortsetzen',
    description:'Retomar un tema de un proyecto donde se quedó: Themenblatt, último traspaso y siguiente paso.',
    args:[{name:'projekt'},{name:'thema'}],
    start:a=>`Retoma en Window el proyecto ${a.projekt}, tema «${a.thema}».`,
    instructions:`Ziel: Gari in weniger als einer Minute wieder in das Thema bringen.
1. Thema öffnen (in Claude: open_topic). Ist der Name unklar, Kandidaten zeigen und fragen; nie raten.
2. In höchstens 5 Zeilen auf Spanisch zusammenfassen: Stand, letzte Entscheidungen, offene Fragen.
3. Einen konkreten nächsten Schritt vorschlagen und fragen, ob Gari damit anfangen will.
4. Dokumente erst suchen und lesen, wenn die Arbeit sie braucht (search, dann fetch); Dateinamen nennen.`},
  {slug:'sitzung-abschliessen',prompt:'sitzung_abschliessen',name:'Sitzung abschließen',
    description:'Guardar el resultado de la sesión en el Themenblatt: estado, decisiones, preguntas, pasos y plazos.',
    args:[{name:'projekt'},{name:'thema',optional:true}],
    start:a=>`Cierra esta sesión en Window (proyecto ${a.projekt}${a.thema?`, tema «${a.thema}»`:''}).`,
    instructions:`Ziel: Das Ergebnis der Sitzung bleibt in der Akte, nicht im Chat.
1. Auf Deutsch vorbereiten: Stand (1–3 Sätze), Entscheidungen (mit Datum und Quelle), offene Fragen, nächste Schritte, Fristen.
2. Gari in 3–5 Zeilen zeigen, was gespeichert wird, und auf sein Ja warten.
3. Speichern (in Claude: close_session). bestaetigt=true nur für das, was Gari ausdrücklich entschieden hat; alles andere bleibt vorgeschlagen.
4. Hat Gari in der Sitzung ausdrücklich gesagt, wie er arbeiten möchte (z. B. „schick mir Entwürfe immer zuerst kurz“), als arbeitsweise mitgeben, in seinen Worten.
5. Ein neues Thema nur mit Garis Zustimmung anlegen.`},
  {slug:'emails-ablegen',prompt:'emails_ablegen',name:'E-Mails ablegen',
    description:'Archivar correos pegados en el escritorio del proyecto, sin duplicados, y señalar plazos y decisiones.',
    args:[{name:'projekt'}],
    start:a=>`Voy a pegarte uno o varios correos del proyecto ${a.projekt} para archivarlos en Window.`,
    instructions:`Ziel: Jede E-Mail liegt einmal, sauber benannt, in der Akte.
1. Pro E-Mail ein Dokument ablegen (in Claude: file_document, art "email") mit von, an, datum (JJJJ-MM-TT), betreff. Ordner „Emails“, außer Gari sagt etwas anderes.
2. Bei einer Weiterleitung oder Antwortkette nur die neue Nachricht als eigenes Dokument, wenn die älteren schon abgelegt sind.
3. Meldet Window ein Duplikat, nicht erneut ablegen; kurz sagen, wo das Original liegt.
4. Danach auf Spanisch auflisten: erkannte Fristen (mit Datum), Entscheidungen, Aufgaben (wer, bis wann). Fragen, welche ins Register sollen.`},
  {slug:'protokoll-erstellen',prompt:'protokoll_erstellen',name:'Protokoll erstellen',
    description:'Convertir notas de una reunión en protocolo en alemán, con decisiones y tareas con responsable.',
    args:[{name:'projekt'},{name:'thema',optional:true}],
    start:a=>`Te paso mis notas de una reunión de ${a.projekt}${a.thema?` (tema «${a.thema}»)`:''} para el Protokoll.`,
    instructions:`Ziel: Ein versandfähiges Protokoll und ein aktuelles Register.
1. Aufbau: Projekt, Besprechung, Datum, Ort, Teilnehmer (Name, Firma/Rolle), Verteiler; dann nummerierte Punkte mit Feststellung, Entscheidung (E), Aufgabe (A: wer, bis wann), Info (I).
2. Nichts erfinden: Fehlende Namen oder Termine als [offen] markieren und Gari fragen.
3. Sachlich, knapp, im Präsens; keine Wertungen.
4. Als Dokument ablegen (in Claude: file_document, art "protokoll").
5. Vorschlagen, welche Entscheidungen und Fristen ins Register gehen und welche Aufgaben Gari in seine Liste übernehmen will.`},
  {slug:'jour-fixe-vorbereiten',prompt:'jour_fixe_vorbereiten',name:'Jour fixe vorbereiten',
    description:'Preparar la agenda de una reunión del proyecto a partir de temas abiertos, plazos y correos.',
    args:[{name:'projekt'},{name:'termin',optional:true}],
    start:a=>`Prepara la agenda del Jour fixe de ${a.projekt}${a.termin?` (${a.termin})`:''}.`,
    instructions:`Ziel: Eine Tagesordnung, mit der die Besprechung Entscheidungen bringt.
1. Projekt öffnen (in Claude: open_project): offene Fragen der Themenblätter, Fristen im Register, Aufgaben der nächsten 14 Tage, neueste Dokumente.
2. Tagesordnung auf Deutsch, nach Priorität: zuerst was eine Entscheidung braucht, dann Termine und Fristen, dann Information.
3. Zu jedem Punkt: Ziel (Entscheidung/Klärung/Info), wer etwas beitragen muss, benötigte Unterlagen (Dateinamen).
4. Am Ende „Offene Punkte aus dem letzten Protokoll“, falls vorhanden.`},
  {slug:'schriftverkehr',prompt:'schriftverkehr',name:'Schriftverkehr: Behinderungsanzeige, Mahnung, Nachtrag',
    description:'Redactar una carta formal (Behinderungsanzeige, Mahnung, Nachtrag, wiederholte Grundleistungen) con hechos y fuentes de la Akte.',
    args:[{name:'projekt'},{name:'anlass',optional:true}],
    start:a=>`Necesito redactar un escrito para ${a.projekt}${a.anlass?`: ${a.anlass}`:''}.`,
    instructions:`Ziel: Ein sachlicher, belegbarer Brief, den Gari prüft und selbst versendet.
1. Zuerst die Fakten aus der Akte sammeln (search, dann fetch): Daten, Schreiben, Protokolle, Entscheidungen. Jede Tatsache mit Quelle (Dateiname, Datum).
2. Aufbau: Betreff, Bezug (Vertrag, Schreiben vom …), Sachverhalt in zeitlicher Reihenfolge, Auswirkungen (Termine, Leistungen, Kosten), Bitte oder Forderung mit angemessener Frist, Vorbehalt weiterer Ansprüche.
3. Rechtsgrundlagen (z. B. VOB/B, BGB, HOAI) nur nennen, wenn sie im Vertrag oder im bisherigen Schriftverkehr stehen oder Gari sie vorgibt; sonst als [prüfen] markieren. Keine Rechtsberatung.
4. Ton: höflich, bestimmt, ohne Vorwürfe.
5. Entwurf zeigen; erst nach Garis Freigabe als Dokument ablegen (art "brief") und die gesetzte Frist ins Register eintragen.`},
  {slug:'entscheidung-dokumentieren',prompt:'entscheidung_dokumentieren',name:'Entscheidung dokumentieren',
    description:'Dejar constancia de una decisión con fecha, quién la tomó, por qué y su fuente.',
    args:[{name:'projekt'},{name:'thema',optional:true}],
    start:a=>`Quiero dejar constancia de una decisión en ${a.projekt}${a.thema?` (tema «${a.thema}»)`:''}.`,
    instructions:`Ziel: Später nachvollziehbar, was entschieden wurde, von wem, warum und wann.
1. Klären: Was genau wurde entschieden? Wer hat entschieden (BHR, Gari, Fachplaner)? Wann? Grundlage (Besprechung, E-Mail, Plan)?
2. Titel kurz und eindeutig auf Deutsch, z. B. „Lichtbänder im Ausstellungsraum statt Einzelstrahler“.
3. Ins Register eintragen (in Claude: record_decision) mit datum und quelle; bestaetigt nur, wenn Gari es bestätigt.
4. Widerspricht sie einer früheren Entscheidung im Register, darauf hinweisen und fragen, ob die alte ersetzt ist.`},
  {slug:'fristen-pruefen',prompt:'fristen_pruefen',name:'Fristen prüfen',
    description:'Revisar plazos del proyecto: registro, correos y protocolos recientes; señalar los que faltan o vencen.',
    args:[{name:'projekt'}],
    start:a=>`Revisa los plazos del proyecto ${a.projekt}.`,
    instructions:`Ziel: Keine Frist geht verloren.
1. Projekt öffnen (in Claude: open_project) und das Register lesen.
2. In neuen E-Mails und Protokollen nach Terminen suchen (z. B. „bis zum“, „spätestens“, „Frist“, „Termin“, „KW“) und mit dem Register vergleichen.
3. Auf Spanisch berichten: fällig in den nächsten 7 Tagen, überfällig, gefunden aber nicht im Register (mit Quelle).
4. Fehlende Fristen nur nach Garis Ja eintragen (record_decision, art "frist").`},
  {slug:'themenblatt-pflegen',prompt:'themenblatt_pflegen',name:'Themenblatt pflegen',
    description:'Poner al día el Themenblatt de un tema con lo último del escritorio y del historial.',
    args:[{name:'projekt'},{name:'thema'}],
    start:a=>`Pon al día el Themenblatt de «${a.thema}» en ${a.projekt}.`,
    instructions:`Ziel: Das Themenblatt sagt in einer Minute, wo das Thema steht.
1. Thema öffnen (in Claude: open_topic), dann nach neuen Dokumenten zum Thema suchen.
2. Stand in 1–3 Sätzen neu schreiben; erledigte offene Fragen und Schritte streichen; neue ergänzen.
3. Entscheidungen nur mit Quelle; Neues bleibt vorgeschlagen, bis Gari bestätigt.
4. Änderungen kurz zeigen und nach Garis Ja speichern (close_session).`}
];
function akteSkillMessage(skill,args,override){
  const a=args||{};
  const text=override&&typeof override.instructions==='string'&&override.instructions.trim()?override.instructions.trim():skill.instructions;
  const version=override&&override.version?' · v'+override.version+' (Window)':'';
  return skill.start(a)+'\n\nArbeitsanweisung «'+skill.name+'»'+version+':\n'+text;
}
function akteSkillRows(){
  return AKTE_SKILLS.map(s=>({agent:'isabella',slug:AKTE_SKILL_PREFIX+s.slug,name:s.name,description:s.description,instructions:s.instructions,
    preferred_tools:[],enabled:true,metadata:{pack:'projektakte_de',pack_version:AKTE_SKILLS_VERSION,skill:s.slug}}));
}
const AKTE_SKILL_LIBRARY={AKTE_SKILLS_VERSION,AKTE_SKILL_PREFIX,AKTE_SKILLS,akteSkillMessage,akteSkillRows};
/* akte-skills:end */
if(typeof module==='object'&&module.exports)module.exports=AKTE_SKILL_LIBRARY;
root.MINDS_AKTE_SKILLS=AKTE_SKILL_LIBRARY;
})(typeof self!=='undefined'?self:globalThis);
