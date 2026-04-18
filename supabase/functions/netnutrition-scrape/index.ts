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
    await res.text();

    const location = res.headers.get("location");
    if (location && res.status >= 300 && res.status < 400) {
      url = new URL(location, url).href;
      console.log(`  Redirect ${res.status} → ${url}`);
    } else {
      break;
    }
  }

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
    `  POST ${path} → status ${res.status}, length ${text.length}, starts: ${
      text.substring(0, 120)
    }`,
  );

  session.cookies = collectCookies(res, session.cookies);
  return text;
}

/** Check if a response is a Start-up Error page (session lost). */
function isStartupError(text: string): boolean {
  return text.includes("NetNutrition Start-up Error") ||
    text.includes("ANA_border");
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
  { name: "Student Center Tally Food Court", unitOid: 16 },
  { name: "North Dining", unitOid: 21 },
  { name: "Woodworth Commons", unitOid: 27 },
  { name: "Bookmark Cafe", unitOid: 33 },
  { name: "Tom John Food Shop", unitOid: 35 },
];

/** Parse dining halls from the sidebar HTML in the initial page. */
function parseHallsFromPage(html: string): { name: string; unitOid: number }[] {
  const halls: { name: string; unitOid: number }[] = [];
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

/** Parse menu links (Daily Menu style) from a panel. */
function parseMenus(html: string): { name: string; menuOid: number }[] {
  const menus: { name: string; menuOid: number }[] = [];
  const seen = new Set<number>();
  // Common NetNutrition triggers for menu selection
  const regexes = [
    /selectMenu\((\d+)\)[^>]*>([^<]+)/gi,
    /menuListSelectMenu\((\d+)\)[^>]*>([^<]+)/gi,
    /SelectMenu\((\d+)\)[^>]*>([^<]+)/gi,
  ];
  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const menuOid = parseInt(match[1]);
      const name = match[2].replace(/&nbsp;/g, " ").trim();
      if (name && !seen.has(menuOid)) {
        seen.add(menuOid);
        menus.push({ menuOid, name });
      }
    }
  }
  return menus;
}

interface ParsedFoodItem {
  name: string;
  detailOid: number;
  allergens: string[];
  dietaryFlags: string[];
  servingSize: string;
}

interface ParsedCategory {
  name: string;
  items: ParsedFoodItem[];
}

