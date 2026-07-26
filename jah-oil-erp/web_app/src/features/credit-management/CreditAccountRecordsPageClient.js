"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import ToastMessage from "@/components/ui/ToastMessage";
import DashboardPageShell from "@/features/dashboard/page-shell";
import {
  formatCurrency,
  formatDisplayDateTime,
} from "@/features/operations/helpers";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactInput,
  CompactSelect,
  PRIMARY_ACTION_BUTTON_CLASS,
} from "@/features/operations/ui";

import {
  saveCreditGuarantorAction,
  uploadCreditAgreementAction,
  uploadCreditorDocumentsAction,
} from "@/app/balance-management/credit-record-actions";

const MODE_COPY = {
  guarantor: {
    title: "Credit Guarantor",
    description: "Add or review guarantors attached to this credit account.",
  },
  agreement: {
    title: "Credit Agreement",
    description: "Upload and review signed credit agreement documents.",
  },
  documents: {
    title: "Creditor Documents",
    description:
      "Store creditor identity and supporting collateral information securely.",
  },
  "follow-ups": {
    title: "Creditor Follow-ups",
    description:
      "Review notification and reminder delivery history for this creditor.",
  },
};

const EMPTY_GUARANTOR_FORM = {
  fullName: "",
  phone: "",
  email: "",
  residentialAddress: "",
  digitalAddress: "",
  identityType: "id_card",
  identityNumber: "",
  photo: null,
  identityFile: null,
};
const MAX_UPLOAD_BATCH_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_COLLATERAL_FILES = 10;

