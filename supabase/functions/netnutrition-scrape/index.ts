import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "http://netnutrition.bsu.edu/NetNutrition/1";

interface SessionState {
  cookies: string[];
}

/** Collect cookies from a response and merge into existing list. */
function collectCookies(res: Response, cookies: string[]): string[] {
  const updated = [...cookies];
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const name = c.split("=")[0];
    const idx = updated.findIndex((x) => x.startsWith(name + "="));
    const value = c.split(";")[0];
    if (idx >= 0) {
      updated[idx] = value;
    } else {
      updated.push(value);
    }
  }
  // Fallback for environments without getSetCookie
  if (setCookies.length === 0) {
    const raw = res.headers.get("set-cookie");
    if (raw) {
      for (const part of raw.split(/,(?=\s*\w+=)/)) {
        const value = part.split(";")[0].trim();
        const name = value.split("=")[0];
        const idx = updated.findIndex((x) => x.startsWith(name + "="));
        if (idx >= 0) {
          updated[idx] = value;
        } else {
          updated.push(value);
        }
      }
    }
  }
  return updated;
}

/** Establish a session by manually following redirects to capture all cookies. */
async function initSession(): Promise<SessionState> {
  let cookies: string[] = [];
  let url: string = BASE_URL;

  // Follow redirects manually to capture cookies from each hop
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Cookie": cookies.join("; "),
      },
    });
    cookies = collectCookies(res, cookies);
    await res.text(); // consume body

    const location = res.headers.get("location");
    if (location && res.status >= 300 && res.status < 400) {
      url = new URL(location, url).href;
      console.log(`  Redirect ${res.status} → ${url}`);
    } else {
      break;
    }
  }

  // Ensure the CBORD cookie is present
  const hasCbord = cookies.some((c) => c.startsWith("CBORD.netnutrition2="));
  if (!hasCbord) {
    cookies.push("CBORD.netnutrition2=NNexternalID=1");
  }

  console.log(
    "Session cookies:",
    cookies.map((c) => c.split("=")[0]).join(", "),
  );
  return { cookies };
}

/** POST to a NetNutrition endpoint maintaining session cookies. */
async function postWithSession(
  session: SessionState,
  path: string,
  body: Record<string, string | number>,
): Promise<string> {
  const formData = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    formData.append(k, String(v));
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Cookie": session.cookies.join("; "),
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "*/*",
      "Referer": BASE_URL,
      "Origin": "http://netnutrition.bsu.edu",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
      "Accept-Language": "en-US,en;q=0.9",
      "Connection": "keep-alive",
    },
    body: formData.toString(),
  });

  const text = await res.text();
  console.log(
    `  POST ${path} → status ${res.status}, length ${text.length}, starts: ${text.substring(0, 120)}`,
  );

  // Update session cookies from response
  session.cookies = collectCookies(res, session.cookies);

  return text;
}

/** Extract HTML from a specific panel in the JSON response. */
function extractPanelHtml(responseText: string, panelId: string): string {
  try {
    const data = JSON.parse(responseText);
    if (data.success && Array.isArray(data.panels)) {
      const panel = data.panels.find(
        (p: { id: string; html: string }) => p.id === panelId,
      );
      return panel?.html ?? "";
    }
  } catch {
    // Not JSON — return raw for regex parsing
  }
  return responseText;
}

// Known dining halls with their sidebar unitOids (verified from browser captures)
const KNOWN_HALLS = [
  { name: "The Atrium", unitOid: 1 },
  { name: "Atrium Café", unitOid: 10 },
  { name: "Noyer", unitOid: 14 },
  { name: "Student Center Tally Food Court", unitOid: 17 },
  { name: "North Dining", unitOid: 21 },
  { name: "Woodworth Commons", unitOid: 27 },
  { name: "Bookmark Cafe", unitOid: 33 },
  { name: "Tom John Food Shop", unitOid: 35 },
];

/** Parse dining halls from the sidebar HTML in the initial page. */
function parseHallsFromPage(html: string): { name: string; unitOid: number }[] {
  const halls: { name: string; unitOid: number }[] = [];
  // Sidebar links: onclick="javascript:sideBarSelectUnit(N);" ... >Hall Name</a>
  const regex = /sideBarSelectUnit\((\d+)\)[^>]*>([^<]+)/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const unitOid = parseInt(match[1]);
    const name = match[2].trim();
    if (name) {
      halls.push({ unitOid, name });
    }
  }
  return halls;
}

