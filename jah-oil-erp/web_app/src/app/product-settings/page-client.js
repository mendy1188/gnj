"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
import ToastMessage from "@/components/ui/ToastMessage";
import DashboardPageShell from "@/features/dashboard/page-shell";
import { PAGE_SIZE, paginateItems } from "@/features/operations/helpers";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactFilterCard,
  CompactInput,
  CompactSelect,
  CompactSplitPanel,
  CompactSummaryCards,
  PaginationControls,
  PaginationSummary,
  PRIMARY_ACTION_BUTTON_CLASS,
} from "@/features/operations/ui";

import {
  createProductAction,
  toggleProductStatusAction,
  updateProductPriceAction,
  updateProductReorderLevelAction,
} from "./actions";

const productColumns = [
  { key: "name", label: "Product" },
  { key: "categoryLabel", label: "Category" },
  { key: "unitLabel", label: "Unit" },
  { key: "reorderLevel", label: "Reorder Level", format: "number" },
  { key: "price", label: "Price", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          row.status === "active"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-200 text-slate-700"
        }`}
      >
        {row.statusLabel}
      </span>
    ),
  },
];

const priceHistoryColumns = [
  { key: "changedDate", label: "Changed" },
  { key: "previousPrice", label: "Previous", format: "currency" },
  { key: "newPrice", label: "New", format: "currency" },
  { key: "changedByName", label: "Changed By" },
  { key: "notes", label: "Notes" },
];

const DEFAULT_CREATE_FORM = {
  name: "",
  category: "shop",
  unit: "",
  price: "",
  reorderLevel: "",
  description: "",
};

const DEFAULT_PRICE_FORM = {
  newPrice: "",
  notes: "",
};

const DEFAULT_REORDER_FORM = {
  reorderLevel: "",
};

function categoryLabel(category) {
  if (category === "fuel") {
    return "Fuel";
  }
  if (category === "cement") {
    return "Cement";
  }
  return "Shop";
}

function statusLabel(status) {
  return status === "active" ? "Active" : "Inactive";
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function buildSummaryCards(products, priceHistoryRecords) {
  const activeProducts = products.filter((product) => product.status === "active").length;
  const inactiveProducts = products.length - activeProducts;
  const latestChange = priceHistoryRecords[0];

  return [
    {
      title: "Catalog Products",
      value: products.length.toLocaleString(),
      icon: "🏷️",
    },
    {
      title: "Active Products",
      value: activeProducts.toLocaleString(),
      icon: "✅",
    },
    {
      title: "Latest Price Update",
      value: latestChange?.productName || "No updates yet",
      icon: inactiveProducts > 0 ? "⏸️" : "🕒",
    },
  ];
}

function buildDetailCards(product, inventoryRecords, historyRecords) {
  const productInventoryRows = inventoryRecords.filter(
    (record) => record.productId === product.id,
  );

  return [
    {
      title: "Current Price",
      value: `D${Number(product.price || 0).toLocaleString()}`,
      icon: "💵",
    },
    {
      title: "Inventory Coverage",
      value: `${productInventoryRows.length.toLocaleString()} branches`,
      icon: "📦",
    },
    {
      title: "Reorder Level",
      value: Number(product.reorderLevel || 0).toLocaleString(),
      icon: "📏",
    },
  ];
}

function buildProductReorderLevelMap(inventoryRecords) {
  return inventoryRecords.reduce((map, record) => {
    if (!map.has(record.productId)) {
      map.set(record.productId, Number(record.reorderLevel || 0));
    }

    return map;
  }, new Map());
}

export default function ProductSettingsPageClient({
  products,
  priceHistoryRecords,
  inventoryRecords,
  shellProps,
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [feedback, setFeedback] = useState(null);
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
  const [priceForm, setPriceForm] = useState(DEFAULT_PRICE_FORM);
  const [reorderForm, setReorderForm] = useState(DEFAULT_REORDER_FORM);

  const reorderLevelsByProductId = useMemo(
    () => buildProductReorderLevelMap(inventoryRecords),
    [inventoryRecords],
  );

  const productRows = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        categoryLabel: categoryLabel(product.category),
        unitLabel: product.unit || "unit",
        reorderLevel: Number(reorderLevelsByProductId.get(product.id) || 0),
        statusLabel: statusLabel(product.status),
      })),
    [products, reorderLevelsByProductId],
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return productRows.filter((product) => {
      if (categoryFilter !== "All" && product.category !== categoryFilter) {
        return false;
      }

      if (statusFilter !== "All" && product.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [product.name, product.sku, product.categoryLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [categoryFilter, productRows, searchTerm, statusFilter]);

  const selectedProduct = useMemo(
    () => productRows.find((product) => product.id === selectedProductId) || null,
    [productRows, selectedProductId],
  );

  const selectedProductHistory = useMemo(
    () =>
      priceHistoryRecords
        .filter((record) => record.productId === selectedProductId)
        .map((record) => ({
          ...record,
          changedDate: formatDateTime(record.changedAt),
        })),
    [priceHistoryRecords, selectedProductId],
  );

  const paginatedHistory = useMemo(
    () => paginateItems(selectedProductHistory, historyPage, PAGE_SIZE),
    [historyPage, selectedProductHistory],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(products, priceHistoryRecords),
    [priceHistoryRecords, products],
  );

  useEffect(() => {
    setReorderForm({
      reorderLevel: selectedProduct
        ? `${Number(selectedProduct.reorderLevel || 0)}`
        : "",
    });
  }, [selectedProduct]);

  function resetFilters() {
    setCategoryFilter("All");
    setStatusFilter("All");
    setSearchTerm("");
    setFeedback(null);
  }

  function updateCreateForm(key, value) {
    setCreateForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updatePriceForm(key, value) {
    setPriceForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateReorderForm(key, value) {
    setReorderForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleCreateProduct() {
    setFeedback(null);

    startTransition(async () => {
      const result = await createProductAction({
        ...createForm,
        price: Number(createForm.price || 0),
        reorderLevel: Number(createForm.reorderLevel || 0),
      });

      setFeedback(result);

      if (result?.success) {
        setCreateForm(DEFAULT_CREATE_FORM);
        setSelectedProductId(result.productId || "");
        router.refresh();
      }
    });
  }

  function handleUpdatePrice() {
    if (!selectedProduct) {
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await updateProductPriceAction({
        productId: selectedProduct.id,
        newPrice: Number(priceForm.newPrice || 0),
        notes: priceForm.notes,
      });

      setFeedback(result);

      if (result?.success) {
        setPriceForm(DEFAULT_PRICE_FORM);
        router.refresh();
      }
    });
  }

  function handleUpdateReorderLevel() {
    if (!selectedProduct) {
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await updateProductReorderLevelAction({
        productId: selectedProduct.id,
        reorderLevel: Number(reorderForm.reorderLevel || 0),
      });

      setFeedback(result);

      if (result?.success) {
        router.refresh();
      }
    });
  }

  function handleToggleStatus() {
    if (!selectedProduct) {
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await toggleProductStatusAction({
        productId: selectedProduct.id,
      });

      setFeedback(result);

      if (result?.success) {
        router.refresh();
      }
    });
  }

  return (
    <DashboardPageShell
      title="Product Settings"
      description="Manage the product catalog, selling prices, and active product availability."
      {...shellProps}
    >
      <CompactFilterCard
        actions={
          <CompactActionButton onClick={resetFilters}>Reset filters</CompactActionButton>
        }
      >
        <div>
          <CompactFieldLabel htmlFor="productSearch">search</CompactFieldLabel>
          <CompactInput
            id="productSearch"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search product"
          />
        </div>
        <div>
          <CompactFieldLabel htmlFor="productCategory">category</CompactFieldLabel>
          <CompactSelect
            id="productCategory"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="All">All</option>
            <option value="fuel">Fuel</option>
            <option value="shop">Shop</option>
            <option value="cement">Cement</option>
          </CompactSelect>
        </div>
        <div>
          <CompactFieldLabel htmlFor="productStatus">status</CompactFieldLabel>
          <CompactSelect
            id="productStatus"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="All">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </CompactSelect>
        </div>
      </CompactFilterCard>

      <ToastMessage
        message={feedback?.message || ""}
        tone={feedback?.success ? "success" : feedback ? "error" : "info"}
        onClose={() => setFeedback(null)}
      />

      {!selectedProduct ? (
        <>
          <CompactSummaryCards items={summaryCards} fullRow />
          <CompactSplitPanel
            className="gap-6"
            left={
              <DataTable
                columns={productColumns}
                data={filteredProducts}
                title="Product Catalog"
                subtitle="Open a product to review price history, update selling price, or change status."
                onRowClick={(row) => {
                  setSelectedProductId(row.id);
                  setHistoryPage(1);
                  setFeedback(null);
                }}
              />
            }
            right={
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Add Product</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    New products are added to the catalog and created in inventory for every branch.
                  </p>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <CompactFieldLabel htmlFor="productName">name</CompactFieldLabel>
                    <CompactInput
                      id="productName"
                      value={createForm.name}
                      onChange={(event) => updateCreateForm("name", event.target.value)}
                      placeholder="Product name"
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>sku</CompactFieldLabel>
                    <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      Generated automatically from category and product name.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <CompactFieldLabel htmlFor="productCategoryInput">category</CompactFieldLabel>
                      <CompactSelect
                        id="productCategoryInput"
                        value={createForm.category}
                        onChange={(event) => updateCreateForm("category", event.target.value)}
                      >
                        <option value="shop">Shop</option>
                        <option value="fuel">Fuel</option>
                        <option value="cement">Cement</option>
                      </CompactSelect>
                    </div>
                    <div>
                      <CompactFieldLabel htmlFor="productUnit">unit</CompactFieldLabel>
                      <CompactInput
                        id="productUnit"
                        value={createForm.unit}
                        onChange={(event) => updateCreateForm("unit", event.target.value)}
                        placeholder="bags, liters, cartons"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <CompactFieldLabel htmlFor="productPrice">price</CompactFieldLabel>
                      <CompactInput
                        id="productPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        value={createForm.price}
                        onChange={(event) => updateCreateForm("price", event.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <CompactFieldLabel htmlFor="productReorder">reorder level</CompactFieldLabel>
                      <CompactInput
                        id="productReorder"
                        type="number"
                        min="0"
                        step="0.01"
                        value={createForm.reorderLevel}
                        onChange={(event) => updateCreateForm("reorderLevel", event.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <CompactFieldLabel htmlFor="productDescription">description</CompactFieldLabel>
                    <textarea
                      id="productDescription"
                      value={createForm.description}
                      onChange={(event) => updateCreateForm("description", event.target.value)}
                      className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 transition outline-none focus:border-sky-500"
                      placeholder="Optional description"
                    />
                  </div>
                  <CompactActionButton
                    onClick={handleCreateProduct}
                    disabled={isPending}
                    className={PRIMARY_ACTION_BUTTON_CLASS}
                  >
                    {isPending ? "Saving..." : "Create product"}
                  </CompactActionButton>
                </div>
              </div>
            }
            leftSpan="xl:col-span-6"
            rightSpan="xl:col-span-4"
          />
        </>
      ) : (
        <div className="space-y-6">
          <CompactSummaryCards
            items={buildDetailCards(selectedProduct, inventoryRecords, selectedProductHistory)}
            fullRow
          />
          <PaginationSummary
            currentPage={historyPage}
            totalItems={selectedProductHistory.length}
            pageSize={PAGE_SIZE}
            label="Price changes"
            actions={
              <CompactActionButton
                onClick={() => {
                  setSelectedProductId("");
                  setHistoryPage(1);
                  setPriceForm(DEFAULT_PRICE_FORM);
                  setFeedback(null);
                }}
              >
                ← Back to products
              </CompactActionButton>
            }
          />
          <CompactSplitPanel
            className="gap-6"
            left={
              <>
                <DataTable
                  columns={priceHistoryColumns}
                  data={paginatedHistory}
                  title={`${selectedProduct.name} Price History`}
                  subtitle={`Track price changes, who made them, and when they were applied. Current status: ${statusLabel(
                    selectedProduct.status,
                  )}.`}
                />
                <div className="mt-6">
                  <PaginationControls
                    currentPage={historyPage}
                    totalItems={selectedProductHistory.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setHistoryPage}
                  />
                </div>
              </>
            }
            right={
              <div className="space-y-6">
                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Update Price</h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Current selling price is D{Number(selectedProduct.price || 0).toLocaleString()} per {selectedProduct.unit}.
                    </p>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <CompactFieldLabel htmlFor="newPrice">new price</CompactFieldLabel>
                      <CompactInput
                        id="newPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        value={priceForm.newPrice}
                        onChange={(event) => updatePriceForm("newPrice", event.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <CompactFieldLabel htmlFor="priceNotes">notes</CompactFieldLabel>
                      <textarea
                        id="priceNotes"
                        value={priceForm.notes}
                        onChange={(event) => updatePriceForm("notes", event.target.value)}
                        className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 transition outline-none focus:border-sky-500"
                        placeholder="Reason for price change"
                      />
                    </div>
                    <CompactActionButton
                      onClick={handleUpdatePrice}
                      disabled={isPending}
                      className={PRIMARY_ACTION_BUTTON_CLASS}
                    >
                      {isPending ? "Saving..." : "Save new price"}
                    </CompactActionButton>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Update Reorder Level</h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Current reorder level is {Number(selectedProduct.reorderLevel || 0).toLocaleString()} for all branch inventory records.
                    </p>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <CompactFieldLabel htmlFor="newReorderLevel">reorder level</CompactFieldLabel>
                      <CompactInput
                        id="newReorderLevel"
                        type="number"
                        min="0"
                        step="0.01"
                        value={reorderForm.reorderLevel}
                        onChange={(event) =>
                          updateReorderForm("reorderLevel", event.target.value)
                        }
                        placeholder="0"
                      />
                    </div>
                    <CompactActionButton
                      onClick={handleUpdateReorderLevel}
                      disabled={isPending}
                      className={PRIMARY_ACTION_BUTTON_CLASS}
                    >
                      {isPending ? "Saving..." : "Save reorder level"}
                    </CompactActionButton>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Product Status</h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Disable a product to remove it from active selling flows while keeping its history.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Status
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {statusLabel(selectedProduct.status)}
                      </p>
                    </div>
                    <CompactActionButton
                      onClick={handleToggleStatus}
                      disabled={isPending}
                      className={
                        selectedProduct.status === "active"
                          ? "bg-slate-900 text-white hover:bg-slate-800 disabled:hover:bg-slate-900"
                          : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:hover:bg-emerald-600"
                      }
                    >
                      {selectedProduct.status === "active" ? "Disable product" : "Enable product"}
                    </CompactActionButton>
                  </div>
                </div>
              </div>
            }
            leftSpan="xl:col-span-6"
            rightSpan="xl:col-span-4"
          />
        </div>
      )}
    </DashboardPageShell>
  );
}