export default function CreditAccountRecordsPageClient({
  account,
  guarantors = [],
  documents = [],
  followUps = [],
  mode,
  shellProps,
}) {
  const [isPending, setIsPending] = useState(false);
  const actionLockRef = useRef(false);
  const [feedback, setFeedback] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [visibleGuarantors, setVisibleGuarantors] = useState(guarantors);
  const [visibleDocuments, setVisibleDocuments] = useState(documents);
  const [guarantorForm, setGuarantorForm] = useState(EMPTY_GUARANTOR_FORM);
  const [agreementForm, setAgreementForm] = useState({
    title: "Credit Agreement",
    notes: "",
    agreementFile: null,
  });
  const [creditorForm, setCreditorForm] = useState({
    identityType: "id_card",
    identityFile: null,
    notes: "",
    collateralRequired: false,
    collateralInfo: "",
    collateralFiles: [],
  });
  const copy = MODE_COPY[mode] || MODE_COPY.documents;
  const agreementDocuments = visibleDocuments.filter(
    (document) => document.documentCategory === "agreement",
  );
  const creditorDocuments = visibleDocuments.filter(
    (document) => document.documentCategory !== "agreement",
  );

  useEffect(() => {
    setVisibleGuarantors((current) => mergeNewRecords(current, guarantors));
  }, [guarantors]);

  useEffect(() => {
    setVisibleDocuments((current) => mergeNewRecords(current, documents));
  }, [documents]);

  function submitGuarantor() {
    const uploadError = getClientUploadBatchError([
      guarantorForm.photo,
      guarantorForm.identityFile,
    ]);

    if (uploadError) {
      setFeedback({ success: false, message: uploadError });
      return;
    }

    const formData = new FormData();
    formData.append("accountId", account.id);
    formData.append("requestId", createClientRequestId());
    Object.entries(guarantorForm).forEach(([key, value]) => {
      if (value !== null) {
        formData.append(key, value);
      }
    });
    runAction(
      () => saveCreditGuarantorAction(formData),
      (result) => {
        if (result?.guarantor) {
          setVisibleGuarantors((current) => [
            result.guarantor,
            ...current.filter(
              (guarantor) => guarantor.id !== result.guarantor.id,
            ),
          ]);
        }
        setGuarantorForm(EMPTY_GUARANTOR_FORM);
      },
    );
  }

  function submitAgreement() {
    const formData = new FormData();
    formData.append("accountId", account.id);
    formData.append("requestId", createClientRequestId());
    formData.append("title", agreementForm.title);
    formData.append("notes", agreementForm.notes);
    if (agreementForm.agreementFile) {
      formData.append("agreementFile", agreementForm.agreementFile);
    }
    runAction(
      () => uploadCreditAgreementAction(formData),
      (result) => {
        if (result?.document) {
          setVisibleDocuments((current) => [
            result.document,
            ...current.filter((document) => document.id !== result.document.id),
          ]);
        }
        setAgreementForm({
          title: "Credit Agreement",
          notes: "",
          agreementFile: null,
        });
      },
    );
  }

  function submitCreditorDocuments() {
    if (creditorForm.collateralFiles.length > MAX_COLLATERAL_FILES) {
      setFeedback({
        success: false,
        message: `Upload no more than ${MAX_COLLATERAL_FILES} collateral documents at once.`,
      });
      return;
    }

    const uploadError = getClientUploadBatchError([
      creditorForm.identityFile,
      ...creditorForm.collateralFiles,
    ]);

    if (uploadError) {
      setFeedback({ success: false, message: uploadError });
      return;
    }

    const formData = new FormData();
    formData.append("accountId", account.id);
    formData.append("requestId", createClientRequestId());
    formData.append("identityType", creditorForm.identityType);
    formData.append("notes", creditorForm.notes);
    formData.append(
      "collateralRequired",
      creditorForm.collateralRequired ? "true" : "false",
    );
    formData.append("collateralInfo", creditorForm.collateralInfo);
    if (creditorForm.identityFile) {
      formData.append("identityFile", creditorForm.identityFile);
    }
    creditorForm.collateralFiles.forEach((file) => {
      formData.append("collateralFiles", file);
    });
    runAction(
      () => uploadCreditorDocumentsAction(formData),
      (result) => {
        if (result?.documents?.length) {
          const createdIds = new Set(
            result.documents.map((document) => document.id),
          );
          setVisibleDocuments((current) => [
            ...result.documents,
            ...current.filter((document) => !createdIds.has(document.id)),
          ]);
        }
        setCreditorForm({
          identityType: "id_card",
          identityFile: null,
          notes: "",
          collateralRequired: false,
          collateralInfo: "",
          collateralFiles: [],
        });
      },
    );
  }

  async function runAction(action, onSuccess) {
    if (actionLockRef.current) {
      return;
    }

    actionLockRef.current = true;
    setFeedback(null);
    setIsPending(true);

    try {
      const result = await action();
      setFeedback(result);
      if (result?.success) {
        onSuccess?.(result);
        setFileInputKey((current) => current + 1);
      }
    } catch {
      setFeedback({
        success: false,
        message: "The record could not be saved. Please try again.",
      });
    } finally {
      actionLockRef.current = false;
      setIsPending(false);
    }
  }

  return (
    <DashboardPageShell
      title={copy.title}
      description={copy.description}
      {...shellProps}
    >
      <ToastMessage
        message={feedback?.message || ""}
        tone={feedback?.success ? "success" : feedback ? "error" : "info"}
        onClose={() => setFeedback(null)}
      />

      <div className="space-y-3">
        <AccountSummary account={account} />
        <div className="flex justify-start sm:justify-end">
          <Link
            href="/balance-management"
            className="inline-flex w-fit rounded-full bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            ← Back to Credit Settlements
          </Link>
        </div>
      </div>

      {mode === "guarantor" ? (
        <GuarantorPanel
          guarantors={visibleGuarantors}
          form={guarantorForm}
          setForm={setGuarantorForm}
          fileInputKey={fileInputKey}
          isPending={isPending}
          onSubmit={submitGuarantor}
        />
      ) : null}

      {mode === "agreement" ? (
        <AgreementPanel
          account={account}
          documents={agreementDocuments}
          form={agreementForm}
          setForm={setAgreementForm}
          fileInputKey={fileInputKey}
          isPending={isPending}
          onSubmit={submitAgreement}
        />
      ) : null}

      {mode === "documents" ? (
        <CreditorDocumentsPanel
          documents={creditorDocuments}
          form={creditorForm}
          setForm={setCreditorForm}
          fileInputKey={fileInputKey}
          isPending={isPending}
          onSubmit={submitCreditorDocuments}
        />
      ) : null}

      {mode === "follow-ups" ? <FollowUpsPanel followUps={followUps} /> : null}
    </DashboardPageShell>
  );
}

function AccountSummary({ account }) {
  return (
    <div className="grid gap-4 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
      <SummaryValue label="Creditor" value={account.customerName} />
      <SummaryValue label="Phone" value={account.customerPhone || "—"} />
      <SummaryValue
        label="Physical address"
        value={account.physicalAddress || "—"}
      />
      <SummaryValue
        label="Digital address"
        value={account.digitalAddress || "—"}
      />
      <SummaryValue
        label="Reference / station"
        value={
          [account.referenceCode, account.stationName]
            .filter(Boolean)
            .join(" · ") || "—"
        }
      />
      <SummaryValue
        label="Outstanding"
        value={formatCurrency(account.balanceAmount)}
      />
    </div>
  );
}

