"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
import DashboardPageShell from "@/features/dashboard/page-shell";
import { buildPaymentMethodCodeFromLabel } from "@/features/payments/constants";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactFilterCard,
  CompactInput,
  CompactSelect,
  CompactSplitPanel,
  CompactSummaryCards,
  PRIMARY_ACTION_BUTTON_CLASS,
} from "@/features/operations/ui";

import { savePaymentMethodAction } from "./actions";

const NEW_PAYMENT_METHOD_KEY = "__new__";

const paymentMethodColumns = [
  { key: "label", label: "Method" },
  { key: "codeLabel", label: "Code" },
  { key: "description", label: "Description" },
  { key: "sortOrder", label: "Order", format: "number" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          row.isEnabled
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-200 text-slate-700"
        }`}
      >
        {row.statusLabel}
      </span>
    ),
  },
];

const DEFAULT_FORM = {
  code: "",
  label: "",
  description: "",
  isEnabled: true,
  sortOrder: "",
};

function buildSummaryCards(paymentMethods) {
  const enabledCount = paymentMethods.filter((method) => method.isEnabled).length;
  const disabledCount = paymentMethods.length - enabledCount;

  return [
    {
      title: "Configured Methods",
      value: paymentMethods.length.toLocaleString(),
      icon: "💳",
    },
    {
      title: "Enabled Methods",
      value: enabledCount.toLocaleString(),
      icon: "✅",
    },
    {
      title: "Disabled Methods",
      value: disabledCount.toLocaleString(),
      icon: "⏸️",
    },
  ];
}

function getNextSortOrder(paymentMethods) {
  return (
    paymentMethods.reduce(
      (maxValue, method) =>
        Math.max(maxValue, Number(method.sortOrder || 0)),
      0,
    ) + 1
  );
}

function buildNewMethodForm(paymentMethods) {
  return {
    ...DEFAULT_FORM,
    sortOrder: `${getNextSortOrder(paymentMethods)}`,
  };
}

export default function PaymentMethodsPageClient({
  paymentMethods,
  shellProps,
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCode, setSelectedCode] = useState("");
  const [isCreatingMethod, setIsCreatingMethod] = useState(false);
  const [hasManualCodeOverride, setHasManualCodeOverride] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [methodForm, setMethodForm] = useState(DEFAULT_FORM);

  const paymentMethodRows = useMemo(
    () =>
      paymentMethods.map((method) => ({
        ...method,
        codeLabel: `${method.code || ""}`.toUpperCase(),
        statusLabel: method.isEnabled ? "Enabled" : "Disabled",
      })),
    [paymentMethods],
  );

  const filteredPaymentMethods = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return paymentMethodRows.filter((method) => {
      if (
        statusFilter !== "All" &&
        `${method.isEnabled ? "enabled" : "disabled"}` !== statusFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [method.label, method.code, method.description]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [paymentMethodRows, searchTerm, statusFilter]);

  const selectedMethod = useMemo(
    () =>
      isCreatingMethod
        ? null
        : paymentMethodRows.find((method) => method.code === selectedCode) || null,
    [isCreatingMethod, paymentMethodRows, selectedCode],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(paymentMethodRows),
    [paymentMethodRows],
  );

  useEffect(() => {
    if (!selectedCode && !isCreatingMethod && paymentMethodRows.length > 0) {
      setSelectedCode(paymentMethodRows[0].code);
    }
  }, [isCreatingMethod, paymentMethodRows, selectedCode]);

  useEffect(() => {
    if (isCreatingMethod) {
      return;
    }

    if (!selectedMethod) {
      setMethodForm(DEFAULT_FORM);
      return;
    }

    setMethodForm({
      code: selectedMethod.code || "",
      label: selectedMethod.label || "",
      description: selectedMethod.description || "",
      isEnabled: Boolean(selectedMethod.isEnabled),
      sortOrder: `${Number(selectedMethod.sortOrder || 0)}`,
    });
  }, [isCreatingMethod, selectedMethod]);

  function resetFilters() {
    setStatusFilter("All");
    setSearchTerm("");
    setFeedback(null);
  }

  function updateMethodForm(key, value) {
    setMethodForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function startCreateMethod() {
    setIsCreatingMethod(true);
    setHasManualCodeOverride(false);
    setSelectedCode(NEW_PAYMENT_METHOD_KEY);
    setMethodForm(buildNewMethodForm(paymentMethodRows));
    setFeedback(null);
  }

  function handleLabelChange(value) {
    setMethodForm((current) => ({
      ...current,
      label: value,
      code:
        isCreatingMethod && !hasManualCodeOverride
          ? buildPaymentMethodCodeFromLabel(value)
          : current.code,
    }));
  }

  function handleSubmit() {
    if (!selectedMethod && !isCreatingMethod) {
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await savePaymentMethodAction({
        code: methodForm.code,
        label: methodForm.label,
        description: methodForm.description,
        isEnabled: methodForm.isEnabled,
        sortOrder: Number(methodForm.sortOrder || 0),
      });

      setFeedback(result);

      if (result?.success) {
        setIsCreatingMethod(false);
        setHasManualCodeOverride(false);
        setSelectedCode(result.paymentMethodCode || methodForm.code);
        router.refresh();
      }
    });
  }

  return (
    <DashboardPageShell
      title="Payment Methods"
      description="Enable the payment methods your cashiers can use in POS and control how they appear at checkout."
      {...shellProps}
    >
      <CompactFilterCard
        actions={
          <>
            <CompactActionButton
              onClick={startCreateMethod}
              className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
            >
              Add payment method
            </CompactActionButton>
            <CompactActionButton onClick={resetFilters}>
              Reset filters
            </CompactActionButton>
          </>
        }
      >
        <div>
          <CompactFieldLabel htmlFor="paymentMethodSearch">search</CompactFieldLabel>
          <CompactInput
            id="paymentMethodSearch"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search method, code, description"
          />
        </div>
        <div>
          <CompactFieldLabel htmlFor="paymentMethodStatusFilter">status</CompactFieldLabel>
          <CompactSelect
            id="paymentMethodStatusFilter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="All">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </CompactSelect>
        </div>
      </CompactFilterCard>

      {feedback?.message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            feedback.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <CompactSummaryCards items={summaryCards} fullRow />

      <CompactSplitPanel
        className="gap-6"
        left={
          <DataTable
            columns={paymentMethodColumns}
            data={filteredPaymentMethods}
            title="Configured Payment Methods"
            subtitle="Select a method to edit it, or add a new method for POS checkout."
            onRowClick={(row) => {
              setIsCreatingMethod(false);
              setHasManualCodeOverride(false);
              setSelectedCode(row.code);
              setFeedback(null);
            }}
            selectedRowKey={selectedCode}
            selectedRowField="code"
          />
        }
        right={
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {isCreatingMethod
                  ? "Add Payment Method"
                  : selectedMethod
                    ? "Edit Payment Method"
                    : "Select a Payment Method"}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {isCreatingMethod
                  ? "Create a new checkout method and decide whether it is immediately available in POS."
                  : selectedMethod
                    ? "Only enabled methods appear in POS checkout."
                    : "Choose a method from the table or create a new one."}
              </p>
            </div>

            {selectedMethod || isCreatingMethod ? (
              <div className="mt-5 space-y-4">
                <div>
                  <CompactFieldLabel htmlFor="paymentMethodCode">code</CompactFieldLabel>
                  <CompactInput
                    id="paymentMethodCode"
                    value={methodForm.code}
                    disabled={!isCreatingMethod}
                    onChange={(event) => {
                      setHasManualCodeOverride(true);
                      updateMethodForm("code", event.target.value);
                    }}
                    placeholder="mobile-money"
                  />
                </div>

                <div>
                  <CompactFieldLabel htmlFor="paymentMethodLabel">label</CompactFieldLabel>
                  <CompactInput
                    id="paymentMethodLabel"
                    value={methodForm.label}
                    onChange={(event) => handleLabelChange(event.target.value)}
                    placeholder="Display label"
                  />
                </div>

                <div>
                  <CompactFieldLabel htmlFor="paymentMethodDescription">description</CompactFieldLabel>
                  <CompactInput
                    id="paymentMethodDescription"
                    value={methodForm.description}
                    onChange={(event) =>
                      updateMethodForm("description", event.target.value)
                    }
                    placeholder="Optional checkout guidance"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <CompactFieldLabel htmlFor="paymentMethodStatus">status</CompactFieldLabel>
                    <CompactSelect
                      id="paymentMethodStatus"
                      value={methodForm.isEnabled ? "enabled" : "disabled"}
                      onChange={(event) =>
                        updateMethodForm(
                          "isEnabled",
                          event.target.value === "enabled",
                        )
                      }
                    >
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </CompactSelect>
                  </div>

                  <div>
                    <CompactFieldLabel htmlFor="paymentMethodOrder">sort order</CompactFieldLabel>
                    <CompactInput
                      id="paymentMethodOrder"
                      type="number"
                      min="0"
                      value={methodForm.sortOrder}
                      onChange={(event) =>
                        updateMethodForm("sortOrder", event.target.value)
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className={`cursor-pointer w-full rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                >
                  {isPending
                    ? "Saving..."
                    : isCreatingMethod
                      ? "Create Payment Method"
                      : "Save Payment Method"}
                </button>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                Select a payment method to edit it, or use “Add payment method” to create a new one.
              </div>
            )}
          </div>
        }
      />
    </DashboardPageShell>
  );
}
