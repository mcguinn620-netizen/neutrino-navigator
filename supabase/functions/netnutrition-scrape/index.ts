import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "http://netnutrition.bsu.edu/NetNutrition/1";

// Verified dining halls with their sidebar unitOids
const DINING_HALLS = [
  { name: "The Atrium", unitOid: 1 },
  { name: "Atrium Café", unitOid: 10 },
  { name: "Noyer", unitOid: 14 },
  { name: "Student Center Tally Food Court", unitOid: 17 },
  { name: "North Dining", unitOid: 21 },
  { name: "Woodworth Commons", unitOid: 27 },
  { name: "Bookmark Cafe", unitOid: 33 },
  { name: "Tom John Food Shop", unitOid: 35 },
];

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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  console.log("Session cookies:", cookies.map((c) => c.split("=")[0]).join(", "));
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
    },
    body: formData.toString(),
  });

  const text = await res.text();
  console.log(`  POST ${path} → status ${res.status}, length ${text.length}, starts: ${text.substring(0, 80)}`);

  // Update session cookies from response
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const name = c.split("=")[0];
    session.cookies = session.cookies.filter((x) => !x.startsWith(name + "="));
    session.cookies.push(c.split(";")[0]);
  }

  return text;
}

/** Extract HTML from a specific panel in the JSON response. */
function extractPanelHtml(
  jsonText: string,
  panelId: string,
): string {
  try {
    const data = JSON.parse(jsonText);
    if (!data.success || !Array.isArray(data.panels)) {
      console.log("  extractPanelHtml: not a valid panels response");
      return "";
    }
    const panel = data.panels.find(
      (p: { id: string; html: string }) => p.id === panelId,
    );
    const html = panel?.html ?? "";
    if (panelId === "childUnitsPanel" && html.length > 0) {
      console.log("  childUnitsPanel snippet:", html.substring(0, 300));
    }
    return html;
  } catch (e) {
    console.log("  extractPanelHtml: JSON parse failed, returning raw text. Error:", e);
    // If response is raw HTML (like nutrition label), return as-is
    return jsonText;
  }
}