/** Parse station links from childUnitsPanel HTML. */
function parseStations(html: string): { name: string; unitOid: number }[] {
  const stations: { name: string; unitOid: number }[] = [];
  // Pattern: childUnitsSelectUnit(N);">StationName</a>
  const regex = /childUnitsSelectUnit\((\d+)\)[^>]*>([^<]+)/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const unitOid = parseInt(match[1]);
    const name = match[2].trim();
    if (name) {
      stations.push({ unitOid, name });
    }
  }
  return stations;
}

interface ParsedFoodItem {
  name: string;
  detailOid: number;
  allergens: string[];
  dietaryFlags: string[];
  servingSize: string;
}

/** Parse food items from itemPanel HTML. */
function parseFoodItems(html: string): ParsedFoodItem[] {
  const items: ParsedFoodItem[] = [];

  // Match each item row: cbo_nn_itemPrimaryRow or cbo_nn_itemAlternateRow
  const rowRegex =
    /<tr[^>]*class='cbo_nn_item(?:Primary|Alternate)Row'[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    // Extract detailOid from getItemNutritionLabel(ID)
    const oidMatch = row.match(/getItemNutritionLabel\((\d+)\)/);
    if (!oidMatch) continue;
    const detailOid = parseInt(oidMatch[1]);

    // Extract item name and allergen/dietary info from cbo_nn_itemHover cell
    const hoverMatch = row.match(
      /class='cbo_nn_itemHover'>([\s\S]*?)<\/td>/i,
    );
    if (!hoverMatch) continue;

    const hoverContent = hoverMatch[1];

    // Name is the text before the first <img or end of content
    const nameMatch = hoverContent.match(/^([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (!name) continue;

    // Extract allergens and dietary flags from <img title='...'
    const allergens: string[] = [];
    const dietaryFlags: string[] = [];
    const imgRegex = /title='([^']+)'/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(hoverContent)) !== null) {
      const title = imgMatch[1].trim();
      const lower = title.toLowerCase();
      if (lower === "vegan" || lower === "vegetarian") {
        dietaryFlags.push(title);
      } else {
        allergens.push(title);
      }
    }

    // Serving size: the <td> after the hover cell
    const afterHover = row.substring(
      (hoverMatch.index ?? 0) + hoverMatch[0].length,
    );
    const servingMatch = afterHover.match(/<td[^>]*>([^<]*)<\/td>/i);
    const servingSize = servingMatch ? servingMatch[1].trim() : "";

    items.push({ name, detailOid, allergens, dietaryFlags, servingSize });
  }

  return items;
}

