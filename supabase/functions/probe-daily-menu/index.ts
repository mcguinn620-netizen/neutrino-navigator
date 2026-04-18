// Probe a single station drill-down and dump full HTML response so we can see structure.
const BASE_URL = "http://netnutrition.bsu.edu/NetNutrition/1";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function collectCookies(res: Response, cookies: string[]): string[] {
  const updated = [...cookies];
  // deno-lint-ignore no-explicit-any
  const setCookies = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const value = c.split(";")[0];
    const name = value.split("=")[0];
    const idx = updated.findIndex((x) => x.startsWith(name + "="));
    if (idx >= 0) updated[idx] = value;
    else updated.push(value);
  }
  if (setCookies.length === 0) {
    const raw = res.headers.get("set-cookie");
    if (raw) {
      for (const part of raw.split(/,(?=\s*\w+=)/)) {
        const value = part.split(";")[0].trim();
        const name = value.split("=")[0];
        const idx = updated.findIndex((x) => x.startsWith(name + "="));
        if (idx >= 0) updated[idx] = value;
        else updated.push(value);
      }
    }
  }
  return updated;
}

async function init(): Promise<string[]> {
  let cookies: string[] = [];
  let url = BASE_URL;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { Cookie: cookies.join("; "), "User-Agent": UA, Accept: "text/html" },
    });
    cookies = collectCookies(res, cookies);
    await res.text();
    const loc = res.headers.get("location");
    if (loc && res.status >= 300 && res.status < 400) url = new URL(loc, url).href;
    else break;
  }
  if (!cookies.some((c) => c.startsWith("CBORD.netnutrition2="))) {
    cookies.push("CBORD.netnutrition2=NNexternalID=1");
  }
  const r = await fetch(BASE_URL, {
    headers: { Cookie: cookies.join("; "), "User-Agent": UA, Accept: "text/html" },
  });
  cookies = collectCookies(r, cookies);
  await r.text();
  return cookies;
}

async function post(
  cookies: string[],
  path: string,
  body: Record<string, string | number>,
): Promise<{ text: string; cookies: string[] }> {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) fd.append(k, String(v));
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: cookies.join("; "),
      "X-Requested-With": "XMLHttpRequest",
      Accept: "*/*",
      Referer: BASE_URL,
      Origin: "http://netnutrition.bsu.edu",
      "User-Agent": UA,
    },
    body: fd.toString(),
  });
  const text = await res.text();
  return { text, cookies: collectCookies(res, cookies) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const hallOid = parseInt(url.searchParams.get("hall") ?? "16");
    const stationOidParam = url.searchParams.get("station");
    const stationOid = stationOidParam ? parseInt(stationOidParam) : null;

    let cookies: string[] = [];
    let lastResp = "";
    let hallResp = "";
    // Up to 5 attempts to get past start-up errors
    for (let attempt = 0; attempt < 5; attempt++) {
      cookies = await init();
      const r1 = await post(cookies, "/Unit/SelectUnitFromSideBar", { unitOid: hallOid });
      cookies = r1.cookies;
      if (r1.text.includes("NetNutrition Start-up Error")) {
        lastResp = "hall startup err attempt " + attempt;
        continue;
      }
      hallResp = r1.text;
      if (stationOid === null) {
        lastResp = r1.text;
        break;
      }
      const r2 = await post(cookies, "/Unit/SelectUnitFromChildUnitsList", {
        unitOid: stationOid,
      });
      cookies = r2.cookies;
      lastResp = r2.text;
      if (!r2.text.includes("NetNutrition Start-up Error")) break;
    }

    // Try to parse panels and return everything
    const out: {
      attemptsResp: string;
      raw?: string;
      panels?: { id: string; length: number; full: string }[];
    } = { attemptsResp: lastResp.substring(0, 100) };

    try {
      const json = JSON.parse(lastResp);
      if (Array.isArray(json.panels)) {
        out.panels = json.panels.map((p: { id: string; html?: string }) => ({
          id: p.id,
          length: p.html?.length ?? 0,
          full: p.html ?? "",
        }));
      } else {
        out.raw = lastResp;
      }
    } catch {
      out.raw = lastResp;
    }

    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
