import { Readable } from "stream";
import got, {
  CancelableRequest,
  Options as GotRequestOptions,
  Response,
} from "got";

const mapUrlsToGotStreams = (
  url: string,
  gotStreamOptions?: GotStreamOptions,
) => got.stream(url, gotStreamOptions);

export async function* generateChunk(
  urls: string[],
  options?: Partial<Options>,
) {
  const fetchStreams = urls.map(
    (url) =>
      (typeof options?.mapUrlsToFetchStreams === "function" &&
        options?.mapUrlsToFetchStreams(
          url,
          options.mapUrlsToFetchStreamsOptions,
        )) ||
      mapUrlsToGotStreams(url, options?.gotStreamOptions),
  );

  for (const stream of fetchStreams) {
    for await (const chunk of stream) {
      yield chunk;
    }
  }
}

export async function* generateChunkWithMetadata(
  urls: string[],
  metadata: Partial<Response>[],
  options?: Partial<OptionsForMetadata>,
  range?: { start: number; end: number },
) {
  if (!range) {
    range = options?.range;
  }

  const fetchStreams = urls.map(
    (url) =>
      (typeof options?.mapUrlsToFetchStreams === "function" &&
        options?.mapUrlsToFetchStreams(
          url,
          options.mapUrlsToFetchStreamsOptions,
        )) ||
      mapUrlsToGotStreams(url, options?.gotStreamOptions),
  );

  let totalGeneratedChunkSize = 0;
  let skippedFirstBytes = false;

  for (let i = 0; i < fetchStreams.length; i++) {
    const stream = fetchStreams[i];

    for await (const chunk of stream) {
      if (
        !skippedFirstBytes &&
        typeof range?.start === "number" &&
        typeof range?.end === "number"
      ) {
        totalGeneratedChunkSize += chunk.length;

        if (totalGeneratedChunkSize > range.start) {
          skippedFirstBytes = true;

          const len = range.start + range.end;

          const data = chunk.slice(range.start, len);

          console.log({
            totalGeneratedChunkSize,
            range,
            len,
            data,
            chunk: chunk.toString(),
          });

          yield data;
        }
      } else {
        yield chunk;
      }
    }
  }
}

export const getStreamFromUrls = async (
  urls: string[],
  options?: Partial<Options>,
) => {
  const readable = Readable.from(generateChunk(urls, options));
  return readable;
};

export const getMetadata = async (
  urls: string[],
  options?: Partial<OptionsForMetadata>,
): Promise<Partial<Response>[]> => {
  const metadata: { [key: string]: any }[] = [];

  for (const url of urls) {
    let response: any = null;

    try {
      const promise = got.head(url, options?.gotStreamOptions);
      response = await promise;
    } catch (error) {
      if (options?.logError) {
        console.error(error);
      }
    }

    // Handle servers that don't support HTTP HEAD method
    if (!response) {
      try {
        const promise = got.get(url, {
          ...options?.gotStreamOptions,
        }) as CancelableRequest;

        promise.on("response", (r) => {
          response = r;
          promise.cancel();
        });

        response = await promise;
      } catch (error) {
        if (error.name !== "CancelError" && options?.logError) {
          console.error(error);
        }
      }
    }

    const data: { [key: string]: any } = {};

    for (const key in response) {
      const prop = (response as { [k: string]: any })[key];

      if (key.startsWith("_") || typeof prop === "function") {
        continue;
      }

      data[key] = prop;
    }

    metadata.push(data);
  }

  return metadata as Partial<Response>[];
};

export const getStreamFromUrlsWithMetadata = async (
  urls: string[],
  options?: Partial<OptionsForMetadata>,
): Promise<{
  readable: Readable;
  metadata: Partial<Response>[];
} | null> => {
  const metadata = await getMetadata(urls, options);

  const contentLengthArray = metadata.map((response) =>
    parseInt((response.headers && response.headers["content-length"]) || "0"),
  );

  const totalContentLength = contentLengthArray.reduce((a, c) => a + c, 0);

  let urlsSkipFromStart = 0;

  const range = {
    start: 0,
    end: 0,
  };

  let chunkSize = contentLengthArray[0];
  let i = 0;

  if (
    totalContentLength > 0 &&
    options?.range?.start &&
    options.range.start > 0
  ) {
    range.start = options.range.start;

    for (i = 0; i < contentLengthArray.length; i++) {
      if (chunkSize > range.start) {
        break;
      }

      chunkSize += contentLengthArray[i];
      range.start = range.start - contentLengthArray[i];
      urlsSkipFromStart++;
    }
  }

  let urlsSkipFromEnd = contentLengthArray.length - urlsSkipFromStart - 1;

  if (
    totalContentLength > 0 &&
    options?.range?.end &&
    options.range.end > options.range.start
  ) {
    range.end = options.range.end;

    chunkSize =
      chunkSize > contentLengthArray[i]
        ? chunkSize - contentLengthArray[i]
        : chunkSize;

    console.log({ chunkSize });

    for (let i = 0; i < contentLengthArray.length; i++) {
      console.log({ urlsSkipFromEnd });

      if (chunkSize < range.end) {
        break;
      }

      chunkSize -= contentLengthArray[i];
      urlsSkipFromEnd--;
    }

    range.end = options.range.end - options.range.start + 1;
  }

  for (let i = 0; i < urlsSkipFromStart; i++) {
    urls.shift();
  }

  for (let i = 0; i < urlsSkipFromEnd; i++) {
    urls.pop();
  }

  const readable = Readable.from(
    generateChunkWithMetadata(urls, metadata, options, range),
  );

  return { readable, metadata };
};

export interface GotStreamOptions extends GotRequestOptions {
  isStream: true;
}

export interface Options {
  gotStreamOptions: GotStreamOptions;
  mapUrlsToFetchStreams: (url: string, ...args: any) => AsyncIterable<any>;
  mapUrlsToFetchStreamsOptions: Object;
  logError: boolean;
}

export interface OptionsForMetadata extends Options {
  range: {
    start: number;
    end: number;
  };
}
