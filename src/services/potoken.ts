/**
 * Mints YouTube "Proof of Origin" tokens (PoTokens) via bgutils-js, following
 * the exact flow YouTube's own web player uses: fetch a BotGuard attestation
 * challenge from youtube.com, run its (Google-provided) interpreter script in
 * a jsdom-backed VM to produce an integrity token, then mint per-video tokens
 * from that. See https://github.com/LuanRT/BgUtils for the reverse-engineering
 * this is based on.
 *
 * Some videos are served fine to a plain anonymous request; others reject it
 * outright unless a valid PoToken is attached. This lets ytSource.ts attach
 * one to every request so both cases work without needing to know in advance
 * which a given video needs.
 */

// The well-known public "web" integrity request key used broadly across the
// PoToken-generation ecosystem (yt-dlp's plugins, this library's own README
// example, etc.) - not a secret specific to this project.
const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";

interface Minter {
  mintAsWebsafeString(videoId: string): Promise<string>;
}

let cached: { minter: Minter; expiresAt: number } | undefined;
let bootstrapping: Promise<{ minter: Minter; expiresAt: number }> | undefined;

async function bootstrap(): Promise<{ minter: Minter; expiresAt: number }> {
  // bgutils-js only declares these as subpath exports with no root export, which
  // ts-node's (lazier than tsc's) module resolution can't see via the package's
  // exports map. Casting the specifier sidesteps static type resolution for it.
  const botguardMod: any = await import("bgutils-js/botguard" as string);
  const webpoMod: any = await import("bgutils-js/webpo" as string);
  const utilsMod: any = await import("bgutils-js/utils" as string);
  const { BotGuardClient } = botguardMod;
  const { WebPoMinter } = webpoMod;
  const { buildURL, parseLooseJSON, getHeaders, USER_AGENT } = utilsMod;
  const { JSDOM, VirtualConsole } = await import("jsdom");

  const dom = new JSDOM(
    '<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
    {
      url: "https://www.youtube.com",
      referrer: "https://www.youtube.com/",
      resources: { userAgent: USER_AGENT },
      virtualConsole: new VirtualConsole(),
    },
  );

  const pageResponse = await fetch("https://www.youtube.com", {
    headers: { accept: "*/*", "accept-language": "en-US,en;q=0.7", "user-agent": USER_AGENT },
  });
  const pageHtml = await pageResponse.text();

  const ytConfig = pageHtml.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
  if (!ytConfig) throw new Error("Could not find ytcfg in YouTube's page HTML");

  (dom.window as any).yt = { config_: JSON.parse(ytConfig) };
  Object.assign(globalThis, {
    yt: (dom.window as any).yt,
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    origin: dom.window.origin,
  });
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator });
  }

  const initialAttestationData = pageHtml.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/);
  if (!initialAttestationData) throw new Error("Could not find BotGuard challenge in YouTube's page HTML");

  const challengeResponse = parseLooseJSON(initialAttestationData[1]).R;
  if (!challengeResponse?.bgChallenge) throw new Error("Could not get BotGuard challenge");

  const interpreterUrl =
    challengeResponse.bgChallenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  const interpreterJavascript = await (await fetch(`https:${interpreterUrl}`)).text();
  if (!interpreterJavascript) throw new Error("Could not load the BotGuard VM script");
  new Function(interpreterJavascript)();

  const botGuardClient = await BotGuardClient.create({
    program: challengeResponse.bgChallenge.program,
    globalName: challengeResponse.bgChallenge.globalName,
    globalObject: globalThis,
  });

  const webPoSignalOutput: any[] = [];
  const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });

  const integrityTokenResponse = await fetch(buildURL("GenerateIT", true), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse]),
  });
  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] =
    (await integrityTokenResponse.json()) as [string, number, number, string];

  const minter = await WebPoMinter.create(
    { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
    webPoSignalOutput,
  );

  return { minter, expiresAt: Date.now() + Math.max(0, estimatedTtlSecs - mintRefreshThreshold) * 1000 };
}

/**
 * Mints a content-bound PoToken for a video. Returns undefined (rather than
 * throwing) if bootstrapping fails, so callers can fall back to an
 * unauthenticated request instead of failing outright.
 */
export async function mintPoToken(videoId: string): Promise<string | undefined> {
  try {
    if (!cached || Date.now() > cached.expiresAt) {
      if (!bootstrapping) bootstrapping = bootstrap();
      cached = await bootstrapping;
      bootstrapping = undefined;
    }
    return await cached.minter.mintAsWebsafeString(videoId);
  } catch (error) {
    console.error("Failed to mint a YouTube PoToken, continuing without one:", error);
    cached = undefined;
    return undefined;
  }
}
