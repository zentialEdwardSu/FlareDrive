import { RequestHandlerParams } from "./utils";
import { handleRequestCopy } from "./copy";
import { handleRequestDelete } from "./delete";

export async function handleRequestMove(params: RequestHandlerParams) {
  const response = await handleRequestCopy(params);
  if (response.status >= 400) return response;
  return handleRequestDelete(params);
}