/** Parse nutrition facts from the nutrition label HTML. */
function parseNutrients(html: string): Record<string, string> {
  const nutrients: Record<string, string> = {};

  // Serving size from label
  const servingMatch = html.match(/Serving Size:(?:&nbsp;|\s)*([^<]+)/i);
  if (servingMatch) {
    nutrients["Serving Size"] = servingMatch[1]
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  // Calories
  const calMatch = html.match(
    />Calories<\/span>(?:&nbsp;|\s)*<span[^>]*class='cbo_nn_SecondaryNutrient'[^>]*>(?:&nbsp;|\s)*([^<]+)/i,
  );
  if (calMatch) {
    nutrients["Calories"] = calMatch[1].replace(/&nbsp;/g, "").trim();
  }

  // Calories from Fat
  const calFatMatch = html.match(
    /Calories from Fat(?:&nbsp;|\s)*<span[^>]*class='cbo_nn_SecondaryNutrient'[^>]*>(?:&nbsp;|\s)*([^<]+)/i,
  );
  if (calFatMatch) {
    nutrients["Calories from Fat"] = calFatMatch[1]
      .replace(/&nbsp;/g, "")
      .trim();
  }

  // Main nutrients (bold)
  const mainRegex =
    /font-weight:\s*bold;?\s*'>\s*([^<]+)<\/span><\/td><td><span[^>]*class='cbo_nn_SecondaryNutrient'[^>]*>(?:&nbsp;|\s)*([^<]+)/gi;
  let mainMatch;
  while ((mainMatch = mainRegex.exec(html)) !== null) {
    const label = mainMatch[1].trim();
    const value = mainMatch[2].replace(/&nbsp;/g, "").trim();
    if (label && value && label !== "Calories") {
      nutrients[label] = value;
    }
  }

  // Sub-nutrients (normal weight)
  const subRegex =
    /font-weight:\s*normal;?\s*'>\s*([^<]+)<\/span><\/td><td><span[^>]*class='cbo_nn_SecondaryNutrient'[^>]*>(?:&nbsp;|\s)*([^<]+)/gi;
  let subMatch;
  while ((subMatch = subRegex.exec(html)) !== null) {
    const label = subMatch[1].trim();
    const value = subMatch[2].replace(/&nbsp;/g, "").trim();
    if (label && value) {
      nutrients[label] = value;
    }
  }

  // Secondary nutrients (vitamins etc)
  const secRegex =
    /class='cbo_nn_SecondaryNutrientLabel'>\s*([^<]+)<\/td>\s*<td[^>]*class='cbo_nn_SecondaryNutrient'[^>]*>\s*([^<]+)/gi;
  let secMatch;
  while ((secMatch = secRegex.exec(html)) !== null) {
    const label = secMatch[1].trim();
    const value = secMatch[2].trim();
    if (label && value) {
      nutrients[label] = value;
    }
  }

  // Ingredients
  const ingredientsMatch = html.match(
    /class='cbo_nn_LabelIngredients'>\s*([\s\S]*?)<\/span>/i,
  );
  if (ingredientsMatch) {
    nutrients["Ingredients"] = ingredientsMatch[1]
      .replace(/&nbsp;/g, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  return nutrients;
}

/** Fetch nutrition label for a food item and upsert into the database. */
async function scrapeAndUpsertItem(
  session: SessionState,
  supabase: ReturnType<typeof createClient>,
  stationId: string,
  item: ParsedFoodItem,
): Promise<void> {
  let nutrients: Record<string, string> = {};

  try {
    const nutritionHtml = await postWithSession(
      session,
      "/NutritionDetail/ShowItemNutritionLabel",
      { detailOid: item.detailOid },
    );
    nutrients = parseNutrients(nutritionHtml);
  } catch (e) {
    console.error(`    Error fetching nutrition for ${item.name}:`, e);
  }

  const { error: itemError } = await supabase.from("food_items").upsert(
    {
      station_id: stationId,
      name: item.name,
      detail_oid: item.detailOid,
      serving_size: item.servingSize || null,
      allergens: item.allergens,
      dietary_flags: item.dietaryFlags,
      nutrients,
    },
    { onConflict: "detail_oid" },
  );

  if (itemError) {
    console.error(`    Error upserting ${item.name}:`, itemError);
  }
}

/** Process items from an itemPanel, handling pagination if needed. */
async function processItemPanel(
  session: SessionState,
  supabase: ReturnType<typeof createClient>,
  stationId: string,
  itemPanelHtml: string,
): Promise<number> {
  const foodItems = parseFoodItems(itemPanelHtml);
  console.log(`    Found ${foodItems.length} food items`);

  for (const item of foodItems) {
    await scrapeAndUpsertItem(session, supabase, stationId, item);
  }
  return foodItems.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log("Starting NetNutrition scrape...");

    // Step 1: Establish session
    const session = await initSession();
    console.log("Session established, cookies:", session.cookies.length);

    // Step 2: Load initial page to discover dining halls from sidebar
    const initPageRes = await fetch(BASE_URL, {
      headers: {
        "Cookie": session.cookies.join("; "),
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    session.cookies = collectCookies(initPageRes, session.cookies);
    const initPageHtml = await initPageRes.text();
    console.log(`Initial page loaded, length: ${initPageHtml.length}`);

    // Discover halls from sidebar
    let discoveredHalls = parseHallsFromPage(initPageHtml);
    console.log(
      `Discovered ${discoveredHalls.length} dining halls from page`,
    );

    // Fall back to known halls if dynamic discovery fails (e.g. site error page)
    if (discoveredHalls.length === 0) {
      console.log("Dynamic discovery failed, using known hall list as fallback");
      discoveredHalls = KNOWN_HALLS;
    }

    console.log(
      `Scraping ${discoveredHalls.length} halls:`,
      discoveredHalls.map((h) => `${h.name}(${h.unitOid})`).join(", "),
    );

    let totalItems = 0;

    for (const hall of discoveredHalls) {
      console.log(
        `\n=== Scraping: ${hall.name} (unitOid: ${hall.unitOid}) ===`,
      );

      // Upsert dining hall
      const { data: hallData, error: hallError } = await supabase
        .from("dining_halls")
        .upsert(
          { name: hall.name, unit_oid: hall.unitOid },
          { onConflict: "unit_oid" },
        )
        .select("id")
        .single();

      if (hallError) {
        console.error(`Error upserting hall ${hall.name}:`, hallError);
        continue;
      }

      // Step 3: Select dining hall → get stations from childUnitsPanel
      const sidebarResponse = await postWithSession(
        session,
        "/Unit/SelectUnitFromSideBar",
        { unitOid: hall.unitOid },
      );

      const childUnitsHtml = extractPanelHtml(
        sidebarResponse,
        "childUnitsPanel",
      );
      const itemPanelHtml = extractPanelHtml(sidebarResponse, "itemPanel");

      // Some halls may return items directly (no child units)
      if (itemPanelHtml && itemPanelHtml.includes("cbo_nn_itemHover")) {
        console.log(`  Hall ${hall.name} returned items directly (no stations)`);
        // Use hall itself as a station
        const { data: stationData, error: stationError } = await supabase
          .from("stations")
          .upsert(
            {
              dining_hall_id: hallData.id,
              name: hall.name,
              unit_oid: hall.unitOid,
            },
            { onConflict: "unit_oid" },
          )
          .select("id")
          .single();

        if (!stationError && stationData) {
          totalItems += await processItemPanel(
            session,
            supabase,
            stationData.id,
            itemPanelHtml,
          );
        }
        continue;
      }

      const stations = parseStations(childUnitsHtml);
      console.log(`  Found ${stations.length} stations`);

      if (stations.length === 0) {
        console.log(
          "  childUnitsHtml sample (first 500 chars):",
          childUnitsHtml.substring(0, 500),
        );
        continue;
      }

      for (const station of stations) {
        console.log(
          `  Station: ${station.name} (unitOid: ${station.unitOid})`,
        );

        // Upsert station
        const { data: stationData, error: stationError } = await supabase
          .from("stations")
          .upsert(
            {
              dining_hall_id: hallData.id,
              name: station.name,
              unit_oid: station.unitOid,
            },
            { onConflict: "unit_oid" },
          )
          .select("id")
          .single();

        if (stationError) {
          console.error(
            `  Error upserting station ${station.name}:`,
            stationError,
          );
          continue;
        }

        // Step 4: Select station → get food items from itemPanel
        const childResponse = await postWithSession(
          session,
          "/Unit/SelectUnitFromChildUnitsList",
          { unitOid: station.unitOid },
        );

        const stationItemHtml = extractPanelHtml(childResponse, "itemPanel");

        // Check if we got items
        if (stationItemHtml && stationItemHtml.includes("cbo_nn_itemHover")) {
          totalItems += await processItemPanel(
            session,
            supabase,
            stationData.id,
            stationItemHtml,
          );
          continue;
        }

        // Maybe nested child units (sub-stations)
        const nestedChildHtml = extractPanelHtml(
          childResponse,
          "childUnitsPanel",
        );
        const nestedStations = parseStations(nestedChildHtml);
        if (nestedStations.length > 0) {
          console.log(
            `    Nested stations found: ${nestedStations.length}, drilling down...`,
          );
          for (const nested of nestedStations) {
            const nestedResponse = await postWithSession(
              session,
              "/Unit/SelectUnitFromChildUnitsList",
              { unitOid: nested.unitOid },
            );
            const nestedItemHtml = extractPanelHtml(
              nestedResponse,
              "itemPanel",
            );
            if (nestedItemHtml && nestedItemHtml.includes("cbo_nn_itemHover")) {
              totalItems += await processItemPanel(
                session,
                supabase,
                stationData.id,
                nestedItemHtml,
              );
            }
          }
        }
      }
    }

    // Log scrape result
    await supabase.from("scrape_logs").insert({
      status: "success",
      message: `Scraped ${totalItems} items from ${discoveredHalls.length} halls`,
      items_count: totalItems,
    });

    console.log(`\nScrape complete: ${totalItems} items total`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scraped ${totalItems} items from ${discoveredHalls.length} dining halls`,
        itemsCount: totalItems,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Scrape error:", error);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      await supabase.from("scrape_logs").insert({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (_) {
      // ignore logging error
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Scrape failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
