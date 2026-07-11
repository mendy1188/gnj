"use server";

import { Client, Databases, ID, Query } from "appwrite";
import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  buildCouponCode,
  buildCouponPurchaseReference,
  COUPON_COLLECTIONS,
  listAllCouponDocuments,
  normalizeCouponCompanyName,
  normalizeCouponCompanyStatus,
  refreshCouponPurchaseTotals,
} from "@/features/coupons/server";
import { invalidateAppwriteCollectionCache } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

export async function createCouponCompanyAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("coupon-purchases");

  const values = normalizeCompanyPayload(payload);

  if (!values.success) {
    return values;
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const now = new Date().toISOString();

  try {
    const existingCompanies = await listAllCouponDocuments(
      databases,
      config.databaseId,
      COUPON_COLLECTIONS.companies,
    );
    const duplicateCompany = existingCompanies.find(
      (company) =>
        normalizeCouponCompanyName(company.name) ===
        normalizeCouponCompanyName(values.name),
    );

    if (duplicateCompany) {
      return {
        success: false,
        message: "A company or organization with that name already exists.",
      };
    }

    const companyDocument = await databases.createDocument(
      config.databaseId,
      COUPON_COLLECTIONS.companies,
      ID.unique(),
      {
        name: values.name,
        date_joined: values.dateJoined,
        status: values.status,
        notes: values.notes,
        created_at: now,
        updated_at: now,
      },
    );

    revalidateCouponPages();

    return {
      success: true,
      companyId: companyDocument.$id,
      message: `${values.name} added successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Purchase Coupons",
        genericLabel: "create this company or organization",
        fallbackMessage: "Failed to create company or organization.",
      }),
    };
  }
}

export async function updateCouponCompanyAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("coupon-purchases");

  const companyId = `${payload?.companyId || ""}`.trim();

  if (!companyId) {
    return {
      success: false,
      message: "Select a company or organization before updating it.",
    };
  }

  const values = normalizeCompanyPayload(payload);

  if (!values.success) {
    return values;
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const existingCompany = await databases.getDocument(
      config.databaseId,
      COUPON_COLLECTIONS.companies,
      companyId,
    );
    const existingCompanies = await listAllCouponDocuments(
      databases,
      config.databaseId,
      COUPON_COLLECTIONS.companies,
    );
    const duplicateCompany = existingCompanies.find(
      (company) =>
        company.$id !== companyId &&
        normalizeCouponCompanyName(company.name) ===
          normalizeCouponCompanyName(values.name),
    );

    if (duplicateCompany) {
      return {
        success: false,
        message: "Another company or organization already uses that name.",
      };
    }

    await databases.updateDocument(
      config.databaseId,
      COUPON_COLLECTIONS.companies,
      companyId,
      {
        name: values.name,
        date_joined: values.dateJoined,
        status: values.status,
        notes: values.notes,
        updated_at: new Date().toISOString(),
      },
    );

    if ((existingCompany.name || "") !== values.name) {
      await renameCouponCompanyAcrossCollections(
        databases,
        config.databaseId,
        companyId,
        values.name,
      );
    }

    revalidateCouponPages();

    return {
      success: true,
      companyId,
      message: `${values.name} updated successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Purchase Coupons",
        genericLabel: "update this company or organization",
        fallbackMessage: "Failed to update company or organization.",
      }),
    };
  }
}

