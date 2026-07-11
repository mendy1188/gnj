function escapePdfText(value) {
  return `${value || ""}`
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "")
    .replace(/\n/g, " ");
}

function buildPdfBytesFromObjects(objects) {
  let pdf = "%PDF-1.4\n";
  const offsets = [];

  for (let index = 1; index < objects.length; index += 1) {
    const object = objects[index];

    if (!object) {
      continue;
    }

    offsets[index] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index} 0 obj\n${object}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index] || 0).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function truncateText(value, maxChars) {
  const normalizedValue = `${value || ""}`;

  if (normalizedValue.length <= maxChars) {
    return normalizedValue;
  }

  if (maxChars <= 3) {
    return normalizedValue.slice(0, maxChars);
  }

  return `${normalizedValue.slice(0, maxChars - 3)}...`;
}

function normalizeColor(red, green, blue) {
  return [red, green, blue].map((value) =>
    Math.max(0, Math.min(1, Number(value || 0))).toFixed(3),
  );
}

function drawFilledRectangle(x, y, width, height, fillColor) {
  const [red, green, blue] = normalizeColor(...fillColor);
  return `q\n${red} ${green} ${blue} rg\n${x} ${y} ${width} ${height} re f\nQ`;
}

function drawStrokedRectangle(x, y, width, height, strokeColor, lineWidth = 1) {
  const [red, green, blue] = normalizeColor(...strokeColor);
  return `q\n${lineWidth} w\n${red} ${green} ${blue} RG\n${x} ${y} ${width} ${height} re S\nQ`;
}

function drawLine(x1, y1, x2, y2, strokeColor, lineWidth = 1) {
  const [red, green, blue] = normalizeColor(...strokeColor);
  return `q\n${lineWidth} w\n${red} ${green} ${blue} RG\n${x1} ${y1} m\n${x2} ${y2} l S\nQ`;
}

function drawText({
  text,
  x,
  y,
  font = "F1",
  size = 10,
  color = [0, 0, 0],
}) {
  const [red, green, blue] = normalizeColor(...color);

  return [
    "BT",
    `/${font} ${size} Tf`,
    `${red} ${green} ${blue} rg`,
    `1 0 0 1 ${x} ${y} Tm`,
    `(${escapePdfText(text)}) Tj`,
    "ET",
  ].join("\n");
}