/** Parse station links from childUnitsPanel HTML. */
function parseStations(html: string): { name: string; unitOid: number }[] {
  const stations: { name: string; unitOid: number }[] = [];
  const regex = /childUnitsSelectUnit\((\d+)\);\s*"\s*>\s*([^<]+)/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    stations.push({
      unitOid: parseInt(match[1]),
      name: match[2].trim(),
    });
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

  // Each item row has a class cbo_nn_itemPrimaryRow or cbo_nn_itemAlternateRow
  // The detailOid is in getItemNutritionLabel(detailOid) calls
  // Item name is the text content of cbo_nn_itemHover cell
  // Allergen/dietary icons are <img title='...'/> inside the same cell
  // Serving size is the next <td> after the hover cell

  // Split by rows (tr elements with item row classes)
  const rowRegex =
    /<tr[^>]*class='cbo_nn_item(?:Primary|Alternate)Row'[^>]*>([\s\S]*?)(?=<tr[^>]*class='cbo_nn_item|<\/table>)/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    // Extract detailOid from getItemNutritionLabel(ID)
    const oidMatch = row.match(/getItemNutritionLabel\((\d+)\)/);
    if (!oidMatch) continue;
    const detailOid = parseInt(oidMatch[1]);

    // Extract item name from cbo_nn_itemHover cell
    // Pattern: class='cbo_nn_itemHover'>ItemName<img...
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

    // Serving size is in the next <td> after the hover cell
    // Pattern after </td>: <td>ServingSize</td>
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
  const servingMatch = html.match(
    /Serving Size:(?:&nbsp;|\s)*([^<]+)/i,
  );
  if (servingMatch) {
    nutrients["Serving Size"] = servingMatch[1]
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  // Calories: <span style='font-weight: bold;'>Calories</span>&nbsp;&nbsp;<span class='cbo_nn_SecondaryNutrient'>440</span>
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

  // Main nutrients: bold label followed by value
  // Pattern: <span style='font-weight:bold;'>Label</span></td><td><span class='cbo_nn_SecondaryNutrient'>&nbsp;value</span>
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

  // Sub-nutrients: normal weight label
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

  // Secondary nutrients (vitamins etc): cbo_nn_SecondaryNutrientLabel / cbo_nn_SecondaryNutrient
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

  // Additional nutrition (Niacin, Magnesium, etc.)
  const addRegex =
    /<td>(\w[\w\s]*?)<\/td>\s*<td>(\d+%?)/gi;
  let addMatch;
  while ((addMatch = addRegex.exec(html)) !== null) {
    const label = addMatch[1].trim();
    const value = addMatch[2].trim();
    if (label && value && !nutrients[label]) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const hallFilter = body.hallUnitOid as number | undefined;

    console.log("Starting NetNutrition scrape...");

    // Step 1: Establish session
    const session = await initSession();
    console.log("Session established, cookies:", session.cookies.length);

    const hallsToScrape = hallFilter
      ? DINING_HALLS.filter((h) => h.unitOid === hallFilter)
      : DINING_HALLS;

    let totalItems = 0;

    for (const hall of hallsToScrape) {
      console.log(`\n=== Scraping: ${hall.name} (unitOid: ${hall.unitOid}) ===`);

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

      // Step 2: Select dining hall → get stations from childUnitsPanel
      const sidebarResponse = await postWithSession(
        session,
        "/Unit/SelectUnitFromSideBar",
        { unitOid: hall.unitOid },
      );

      const childUnitsHtml = extractPanelHtml(
        sidebarResponse,
        "childUnitsPanel",
      );
      const stations = parseStations(childUnitsHtml);
      console.log(`  Found ${stations.length} stations`);

      if (stations.length === 0) {
        console.log("  Raw childUnitsPanel length:", childUnitsHtml.length);
        continue;
      }

      for (const station of stations) {
        console.log(`  Station: ${station.name} (unitOid: ${station.unitOid})`);

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
          console.error(`  Error upserting station ${station.name}:`, stationError);
          continue;
        }

        // Step 3: Select station → get food items from itemPanel
        const childResponse = await postWithSession(
          session,
          "/Unit/SelectUnitFromChildUnitsList",
          { unitOid: station.unitOid },
        );

        const itemPanelHtml = extractPanelHtml(childResponse, "itemPanel");

        // Check if we got more child units instead of items (nested hierarchy)
        const nestedChildHtml = extractPanelHtml(
          childResponse,
          "childUnitsPanel",
        );
        if (nestedChildHtml && !itemPanelHtml) {
          const nestedStations = parseStations(nestedChildHtml);
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
            const nestedItems = parseFoodItems(nestedItemHtml);
            console.log(
              `      Sub-station ${nested.name}: ${nestedItems.length} items`,
            );
            for (const item of nestedItems) {
              await scrapeAndUpsertItem(
                session,
                supabase,
                stationData.id,
                item,
              );
              totalItems++;
            }
          }
          continue;
        }

        const foodItems = parseFoodItems(itemPanelHtml);
        console.log(`    Found ${foodItems.length} food items`);

        for (const item of foodItems) {
          await scrapeAndUpsertItem(session, supabase, stationData.id, item);
          totalItems++;
        }
      }
    }

    // Log scrape result
    await supabase.from("scrape_logs").insert({
      status: "success",
      message: `Scraped ${totalItems} items from ${hallsToScrape.length} halls`,
      items_count: totalItems,
    });

    console.log(`\nScrape complete: ${totalItems} items total`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scraped ${totalItems} items from ${hallsToScrape.length} dining halls`,
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

/** Fetch nutrition label for a food item and upsert into the database. */
async function scrapeAndUpsertItem(
  session: SessionState,
  supabase: ReturnType<typeof createClient>,
  stationId: string,
  item: ParsedFoodItem,
): Promise<void> {
  let nutrients: Record<string, string> = {};

  try {
    // ShowItemNutritionLabel returns raw HTML (not JSON)
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
