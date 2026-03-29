import { getResourceUrl, getPrmResponse } from "@/lib/oauth-metadata"

export async function GET(req: Request) {
  const resourceUrl = getResourceUrl(req)
  return Response.json(getPrmResponse(resourceUrl))
}