function buildColumnWidths(columns, totalWidth) {
  const sourceColumns = Array.isArray(columns) ? columns : [];
  const weights = sourceColumns.map((column) =>
    Number.isFinite(column?.pdfWidth) && column.pdfWidth > 0
      ? column.pdfWidth
      : 18,
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const widths = [];
  let consumedWidth = 0;

  weights.forEach((weight, index) => {
    const isLastColumn = index === weights.length - 1;
    const width = isLastColumn
      ? totalWidth - consumedWidth
      : Math.round((totalWidth * weight) / totalWeight);

    widths.push(width);
    consumedWidth += width;
  });

  return widths;
}

function buildPageContent({
  title,
  subtitle,
  brandName,
  scopeLabel,
  generatedAt,
  generatedBy,
  summaryText,
  columns,
  rows,
  pageIndex,
  pageCount,
}) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 40;
  const tableWidth = pageWidth - marginX * 2;
  const bannerY = pageHeight - 88;
  const commands = [];
  const bannerColor = [0.059, 0.09, 0.165];
  const bannerTextColor = [1, 1, 1];
  const bannerMutedColor = [0.82, 0.89, 0.96];
  const panelColor = [0.965, 0.973, 0.988];
  const borderColor = [0.855, 0.886, 0.933];
  const tableHeaderColor = [0.922, 0.949, 0.984];
  const tableAltColor = [0.98, 0.984, 0.992];
  const textColor = [0.11, 0.153, 0.231];
  const mutedTextColor = [0.42, 0.478, 0.565];

  commands.push(drawFilledRectangle(0, bannerY, pageWidth, 88, bannerColor));
  commands.push(
    drawText({
      text: brandName || "JAH MULTI INDUSTRIES",
      x: marginX,
      y: pageHeight - 34,
      font: "F2",
      size: 13,
      color: bannerTextColor,
    }),
  );
  commands.push(
    drawText({
      text: title || "Report",
      x: marginX,
      y: pageHeight - 58,
      font: "F2",
      size: 22,
      color: bannerTextColor,
    }),
  );

  if (subtitle) {
    commands.push(
      drawText({
        text: subtitle,
        x: marginX,
        y: pageHeight - 76,
        font: "F1",
        size: 9,
        color: bannerMutedColor,
      }),
    );
  }

  const infoPanelY = pageHeight - 150;
  commands.push(drawFilledRectangle(marginX, infoPanelY, tableWidth, 44, panelColor));
  commands.push(
    drawStrokedRectangle(marginX, infoPanelY, tableWidth, 44, borderColor, 1),
  );
  commands.push(
    drawText({
      text: scopeLabel ? `Scope: ${scopeLabel}` : "Scope: Report view",
      x: marginX + 12,
      y: infoPanelY + 27,
      font: "F2",
      size: 9,
      color: textColor,
    }),
  );
  commands.push(
    drawText({
      text: summaryText || "Rows: 0",
      x: marginX + 12,
      y: infoPanelY + 11,
      font: "F1",
      size: 8.5,
      color: mutedTextColor,
    }),
  );
  commands.push(
    drawText({
      text: `Generated: ${generatedAt || ""}`,
      x: marginX + 320,
      y: infoPanelY + 27,
      font: "F1",
      size: 8.5,
      color: textColor,
    }),
  );
  commands.push(
    drawText({
      text: `By: ${generatedBy || "System"}`,
      x: marginX + 320,
      y: infoPanelY + 11,
      font: "F1",
      size: 8.5,
      color: mutedTextColor,
    }),
  );

  const tableTopY = pageHeight - 190;
  const headerHeight = 24;
  const rowHeight = 20;
  const widths = buildColumnWidths(columns, tableWidth);
  const startX = marginX;

  commands.push(
    drawFilledRectangle(
      startX,
      tableTopY - headerHeight,
      tableWidth,
      headerHeight,
      tableHeaderColor,
    ),
  );
  commands.push(
    drawStrokedRectangle(
      startX,
      tableTopY - headerHeight,
      tableWidth,
      headerHeight,
      borderColor,
      1,
    ),
  );

  let currentX = startX;
  columns.forEach((column, index) => {
    const width = widths[index] || 0;
    const label = truncateText(
      column.label || column.key || "",
      Math.max(8, Math.floor(width / 5)),
    );

    commands.push(
      drawText({
        text: label,
        x: currentX + 6,
        y: tableTopY - 16,
        font: "F2",
        size: 8.5,
        color: textColor,
      }),
    );

    if (index < columns.length - 1) {
      commands.push(
        drawLine(
          currentX + width,
          tableTopY - headerHeight,
          currentX + width,
          tableTopY,
          borderColor,
          0.6,
        ),
      );
    }

    currentX += width;
  });

  rows.forEach((row, rowIndex) => {
    const rowTopY = tableTopY - headerHeight - rowIndex * rowHeight;
    const rowBottomY = rowTopY - rowHeight;

    if (rowIndex % 2 === 0) {
      commands.push(
        drawFilledRectangle(startX, rowBottomY, tableWidth, rowHeight, tableAltColor),
      );
    }

    commands.push(
      drawLine(startX, rowBottomY, startX + tableWidth, rowBottomY, borderColor, 0.5),
    );

    let cellX = startX;

    columns.forEach((column, columnIndex) => {
      const width = widths[columnIndex] || 0;
      const text = truncateText(
        `${row?.[column.key] ?? ""}`,
        Math.max(8, Math.floor(width / 5)),
      );

      commands.push(
        drawText({
          text,
          x: cellX + 6,
          y: rowBottomY + 6,
          font: "F1",
          size: 8,
          color: textColor,
        }),
      );

      if (columnIndex < columns.length - 1) {
        commands.push(
          drawLine(cellX + width, rowBottomY, cellX + width, rowTopY, borderColor, 0.4),
        );
      }

      cellX += width;
    });
  });

  const tableBottomY =
    tableTopY - headerHeight - Math.max(1, rows.length) * rowHeight;
  commands.push(
    drawStrokedRectangle(
      startX,
      tableBottomY,
      tableWidth,
      headerHeight + Math.max(1, rows.length) * rowHeight,
      borderColor,
      1,
    ),
  );

  commands.push(drawLine(marginX, 42, pageWidth - marginX, 42, borderColor, 0.8));
  commands.push(
    drawText({
      text: `Page ${pageIndex + 1} of ${pageCount}`,
      x: marginX,
      y: 28,
      font: "F1",
      size: 8.5,
      color: mutedTextColor,
    }),
  );
  commands.push(
    drawText({
      text: brandName || "JAH MULTI INDUSTRIES",
      x: pageWidth - marginX - 72,
      y: 28,
      font: "F2",
      size: 8.5,
      color: mutedTextColor,
    }),
  );

  return commands.join("\n");
}

export function buildSimpleReportPdf({
  title = "Report",
  subtitle = "",
  columns = [],
  rows = [],
  brandName = "JAH MULTI INDUSTRIES",
  scopeLabel = "",
  generatedAt = "",
  generatedBy = "",
  summaryText = "",
}) {
  const sourceColumns = Array.isArray(columns) ? columns : [];
  const sourceRows = Array.isArray(rows) ? rows : [];
  const rowsPerPage = 24;
  const safeRows = sourceRows.length > 0 ? sourceRows : [{}];
  const pageChunks = [];

  for (let index = 0; index < safeRows.length; index += rowsPerPage) {
    pageChunks.push(safeRows.slice(index, index + rowsPerPage));
  }

  const pageCount = Math.max(1, pageChunks.length);
  const pageObjectIds = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  const contentObjectIds = pageObjectIds.map((id) => id + 1);
  const fontRegularObjectId = 3 + pageCount * 2;
  const fontBoldObjectId = fontRegularObjectId + 1;
  const objects = new Array(fontBoldObjectId + 1).fill(null);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] >>`;

  pageChunks.forEach((chunk, pageIndex) => {
    const pageObjectId = pageObjectIds[pageIndex];
    const contentObjectId = contentObjectIds[pageIndex];
    const pageContent = buildPageContent({
      title,
      subtitle,
      brandName,
      scopeLabel,
      generatedAt,
      generatedBy,
      summaryText,
      columns: sourceColumns,
      rows: chunk,
      pageIndex,
      pageCount,
    });

    objects[pageObjectId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(pageContent, "utf8")} >>\nstream\n${pageContent}\nendstream`;
  });

  objects[fontRegularObjectId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[fontBoldObjectId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  return buildPdfBytesFromObjects(objects);
}