function mergeNewRecords(currentRecords, serverRecords) {
  const current = Array.isArray(currentRecords) ? currentRecords : [];
  const currentIds = new Set(current.map((record) => record.id));
  const additions = (Array.isArray(serverRecords) ? serverRecords : []).filter(
    (record) => record?.id && !currentIds.has(record.id),
  );

  return additions.length ? [...current, ...additions] : current;
}

function createClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `credit-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getClientUploadBatchError(files) {
  const totalSize = files
    .filter(Boolean)
    .reduce((sum, file) => sum + Number(file?.size || 0), 0);

  return totalSize > MAX_UPLOAD_BATCH_SIZE_BYTES
    ? "The combined upload size must be 20MB or smaller."
    : "";
}

function SummaryValue({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Panel({ title, description, children }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function GuarantorPanel({
  guarantors,
  form,
  setForm,
  fileInputKey,
  isPending,
  onSubmit,
}) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-3">
        <Panel
          title="Add guarantor"
          description="Add each guarantor separately. A photo and identity document are required for every guarantor."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="full name">
              <CompactInput
                value={form.fullName}
                maxLength={255}
                onChange={(event) => update("fullName", event.target.value)}
                placeholder="Guarantor full name"
              />
            </Field>
            <Field label="phone">
              <CompactInput
                type="tel"
                value={form.phone}
                maxLength={32}
                onChange={(event) => update("phone", event.target.value)}
                placeholder="Phone number"
              />
            </Field>
            <Field label="email">
              <CompactInput
                type="email"
                value={form.email}
                maxLength={255}
                onChange={(event) => update("email", event.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="digital address">
              <CompactInput
                value={form.digitalAddress}
                maxLength={128}
                onChange={(event) =>
                  update("digitalAddress", event.target.value)
                }
                placeholder="Optional digital address"
              />
            </Field>
            <Field label="residential address" className="sm:col-span-2">
              <CompactInput
                value={form.residentialAddress}
                maxLength={500}
                onChange={(event) =>
                  update("residentialAddress", event.target.value)
                }
                placeholder="Residential address"
              />
            </Field>
            <IdentityTypeField
              value={form.identityType}
              onChange={(value) => update("identityType", value)}
            />
            <Field label="identity number">
              <CompactInput
                value={form.identityNumber}
                maxLength={128}
                onChange={(event) =>
                  update("identityNumber", event.target.value)
                }
                placeholder="Optional ID number"
              />
            </Field>
            <Field label="photo">
              <CompactInput
                key={`photo-${fileInputKey}`}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  update("photo", event.target.files?.[0] || null)
                }
              />
            </Field>
            <Field label="identity document">
              <CompactInput
                key={`identity-${fileInputKey}`}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx"
                onChange={(event) =>
                  update("identityFile", event.target.files?.[0] || null)
                }
              />
            </Field>
          </div>
          <CompactActionButton
            onClick={onSubmit}
            disabled={isPending}
            className={`mt-5 px-5 py-2 ${PRIMARY_ACTION_BUTTON_CLASS}`}
          >
            {isPending ? "Saving..." : "Add guarantor"}
          </CompactActionButton>
        </Panel>
      </div>

      <div className="xl:col-span-2">
        <Panel
          title={`Guarantors (${guarantors.length.toLocaleString()})`}
          description="All guarantors attached to this creditor."
        >
          {guarantors.length ? (
            <div className="space-y-4">
              {guarantors.map((guarantor) => (
                <GuarantorCard key={guarantor.id} guarantor={guarantor} />
              ))}
            </div>
          ) : (
            <EmptyState message="No guarantor information has been added." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function GuarantorCard({ guarantor }) {
  const photoUrl = `/api/credit-files/guarantor/${guarantor.id}/photo`;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
      <div className="flex items-center gap-4 border-b border-slate-200 bg-white p-4">
        {guarantor.photoFileName ? (
          <a
            href={photoUrl}
            target="_blank"
            rel="noreferrer"
            className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={`${guarantor.fullName} guarantor`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </a>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-xl font-semibold text-slate-600">
            {guarantor.fullName?.[0]?.toUpperCase() || "G"}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {guarantor.fullName}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{guarantor.phone}</p>
        </div>
      </div>

      <div className="space-y-3 p-4 text-sm">
        <RecordLine label="Email" value={guarantor.email || "—"} />
        <RecordLine
          label="Address"
          value={guarantor.residentialAddress || "—"}
        />
        <RecordLine
          label="Digital address"
          value={guarantor.digitalAddress || "—"}
        />
        <RecordLine
          label="Identity"
          value={`${formatIdentityType(guarantor.identityType)}${
            guarantor.identityNumber ? ` · ${guarantor.identityNumber}` : ""
          }`}
        />
        <RecordLine
          label="Added"
          value={
            guarantor.createdAt
              ? formatDisplayDateTime(guarantor.createdAt)
              : "—"
          }
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {guarantor.photoFileName ? (
            <FileLink
              href={photoUrl}
              label={`Show photo (${guarantor.photoFileName})`}
            />
          ) : null}
          {guarantor.identityFileName ? (
            <FileLink
              href={`/api/credit-files/guarantor/${guarantor.id}/identity`}
              label={`Show identity (${guarantor.identityFileName})`}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AgreementPanel({
  documents,
  form,
  setForm,
  fileInputKey,
  isPending,
  onSubmit,
}) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-2">
        <Panel
          title="Upload agreement"
          description="Upload a signed credit agreement as an image, PDF, DOC, or DOCX file."
        >
          <div className="space-y-4">
            <Field label="document title">
              <CompactInput
                value={form.title}
                maxLength={255}
                onChange={(event) => update("title", event.target.value)}
              />
            </Field>
            <Field label="agreement file">
              <CompactInput
                key={`agreement-${fileInputKey}`}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx"
                onChange={(event) =>
                  update("agreementFile", event.target.files?.[0] || null)
                }
              />
            </Field>
            <Field label="notes">
              <CompactInput
                value={form.notes}
                maxLength={2000}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Optional notes"
              />
            </Field>
          </div>
          <CompactActionButton
            onClick={onSubmit}
            disabled={isPending}
            className={`mt-5 px-5 py-2 ${PRIMARY_ACTION_BUTTON_CLASS}`}
          >
            {isPending ? "Uploading..." : "Upload agreement"}
          </CompactActionButton>
        </Panel>
      </div>
      <div className="xl:col-span-3">
        <DocumentList
          title="Uploaded agreements"
          description="All agreements currently attached to this credit account."
          documents={documents}
        />
      </div>
    </div>
  );
}

function CreditorDocumentsPanel({
  documents,
  form,
  setForm,
  fileInputKey,
  isPending,
  onSubmit,
}) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-2">
        <Panel
          title="Upload creditor documents"
          description="Creditor identity is required. Add collateral details and files when the credit arrangement requires collateral."
        >
          <div className="space-y-4">
            <IdentityTypeField
              value={form.identityType}
              onChange={(value) => update("identityType", value)}
            />
            <Field label="creditor identity">
              <CompactInput
                key={`creditor-identity-${fileInputKey}`}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx"
                onChange={(event) =>
                  update("identityFile", event.target.files?.[0] || null)
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.collateralRequired}
                onChange={(event) =>
                  update("collateralRequired", event.target.checked)
                }
              />
              Collateral is required
            </label>
            {form.collateralRequired ? (
              <>
                <Field label="collateral information">
                  <textarea
                    value={form.collateralInfo}
                    maxLength={2000}
                    onChange={(event) =>
                      update("collateralInfo", event.target.value)
                    }
                    placeholder="Describe the collateral, ownership, condition, and reference details"
                    className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500"
                  />
                </Field>
                <Field label="collateral documents">
                  <CompactInput
                    key={`collateral-${fileInputKey}`}
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx"
                    onChange={(event) =>
                      update(
                        "collateralFiles",
                        Array.from(event.target.files || []),
                      )
                    }
                  />
                </Field>
              </>
            ) : null}
            <Field label="notes">
              <CompactInput
                value={form.notes}
                maxLength={2000}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Optional notes"
              />
            </Field>
          </div>
          <CompactActionButton
            onClick={onSubmit}
            disabled={isPending}
            className={`mt-5 px-5 py-2 ${PRIMARY_ACTION_BUTTON_CLASS}`}
          >
            {isPending ? "Uploading..." : "Upload creditor documents"}
          </CompactActionButton>
        </Panel>
      </div>
      <div className="xl:col-span-3">
        <DocumentList
          title="Creditor documents"
          description="Identity and collateral documents currently attached to this account."
          documents={documents}
        />
      </div>
    </div>
  );
}

function DocumentList({ title, description, documents }) {
  return (
    <Panel title={title} description={description}>
      {documents.length ? (
        <div className="divide-y divide-slate-100">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {document.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDocumentCategory(document)}
                  {document.uploadedAt
                    ? ` · ${formatDisplayDateTime(document.uploadedAt)}`
                    : ""}
                  {document.uploadedByName
                    ? ` · ${document.uploadedByName}`
                    : ""}
                </p>
                {document.collateralInfo ? (
                  <p className="mt-2 text-xs text-slate-600">
                    {document.collateralInfo}
                  </p>
                ) : null}
                {document.notes ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {document.notes}
                  </p>
                ) : null}
              </div>
              <FileLink
                href={`/api/credit-files/document/${document.id}/file`}
                label={`Show ${document.fileName}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No documents have been uploaded yet." />
      )}
    </Panel>
  );
}

