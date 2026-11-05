// =====================================================================
// Certificat de réussite (PDF) : généré dans le navigateur avec jsPDF
// =====================================================================
const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm';

/** Télécharge le certificat. data : { name, module, correct, total, date, trainer, code } */
export async function downloadCertificate(data) {
  const { jsPDF } = await import(JSPDF);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210, navy = [11, 37, 69], blue = [29, 78, 216], gold = [245, 183, 0];
  // Cadre
  doc.setFillColor(246, 248, 252); doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(...blue); doc.setLineWidth(2.2); doc.rect(10, 10, W - 20, H - 20);
  doc.setDrawColor(...gold); doc.setLineWidth(0.8); doc.rect(14, 14, W - 28, H - 28);
  // Logo (barres de son)
  doc.setFillColor(...blue); doc.roundedRect(W / 2 - 9, 22, 18, 18, 4, 4, 'F');
  doc.setFillColor(255, 255, 255);
  [[-6, 3], [-3, 6], [0, 10], [3, 7], [6, 3]].forEach(([x, h]) => doc.rect(W / 2 + x - 0.7, 31 - h / 2, 1.4, h, 'F'));
  doc.setTextColor(...blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('MUSIC PROGRESSION LAB', W / 2, 48, { align: 'center' });
  doc.setTextColor(...navy); doc.setFontSize(32);
  doc.text('Certificat de réussite', W / 2, 66, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(91, 107, 133);
  doc.text('décerné à', W / 2, 80, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...navy);
  doc.text(data.name, W / 2, 95, { align: 'center' });
  doc.setDrawColor(...gold); doc.setLineWidth(0.6); doc.line(W / 2 - 60, 100, W / 2 + 60, 100);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(91, 107, 133);
  doc.text("pour la réussite de l'examen d'oreille musicale", W / 2, 112, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...blue);
  doc.text(data.module, W / 2, 125, { align: 'center' });
  const pct = Math.round((data.correct / data.total) * 100);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(...navy);
  doc.text(`Score : ${data.correct}/${data.total} (${pct} %)  -  le ${data.date}`, W / 2, 138, { align: 'center' });
  // Signature et code de vérification
  doc.setFontSize(11); doc.setTextColor(91, 107, 133);
  if (data.trainer) {
    doc.text('Formateur', 60, 168, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy); doc.text(data.trainer, 60, 176, { align: 'center' });
    doc.setDrawColor(199, 212, 234); doc.line(30, 170, 90, 170);
  }
  doc.setFont('helvetica', 'normal'); doc.setTextColor(91, 107, 133);
  doc.text('Code de vérification', W - 60, 168, { align: 'center' });
  doc.setFont('courier', 'bold'); doc.setTextColor(...navy); doc.text(data.code, W - 60, 176, { align: 'center' });
  const file = `certificat-${data.module.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.pdf`;
  doc.save(file);
  return file;
}
