import * as env from "env-var";

export const config = {
  name: env.get("SERVER_NAME").asString(),
  notionToken: env.get("NOTION_TOKEN").required().asString(),
  clientUrl: env.get("CLIENT_URL").required().asString(),
};