/** Parse food items from raw item rows when categories are not present. */
function parseFoodItems(html: string): ParsedFoodItem[] {
  const items: ParsedFoodItem[] = [];

  const rowRegex =
    /<tr[^>]*class='cbo_nn_item(?:Primary|Alternate)Row'[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    const oidMatch = row.match(
      /(?:getItemNutritionLabel|ShowItemNutritionLabel)\((\d+)\)/,
    ) ?? row.match(/id=['"]cbm(\d+)['"]/i);
    if (!oidMatch) continue;
    const detailOid = parseInt(oidMatch[1]);

    const hoverMatch = row.match(
      /class=['"]cbo_nn_itemHover['"]>([\s\S]*?)<\/td>/i,
    );
    if (!hoverMatch) continue;

    const hoverContent = hoverMatch[1];
    const nameMatch = hoverContent.match(/^([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (!name) continue;

    const allergens: string[] = [];
    const dietaryFlags: string[] = [];
    const imgRegex = /title=['"]([^'"]+)['"]/gi;
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

    const afterHover = row.substring(
      (hoverMatch.index ?? 0) + hoverMatch[0].length,
    );
    const servingMatch = afterHover.match(/<td[^>]*>([^<]*)<\/td>/i);
    const servingSize = servingMatch ? servingMatch[1].trim() : "";

    items.push({ name, detailOid, allergens, dietaryFlags, servingSize });
  }

  return items;
}

/** Parse grouped categories from itemPanel HTML using cbo_nn_itemGroupRow as the category key. */
function parseCategoriesFromItemPanel(html: string): ParsedCategory[] {
  const categories: ParsedCategory[] = [];

  // Scan rows directly from the full panel HTML (no strict <table> wrapper requirement).
  const rowRegex = /<tr\b[\s\S]*?<\/tr>/gi;
  let rowMatch;
  let currentCategory: ParsedCategory | null = null;
  let sawAnyGroupRow = false;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[0];

    // Group/category header row — class can be on <tr> or inner <td>.
    const groupMatch = rowHtml.match(
      /class=['"][^'"]*cbo_nn_itemGroupRow[^'"]*['"][^>]*>([\s\S]*?)<\/(?:td|tr)>/i,
    );
    if (groupMatch) {
      sawAnyGroupRow = true;
      const categoryName = groupMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (categoryName) {
        currentCategory = { name: categoryName, items: [] };
        categories.push(currentCategory);
      }
      continue;
    }

    const parsedItems = parseFoodItems(rowHtml);
    if (parsedItems.length === 0) continue;

    if (!currentCategory) {
      currentCategory = { name: "All Items", items: [] };
      categories.push(currentCategory);
    }

    for (const item of parsedItems) {
      currentCategory.items.push(item);
    }
  }

  // If we never saw a real category header row, signal "no grouping" so caller can fall back.
  if (!sawAnyGroupRow) return [];

  return categories.filter((c) => c.items.length > 0);
}

/** Parse nutrition facts from the nutrition label HTML. */
function parseNutrients(html: string): Record<string, string> {
  const nutrients: Record<string, string> = {};

  const servingMatch = html.match(/Serving Size:(?:&nbsp;|\s)*([^<]+)/i);
  if (servingMatch) {
    nutrients["Serving Size"] = servingMatch[1]
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  const calMatch = html.match(
    />Calories<\/span>(?:&nbsp;|\s)*<span[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>(?:&nbsp;|\s)*([^<]+)/i,
  );
  if (calMatch) {
    nutrients["Calories"] = calMatch[1].replace(/&nbsp;/g, "").trim();
  }

  const calFatMatch = html.match(
    /Calories from Fat(?:&nbsp;|\s)*<span[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>(?:&nbsp;|\s)*([^<]+)/i,
  );
  if (calFatMatch) {
    nutrients["Calories from Fat"] = calFatMatch[1]
      .replace(/&nbsp;/g, "")
      .trim();
  }

  const mainRegex =
    /font-weight:\s*bold;?\s*'>\s*([^<]+)<\/span><\/td><td><span[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>(?:&nbsp;|\s)*([^<]+)/gi;
  let mainMatch;
  while ((mainMatch = mainRegex.exec(html)) !== null) {
    const label = mainMatch[1].trim();
    const value = mainMatch[2].replace(/&nbsp;/g, "").trim();
    if (label && value && label !== "Calories") {
      nutrients[label] = value;
    }
  }

  const subRegex =
    /font-weight:\s*normal;?\s*'>\s*([^<]+)<\/span><\/td><td><span[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>(?:&nbsp;|\s)*([^<]+)/gi;
  let subMatch;
  while ((subMatch = subRegex.exec(html)) !== null) {
    const label = subMatch[1].trim();
    const value = subMatch[2].replace(/&nbsp;/g, "").trim();
    if (label && value) {
      nutrients[label] = value;
    }
  }

  const secRegex =
    /class=['"]cbo_nn_SecondaryNutrientLabel['"]>\s*([^<]+)<\/td>\s*<td[^>]*class=['"]cbo_nn_SecondaryNutrient['"][^>]*>\s*([^<]+)/gi;
  let secMatch;
  while ((secMatch = secRegex.exec(html)) !== null) {
    const label = secMatch[1].trim();
    const value = secMatch[2].trim();
    if (label && value) {
      nutrients[label] = value;
    }
  }

  const ingredientsMatch = html.match(
    /class=['"]cbo_nn_LabelIngredients['"]>\s*([\s\S]*?)<\/span>/i,
  );
  if (ingredientsMatch) {
    nutrients["Ingredients"] = ingredientsMatch[1]
      .replace(/&nbsp;/g, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  return nutrients;
}

// deno-lint-ignore no-explicit-any
type SupabaseAny = any;

/** Upsert a category into the database. */
async function upsertCategory(
  supabase: SupabaseAny,
  stationId: string,
  categoryName: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("menu_categories")
    .upsert(
      {
        station_id: stationId,
        name: categoryName,
      },
      { onConflict: "station_id,name" },
    )
    .select("id")
    .single();

  if (error) {
    console.error(`    Error upserting category ${categoryName}:`, error);
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}

/** Fetch and parse nutrition facts for a single item. Returns {} on failure. */
async function fetchItemNutrients(
  session: SessionState,
  detailOid: number,
): Promise<Record<string, string>> {
  try {
    const response = await postWithSession(
      session,
      "/NutritionDetail/ShowItemNutritionLabel",
      { detailOid },
    );
    if (isStartupError(response)) return {};
    const labelHtml = extractPanelHtml(response, "itemNutritionLabelPanel") ||
      response;
    return parseNutrients(labelHtml);
  } catch (e) {
    console.error(`    Nutrition fetch failed for ${detailOid}:`, e);
    return {};
  }
}

/** Upsert a food item into the database. */
async function upsertItem(
  supabase: SupabaseAny,
  session: SessionState,
  stationId: string,
  categoryId: string | null,
  item: ParsedFoodItem,
): Promise<void> {
  const nutrients = await fetchItemNutrients(session, item.detailOid);

  const { error: itemError } = await supabase.from("food_items").upsert(
    {
      station_id: stationId,
      category_id: categoryId,
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

/** Process items from an itemPanel, using cbo_nn_itemGroupRow as category key when present. */
async function processItemPanel(
  supabase: SupabaseAny,
  session: SessionState,
  stationId: string,
  itemPanelHtml: string,
): Promise<number> {
  // Debug: log a snippet around the first group/course marker to verify class names.
  const probeIdx = itemPanelHtml.search(/itemGroupRow|courseItem|cbo_nn_item/i);
  if (probeIdx >= 0) {
    const snippet = itemPanelHtml.substring(
      Math.max(0, probeIdx - 80),
      probeIdx + 240,
    );
    console.log(`    HTML probe @${probeIdx}: ${snippet.replace(/\s+/g, " ")}`);
  } else {
    console.log(`    HTML probe: no itemGroupRow/courseItem/cbo_nn_item match`);
  }

  const categories = parseCategoriesFromItemPanel(itemPanelHtml);

  if (categories.length > 0) {
    console.log(`    Found ${categories.length} categories`);
    let total = 0;

    for (const category of categories) {
      console.log(
        `      Category: ${category.name} (${category.items.length} items)`,
      );
      const categoryId = await upsertCategory(
        supabase,
        stationId,
        category.name,
      );

      for (const item of category.items) {
        await upsertItem(supabase, session, stationId, categoryId, item);
        total++;
      }
    }

    return total;
  }

  const foodItems = parseFoodItems(itemPanelHtml);
  console.log(`    Found ${foodItems.length} ungrouped food items`);

  for (const item of foodItems) {
    await upsertItem(supabase, session, stationId, null, item);
  }

  return foodItems.length;
}

/** Try to fetch items from a "Daily Menu"-style station that lists menus rather than items. */
async function processDailyMenuStation(
  supabase: SupabaseAny,
  session: SessionState,
  stationId: string,
  childResponseHtml: string,
): Promise<number> {
  // Diagnostic: dump panel ids + samples so we can see exactly what NetNutrition returns.
  try {
    const data = JSON.parse(childResponseHtml);
    if (Array.isArray(data.panels)) {
      console.log(
        `    [daily-menu probe] panels: ${data.panels.map((p: { id: string; html?: string }) => `${p.id}(${p.html?.length ?? 0})`).join(", ")}`,
      );
      for (const p of data.panels) {
        if (p.html && p.html.length > 100) {
          console.log(
            `    [daily-menu probe] panel ${p.id} sample: ${p.html.substring(0, 1500).replace(/\s+/g, " ")}`,
          );
        }
      }
    } else {
      console.log(
        `    [daily-menu probe] non-panels JSON keys: ${Object.keys(data).join(",")}`,
      );
    }
  } catch {
    console.log(
      `    [daily-menu probe] non-JSON response, first 1500 chars: ${childResponseHtml.substring(0, 1500).replace(/\s+/g, " ")}`,
    );
  }

  // NetNutrition's actual panel for daily menus is `menuPanel`, which contains
  // <a class='cbo_nn_menuLink' onclick="menuListSelectMenu(NNN)">Lunch</a>
  // grouped by date row.
  const candidates = [
    extractPanelHtml(childResponseHtml, "menuPanel"),
    extractPanelHtml(childResponseHtml, "MenuList"),
    extractPanelHtml(childResponseHtml, "menuListPanel"),
    extractPanelHtml(childResponseHtml, "itemPanel"),
    extractPanelHtml(childResponseHtml, "selectedUnitPanel"),
    childResponseHtml,
  ];
  let menus: { name: string; menuOid: number; dateLabel?: string }[] = [];
  let panelHtml = "";
  for (const html of candidates) {
    if (!html) continue;
    const found = parseMenusWithDates(html);
    if (found.length > 0) {
      menus = found;
      panelHtml = html;
      break;
    }
  }

  if (menus.length === 0) {
    console.log(`    No daily menus found for station`);
    return 0;
  }

  console.log(
    `    Found ${menus.length} daily menus in panel (${panelHtml.length} chars), drilling in...`,
  );
  let total = 0;
  for (const menu of menus) {
    const menuLabel = menu.dateLabel
      ? `${menu.dateLabel} — ${menu.name}`
      : menu.name;
    console.log(`      Menu: ${menuLabel} (${menu.menuOid})`);
    const menuRes = await postWithRetry(session, "/Menu/SelectMenu", {
      menuOid: menu.menuOid,
    });
    if (isStartupError(menuRes)) continue;

    const menuItemHtml = extractPanelHtml(menuRes, "itemPanel");
    if (menuItemHtml && menuItemHtml.includes("cbo_nn_itemHover")) {
      total += await processItemPanelWithCategoryPrefix(
        supabase,
        session,
        stationId,
        menuItemHtml,
        menuLabel,
      );
    } else {
      console.log(
        `        SelectMenu(${menu.menuOid}) returned no items (panel length ${menuItemHtml?.length ?? 0})`,
      );
    }
  }
  return total;
}

/** Parse menu links along with their nearest preceding date label.
 * Robust to either <tr class='cbo_nn_menu(Primary|Alternate)Row'> structure
 * or plain HTML where date headers and menu links are siblings. */
function parseMenusWithDates(
  html: string,
): { name: string; menuOid: number; dateLabel?: string }[] {
  const out: { name: string; menuOid: number; dateLabel?: string }[] = [];
  const seen = new Set<number>();

  // Pass 1 — table-row style (preferred when present)
  const rowRegex =
    /<tr[^>]*class=['"][^'"]*cbo_nn_menu(?:Primary|Alternate)Row[^'"]*['"][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const dateMatch = row.match(
      /((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?\s*[A-Z][a-z]+\s+\d{1,2},?\s*\d{4})/i,
    );
    const dateLabel = dateMatch
      ? dateMatch[1].replace(/\s+/g, " ").trim()
      : undefined;

    const linkRegex =
      /(?:menuListSelectMenu|selectMenu|SelectMenu)\((\d+)\)[^>]*>\s*([^<]+?)\s*</gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(row)) !== null) {
      const menuOid = parseInt(linkMatch[1]);
      const name = linkMatch[2].replace(/&nbsp;/g, " ").trim();
      if (name && !seen.has(menuOid)) {
        seen.add(menuOid);
        out.push({ menuOid, name, dateLabel });
      }
    }
  }

  if (out.length > 0) return out;

  // Pass 2 — sequential scan: pair each selectMenu(N) link with the nearest
  // preceding date label found in the HTML. Works for div/anchor layouts.
  const dateRegex =
    /((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?\s*[A-Z][a-z]+\s+\d{1,2},?\s*\d{4})/gi;
  const dates: { idx: number; label: string }[] = [];
  let dm;
  while ((dm = dateRegex.exec(html)) !== null) {
    dates.push({ idx: dm.index, label: dm[1].replace(/\s+/g, " ").trim() });
  }

  const linkRegex =
    /(?:menuListSelectMenu|selectMenu|SelectMenu)\((\d+)\)[^>]*>\s*([^<]+?)\s*</gi;
  let lm;
  while ((lm = linkRegex.exec(html)) !== null) {
    const oid = parseInt(lm[1]);
    const name = lm[2].replace(/&nbsp;/g, " ").trim();
    if (!name || seen.has(oid)) continue;
    seen.add(oid);

    // Find nearest preceding date label
    let dateLabel: string | undefined;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i].idx < lm.index) {
        dateLabel = dates[i].label;
        break;
      }
    }
    out.push({ menuOid: oid, name, dateLabel });
  }

  return out;
}

/** Like processItemPanel but prefixes each discovered category name with a label. */
async function processItemPanelWithCategoryPrefix(
  supabase: SupabaseAny,
  session: SessionState,
  stationId: string,
  itemPanelHtml: string,
  prefix: string,
): Promise<number> {
  const categories = parseCategoriesFromItemPanel(itemPanelHtml);

  if (categories.length > 0) {
    let total = 0;
    for (const category of categories) {
      const labeledName = `${prefix} • ${category.name}`;
      console.log(
        `      Category: ${labeledName} (${category.items.length} items)`,
      );
      const categoryId = await upsertCategory(supabase, stationId, labeledName);
      for (const item of category.items) {
        await upsertItem(supabase, session, stationId, categoryId, item);
        total++;
      }
    }
    return total;
  }

  const items = parseFoodItems(itemPanelHtml);
  if (items.length === 0) return 0;
  const categoryId = await upsertCategory(supabase, stationId, prefix);
  for (const item of items) {
    await upsertItem(supabase, session, stationId, categoryId, item);
  }
  return items.length;
}


/** POST with session recovery — re-inits session if Start-up Error is returned. */
async function postWithRetry(
  session: SessionState,
  path: string,
  body: Record<string, string | number>,
  maxRetries = 2,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const text = await postWithSession(session, path, body);
    if (!isStartupError(text)) {
      return text;
    }

    console.log(
      `  Start-up Error detected (attempt ${attempt + 1}), re-initializing session...`,
    );
    const newSession = await initSession();
    session.cookies = newSession.cookies;
  }

  return await postWithSession(session, path, body);
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

    let session = await initSession();
    console.log("Session established, cookies:", session.cookies.length);

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

    if (isStartupError(initPageHtml)) {
      console.log(
        "Initial page returned Start-up Error, re-initializing session...",
      );
      session = await initSession();

      const retryRes = await fetch(BASE_URL, {
        headers: {
          "Cookie": session.cookies.join("; "),
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      session.cookies = collectCookies(retryRes, session.cookies);
      const retryHtml = await retryRes.text();
      console.log(`Retry page loaded, length: ${retryHtml.length}`);
    }

    let discoveredHalls = parseHallsFromPage(initPageHtml);
    console.log(
      `Discovered ${discoveredHalls.length} dining halls from page`,
    );

    if (discoveredHalls.length === 0) {
      console.log(
        "Dynamic discovery failed, using known hall list as fallback",
      );
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

      const sidebarResponse = await postWithRetry(
        session,
        "/Unit/SelectUnitFromSideBar",
        { unitOid: hall.unitOid },
      );

      if (isStartupError(sidebarResponse)) {
        console.log(
          `  Skipping ${hall.name}: persistent Start-up Error after retries`,
        );
        continue;
      }

      const childUnitsHtml = extractPanelHtml(sidebarResponse, "childUnitsPanel");
      const itemPanelHtml = extractPanelHtml(sidebarResponse, "itemPanel");

      if (itemPanelHtml && itemPanelHtml.includes("cbo_nn_itemHover")) {
        console.log(
          `  Hall ${hall.name} returned items directly (no stations)`,
        );

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
            supabase,
            session,
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

        console.log(
          `  Trying SelectUnitFromChildUnitsList as fallback for ${hall.name}...`,
        );
        const childFallback = await postWithRetry(
          session,
          "/Unit/SelectUnitFromChildUnitsList",
          { unitOid: hall.unitOid },
        );

        if (!isStartupError(childFallback)) {
          const fallbackItemHtml = extractPanelHtml(childFallback, "itemPanel");
          const fallbackChildHtml = extractPanelHtml(
            childFallback,
            "childUnitsPanel",
          );

          if (fallbackItemHtml && fallbackItemHtml.includes("cbo_nn_itemHover")) {
            console.log(`  Fallback: found items directly for ${hall.name}`);
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
                supabase,
                session,
                stationData.id,
                fallbackItemHtml,
              );
            }
          } else {
            const fallbackStations = parseStations(fallbackChildHtml);
            console.log(
              `  Fallback: found ${fallbackStations.length} child units for ${hall.name}`,
            );

            for (const fStation of fallbackStations) {
              console.log(
                `    Fallback station: ${fStation.name} (${fStation.unitOid})`,
              );

              const { data: stationData, error: stationError } = await supabase
                .from("stations")
                .upsert(
                  {
                    dining_hall_id: hallData.id,
                    name: fStation.name,
                    unit_oid: fStation.unitOid,
                  },
                  { onConflict: "unit_oid" },
                )
                .select("id")
                .single();

              if (stationError || !stationData) continue;

              const nestedRes = await postWithRetry(
                session,
                "/Unit/SelectUnitFromChildUnitsList",
                { unitOid: fStation.unitOid },
              );
              if (isStartupError(nestedRes)) continue;

              const nestedItemHtml = extractPanelHtml(nestedRes, "itemPanel");
              if (nestedItemHtml && nestedItemHtml.includes("cbo_nn_itemHover")) {
                totalItems += await processItemPanel(
                  supabase,
                  session,
                  stationData.id,
                  nestedItemHtml,
                );
              }
            }
          }
        }

        continue;
      }

      for (const station of stations) {
        console.log(
          `  Station: ${station.name} (unitOid: ${station.unitOid})`,
        );

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

        const childResponse = await postWithRetry(
          session,
          "/Unit/SelectUnitFromChildUnitsList",
          { unitOid: station.unitOid },
        );

        if (isStartupError(childResponse)) {
          console.log(`    Skipping station ${station.name}: Start-up Error`);
          continue;
        }

        const stationItemHtml = extractPanelHtml(childResponse, "itemPanel");

        if (stationItemHtml && stationItemHtml.includes("cbo_nn_itemHover")) {
          totalItems += await processItemPanel(
            supabase,
            session,
            stationData.id,
            stationItemHtml,
          );
          continue;
        }

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
            const nestedResponse = await postWithRetry(
              session,
              "/Unit/SelectUnitFromChildUnitsList",
              { unitOid: nested.unitOid },
            );
            if (isStartupError(nestedResponse)) continue;

            const nestedItemHtml = extractPanelHtml(
              nestedResponse,
              "itemPanel",
            );
            if (nestedItemHtml && nestedItemHtml.includes("cbo_nn_itemHover")) {
              totalItems += await processItemPanel(
                supabase,
                session,
                stationData.id,
                nestedItemHtml,
              );
            }
          }
          continue;
        }

        // Daily Menu fallback: station response had no items and no child units —
        // it likely lists dated menus that need to be selected to reveal items.
        console.log(
          `    Station ${station.name} has no items/children — trying daily menu drill-in`,
        );
        const dailyCount = await processDailyMenuStation(
          supabase,
          session,
          stationData.id,
          childResponse,
        );
        if (dailyCount > 0) {
          totalItems += dailyCount;
        } else {
          console.log(`    No daily menu items recovered for ${station.name}`);
        }
      }
    }

    await supabase.from("scrape_logs").insert({
      status: "success",
      message:
        `Scraped ${totalItems} items from ${discoveredHalls.length} halls`,
      items_count: totalItems,
    });

    console.log(`\nScrape complete: ${totalItems} items total`);

    return new Response(
      JSON.stringify({
        success: true,
        message:
          `Scraped ${totalItems} items from ${discoveredHalls.length} dining halls`,
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
    } catch {
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