import { NextResponse } from "next/server";

export function createProxyResponse(data: unknown) {
  return NextResponse.json(data);
}
