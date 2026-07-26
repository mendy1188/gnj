#!/usr/bin/env node

import process from "node:process";

import {
  createAdminConfig,
  isAlreadyExistsError,
  loadEnvFiles,
  parseArgs,
  request,
  validateAdminConfig,
} from "./lib/appwrite-admin.mjs";

loadEnvFiles();

const ATTRIBUTE_READY_STATES = new Set(["available", "ready"]);
const ATTRIBUTE_FAILED_STATES = new Set(["failed", "stuck"]);
const DEFAULT_ATTRIBUTE_WAIT_TIMEOUT_MS = 120000;
const PRODUCT_IMAGES_BUCKET_ID =
  process.env.APPWRITE_PRODUCT_IMAGES_BUCKET_ID || "product-images";
const CREDIT_DOCUMENTS_BUCKET_ID =
  process.env.APPWRITE_CREDIT_DOCUMENTS_BUCKET_ID || "credit-documents";

const cliArgs = parseArgs(process.argv.slice(2), {
  booleanFlags: ["dry-run", "help"],
});
const config = createAdminConfig(cliArgs);
const attributeWaitTimeoutMs = getPositiveInteger(
  cliArgs.attributeWaitTimeoutMs ||
    process.env.APPWRITE_SCHEMA_ATTRIBUTE_WAIT_TIMEOUT_MS,
  DEFAULT_ATTRIBUTE_WAIT_TIMEOUT_MS,
);

if (cliArgs.help) {
  printUsage();
  process.exit(0);
}

validateAdminConfig(config);

