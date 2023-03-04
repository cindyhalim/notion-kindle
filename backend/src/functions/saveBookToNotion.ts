import middy from "@middy/core";
import jsonBodyParser from "@middy/http-json-body-parser";
import type { Context } from "aws-lambda";
import Notion from "src/api/notion";
import { READING_LIST_PROPERTIES } from "src/api/notion/constants";
import type {
  NotionPropertyData,
  RawReadingListProperties,
} from "src/api/notion/types";
import { authorizerMiddleware } from "src/middlewares/authorizer";
import { validateReadListDatabaseIdMiddleware } from "src/middlewares/validateReadListDatabaseId";
import {
  makeResultResponse,
  ValidatedAPIGatewayProxyEvent,
} from "../libs/apiGateway";

type SaveBookToNotionBody = {
  isbn: string;
  title: string;
  author: string;
  pages: string;
  genre: string[];
  coverUrl: string;
  goodreadsUrl: string;
  settings: {
    useLowerCase: boolean;
  };
};

type SaveBookToNotionContext = Context & { accessToken: string };

const controller = async (
  event: ValidatedAPIGatewayProxyEvent<SaveBookToNotionBody>,
  context: SaveBookToNotionContext
) => {
  const { accessToken } = context;
  const { isbn, title, author, pages, genre, coverUrl, goodreadsUrl } =
    event.body;
  const { databaseId } = event.pathParameters;

  const client = new Notion({ accessToken });

  const { pages: existingBookEntries } =
    await client.getPages<RawReadingListProperties>({
      databaseId,
      filter: {
        or: [
          {
            property: READING_LIST_PROPERTIES["isbn"].name,
            rich_text: {
              equals: isbn,
            },
          },
          {
            and: [
              {
                property: READING_LIST_PROPERTIES["title"].name,
                rich_text: {
                  contains: title,
                },
              },
              {
                property: READING_LIST_PROPERTIES["author"].name,
                rich_text: {
                  contains: author,
                },
              },
            ],
          },
        ],
      },
    });

  const properties: NotionPropertyData<RawReadingListProperties>[] = [
    {
      name: "title",
      value: title,
    },
    { name: "author", value: author },
    {
      name: "book cover",
      value: coverUrl,
    },
    {
      name: "genre",
      value: genre,
    },
    {
      name: "pages",
      value: pages,
    },
    {
      name: "goodreads link",
      value: goodreadsUrl,
    },
  ];

  if (!existingBookEntries.length) {
    try {
      const { id } =
        await client.addPageToReadListDatabase<RawReadingListProperties>({
          databaseId,
          properties,
        });
      return makeResultResponse({
        pageId: id,
      });
    } catch (e) {
      console.log("Error adding new page to read list", e);
      return makeResultResponse(
        {
          message: "Failed to save book to notion",
        },
        400
      );
    }
  }

  // update existing page properties if it exists
  const pageId = existingBookEntries[0].id;

  try {
    await client.updatePageProperties<RawReadingListProperties>({
      pageId,
      properties,
    });
  } catch (e) {
    console.log("Error updating page with book details", e);
    return makeResultResponse(
      {
        message: "Failed to save book to notion",
      },
      400
    );
  }

  return makeResultResponse({
    pageId,
  });
};

export const handler = middy(controller)
  .use(jsonBodyParser())
  .use(authorizerMiddleware())
  .use(validateReadListDatabaseIdMiddleware());