// Mock data for Jah Oil ERP

function sumAmountByType(records, type) {
  return records
    .filter((record) => record.type === type)
    .reduce((total, record) => total + record.amount, 0);
}

function getLatestDate(records) {
  return records.reduce((latest, record) => (record.date > latest ? record.date : latest), records[0]?.date || "");
}

function buildSalesByStation(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.station)) {
      grouped.set(record.station, {
        station: record.station,
        fuel: 0,
        shop: 0,
        cement: 0,
        total: 0,
        lastDate: record.date,
      });
    }

    const station = grouped.get(record.station);
    const bucket = record.type === "Fuel" ? "fuel" : record.type === "Cement" ? "cement" : "shop";

    station[bucket] += record.amount;
    station.total += record.amount;
    if (record.date > station.lastDate) {
      station.lastDate = record.date;
    }
  });

  return Array.from(grouped.values()).sort((left, right) => right.total - left.total);
}

function buildSalesByDay(records) {
  const grouped = new Map();

  records.forEach((record) => {
    const currentTotal = grouped.get(record.date) || 0;
    grouped.set(record.date, currentTotal + record.amount);
  });

  return Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, total]) => ({ date, total }));
}

export const stations = [
  { id: 1, name: "Banjul Station", location: "Banjul", status: "active", manager: "Alieu Bah" },
  { id: 2, name: "Serekunda Station", location: "Serekunda", status: "active", manager: "Fatou Touray" },
  { id: 3, name: "Bakau Station", location: "Bakau", status: "active", manager: "Musa Camara" },
  { id: 4, name: "Brikama Station", location: "Brikama", status: "active", manager: "Aminata Jallow" },
];

export const fuelDeliveries = [
  { id: 1, date: "2026-06-04", station: "Banjul Station", quantity: 5000, type: "Petrol", status: "delivered" },
  { id: 2, date: "2026-06-03", station: "Serekunda Station", quantity: 3000, type: "Diesel", status: "delivered" },
  { id: 3, date: "2026-06-02", station: "Bakau Station", quantity: 4000, type: "Petrol", status: "delivered" },
  { id: 4, date: "2026-06-04", station: "Brikama Station", quantity: 2500, type: "Diesel", status: "pending" },
  { id: 5, date: "2026-06-01", station: "Banjul Station", quantity: 4200, type: "Petrol", status: "delivered" },
  { id: 6, date: "2026-05-31", station: "Bakau Station", quantity: 2800, type: "Diesel", status: "delivered" },
  { id: 7, date: "2026-05-30", station: "Serekunda Station", quantity: 3600, type: "Petrol", status: "delivered" },
  { id: 8, date: "2026-05-29", station: "Brikama Station", quantity: 3100, type: "Diesel", status: "delivered" },
];

export const salesData = [
  { id: 1, date: "2026-05-29", station: "Banjul Station", type: "Fuel", item: "Petrol", amount: 112000, quantity: 265 },
  { id: 2, date: "2026-05-29", station: "Banjul Station", type: "Shop", item: "Rice", amount: 36000, quantity: 42 },
  { id: 3, date: "2026-05-29", station: "Serekunda Station", type: "Fuel", item: "Diesel", amount: 94000, quantity: 230 },
  { id: 4, date: "2026-05-29", station: "Serekunda Station", type: "Shop", item: "Cooking Oil", amount: 41000, quantity: 18 },
  { id: 5, date: "2026-05-29", station: "Bakau Station", type: "Cement", item: "Cement", amount: 152000, quantity: 84 },
  { id: 6, date: "2026-05-29", station: "Brikama Station", type: "Shop", item: "Onions", amount: 47000, quantity: 56 },
  { id: 7, date: "2026-05-30", station: "Banjul Station", type: "Fuel", item: "Diesel", amount: 118000, quantity: 280 },
  { id: 8, date: "2026-05-30", station: "Banjul Station", type: "Cement", item: "Cement", amount: 52000, quantity: 28 },
  { id: 9, date: "2026-05-30", station: "Serekunda Station", type: "Shop", item: "Rice", amount: 44000, quantity: 49 },
  { id: 10, date: "2026-05-30", station: "Bakau Station", type: "Fuel", item: "Petrol", amount: 86000, quantity: 210 },
  { id: 11, date: "2026-05-30", station: "Bakau Station", type: "Shop", item: "Sugar", amount: 35000, quantity: 38 },
  { id: 12, date: "2026-05-30", station: "Brikama Station", type: "Cement", item: "Cement", amount: 91000, quantity: 51 },
  { id: 13, date: "2026-05-31", station: "Banjul Station", type: "Shop", item: "Cooking Oil", amount: 43000, quantity: 20 },
  { id: 14, date: "2026-05-31", station: "Serekunda Station", type: "Fuel", item: "Petrol", amount: 101000, quantity: 244 },
  { id: 15, date: "2026-05-31", station: "Serekunda Station", type: "Cement", item: "Cement", amount: 48000, quantity: 26 },
  { id: 16, date: "2026-05-31", station: "Bakau Station", type: "Shop", item: "Rice", amount: 47000, quantity: 55 },
  { id: 17, date: "2026-05-31", station: "Brikama Station", type: "Fuel", item: "Diesel", amount: 79000, quantity: 192 },
  { id: 18, date: "2026-05-31", station: "Brikama Station", type: "Shop", item: "Sugar", amount: 29000, quantity: 30 },
  { id: 19, date: "2026-06-01", station: "Banjul Station", type: "Fuel", item: "Petrol", amount: 121000, quantity: 292 },
  { id: 20, date: "2026-06-01", station: "Serekunda Station", type: "Shop", item: "Onions", amount: 27000, quantity: 28 },
  { id: 21, date: "2026-06-01", station: "Bakau Station", type: "Cement", item: "Cement", amount: 175000, quantity: 97 },
  { id: 22, date: "2026-06-01", station: "Brikama Station", type: "Shop", item: "Cooking Oil", amount: 62000, quantity: 32 },
  { id: 23, date: "2026-06-02", station: "Banjul Station", type: "Shop", item: "Onions", amount: 31000, quantity: 35 },
  { id: 24, date: "2026-06-02", station: "Serekunda Station", type: "Fuel", item: "Diesel", amount: 98000, quantity: 238 },
  { id: 25, date: "2026-06-02", station: "Bakau Station", type: "Shop", item: "Sugar", amount: 42000, quantity: 45 },
  { id: 26, date: "2026-06-02", station: "Brikama Station", type: "Fuel", item: "Petrol", amount: 83000, quantity: 205 },
  { id: 27, date: "2026-06-03", station: "Banjul Station", type: "Fuel", item: "Diesel", amount: 124000, quantity: 296 },
  { id: 28, date: "2026-06-03", station: "Serekunda Station", type: "Shop", item: "Cooking Oil", amount: 76000, quantity: 30 },
  { id: 29, date: "2026-06-03", station: "Bakau Station", type: "Shop", item: "Building Sand", amount: 52000, quantity: 60 },
  { id: 30, date: "2026-06-03", station: "Brikama Station", type: "Cement", item: "Cement", amount: 94000, quantity: 54 },
  { id: 31, date: "2026-06-04", station: "Banjul Station", type: "Fuel", item: "Petrol", amount: 125000, quantity: 300 },
  { id: 32, date: "2026-06-04", station: "Banjul Station", type: "Shop", item: "Cooking Oil", amount: 43000, quantity: 20 },
  { id: 33, date: "2026-06-04", station: "Serekunda Station", type: "Shop", item: "Rice", amount: 45000, quantity: 50 },
  { id: 34, date: "2026-06-04", station: "Bakau Station", type: "Cement", item: "Cement", amount: 180000, quantity: 100 },
  { id: 35, date: "2026-06-04", station: "Brikama Station", type: "Fuel", item: "Diesel", amount: 88000, quantity: 214 },
  { id: 36, date: "2026-06-04", station: "Brikama Station", type: "Shop", item: "Rice", amount: 58000, quantity: 65 },
];