const schema = [
  {
    id: "stations",
    name: "Stations",
    attributes: [
      stringAttribute("name", 255),
      stringAttribute("code", 64),
      stringAttribute("location", 255),
      enumAttribute("status", ["active", "inactive", "maintenance"]),
      stringAttribute("manager_name", 255, { required: false }),
      stringAttribute("manager_phone", 32, { required: false }),
      floatAttribute("latitude", { required: false }),
      floatAttribute("longitude", { required: false }),
    ],
    indexes: [
      uniqueIndex("stations_code_unique", ["code"]),
      keyIndex("stations_status_idx", ["status"]),
      keyIndex("stations_name_idx", ["name"]),
    ],
  },
  {
    id: "products",
    name: "Products",
    attributes: [
      stringAttribute("name", 255),
      stringAttribute("sku", 64),
      enumAttribute("category", ["fuel", "shop", "cement"]),
      stringAttribute("unit", 64),
      enumAttribute("status", ["active", "inactive"]),
      floatAttribute("selling_price", { required: false }),
      stringAttribute("description", 1000, { required: false }),
      stringAttribute("image_bucket_id", 64, { required: false }),
      stringAttribute("image_file_id", 128, { required: false }),
      stringAttribute("image_alt", 255, { required: false }),
    ],
    indexes: [
      uniqueIndex("products_sku_unique", ["sku"]),
      keyIndex("products_category_idx", ["category"]),
      keyIndex("products_name_idx", ["name"]),
    ],
  },
  {
    id: "product_price_history",
    name: "Product Price History",
    attributes: [
      stringAttribute("product_id", 64),
      stringAttribute("product_name", 255),
      floatAttribute("previous_price"),
      floatAttribute("new_price"),
      datetimeAttribute("changed_at"),
      stringAttribute("changed_by_user_id", 64, { required: false }),
      stringAttribute("changed_by_name", 255),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      keyIndex("product_price_history_product_idx", ["product_id"]),
      keyIndex("product_price_history_changed_at_idx", ["changed_at"]),
    ],
  },
  {
    id: "payment_methods",
    name: "Payment Methods",
    attributes: [
      stringAttribute("code", 64),
      stringAttribute("label", 128),
      stringAttribute("description", 255, { required: false }),
      booleanAttribute("is_enabled"),
      integerAttribute("sort_order"),
    ],
    indexes: [
      uniqueIndex("payment_methods_code_unique", ["code"]),
      keyIndex("payment_methods_enabled_idx", ["is_enabled"]),
      keyIndex("payment_methods_order_idx", ["sort_order"]),
    ],
  },
  {
    id: "coupon_companies",
    name: "Coupon Companies",
    attributes: [
      stringAttribute("name", 255),
      stringAttribute("date_joined", 10),
      enumAttribute("status", ["active", "inactive"]),
      stringAttribute("notes", 2000, { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("cc_name_unique", ["name"]),
      keyIndex("cc_status_idx", ["status"]),
      keyIndex("cc_joined_idx", ["date_joined"]),
    ],
  },
  {
    id: "coupon_purchases",
    name: "Coupon Purchases",
    attributes: [
      stringAttribute("company_id", 64),
      stringAttribute("company_name", 255),
      stringAttribute("purchase_reference", 64),
      stringAttribute("purchase_date", 10),
      floatAttribute("total_amount"),
      integerAttribute("coupon_count"),
      floatAttribute("coupon_value"),
      floatAttribute("generated_total_value"),
      floatAttribute("remaining_total_value"),
      enumAttribute("status", [
        "draft",
        "active",
        "partially_redeemed",
        "redeemed",
        "cancelled",
      ]),
      stringAttribute("created_by_user_id", 64, { required: false }),
      stringAttribute("created_by_name", 255, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("cp_ref_unique", ["purchase_reference"]),
      keyIndex("cp_company_idx", ["company_id"]),
      keyIndex("cp_date_idx", ["purchase_date"]),
      keyIndex("cp_status_idx", ["status"]),
      keyIndex("cp_company_date", ["company_id", "purchase_date"]),
    ],
  },
  {
    id: "coupons",
    name: "Coupons",
    attributes: [
      stringAttribute("company_id", 64),
      stringAttribute("company_name", 255),
      stringAttribute("purchase_id", 64),
      stringAttribute("purchase_reference", 64),
      stringAttribute("code", 64),
      floatAttribute("face_value"),
      floatAttribute("remaining_value"),
      enumAttribute("status", [
        "active",
        "partially_redeemed",
        "redeemed",
        "cancelled",
        "expired",
      ]),
      stringAttribute("created_by_user_id", 64, { required: false }),
      stringAttribute("created_by_name", 255, { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("last_used_at", { required: false }),
      stringAttribute("last_receipt_id", 64, { required: false }),
      stringAttribute("last_receipt_number", 64, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      uniqueIndex("cpn_code_unique", ["code"]),
      keyIndex("cpn_company_idx", ["company_id"]),
      keyIndex("cpn_purchase_idx", ["purchase_id"]),
      keyIndex("cpn_status_idx", ["status"]),
      keyIndex("cpn_created_idx", ["created_at"]),
      keyIndex("cpn_comp_status", ["company_id", "status"]),
    ],
  },
  {
    id: "coupon_movements",
    name: "Coupon Movements",
    attributes: [
      stringAttribute("coupon_id", 64),
      stringAttribute("coupon_code", 64),
      stringAttribute("company_id", 64),
      stringAttribute("company_name", 255),
      stringAttribute("purchase_id", 64),
      stringAttribute("purchase_reference", 64),
      stringAttribute("receipt_id", 64, { required: false }),
      stringAttribute("receipt_number", 64, { required: false }),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      datetimeAttribute("movement_date"),
      enumAttribute("direction", ["issue", "redeem", "adjust", "void"]),
      floatAttribute("amount_delta"),
      floatAttribute("balance_after"),
      stringAttribute("actor_user_id", 64, { required: false }),
      stringAttribute("actor_name", 255, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      keyIndex("cm_coupon_date", ["coupon_id", "movement_date"]),
      keyIndex("cm_receipt_idx", ["receipt_id"]),
      keyIndex("cm_company_date", ["company_id", "movement_date"]),
    ],
  },
  {
    id: "bulk_fuel_clients",
    name: "Bulk Fuel Clients",
    attributes: [
      stringAttribute("name", 255),
      stringAttribute("phone", 32),
      stringAttribute("address", 500),
      stringAttribute("date_joined", 10),
      enumAttribute("status", ["active", "inactive"]),
      stringAttribute("notes", 2000, { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("bfc_phone_unique", ["phone"]),
      keyIndex("bfc_status_idx", ["status"]),
      keyIndex("bfc_joined_idx", ["date_joined"]),
    ],
  },
  {
    id: "inventory_items",
    name: "Inventory Items",
    attributes: [
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      stringAttribute("product_id", 64),
      stringAttribute("product_name", 255),
      enumAttribute("category", ["fuel", "shop", "cement"]),
      floatAttribute("quantity"),
      stringAttribute("unit", 64),
      floatAttribute("reorder_level"),
      enumAttribute("status", ["in_stock", "low", "out"]),
      datetimeAttribute("last_updated_at", { required: false }),
    ],
    indexes: [
      uniqueIndex("inventory_station_product_unique", [
        "station_id",
        "product_id",
      ]),
      keyIndex("inventory_station_idx", ["station_id"]),
      keyIndex("inventory_product_idx", ["product_id"]),
      keyIndex("inventory_status_idx", ["status"]),
      keyIndex("inventory_station_status_idx", ["station_id", "status"]),
    ],
  },
  {
    id: "incoming_stock_records",
    name: "Incoming Stock Records",
    attributes: [
      stringAttribute("inventory_item_id", 64),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      stringAttribute("product_id", 64),
      stringAttribute("product_name", 255),
      floatAttribute("quantity_added"),
      floatAttribute("previous_quantity"),
      floatAttribute("new_quantity"),
      stringAttribute("unit", 64),
      datetimeAttribute("recorded_at"),
      stringAttribute("recorded_by", 255),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      keyIndex("incoming_stock_inventory_idx", ["inventory_item_id"]),
      keyIndex("incoming_stock_station_idx", ["station_id"]),
      keyIndex("incoming_stock_product_idx", ["product_id"]),
      keyIndex("incoming_stock_recorded_idx", ["recorded_at"]),
      keyIndex("incoming_stock_station_recorded_idx", [
        "station_id",
        "recorded_at",
      ]),
    ],
  },
  {
    id: "fuel_deliveries",
    name: "Fuel Deliveries",
    attributes: [
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      stringAttribute("product_id", 64),
      stringAttribute("product_name", 255),
      datetimeAttribute("delivery_date"),
      floatAttribute("quantity"),
      stringAttribute("unit", 64),
      enumAttribute("status", [
        "pending",
        "in_transit",
        "delivered",
        "cancelled",
      ]),
      stringAttribute("supplier", 255, { required: false }),
      stringAttribute("reference_no", 128, { required: false }),
      stringAttribute("driver_name", 255, { required: false }),
      stringAttribute("recorded_by", 255, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      keyIndex("deliveries_station_idx", ["station_id"]),
      keyIndex("deliveries_product_idx", ["product_id"]),
      keyIndex("deliveries_status_idx", ["status"]),
      keyIndex("deliveries_date_idx", ["delivery_date"]),
      keyIndex("deliveries_station_date_idx", ["station_id", "delivery_date"]),
    ],
  },
  {
    id: "sales_receipts",
    name: "Sales Receipts",
    attributes: [
      stringAttribute("receipt_number", 64),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      datetimeAttribute("sale_date"),
      enumAttribute("source", ["pos", "ops"]),
      floatAttribute("subtotal"),
      floatAttribute("tax_amount", { required: false }),
      floatAttribute("discount_amount", { required: false }),
      floatAttribute("total_amount"),
      stringAttribute("payment_method", 64),
      stringAttribute("payment_method_code", 64, { required: false }),
      stringAttribute("payment_method_label", 128, { required: false }),
      enumAttribute(
        "payment_status",
        ["paid", "pending", "partially_paid", "voided"],
        {
          required: false,
        },
      ),
      enumAttribute("status", ["draft", "completed", "voided", "refunded"]),
      stringAttribute("cashier_name", 255, { required: false }),
      stringAttribute("customer_name", 255, { required: false }),
      stringAttribute("customer_phone", 32, { required: false }),
      stringAttribute("vehicle_registration_number", 64, { required: false }),
      stringAttribute("company_name", 255, { required: false }),
      stringAttribute("billable_to", 255, { required: false }),
      stringAttribute("idempotency_key", 128, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      uniqueIndex("receipts_number_unique", ["receipt_number"]),
      uniqueIndex("receipts_idem_unique", ["idempotency_key"]),
      keyIndex("receipts_station_idx", ["station_id"]),
      keyIndex("receipts_date_idx", ["sale_date"]),
      keyIndex("receipts_status_idx", ["status"]),
      keyIndex("receipts_source_idx", ["source"]),
      keyIndex("receipts_station_date_idx", ["station_id", "sale_date"]),
      keyIndex("receipts_cashier_date_idx", ["cashier_name", "sale_date"]),
    ],
  },
  {
    id: "sales_receipt_items",
    name: "Sales Receipt Items",
    attributes: [
      stringAttribute("receipt_id", 64),
      stringAttribute("receipt_number", 64),
      datetimeAttribute("sale_date"),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      stringAttribute("product_id", 64),
      stringAttribute("product_name", 255),
      enumAttribute("category", ["fuel", "shop", "cement"]),
      integerAttribute("line_number"),
      floatAttribute("quantity"),
      stringAttribute("unit", 64),
      floatAttribute("unit_price"),
      floatAttribute("line_total"),
    ],
    indexes: [
      keyIndex("receipt_items_receipt_idx", ["receipt_id"]),
      keyIndex("receipt_items_station_idx", ["station_id"]),
      keyIndex("receipt_items_product_idx", ["product_id"]),
      keyIndex("receipt_items_category_idx", ["category"]),
      keyIndex("receipt_items_date_idx", ["sale_date"]),
      keyIndex("receipt_items_station_date_idx", ["station_id", "sale_date"]),
      keyIndex("rit_station_item_date_idx", [
        "station_id",
        "product_name",
        "sale_date",
      ]),
      keyIndex("rit_station_category_date_idx", [
        "station_id",
        "category",
        "sale_date",
      ]),
    ],
  },
  {
    id: "sales_payments",
    name: "Sales Payments",
    attributes: [
      stringAttribute("receipt_id", 64),
      stringAttribute("receipt_number", 64),
      datetimeAttribute("sale_date"),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      stringAttribute("payment_method_code", 64),
      stringAttribute("payment_method_label", 128),
      floatAttribute("amount"),
      enumAttribute("status", ["pending", "confirmed", "failed", "voided"]),
      stringAttribute("reference_code", 128, { required: false }),
      stringAttribute("customer_name", 255, { required: false }),
      stringAttribute("customer_phone", 32, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      keyIndex("pay_receipt_idx", ["receipt_id"]),
      keyIndex("pay_station_date_idx", ["station_id", "sale_date"]),
      keyIndex("pay_method_date_idx", ["payment_method_code", "sale_date"]),
      keyIndex("pay_status_idx", ["status"]),
    ],
  },
  {
    id: "inventory_movements",
    name: "Inventory Movements",
    attributes: [
      stringAttribute("receipt_id", 64, { required: false }),
      stringAttribute("receipt_number", 64, { required: false }),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      stringAttribute("product_id", 64),
      stringAttribute("product_name", 255),
      enumAttribute("category", ["fuel", "shop", "cement"]),
      datetimeAttribute("movement_date"),
      enumAttribute("movement_type", [
        "opening",
        "incoming",
        "sale",
        "adjustment",
        "transfer_in",
        "transfer_out",
        "damage",
        "reversal",
      ]),
      floatAttribute("quantity_delta"),
      floatAttribute("previous_quantity"),
      floatAttribute("new_quantity"),
      stringAttribute("unit", 64),
      stringAttribute("actor_user_id", 64, { required: false }),
      stringAttribute("actor_name", 255, { required: false }),
      stringAttribute("reference_no", 128, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      keyIndex("imv_receipt_idx", ["receipt_id"]),
      keyIndex("imv_station_date_idx", ["station_id", "movement_date"]),
      keyIndex("imv_product_date_idx", ["product_id", "movement_date"]),
      keyIndex("imv_station_prod_date", [
        "station_id",
        "product_id",
        "movement_date",
      ]),
      keyIndex("imv_type_date_idx", ["movement_type", "movement_date"]),
    ],
  },
  {
    id: "customer_balances",
    name: "Customer Balances",
    attributes: [
      enumAttribute("account_type", ["coupon", "credit", "bulk_redeem"]),
      stringAttribute("reference_code", 128, { required: false }),
      stringAttribute("customer_name", 255),
      stringAttribute("customer_phone", 32),
      stringAttribute("customer_email", 255, { required: false }),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      stringAttribute("product_id", 64, { required: false }),
      stringAttribute("product_name", 255, { required: false }),
      enumAttribute("product_category", ["fuel", "shop", "cement", "all"]),
      floatAttribute("balance_amount"),
      floatAttribute("balance_quantity", { required: false }),
      stringAttribute("unit", 64, { required: false }),
      stringAttribute("due_date", 32, { required: false }),
      enumAttribute("status", ["active", "inactive", "suspended"]),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      keyIndex("cbal_type_idx", ["account_type"]),
      keyIndex("cbal_ref_idx", ["reference_code"]),
      keyIndex("cbal_phone_idx", ["customer_phone"]),
      keyIndex("cbal_station_type_idx", ["station_id", "account_type"]),
      keyIndex("cbal_phone_type_idx", ["customer_phone", "account_type"]),
      keyIndex("cbal_product_idx", ["product_id"]),
      keyIndex("cbal_due_idx", ["due_date"]),
    ],
  },
  {
    id: "customer_balance_movements",
    name: "Customer Balance Movements",
    attributes: [
      stringAttribute("account_id", 64),
      enumAttribute("account_type", ["coupon", "credit", "bulk_redeem"]),
      stringAttribute("receipt_id", 64, { required: false }),
      stringAttribute("receipt_number", 64, { required: false }),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      stringAttribute("product_id", 64, { required: false }),
      stringAttribute("product_name", 255, { required: false }),
      datetimeAttribute("movement_date"),
      enumAttribute("direction", ["credit", "debit"]),
      floatAttribute("amount_delta"),
      floatAttribute("quantity_delta", { required: false }),
      floatAttribute("balance_amount"),
      floatAttribute("balance_quantity", { required: false }),
      stringAttribute("due_date", 32, { required: false }),
      stringAttribute("actor_user_id", 64, { required: false }),
      stringAttribute("actor_name", 255, { required: false }),
      stringAttribute("reference_code", 128, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
    ],
    indexes: [
      keyIndex("cbm_account_date_idx", ["account_id", "movement_date"]),
      keyIndex("cbm_receipt_idx", ["receipt_id"]),
      keyIndex("cbm_station_date_idx", ["station_id", "movement_date"]),
      keyIndex("cbm_type_date_idx", ["account_type", "movement_date"]),
      keyIndex("cbm_product_date_idx", ["product_id", "movement_date"]),
    ],
  },
  {
    id: "credit_guarantors",
    name: "Credit Guarantors",
    attributes: [
      stringAttribute("account_id", 64),
      stringAttribute("full_name", 255),
      stringAttribute("phone", 32),
      stringAttribute("email", 255, { required: false }),
      stringAttribute("residential_address", 500, { required: false }),
      stringAttribute("digital_address", 128, { required: false }),
      stringAttribute("identity_type", 64),
      stringAttribute("identity_number", 128, { required: false }),
      stringAttribute("photo_bucket_id", 64, { required: false }),
      stringAttribute("photo_file_id", 128, { required: false }),
      stringAttribute("photo_file_name", 255, { required: false }),
      stringAttribute("photo_mime_type", 128, { required: false }),
      stringAttribute("identity_bucket_id", 64, { required: false }),
      stringAttribute("identity_file_id", 128, { required: false }),
      stringAttribute("identity_file_name", 255, { required: false }),
      stringAttribute("identity_mime_type", 128, { required: false }),
      stringAttribute("created_by_user_id", 64, { required: false }),
      stringAttribute("created_by_name", 255, { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      keyIndex("cguar_account_idx", ["account_id"]),
      keyIndex("cguar_name_idx", ["full_name"]),
      keyIndex("cguar_updated_idx", ["updated_at"]),
      keyIndex("cguar_account_updated_idx", ["account_id", "updated_at"]),
    ],
    obsoleteIndexes: ["cguar_account_unique"],
  },
  {
    id: "credit_account_documents",
    name: "Credit Account Documents",
    attributes: [
      stringAttribute("account_id", 64),
      enumAttribute("document_category", [
        "agreement",
        "creditor_identity",
        "collateral",
      ]),
      stringAttribute("identity_type", 64, { required: false }),
      stringAttribute("title", 255),
      stringAttribute("notes", 2000, { required: false }),
      stringAttribute("collateral_info", 2000, { required: false }),
      stringAttribute("bucket_id", 64),
      stringAttribute("file_id", 128),
      stringAttribute("file_name", 255),
      stringAttribute("mime_type", 128, { required: false }),
      integerAttribute("file_size"),
      stringAttribute("uploaded_by_user_id", 64, { required: false }),
      stringAttribute("uploaded_by_name", 255, { required: false }),
      datetimeAttribute("uploaded_at"),
    ],
    indexes: [
      keyIndex("cad_account_idx", ["account_id"]),
      keyIndex("cad_account_category_idx", ["account_id", "document_category"]),
      keyIndex("cad_uploaded_at_idx", ["uploaded_at"]),
      keyIndex("cad_account_uploaded_idx", ["account_id", "uploaded_at"]),
      keyIndex("cad_acct_category_uploaded", [
        "account_id",
        "document_category",
        "uploaded_at",
      ]),
    ],
  },
  {
    id: "notifications",
    name: "Notifications",
    attributes: [
      stringAttribute("user_id", 64),
      stringAttribute("user_name", 255, { required: false }),
      stringAttribute("role_name", 128, { required: false }),
      stringAttribute("title", 255),
      stringAttribute("message", 2000),
      enumAttribute("type", ["credit_due", "credit_overdue", "system"]),
      stringAttribute("reference_type", 128, { required: false }),
      stringAttribute("reference_id", 64, { required: false }),
      enumAttribute("status", ["unread", "read", "archived"]),
      enumAttribute("priority", ["info", "warning", "critical"]),
      stringAttribute("idempotency_key", 255),
      datetimeAttribute("created_at"),
      datetimeAttribute("read_at", { required: false }),
    ],
    indexes: [
      uniqueIndex("notif_idem_uq", ["idempotency_key"]),
      keyIndex("notif_user_status_date", ["user_id", "status", "created_at"]),
      keyIndex("notif_user_date_idx", ["user_id", "created_at"]),
      keyIndex("notif_ref_idx", ["reference_type", "reference_id"]),
    ],
  },
  {
    id: "notification_deliveries",
    name: "Notification Deliveries",
    attributes: [
      stringAttribute("notification_id", 64, { required: false }),
      enumAttribute("event_type", ["credit_due", "credit_overdue", "system"]),
      stringAttribute("reference_type", 128, { required: false }),
      stringAttribute("reference_id", 64, { required: false }),
      enumAttribute("channel", ["popup", "email", "sms"]),
      enumAttribute("recipient_type", ["user", "creditor"]),
      stringAttribute("recipient_name", 255, { required: false }),
      stringAttribute("recipient_contact", 255, { required: false }),
      stringAttribute("subject", 255, { required: false }),
      stringAttribute("message", 2000),
      enumAttribute("status", ["pending", "sent", "failed", "skipped"]),
      stringAttribute("last_error", 2000, { required: false }),
      stringAttribute("idempotency_key", 255),
      datetimeAttribute("sent_at", { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("ndel_idem_uq", ["idempotency_key"]),
      keyIndex("ndel_ref_idx", ["reference_type", "reference_id"]),
      keyIndex("ndel_channel_status", ["channel", "status"]),
      keyIndex("ndel_created_idx", ["created_at"]),
    ],
  },
  {
    id: "notification_settings",
    name: "Notification Settings",
    attributes: [
      stringAttribute("setting_key", 64),
      integerAttribute("credit_due_lookahead_days"),
      booleanAttribute("popup_enabled"),
      booleanAttribute("email_enabled"),
      booleanAttribute("sms_enabled"),
      integerAttribute("daily_run_hour"),
      enumAttribute("status", ["active", "inactive"]),
      stringAttribute("updated_by_user_id", 64, { required: false }),
      stringAttribute("updated_by_name", 255, { required: false }),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("nset_key_uq", ["setting_key"]),
      keyIndex("nset_status_idx", ["status"]),
    ],
  },
  {
    id: "audit_logs",
    name: "Audit Logs",
    attributes: [
      stringAttribute("actor_user_id", 64, { required: false }),
      stringAttribute("actor_name", 255),
      stringAttribute("action", 128),
      stringAttribute("entity_type", 128),
      stringAttribute("entity_id", 64),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      stringAttribute("old_value", 4000, { required: false }),
      stringAttribute("new_value", 4000, { required: false }),
      datetimeAttribute("created_at"),
    ],
    indexes: [
      keyIndex("alog_entity_type_idx", ["entity_type"]),
      keyIndex("alog_entity_id_idx", ["entity_id"]),
      keyIndex("alog_station_date_idx", ["station_id", "created_at"]),
      keyIndex("alog_actor_date_idx", ["actor_user_id", "created_at"]),
    ],
  },
  {
    id: "pos_transaction_envelopes",
    name: "POS Transaction Envelopes",
    attributes: [
      enumAttribute("transaction_type", ["sale_create", "sale_reverse"]),
      enumAttribute("status", ["applying", "applied", "repair_needed"]),
      stringAttribute("idempotency_key", 128),
      stringAttribute("receipt_id", 64, { required: false }),
      stringAttribute("receipt_number", 128, { required: false }),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      stringAttribute("cashier_name", 255, { required: false }),
      floatAttribute("total_amount"),
      stringAttribute("payload_summary", 4000, { required: false }),
      stringAttribute("error_message", 1000, { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("pte_idem_uq", ["idempotency_key"]),
      keyIndex("pte_status_updated", ["status", "updated_at"]),
      keyIndex("pte_updated_idx", ["updated_at"]),
      keyIndex("pte_receipt_idx", ["receipt_id"]),
      keyIndex("pte_station_updated", ["station_id", "updated_at"]),
      keyIndex("pte_type_status", ["transaction_type", "status"]),
    ],
  },
  {
    id: "pos_device_sync_status",
    name: "POS Device Sync Status",
    attributes: [
      stringAttribute("device_id", 128),
      enumAttribute("platform", ["web", "mobile", "unknown"]),
      stringAttribute("app_version", 64, { required: false }),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      stringAttribute("cashier_user_id", 64, { required: false }),
      stringAttribute("cashier_name", 255, { required: false }),
      enumAttribute("status", ["synced", "pending", "failed", "offline"]),
      integerAttribute("pending_count"),
      integerAttribute("failed_count"),
      integerAttribute("needs_review_count"),
      datetimeAttribute("oldest_unsynced_at", { required: false }),
      datetimeAttribute("last_sync_attempt_at", { required: false }),
      datetimeAttribute("last_synced_at", { required: false }),
      stringAttribute("last_error", 1000, { required: false }),
      booleanAttribute("is_online"),
      datetimeAttribute("reported_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("pds_device_uq", ["device_id"]),
      keyIndex("pds_status_updated", ["status", "updated_at"]),
      keyIndex("pds_station_updated", ["station_id", "updated_at"]),
      keyIndex("pds_cashier_updated", ["cashier_user_id", "updated_at"]),
    ],
  },
  {
    id: "station_daily_summary",
    name: "Station Daily Summary",
    attributes: [
      stringAttribute("date", 10),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      floatAttribute("fuel_sales"),
      floatAttribute("petrol_sales"),
      floatAttribute("diesel_sales"),
      floatAttribute("shop_sales"),
      floatAttribute("rice_sales"),
      floatAttribute("cooking_oil_sales"),
      floatAttribute("other_shop_sales"),
      floatAttribute("cement_sales"),
      floatAttribute("cement_bags_sold"),
      floatAttribute("total_sales"),
      integerAttribute("transactions"),
    ],
    indexes: [
      uniqueIndex("sds_date_station_unique", ["date", "station_id"]),
      keyIndex("sds_date_idx", ["date"]),
      keyIndex("sds_station_idx", ["station_id"]),
    ],
  },
  {
    id: "cashier_daily_summary",
    name: "Cashier Daily Summary",
    attributes: [
      stringAttribute("date", 10),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      stringAttribute("cashier_user_id", 64, { required: false }),
      stringAttribute("cashier_name", 255),
      floatAttribute("fuel_sales"),
      floatAttribute("petrol_sales"),
      floatAttribute("diesel_sales"),
      floatAttribute("shop_sales"),
      floatAttribute("rice_sales"),
      floatAttribute("cooking_oil_sales"),
      floatAttribute("other_shop_sales"),
      floatAttribute("cement_sales"),
      floatAttribute("cement_bags_sold"),
      floatAttribute("total_sales"),
      integerAttribute("transactions"),
    ],
    indexes: [
      uniqueIndex("cds_date_station_cashier_unique", [
        "date",
        "station_id",
        "cashier_name",
      ]),
      keyIndex("cds_date_idx", ["date"]),
      keyIndex("cds_station_idx", ["station_id"]),
      keyIndex("cds_cashier_idx", ["cashier_name"]),
    ],
  },
  {
    id: "station_product_daily_summary",
    name: "Station Product Daily Summary",
    attributes: [
      stringAttribute("date", 10),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      stringAttribute("product_id", 64, { required: false }),
      stringAttribute("product_name", 255),
      enumAttribute("category", ["fuel", "shop", "cement"]),
      stringAttribute("unit", 64, { required: false }),
      floatAttribute("received_quantity"),
      floatAttribute("sold_quantity"),
      floatAttribute("sold_amount"),
      floatAttribute("net_quantity"),
      integerAttribute("transactions"),
    ],
    indexes: [
      uniqueIndex("spds_date_stat_prod_uq", [
        "date",
        "station_id",
        "product_name",
      ]),
      keyIndex("spds_date_idx", ["date"]),
      keyIndex("spds_station_idx", ["station_id"]),
      keyIndex("spds_product_idx", ["product_name"]),
      keyIndex("spds_category_idx", ["category"]),
    ],
  },
  {
    id: "station_category_daily_summary",
    name: "Station Category Daily Summary",
    attributes: [
      stringAttribute("date", 10),
      stringAttribute("station_id", 64),
      stringAttribute("station_name", 255),
      enumAttribute("category", ["fuel", "shop", "cement"]),
      floatAttribute("total_quantity"),
      floatAttribute("total_amount"),
      integerAttribute("transactions"),
    ],
    indexes: [
      uniqueIndex("scds_date_stat_cat_uq", ["date", "station_id", "category"]),
      keyIndex("scds_date_idx", ["date"]),
      keyIndex("scds_station_idx", ["station_id"]),
      keyIndex("scds_category_idx", ["category"]),
    ],
  },
  {
    id: "app_roles",
    name: "App Roles",
    attributes: [
      stringAttribute("name", 128),
      stringAttribute("code", 64),
      stringAttribute("modules_json", 4096),
      booleanAttribute("branch_required"),
      enumAttribute("status", ["active", "inactive"]),
    ],
    indexes: [
      uniqueIndex("app_roles_code_unique", ["code"]),
      uniqueIndex("app_roles_name_unique", ["name"]),
      keyIndex("app_roles_status_idx", ["status"]),
    ],
  },
  {
    id: "app_users",
    name: "App Users",
    attributes: [
      stringAttribute("full_name", 255),
      stringAttribute("email", 255),
      stringAttribute("cashier_qr_code", 128, { required: false }),
      stringAttribute("role_id", 64),
      stringAttribute("role_name", 128),
      stringAttribute("branch_station_id", 64, { required: false }),
      stringAttribute("branch_station_name", 255, { required: false }),
      stringAttribute("password_hash", 512),
      booleanAttribute("must_change_password"),
      enumAttribute("status", ["active", "inactive"]),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("app_users_email_unique", ["email"]),
      keyIndex("app_users_role_idx", ["role_id"]),
      keyIndex("app_users_branch_idx", ["branch_station_id"]),
      keyIndex("app_users_status_idx", ["status"]),
    ],
  },
  {
    id: "client_users",
    name: "Client Users",
    attributes: [
      stringAttribute("full_name", 255),
      stringAttribute("email", 255),
      stringAttribute("phone", 32),
      stringAttribute("password_hash", 512),
      enumAttribute("user_type", ["individual", "company"]),
      stringAttribute("company_name", 255, { required: false }),
      stringAttribute("preferred_provider", 64, { required: false }),
      stringAttribute("wave_number", 32, { required: false }),
      stringAttribute("qmoney_number", 32, { required: false }),
      stringAttribute("afrimoney_number", 32, { required: false }),
      booleanAttribute("must_change_password"),
      enumAttribute("status", ["active", "inactive"]),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("client_users_email_uq", ["email"]),
      keyIndex("client_users_phone_idx", ["phone"]),
      keyIndex("client_users_type_idx", ["user_type"]),
      keyIndex("client_users_status_idx", ["status"]),
    ],
  },
  {
    id: "reward_settings",
    name: "Reward Settings",
    attributes: [
      stringAttribute("setting_key", 64),
      floatAttribute("cashback_percent"),
      enumAttribute("status", ["active", "inactive"]),
      stringAttribute("updated_by_user_id", 64, { required: false }),
      stringAttribute("updated_by_name", 255, { required: false }),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("reward_settings_key_uq", ["setting_key"]),
      keyIndex("reward_settings_status", ["status"]),
    ],
  },
  {
    id: "client_reward_accounts",
    name: "Client Reward Accounts",
    attributes: [
      stringAttribute("client_user_id", 64),
      stringAttribute("client_name", 255),
      stringAttribute("client_phone", 32),
      floatAttribute("balance_amount"),
      floatAttribute("total_earned"),
      floatAttribute("total_redeemed"),
      enumAttribute("status", ["active", "inactive"]),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
    ],
    indexes: [
      uniqueIndex("cra_client_user_uq", ["client_user_id"]),
      keyIndex("cra_phone_idx", ["client_phone"]),
      keyIndex("cra_status_idx", ["status"]),
    ],
  },
  {
    id: "client_reward_movements",
    name: "Client Reward Movements",
    attributes: [
      stringAttribute("account_id", 64),
      stringAttribute("client_user_id", 64),
      stringAttribute("client_name", 255),
      stringAttribute("client_phone", 32),
      stringAttribute("receipt_id", 64, { required: false }),
      stringAttribute("receipt_number", 64, { required: false }),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      enumAttribute("direction", ["credit", "debit"]),
      enumAttribute("movement_type", [
        "earn",
        "redeem",
        "adjustment",
        "reversal",
      ]),
      floatAttribute("amount_delta"),
      floatAttribute("balance_after"),
      stringAttribute("actor_user_id", 64, { required: false }),
      stringAttribute("actor_name", 255, { required: false }),
      stringAttribute("reference_code", 128, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
      datetimeAttribute("movement_date"),
    ],
    indexes: [
      keyIndex("crm_account_date_idx", ["account_id", "movement_date"]),
      keyIndex("crm_client_date_idx", ["client_user_id", "movement_date"]),
      keyIndex("crm_receipt_idx", ["receipt_id"]),
      keyIndex("crm_ref_idx", ["reference_code"]),
      keyIndex("crm_type_date_idx", ["movement_type", "movement_date"]),
    ],
  },
  {
    id: "fuel_gift_codes",
    name: "Fuel Gift Codes",
    attributes: [
      stringAttribute("code", 64),
      stringAttribute("client_user_id", 64),
      stringAttribute("client_name", 255),
      stringAttribute("client_phone", 32),
      stringAttribute("product_code", 64),
      stringAttribute("product_name", 255),
      floatAttribute("amount"),
      stringAttribute("recipient_name", 255),
      enumAttribute("status", ["active", "redeemed", "cancelled", "expired"]),
      stringAttribute("cashier_user_id", 64, { required: false }),
      stringAttribute("cashier_name", 255, { required: false }),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      stringAttribute("receipt_id", 64, { required: false }),
      stringAttribute("receipt_number", 64, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("redeemed_at", { required: false }),
    ],
    indexes: [
      uniqueIndex("fuel_gift_code_uq", ["code"]),
      keyIndex("fgc_client_status_idx", ["client_user_id", "status"]),
      keyIndex("fgc_status_created_idx", ["status", "created_at"]),
      keyIndex("fgc_receipt_idx", ["receipt_id"]),
    ],
  },
  {
    id: "fuel_gift_purchases",
    name: "Fuel Gift Purchases",
    attributes: [
      stringAttribute("gift_code_id", 64),
      stringAttribute("gift_code", 64),
      stringAttribute("client_user_id", 64),
      stringAttribute("client_name", 255),
      stringAttribute("client_phone", 32),
      stringAttribute("product_code", 64),
      stringAttribute("product_name", 255),
      floatAttribute("amount"),
      stringAttribute("recipient_name", 255),
      enumAttribute("status", ["active", "redeemed", "cancelled", "expired"]),
      stringAttribute("cashier_user_id", 64, { required: false }),
      stringAttribute("cashier_name", 255, { required: false }),
      stringAttribute("station_id", 64, { required: false }),
      stringAttribute("station_name", 255, { required: false }),
      stringAttribute("receipt_id", 64, { required: false }),
      stringAttribute("receipt_number", 64, { required: false }),
      stringAttribute("notes", 2000, { required: false }),
      datetimeAttribute("created_at"),
      datetimeAttribute("updated_at"),
      datetimeAttribute("redeemed_at", { required: false }),
      datetimeAttribute("cancelled_at", { required: false }),
    ],
    indexes: [
      uniqueIndex("fgp_gift_code_id_uq", ["gift_code_id"]),
      keyIndex("fgp_client_status_idx", ["client_user_id", "status"]),
      keyIndex("fgp_status_date_idx", ["status", "created_at"]),
      keyIndex("fgp_receipt_idx", ["receipt_id"]),
      keyIndex("fgp_code_idx", ["gift_code"]),
    ],
  },
];

const storageBuckets = [
  {
    id: PRODUCT_IMAGES_BUCKET_ID,
    name: "Product Images",
    permissions: ['read("any")'],
    fileSecurity: false,
    enabled: true,
    maximumFileSize: 5 * 1024 * 1024,
    allowedFileExtensions: ["png", "jpg", "jpeg", "webp", "svg"],
    compression: "gzip",
    encryption: true,
    antivirus: true,
  },
  {
    id: CREDIT_DOCUMENTS_BUCKET_ID,
    name: "Credit Documents",
    permissions: [],
    fileSecurity: false,
    enabled: true,
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ["png", "jpg", "jpeg", "webp", "pdf", "doc", "docx"],
    compression: "gzip",
    encryption: true,
    antivirus: true,
  },
];

main().catch((error) => {
  console.error(`Schema creation failed: ${error.message}`);

  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }

  process.exit(1);
});

async function main() {
  console.log(`Using Appwrite endpoint: ${config.apiBaseUrl}`);
  console.log(`Target database ID: ${config.databaseId}`);

  if (config.dryRun) {
    console.log("Dry run only. No Appwrite API requests will be sent.");
    schema.forEach((collection) => {
      console.log(
        `- ${collection.id}: ${collection.attributes.length} attributes, ${collection.indexes.length} indexes`,
      );
    });
    storageBuckets.forEach((bucket) => {
      console.log(`- storage bucket ${bucket.id}: ${bucket.name}`);
    });
    return;
  }

  for (const bucket of storageBuckets) {
    await ensureBucket(bucket);
  }

  for (const collection of schema) {
    await ensureCollection(collection);

    for (const indexKey of collection.obsoleteIndexes || []) {
      await removeIndexIfExists(collection.id, indexKey);
    }

    const existingAttributes = new Map(
      (await listCollectionAttributes(collection.id)).map((attribute) => [
        attribute.key,
        attribute,
      ]),
    );

    for (const attribute of collection.attributes) {
      const existingAttribute = existingAttributes.get(attribute.key);

      if (
        existingAttribute &&
        ATTRIBUTE_READY_STATES.has(existingAttribute.status)
      ) {
        console.log(
          `  Attribute already exists: ${collection.id}.${attribute.key}`,
        );
        continue;
      }

      if (existingAttribute) {
        assertAttributeHasNotFailed(collection.id, existingAttribute);
        console.log(
          `  Waiting for existing attribute: ${collection.id}.${attribute.key} (${existingAttribute.status || "unknown"})`,
        );
      } else {
        await ensureAttribute(collection.id, attribute);
      }

      await waitForAttributes(collection.id, [attribute.key]);
    }

    for (const index of collection.indexes) {
      await ensureIndex(collection.id, index);
    }
  }

  console.log("Appwrite schema is ready.");
}

async function ensureBucket(bucket) {
  try {
    await request(config, "/storage/buckets", {
      method: "POST",
      body: {
        bucketId: bucket.id,
        name: bucket.name,
        permissions: bucket.permissions,
        fileSecurity: bucket.fileSecurity,
        enabled: bucket.enabled,
        maximumFileSize: bucket.maximumFileSize,
        allowedFileExtensions: bucket.allowedFileExtensions,
        compression: bucket.compression,
        encryption: bucket.encryption,
        antivirus: bucket.antivirus,
      },
    });
    console.log(`Created storage bucket: ${bucket.id}`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`Storage bucket already exists: ${bucket.id}`);
      return;
    }

    throw error;
  }
}

function printUsage() {
  console.log(`
Usage:
  node scripts/create-appwrite-schema.mjs

Required environment variables:
  NEXT_PUBLIC_APPWRITE_ENDPOINT
  NEXT_PUBLIC_APPWRITE_PROJECT_ID
  APPWRITE_API_KEY
  APPWRITE_DATABASE_ID

Optional flags:
  --endpoint <url>
  --projectId <id>
  --apiKey <key>
  --databaseId <id>
  --requestRetries <number>
  --requestRetryDelayMs <number>
  --requestTimeoutMs <number>
  --attributeWaitTimeoutMs <number>
  --dry-run
  --help
`);
}

function stringAttribute(key, size, options = {}) {
  return {
    type: "string",
    key,
    payload: {
      key,
      size,
      required: options.required ?? true,
      array: false,
    },
  };
}

function enumAttribute(key, elements, options = {}) {
  return {
    type: "enum",
    key,
    payload: {
      key,
      elements,
      required: options.required ?? true,
      array: false,
    },
  };
}

function floatAttribute(key, options = {}) {
  return {
    type: "float",
    key,
    payload: {
      key,
      required: options.required ?? true,
      array: false,
    },
  };
}

function booleanAttribute(key, options = {}) {
  return {
    type: "boolean",
    key,
    payload: {
      key,
      required: options.required ?? true,
      array: false,
    },
  };
}

function integerAttribute(key, options = {}) {
  return {
    type: "integer",
    key,
    payload: {
      key,
      required: options.required ?? true,
      array: false,
    },
  };
}

function datetimeAttribute(key, options = {}) {
  return {
    type: "datetime",
    key,
    payload: {
      key,
      required: options.required ?? true,
      array: false,
    },
  };
}

function keyIndex(key, attributes) {
  validateIndexKey(key);

  return {
    key,
    type: "key",
    attributes,
    orders: attributes.map(() => "ASC"),
  };
}

function uniqueIndex(key, attributes) {
  validateIndexKey(key);

  return {
    key,
    type: "unique",
    attributes,
    orders: attributes.map(() => "ASC"),
  };
}

function validateIndexKey(key) {
  const normalizedKey = `${key || ""}`;

  if (
    normalizedKey.length === 0 ||
    normalizedKey.length > 36 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalizedKey)
  ) {
    throw new Error(
      `Invalid index key "${normalizedKey}". Appwrite index keys must be 1-36 chars and start with an alphanumeric character.`,
    );
  }
}

async function ensureCollection(collection) {
  try {
    await request(config, `/databases/${config.databaseId}/collections`, {
      method: "POST",
      body: {
        collectionId: collection.id,
        name: collection.name,
        permissions: [],
        documentSecurity: false,
        enabled: true,
      },
    });
    console.log(`Created collection: ${collection.id}`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`Collection already exists: ${collection.id}`);
      return;
    }

    throw error;
  }
}

async function ensureAttribute(collectionId, attribute) {
  try {
    await request(
      config,
      `/databases/${config.databaseId}/collections/${collectionId}/attributes/${attribute.type}`,
      {
        method: "POST",
        body: attribute.payload,
      },
    );
    console.log(`  Added attribute: ${collectionId}.${attribute.key}`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(
        `  Attribute already exists: ${collectionId}.${attribute.key}`,
      );
      return;
    }

    throw error;
  }
}

async function listCollectionAttributes(collectionId) {
  const response = await request(
    config,
    `/databases/${config.databaseId}/collections/${collectionId}/attributes`,
  );

  return Array.isArray(response.attributes) ? response.attributes : [];
}

function assertAttributeHasNotFailed(collectionId, attribute) {
  if (!ATTRIBUTE_FAILED_STATES.has(attribute?.status)) {
    return;
  }

  const errorDetails = `${attribute?.error || ""}`.trim();

  throw new Error(
    `Attribute ${collectionId}.${attribute.key} entered failed state: ${attribute.status}${errorDetails ? ` (${errorDetails})` : ""}`,
  );
}

async function waitForAttributes(
  collectionId,
  keys,
  timeoutMs = attributeWaitTimeoutMs,
) {
  const deadline = Date.now() + timeoutMs;
  let lastPendingSummary = "";

  while (Date.now() < deadline) {
    const attributes = await listCollectionAttributes(collectionId);

    const relevantAttributes = attributes.filter((attribute) =>
      keys.includes(attribute.key),
    );
    const statuses = new Map(
      relevantAttributes.map((attribute) => [attribute.key, attribute.status]),
    );

    if (keys.every((key) => ATTRIBUTE_READY_STATES.has(statuses.get(key)))) {
      return;
    }

    for (const attribute of relevantAttributes) {
      assertAttributeHasNotFailed(collectionId, attribute);
    }

    const pendingSummary = keys
      .filter((key) => !ATTRIBUTE_READY_STATES.has(statuses.get(key)))
      .map((key) => {
        const attribute = relevantAttributes.find(
          (candidate) => candidate.key === key,
        );
        const status = attribute?.status || "missing";
        const errorDetails = `${attribute?.error || ""}`.trim();
        return `${key}=${status}${errorDetails ? ` (${errorDetails})` : ""}`;
      })
      .join(", ");

    if (pendingSummary && pendingSummary !== lastPendingSummary) {
      console.log(`  Waiting: ${collectionId} (${pendingSummary})`);
      lastPendingSummary = pendingSummary;
    }

    await sleep(1500);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${collectionId}: ${lastPendingSummary || keys.join(", ")}. If an attribute remains in "processing" with an unchanged $updatedAt value, remove only that stuck attribute in Appwrite and rerun this script; attributes are now created one at a time.`,
  );
}

function getPositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(`${value || ""}`, 10);

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}

async function ensureIndex(collectionId, index) {
  try {
    await request(
      config,
      `/databases/${config.databaseId}/collections/${collectionId}/indexes`,
      {
        method: "POST",
        body: index,
      },
    );
    console.log(`  Added index: ${collectionId}.${index.key}`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`  Index already exists: ${collectionId}.${index.key}`);
      return;
    }

    throw error;
  }
}

async function removeIndexIfExists(collectionId, indexKey) {
  try {
    await request(
      config,
      `/databases/${config.databaseId}/collections/${collectionId}/indexes/${indexKey}`,
      { method: "DELETE" },
    );
    console.log(`  Removed obsolete index: ${collectionId}.${indexKey}`);
  } catch (error) {
    if (error.status === 404) {
      return;
    }

    throw error;
  }
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
