import { Readable } from "stream";
import {
  generateChunk,
  generateChunkWithMetadata,
  getStreamFromUrls,
  getStreamFromUrlsWithMetadata,
} from "../index";

const urls = [
  "http://localhost:7501/send/abcdefgh",
  "http://localhost:7501/send/ijklmnop",
  "http://localhost:7501/send/qrstuvwx",
];

function mockMapUrlsToFetchStreams(data: Iterable<any>) {
  return async function* () {
    for await (const i of data) {
      yield i;
    }
  };
}

let server: any;

beforeAll(() => {
  server = require("./server.js").server;
});

afterAll(() => {
  server.close();
});

describe("generateChunk(urls)", () => {
  it("should return an async generator with proper value", async () => {
    const generator = generateChunk(urls);

    expect((await generator.next()).value.toString()).toBe("abcdefgh");
  });

  it("should use options.mapUrlsToFetchStreams if given", async () => {
    const generator = generateChunk(urls, {
      mapUrlsToFetchStreams: async function* () {
        for await (const i of ["1", "2"]) {
          yield i;
        }
      },
    });

    expect((await generator.next()).value.toString()).toBe("1");
    expect((await generator.next()).value.toString()).toBe("2");
  });
});

describe("getStreamFromUrls(urls)", () => {
  it("should return a readable stream", async () => {
    const result = await getStreamFromUrls(urls);

    expect(result).toBeInstanceOf(Readable);
  });
});

describe("generateChunkWithMetadata(urls)", () => {
  it("should return an async generator with proper value", async () => {
    const generator = generateChunkWithMetadata(urls, []);

    expect((await generator.next()).value.toString()).toBe("abcdefgh");
  });

  it("should use options.mapUrlsToFetchStreams if given", async () => {
    const generator = generateChunkWithMetadata(["doesn't matter"], [], {
      mapUrlsToFetchStreams: mockMapUrlsToFetchStreams([1, 2]),
    });

    expect((await generator.next()).value).toBe(1);
    expect((await generator.next()).value).toBe(2);
  });

  it("should use options.range.start & options.range.end if given", async () => {
    const generator = generateChunkWithMetadata(["doesn't matter"], [], {
      range: {
        start: 0,
        end: 1,
      },
      mapUrlsToFetchStreams: mockMapUrlsToFetchStreams(["123"]),
    });

    expect((await generator.next()).value.toString()).toBe("1");
  });
});

describe("getStreamFromUrlsWithMetadata(urls)", () => {
  it("should return an object with readable & metadata property", async () => {
    const result = await getStreamFromUrlsWithMetadata(urls);

    expect(result).toHaveProperty("readable");
    expect(result).toHaveProperty("metadata");
  });

  it("should log error if options.logError is true and there is an error", async () => {
    const spy = jest.spyOn(global.console, "error").mockImplementation();

    await getStreamFromUrlsWithMetadata(urls, {
      logError: true,
    });

    expect(spy).toHaveBeenCalled();

    await getStreamFromUrlsWithMetadata(["invalid url"], {
      logError: true,
    });

    expect(spy).toHaveBeenCalled();
  });

  it("should remove urls from the start if options.range.start is given", async () => {
    const result = await getStreamFromUrlsWithMetadata(urls, {
      range: { start: 10, end: 11 },
    });

    expect(result).toHaveProperty("readable");
    expect(result).toHaveProperty("metadata");
  });

  it("should use options.range.start & options.range.end if given", async () => {
    const response = await getStreamFromUrlsWithMetadata(["doesn't matter"], {
      mapUrlsToFetchStreams: mockMapUrlsToFetchStreams(["123"]),
      range: {
        start: 0,
        end: 1,
      },
    });

    const { readable } = response!;

    const result = await new Promise<string>((resolve) => {
      let collectedData = "";

      readable.on("data", (data: Buffer) => {
        collectedData += data.toString();
      });

      readable.once("close", () => {
        resolve(collectedData);
      });

      readable.read();
    });

    expect(result).toBe("1");
  });
});
