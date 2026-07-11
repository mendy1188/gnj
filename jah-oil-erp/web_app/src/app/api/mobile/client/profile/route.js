import { NextResponse } from "next/server";

import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  getClientUserById,
  updateClientUserProfile,
} from "@/features/client-users/data";

import { getClientRequestSession } from "../auth/_shared";

export const dynamic = "force-dynamic";

function getClientProfileErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Client Profile",
    genericLabel: "update your profile",
    fallbackMessage:
      "We could not update your profile right now. Try again, and if the problem continues, contact support.",
  });
}

export async function PUT(request) {
  try {
    const session = await getClientRequestSession(request);

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 },
      );
    }

    const payload = await request.json().catch(() => null);
    const currentUser = await getClientUserById(session.userId);

    if (!currentUser) {
      return NextResponse.json(
        {
          success: false,
          message: "Client account could not be found.",
        },
        { status: 404 },
      );
    }

    const updatedUser = await updateClientUserProfile(session.userId, {
      ...currentUser,
      ...payload,
    });

    return NextResponse.json({
      success: true,
      profile: {
        fullName: updatedUser.fullName,
        phone: updatedUser.phone,
        userType: updatedUser.userType,
        companyName: updatedUser.companyName,
        preferredProvider: updatedUser.preferredProvider,
        providerNumbers: updatedUser.providerNumbers,
      },
      message: "Profile updated successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getClientProfileErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