function FollowUpsPanel({ followUps }) {
  return (
    <Panel
      title={`Follow-ups (${followUps.length.toLocaleString()})`}
      description="Email and SMS reminders sent or attempted for this creditor, newest first."
    >
      {followUps.length ? (
        <div className="space-y-4">
          {followUps.map((followUp) => (
            <FollowUpCard key={followUp.id} followUp={followUp} />
          ))}
        </div>
      ) : (
        <EmptyState message="No creditor notifications or reminders have been recorded yet." />
      )}
    </Panel>
  );
}

function FollowUpCard({ followUp }) {
  const attemptedAt = followUp.createdAt || followUp.updatedAt;

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
            {formatFollowUpEventType(followUp.eventType)}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">
            {followUp.subject || "Credit reminder"}
          </h3>
        </div>
        <FollowUpStatus status={followUp.status} />
      </div>

      <p className="mt-3 text-sm whitespace-pre-wrap text-slate-700">
        {followUp.message || "—"}
      </p>

      <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <FollowUpDetail
          label="Channel"
          value={formatFollowUpChannel(followUp.channel)}
        />
        <FollowUpDetail
          label="Recipient"
          value={
            [followUp.recipientName, followUp.recipientContact]
              .filter(Boolean)
              .join(" · ") || "—"
          }
        />
        <FollowUpDetail
          label="Attempted"
          value={attemptedAt ? formatDisplayDateTime(attemptedAt) : "—"}
        />
        <FollowUpDetail
          label="Sent"
          value={followUp.sentAt ? formatDisplayDateTime(followUp.sentAt) : "—"}
        />
      </dl>

      {followUp.lastError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-rose-500 uppercase">
            Delivery note
          </p>
          <p className="mt-1 text-xs text-rose-700">{followUp.lastError}</p>
        </div>
      ) : null}
    </article>
  );
}

