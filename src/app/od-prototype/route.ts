import { NextResponse } from "next/server";

function redirectToDirectory() {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: "/od-prototype/" },
  });
}

export const GET = redirectToDirectory;
export const HEAD = redirectToDirectory;