export async function createCouponPurchaseAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const session = await requireModuleAccess("coupon-purchases");
  const companyId = `${payload?.companyId || ""}`.trim();
  const purchaseDate = normalizeDateInput(payload?.purchaseDate);
  const totalAmount = toAmount(payload?.totalAmount);
  const notes = `${payload?.notes || ""}`.trim();

  if (!companyId) {
    return {
      success: false,
      message: "Select a company or organization first.",
    };
  }

  if (!purchaseDate) {
    return {
      success: false,
      message: "Purchase date is required.",
    };
  }

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return {
      success: false,
      message: "Purchase amount must be greater than zero.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const now = new Date().toISOString();

  try {
    const companyDocument = await databases.getDocument(
      config.databaseId,
      COUPON_COLLECTIONS.companies,
      companyId,
    );
    const companyName = `${companyDocument.name || ""}`.trim();

    if (!companyName) {
      return {
        success: false,
        message: "Selected company or organization could not be found.",
      };
    }

    const purchaseDocument = await databases.createDocument(
      config.databaseId,
      COUPON_COLLECTIONS.purchases,
      ID.unique(),
      {
        company_id: companyId,
        company_name: companyName,
        purchase_reference: buildCouponPurchaseReference({
          companyName,
          purchaseDate,
        }),
        purchase_date: purchaseDate,
        total_amount: totalAmount,
        coupon_count: 0,
        coupon_value: 0,
        generated_total_value: 0,
        remaining_total_value: 0,
        status: "draft",
        created_by_user_id: session.userId || "",
        created_by_name: session.fullName || "System",
        notes,
        created_at: now,
        updated_at: now,
      },
    );

    revalidateCouponPages();

    return {
      success: true,
      purchaseId: purchaseDocument.$id,
      message: "Coupon purchase created successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Purchase Coupons",
        genericLabel: "create this coupon purchase",
        fallbackMessage: "Failed to create coupon purchase.",
      }),
    };
  }
}

export async function generateCouponsForPurchaseAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const session = await requireModuleAccess("coupon-purchases");
  const purchaseId = `${payload?.purchaseId || ""}`.trim();
  const couponCount = toWholeNumber(payload?.couponCount);
  const couponValue = toAmount(payload?.couponValue);
  const notes = `${payload?.notes || ""}`.trim();

  if (!purchaseId) {
    return {
      success: false,
      message: "Select a coupon purchase first.",
    };
  }

  if (!Number.isFinite(couponCount) || couponCount < 1) {
    return {
      success: false,
      message: "Enter a valid number of coupons to create.",
    };
  }

  if (!Number.isFinite(couponValue) || couponValue <= 0) {
    return {
      success: false,
      message: "Coupon value must be greater than zero.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const now = new Date().toISOString();

  try {
    const purchaseDocument = await databases.getDocument(
      config.databaseId,
      COUPON_COLLECTIONS.purchases,
      purchaseId,
    );
    const existingCoupons = await listAllCouponDocuments(
      databases,
      config.databaseId,
      COUPON_COLLECTIONS.coupons,
      [Query.equal("purchase_id", purchaseId)],
    );

    if (`${purchaseDocument.status || ""}`.trim().toLowerCase() === "cancelled") {
      return {
        success: false,
        message: "Cancelled purchases cannot generate coupons.",
      };
    }

    const expectedTotal = Number((couponCount * couponValue).toFixed(2));
    const purchaseTotal = Number(purchaseDocument.total_amount || 0);
    const generatedTotal = Number(
      existingCoupons
        .reduce((sum, coupon) => sum + Number(coupon.face_value || 0), 0)
        .toFixed(2),
    );
    const availableToGenerate = Number(
      Math.max(0, purchaseTotal - generatedTotal).toFixed(2),
    );

    if (availableToGenerate <= 0.009) {
      return {
        success: false,
        message:
          "This purchase has no unallocated balance left. All coupons have already been created.",
      };
    }

    if (expectedTotal - availableToGenerate > 0.009) {
      return {
        success: false,
        message:
          "Number of coupons multiplied by value per coupon cannot exceed the unallocated purchase balance.",
      };
    }

    const companyId = `${purchaseDocument.company_id || ""}`.trim();
    const companyName = `${purchaseDocument.company_name || ""}`.trim();
    const purchaseReference = `${purchaseDocument.purchase_reference || ""}`.trim();
    const existingCouponSequence = existingCoupons.reduce((max, coupon, index) => {
      const suffix = `${coupon.code || ""}`.trim().split("-").pop() || "";
      const parsedSequence = Number.parseInt(suffix, 10);
      const fallbackSequence = index + 1;

      return Math.max(
        max,
        Number.isFinite(parsedSequence) && parsedSequence > 0
          ? parsedSequence
          : fallbackSequence,
      );
    }, 0);

    await Promise.all(
      Array.from({ length: couponCount }, async (_, index) => {
        const couponId = ID.unique();
        const couponCode = buildCouponCode({
          purchaseId,
          index: existingCouponSequence + index,
        });

        await databases.createDocument(
          config.databaseId,
          COUPON_COLLECTIONS.coupons,
          couponId,
          {
            company_id: companyId,
            company_name: companyName,
            purchase_id: purchaseId,
            purchase_reference: purchaseReference,
            code: couponCode,
            face_value: couponValue,
            remaining_value: couponValue,
            status: "active",
            created_by_user_id: session.userId || "",
            created_by_name: session.fullName || "System",
            created_at: now,
            last_receipt_id: "",
            last_receipt_number: "",
            notes,
          },
        );

        await databases.createDocument(
          config.databaseId,
          COUPON_COLLECTIONS.movements,
          ID.unique(),
          {
            coupon_id: couponId,
            coupon_code: couponCode,
            company_id: companyId,
            company_name: companyName,
            purchase_id: purchaseId,
            purchase_reference: purchaseReference,
            receipt_id: "",
            receipt_number: "",
            station_id: "",
            station_name: "",
            movement_date: now,
            direction: "issue",
            amount_delta: couponValue,
            balance_after: couponValue,
            actor_user_id: session.userId || "",
            actor_name: session.fullName || "System",
            notes: notes || "Coupon issued from Purchase Coupons.",
          },
        );
      }),
    );

    await refreshCouponPurchaseTotals(databases, config.databaseId, purchaseDocument);
    revalidateCouponPages();

    return {
      success: true,
      purchaseId,
      message: `${couponCount.toLocaleString()} coupons created successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Purchase Coupons",
        genericLabel: "create these coupons",
        fallbackMessage: "Failed to create coupons.",
      }),
    };
  }
}

function normalizeCompanyPayload(payload) {
  const name = `${payload?.name || ""}`.trim();
  const dateJoined = normalizeDateInput(payload?.dateJoined);
  const status = normalizeCouponCompanyStatus(payload?.status);
  const notes = `${payload?.notes || ""}`.trim();

  if (!name) {
    return {
      success: false,
      message: "Company or organization name is required.",
    };
  }

  if (!dateJoined) {
    return {
      success: false,
      message: "Date joined is required.",
    };
  }

  return {
    success: true,
    name,
    dateJoined,
    status,
    notes,
  };
}

function normalizeDateInput(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "";
  }

  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime())
    ? ""
    : parsedDate.toISOString().slice(0, 10);
}

function toAmount(value) {
  const parsedValue = Number(value ?? 0);
  return Number.isFinite(parsedValue) ? Number(parsedValue.toFixed(2)) : Number.NaN;
}

function toWholeNumber(value) {
  const parsedValue = Number.parseInt(`${value || ""}`, 10);
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN;
}

function createServerDatabases() {
  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);
  client.headers["X-Appwrite-Key"] = config.apiKey;
  return new Databases(client);
}

async function renameCouponCompanyAcrossCollections(
  databases,
  databaseId,
  companyId,
  companyName,
) {
  const [purchases, coupons, movements] = await Promise.all([
    listAllCouponDocuments(databases, databaseId, COUPON_COLLECTIONS.purchases, [
      Query.equal("company_id", companyId),
    ]),
    listAllCouponDocuments(databases, databaseId, COUPON_COLLECTIONS.coupons, [
      Query.equal("company_id", companyId),
    ]),
    listAllCouponDocuments(databases, databaseId, COUPON_COLLECTIONS.movements, [
      Query.equal("company_id", companyId),
    ]),
  ]);

  await Promise.all([
    ...purchases.map((document) =>
      databases.updateDocument(
        databaseId,
        COUPON_COLLECTIONS.purchases,
        document.$id,
        {
          company_name: companyName,
          updated_at: new Date().toISOString(),
        },
      ),
    ),
    ...coupons.map((document) =>
      databases.updateDocument(databaseId, COUPON_COLLECTIONS.coupons, document.$id, {
        company_name: companyName,
      }),
    ),
    ...movements.map((document) =>
      databases.updateDocument(
        databaseId,
        COUPON_COLLECTIONS.movements,
        document.$id,
        {
          company_name: companyName,
        },
      ),
    ),
  ]);
}

function revalidateCouponPages() {
  invalidateAppwriteCollectionCache([
    COUPON_COLLECTIONS.companies,
    COUPON_COLLECTIONS.purchases,
    COUPON_COLLECTIONS.coupons,
    COUPON_COLLECTIONS.movements,
  ]);
  revalidatePath("/coupon-purchases");
  revalidatePath("/coupons");
  revalidatePath("/pos");
}
