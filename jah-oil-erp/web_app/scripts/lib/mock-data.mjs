import fs from "node:fs";
import path from "node:path";

export function loadMockData(rootDir = process.cwd()) {
  const filePath = path.join(rootDir, "src/lib/data/mockData.js");
  const source = fs.readFileSync(filePath, "utf8");
  const transformedSource = source.replace(/\bexport const\b/g, "const");

  const evaluate = new Function(`
    ${transformedSource}

    return {
      stations,
      fuelDeliveries,
      salesData,
      inventory,
      lowStockAlerts,
      salesByStation,
      salesByDay,
      todaySales,
      topStations,
      recentSales,
    };
  `);

  return evaluate();
}
