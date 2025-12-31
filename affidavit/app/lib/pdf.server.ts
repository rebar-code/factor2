import { jsPDF } from "jspdf";

export interface AffidavitFormData {
  // Contact Information
  name: string;
  company: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postal: string;
  country: string;
  telephone: string;
  email: string;

  // Product Information
  productCodes: string;
  contactTissue: string;
  howForm: string;
  implanted: string;
  implantDays?: number;
  protocol: string;

  // Signature
  printName: string;
  signature: string; // base64 image data
  title: string;
  date: string;
}

export function generateAffidavitPDF(data: AffidavitFormData): Buffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;
  const lineHeight = 7;
  const sectionSpacing = 5;

  // Helper to check if we need a new page
  function checkPageBreak(requiredSpace: number) {
    if (y + requiredSpace > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  // Helper to add text with wrapping
  function addText(text: string, bold = false, fontSize = 10, textColor: [number, number, number] = [0, 0, 0]) {
    checkPageBreak(lineHeight * 2);
    doc.setFontSize(fontSize);
    doc.setFont(undefined, bold ? "bold" : "normal");
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line: string) => {
      checkPageBreak(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    });
    doc.setTextColor(0, 0, 0);
  }

  // Helper to add a field label and value
  function addField(label: string, value: string, required = false) {
    const labelText = required ? `${label} *` : label;
    const displayValue = value || "N/A";
    
    checkPageBreak(lineHeight * 2);
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(`${labelText}: `, margin, y);
    const labelWidth = doc.getTextWidth(`${labelText}: `);
    
    doc.setTextColor(0, 0, 255); // Blue
    const remainingWidth = maxWidth - labelWidth;
    const valueLines = doc.splitTextToSize(displayValue, remainingWidth);
    
    if (valueLines.length === 1 && valueLines[0].length < 60) {
      doc.text(valueLines[0], margin + labelWidth, y);
      y += lineHeight;
    } else {
      y += lineHeight;
      const valueLinesFull = doc.splitTextToSize(displayValue, maxWidth);
      valueLinesFull.forEach((line: string) => {
        checkPageBreak(lineHeight);
        doc.text(line, margin + 5, y);
        y += lineHeight;
      });
    }
    doc.setTextColor(0, 0, 0);
  }

  // Header
  addText("FACTOR II, INC. AFFIDAVIT OF INTENDED USE", true, 14);
  y += sectionSpacing;

  // Warning text
  addText("ALL FIELDS WITH * MUST BE FILLED OUT!!! THE AFFIDAVIT MUST BE FILLED OUT COMPLETELY!!!!", false, 9);
  addText("THIS FORM SHOULD NOT BE ALTERED IN ANY MANNER.", false, 9);
  y += sectionSpacing * 2;

  // Contact Information Section
  addText("CONTACT INFORMATION", true, 12);
  y += sectionSpacing;
  addField("Name: INDIVIDUAL Responsible for product", data.name, true);
  addField("Company or Organization", data.company, true);
  addField("Address 1", data.address1, true);
  if (data.address2) {
    addField("Address 2", data.address2, false);
  }
  addField("City", data.city, true);
  addField("State", data.state, true);
  addField("Postal Code", data.postal, true);
  addField("Country", data.country, true);
  addField("Telephone", data.telephone, true);
  addField("Email", data.email, true);
  y += sectionSpacing * 2;

  // Product Information Section
  addText("***ALL QUESTIONS MUST BE ANSWERED ***", true, 10);
  y += sectionSpacing;
  addText("PRODUCT INFORMATION", true, 12);
  y += sectionSpacing;
  addField("Factor II Product Code(s): (Aforementioned product)", data.productCodes, true);
  addField("Is the final product to be in contact with tissue externally?", data.contactTissue, true);
  
  // How and in what form
  addText("How and in what form (Cured or Uncured)? *", false);
  if (data.howForm) {
    doc.setTextColor(0, 0, 255);
    const howFormLines = doc.splitTextToSize(data.howForm, maxWidth);
    howFormLines.forEach((line: string) => {
      checkPageBreak(lineHeight);
      doc.text(line, margin + 5, y);
      y += lineHeight;
    });
    doc.setTextColor(0, 0, 0);
  }
  y += sectionSpacing;

  addField("Will the final product be implanted?", data.implanted, true);
  
  if (data.implanted === "Yes") {
    addText("If YES, please attach additional information/protocol, along with this document.", false, 9);
    addText("We may contact you for further information.", false, 9);
    y += sectionSpacing;
    addField("How long will the product be implanted? (Days)", data.implantDays?.toString() || "", true);
    y += sectionSpacing;
  }

  // Protocol description
  addText("Please briefly describe below (or on separate page if necessary) the protocol for your application of the aforementioned product(s). *", false);
  if (data.protocol) {
    doc.setTextColor(0, 0, 255);
    const protocolLines = doc.splitTextToSize(data.protocol, maxWidth);
    protocolLines.forEach((line: string) => {
      checkPageBreak(lineHeight);
      doc.text(line, margin + 5, y);
      y += lineHeight;
    });
    doc.setTextColor(0, 0, 0);
  }
  y += sectionSpacing * 2;

  // Signature Section
  addText("AFFIDAVIT AND SIGNATURE", true, 12);
  y += sectionSpacing;
  
  // Print Name
  const printName = data.printName;
  checkPageBreak(lineHeight * 2);
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Print Name: ", margin, y);
  const nameWidth = doc.getTextWidth("Print Name: ");
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 255);
  doc.text(`${printName}, being duly sworn, depose and say as follows:`, margin + nameWidth, y);
  doc.setTextColor(0, 0, 0);
  y += lineHeight;
  y += sectionSpacing;

  // Certification statement
  const certText = "I certify that I will not use, either in its pure state or as a component of some other material, any of the aforementioned product(s) hereafter received by me from Factor II, Inc. for injection or implantation into any areas of the human body in a cured or uncured state, or onto any areas of the human body in a cured or uncured state for an un-approved application, nor will I supply the aforementioned product(s) to others for such purposes. Factor II cannot advise if the product you are using will be suitable for your application. All companies and/or individuals are responsible for final testing of their products to determine their safety and use.";
  
  const certLines = doc.splitTextToSize(certText, maxWidth);
  certLines.forEach((line: string) => {
    checkPageBreak(lineHeight);
    doc.text(line, margin, y);
    y += lineHeight;
  });
  
  y += sectionSpacing * 2;

  // Signature image
  checkPageBreak(60);
  addText("Signature: *", false);
  y += sectionSpacing;
  try {
    doc.addImage(data.signature, "PNG", margin, y, 100, 50);
    y += 60;
  } catch (error) {
    console.error("Error adding signature image:", error);
    y += 60;
  }

  addField("Title", data.title, true);
  addField("Date", data.date, true);

  // Return as Buffer
  return Buffer.from(doc.output("arraybuffer"));
}

