// Vyhľadanie konania podľa spisovej značky.
//
// Rozhodnutia súdov sú zverejňované anonymizované — mená účastníkov sú
// nahradené. Spisová značka je jediný praktický kľúč, ktorým sa dá rozhodnutie
// priradiť ku kauze (produktové zadanie §5.10). Preto má vlastný index.

export default function (doc) {
  if (doc.type !== "proceeding" || !doc.file_number) return;
  emit(String(doc.file_number).trim(), { case_id: doc.case_id, court: doc.court || null });
}
