import { NextResponse } from "next/server";

import { createSessionToken } from "@/features/auth/session";
import { hashPassword } from "@/features/auth/password";
import { buildClientSession } from "@/features/client-users/session";
import { createClientUserRecord } from "@/features/client-users/data";
import { getUserFacingErrorMessage } from "@/features/errors/copy";

import { sanitizeClientSession } from "../_shared";

function getClientSignupErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Client Registration",
    genericLabel: "create your account",
    fallbackMessage:
      "We could not create your account right now. Try again in a moment, and if the problem continues, contact support.",
  });
}

function normalizeString(value) {
  return `${value || ""}`.trim();
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);
    const fullName = normalizeString(payload?.fullName);
    const email = normalizeString(payload?.email).toLowerCase();
    const phone = normalizeString(payload?.phone);
    const password = `${payload?.password || ""}`;
    const userType = normalizeString(payload?.userType || "individual").toLowerCase();
    const companyName = normalizeString(payload?.companyName);
    const preferredProvider = normalizeString(payload?.preferredProvider || "wave").toLowerCase();
    const waveNumber = normalizeString(payload?.waveNumber);
    const qmoneyNumber = normalizeString(payload?.qmoneyNumber);
    const afrimoneyNumber = normalizeString(payload?.afrimoneyNumber);

    if (!fullName || !email || !phone || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "Full name, email, phone number, and password are required.",
        },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          message: "Password must be at least 8 characters.",
        },
        { status: 400 },
      );
    }

    if (!["individual", "company"].includes(userType)) {
      return NextResponse.json(
        {
          success: false,
          message: "User type is invalid.",
        },
        { status: 400 },
      );
    }

    if (userType === "company" && !companyName) {
      return NextResponse.json(
        {
          success: false,
          message: "Company or organization name is required.",
        },
        { status: 400 },
      );
    }

    const user = await createClientUserRecord({
      fullName,
      email,
      phone,
      passwordHash: hashPassword(password),
      userType,
      companyName,
      preferredProvider,
      providerNumbers: {
        wave: waveNumber,
        qmoney: qmoneyNumber,
        afrimoney: afrimoneyNumber,
      },
      mustChangePassword: false,
      status: "active",
    });
    const session = buildClientSession(user);

    return NextResponse.json(
      {
        success: true,
        token: await createSessionToken(session),
        session: sanitizeClientSession(session),
        message: "Client account created successfully.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error?.code === 409) {
      return NextResponse.json(
        {
          success: false,
          message: "A client account with that email already exists.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: getClientSignupErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