function FollowUpDetail({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-xs font-medium break-words text-slate-700">
        {value}
      </dd>
    </div>
  );
}

function FollowUpStatus({ status }) {
  const normalizedStatus = `${status || ""}`.toLowerCase();
  const styles =
    normalizedStatus === "sent"
      ? "bg-emerald-100 text-emerald-700"
      : normalizedStatus === "failed"
        ? "bg-rose-100 text-rose-700"
        : normalizedStatus === "pending"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-200 text-slate-700";

  return (
    <span
      className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles}`}
    >
      {normalizedStatus || "unknown"}
    </span>
  );
}

function formatFollowUpChannel(channel) {
  const normalizedChannel = `${channel || ""}`.toLowerCase();

  if (normalizedChannel === "sms") {
    return "SMS";
  }

  if (normalizedChannel === "email") {
    return "Email";
  }

  return normalizedChannel || "—";
}

function formatFollowUpEventType(eventType) {
  if (eventType === "credit_overdue") {
    return "Overdue credit reminder";
  }

  if (eventType === "credit_due") {
    return "Credit due reminder";
  }

  return "Creditor notification";
}

function Field({ label, className = "", children }) {
  return (
    <div className={className}>
      <CompactFieldLabel>{label}</CompactFieldLabel>
      {children}
    </div>
  );
}

function IdentityTypeField({ value, onChange }) {
  return (
    <Field label="identity type">
      <CompactSelect
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="id_card">ID Card</option>
        <option value="passport">Passport</option>
        <option value="drivers_license">Driver&apos;s License</option>
      </CompactSelect>
    </Field>
  );
}

function FileLink({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex w-fit rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
    >
      {label}
    </a>
  );
}

function RecordLine({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-right text-xs font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function formatIdentityType(value) {
  if (value === "id_card") {
    return "ID Card";
  }
  if (value === "drivers_license") {
    return "Driver's License";
  }
  return "Passport";
}

function formatDocumentCategory(document) {
  if (document.documentCategory === "creditor_identity") {
    return `Creditor ${formatIdentityType(document.identityType)}`;
  }
  if (document.documentCategory === "collateral") {
    return "Collateral document";
  }
  return "Credit agreement";
}