export const inventory = [
  { id: 1, name: "Petrol", station: "Banjul Station", quantity: 8500, unit: "liters", reorderLevel: 5000 },
  { id: 2, name: "Diesel", station: "Banjul Station", quantity: 4200, unit: "liters", reorderLevel: 3000 },
  { id: 3, name: "Rice", station: "Banjul Station", quantity: 150, unit: "bags", reorderLevel: 50 },
  { id: 4, name: "Sugar", station: "Serekunda Station", quantity: 80, unit: "bags", reorderLevel: 30 },
  { id: 5, name: "Cooking Oil", station: "Serekunda Station", quantity: 120, unit: "cartons", reorderLevel: 50 },
  { id: 6, name: "Onions", station: "Bakau Station", quantity: 200, unit: "bags", reorderLevel: 100 },
  { id: 7, name: "Cement", station: "Brikama Station", quantity: 450, unit: "bags", reorderLevel: 200 },
  { id: 8, name: "Building Sand", station: "Brikama Station", quantity: 600, unit: "cubic meters", reorderLevel: 300 },
];

export const lowStockAlerts = [
  { id: 1, item: "Cooking Oil", station: "Serekunda Station", current: 120, required: 150 },
  { id: 2, item: "Diesel", station: "Banjul Station", current: 4200, required: 5000 },
  { id: 3, item: "Sugar", station: "Serekunda Station", current: 80, required: 100 },
];

export const salesByStation = buildSalesByStation(salesData);

export const salesByDay = buildSalesByDay(salesData);

const latestSalesDate = getLatestDate(salesData);
const latestSalesRecords = salesData.filter((record) => record.date === latestSalesDate);

export const todaySales = {
  fuel: sumAmountByType(latestSalesRecords, "Fuel"),
  shop: sumAmountByType(latestSalesRecords, "Shop"),
  cement: sumAmountByType(latestSalesRecords, "Cement"),
};

export const topStations = salesByStation.map((station, index) => ({
  rank: index + 1,
  name: station.station,
  sales: station.total,
  fuel: station.fuel,
  shop: station.shop,
  cement: station.cement,
}));

export const recentSales = [
  { id: 1, time: "14:35", station: "Bakau Station", type: "Fuel (Petrol)", amount: "D45,000", qty: "100L" },
  { id: 2, time: "14:22", station: "Serekunda Station", type: "Rice (50kg bag)", amount: "D8,500", qty: "2" },
  { id: 3, time: "14:10", station: "Banjul Station", type: "Cement", amount: "D18,000", qty: "10" },
  { id: 4, time: "13:58", station: "Brikama Station", type: "Fuel (Diesel)", amount: "D52,000", qty: "120L" },
  { id: 5, time: "13:45", station: "Bakau Station", type: "Cooking Oil", amount: "D12,500", qty: "5L" },
];
