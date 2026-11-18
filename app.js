const DEMO_PRODUCTS = [
  { id: "baizean", code: "BZA", name: "百泽安", accent: "#66dec5", rgb: "102,222,197", stats: [24, 9, 15] },
  { id: "baiyueze", code: "BYZ", name: "百悦泽", accent: "#7aa8ff", rgb: "122,168,255", stats: [22, 7, 13] },
  { id: "baiyueda", code: "BYD", name: "百悦达", accent: "#c8f26b", rgb: "200,242,107", stats: [18, 6, 12] },
  { id: "baituowei", code: "BTW", name: "百拓维", accent: "#ff9a79", rgb: "255,154,121", stats: [17, 5, 11] },
  { id: "kaizebai", code: "KZB", name: "凯泽百", accent: "#b69cff", rgb: "182,156,255", stats: [16, 4, 10] },
  { id: "kailuosi", code: "KLS", name: "凯洛斯", accent: "#64c7f3", rgb: "100,199,243", stats: [15, 5, 9] },
  { id: "beilituo", code: "BLT", name: "倍利妥", accent: "#ffbd68", rgb: "255,189,104", stats: [20, 6, 12] },
  { id: "pubeixi", code: "PBX", name: "普贝希", accent: "#72d59b", rgb: "114,213,155", stats: [14, 4, 8] },
  { id: "baihean", code: "BHA", name: "百赫安", accent: "#f084bd", rgb: "240,132,189", stats: [19, 5, 10] }
].map((product, index) => ({
  ...product,
  dbId: product.id,
  updated: `2025.05.${String(16 - index).padStart(2, "0")}`,
  description: `${product.name}产品医学资料专区，用于集中管理最新研究进展、临床文献、指南共识和医学材料。当前内容均为界面演示。`,
  mechanism: "正式产品信息将在医学团队确认后接入。"
}));

const DEMO_BASE_RESOURCES = [
  { type: "literature", year: "2025", date: "2025.05.16", title: "年度研究进展汇总（演示）", source: "Medical Information", meta: "研究进展 · 演示资料" },
  { type: "literature", year: "2025", date: "2025.05.12", title: "关键临床研究长期随访资料（演示）", source: "Clinical Research Update", meta: "长期随访 · 演示资料" },
  { type: "guideline", year: "2025", date: "2025.05.09", title: "临床实践指南更新追踪（演示）", source: "Guideline Intelligence", meta: "指南追踪 · 演示资料" },
  { type: "material", year: "2025", date: "2025.05.06", title: "核心医学信息与标准应答（演示）", source: "Medical Information", meta: "内部材料 · 演示版本" },
  { type: "literature", year: "2024", date: "2025.04.29", title: "真实世界研究文献追踪（演示）", source: "Evidence Review", meta: "真实世界研究 · 演示资料" },
  { type: "literature", year: "2024", date: "2025.04.22", title: "最新学术会议摘要合集（演示）", source: "Congress Update", meta: "会议摘要 · 演示资料" },
  { type: "guideline", year: "2024", date: "2025.04.15", title: "治疗管理专家共识（演示）", source: "Consensus Monitor", meta: "专家共识 · 演示资料" },
  { type: "material", year: "2023", date: "2025.04.08", title: "医学沟通培训材料（演示）", source: "Medical Affairs", meta: "培训材料 · 演示版本" }
];

const DEMO_RESEARCH_UPDATES = [
  { date: "2025.05.16", tag: "研究更新", title: "年度研究进展汇总完成更新", text: "展示研究背景、设计、关键终点和结果摘要的结构化内容。", badge: "NEW", featured: true },
  { date: "2025.05.12", tag: "长期随访", title: "关键研究长期随访资料收录", text: "支持关联原始文献、研究编号、随访时间和医学解读。", badge: "新增" },
  { date: "2025.05.09", tag: "指南追踪", title: "相关临床实践指南完成追踪", text: "可记录推荐章节、证据等级、版本变化和适用人群。", badge: "更新" },
  { date: "2025.04.29", tag: "真实世界", title: "真实世界研究证据完成标引", text: "按研究类型、数据来源和患者特征建立检索标签。", badge: "收录" },
  { date: "2025.04.22", tag: "学术会议", title: "近期学术会议摘要完成整理", text: "集中呈现会议名称、摘要编号、主要结果和资料入口。", badge: "跟踪中" },
  { date: "2025.04.15", tag: "医学审核", title: "研究摘要进入医学审核流程", text: "内容通过审核后方可作为正式医学资料在专区发布。", badge: "审核中" }
];

const typeInfo = {
  literature: { label: "临床文献", icon: "▤" },
  guideline: { label: "指南共识", icon: "◇" },
  material: { label: "医学材料", icon: "▱" }
};

const fallbackTypeInfo = { label: "医学资料", icon: "▤" };
const defaultAccents = ["#66dec5", "#7aa8ff", "#c8f26b", "#ff9a79", "#b69cff", "#64c7f3", "#ffbd68", "#72d59b", "#f084bd"];
const homeView = document.getElementById("homeView");
const productView = document.getElementById("productView");
const siteHeader = document.getElementById("siteHeader");
const siteFooter = document.getElementById("siteFooter");
let products = DEMO_PRODUCTS;
let researchUpdates = DEMO_RESEARCH_UPDATES;
let resources = [];
let usingCmsData = false;
let activeProduct = null;
let activeTab = "research";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value), window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

function colorToRgb(color) {
  const hex = color.slice(1);
  return `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`;
}

function safeRgb(value, fallback) {
  const parts = String(value || "").split(",").map(part => Number(part.trim()));
  return parts.length === 3 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts.join(",")
    : fallback;
}

function normalizeType(value) {
  const type = String(value || "").toLowerCase();
  const aliases = {
    clinical_literature: "literature",
    clinical: "literature",
    guidelines: "guideline",
    consensus: "guideline",
    medical_material: "material",
    materials: "material"
  };
  return typeInfo[type] ? type : (aliases[type] || "material");
}

function isoDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10).replaceAll("-", ".");
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function dateParts(value) {
  const formatted = isoDate(value);
  const match = formatted.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  return match ? { year: match[1], short: `${match[2]}.${match[3]}` } : { year: "", short: formatted || "—" };
}

function latestDate(values, fallback = "—") {
  const dates = values.map(isoDate).filter(Boolean).sort((a, b) => b.localeCompare(a));
  return dates[0] || fallback;
}

function normalizeProducts(rows) {
  return rows.map((row, index) => {
    const accent = safeColor(row.accent_color || row.accent, defaultAccents[index % defaultAccents.length]);
    const routeId = String(row.slug || row.id || `product-${index + 1}`);
    return {
      id: routeId,
      dbId: row.id,
      code: row.code || row.short_code || row.short_name || String(row.name || "MED").slice(0, 3).toUpperCase(),
      name: row.name || row.name_cn || row.display_name || "未命名产品",
      generic: row.generic_name || "PRODUCT MEDICAL HUB",
      description: row.description || "该产品的已发布医学资料专区。",
      mechanism: row.mechanism || row.mechanism_of_action || "产品信息待补充。",
      accent,
      rgb: safeRgb(row.accent_rgb, colorToRgb(accent)),
      updated: isoDate(row.updated_at || row.published_at || row.created_at)
    };
  });
}

function normalizeResearchUpdates(rows) {
  return rows.map(row => ({
    id: row.id,
    productId: row.product_id,
    date: row.event_date || row.published_at || row.updated_at || row.created_at,
    tag: row.tag || row.category || row.update_type || "研究更新",
    title: row.title || "未命名研究进展",
    text: row.summary || row.description || row.content || "",
    badge: row.badge || row.status_label || row.label || "已发布",
    featured: Boolean(row.is_featured),
    source: row.source_name || "",
    url: safeHttpUrl(row.source_url)
  }));
}

function normalizeResources(rows) {
  return rows.map(row => {
    const documents = Array.isArray(row.documents) ? row.documents : [];
    const documentUrl = documents.map(document => document.public_url).find(Boolean);
    return {
      id: row.id,
      productId: row.product_id,
      type: normalizeType(row.type || row.resource_type || row.category),
      year: String(row.publication_year || row.year || dateParts(row.published_at || row.updated_at || row.created_at).year),
      date: isoDate(row.published_at || row.publish_date || row.updated_at || row.created_at),
      title: row.title || "未命名医学资料",
      source: row.source_name || row.source || row.publisher || "Medical Information",
      meta: row.summary || row.description || row.metadata || row.reference || "已发布医学资料",
      url: safeHttpUrl(documentUrl || row.source_url || row.external_url || row.file_url || row.url),
      documents
    };
  });
}

function updatesFor(product) {
  if (!usingCmsData) return researchUpdates;
  return researchUpdates.filter(item => String(item.productId) === String(product.dbId));
}

function resourcesFor(product) {
  if (!usingCmsData) {
    return DEMO_BASE_RESOURCES.map((item, index) => ({
      ...item,
      id: `${product.id}-r${index + 1}`,
      productId: product.dbId,
      title: `${product.name}：${item.title}`,
      url: null,
      documents: []
    }));
  }
  return resources.filter(item => String(item.productId) === String(product.dbId));
}

function resourceCounts(product) {
  if (!usingCmsData && product.stats) {
    return { literature: product.stats[0], guideline: product.stats[1], material: product.stats[2], total: product.stats.reduce((sum, value) => sum + value, 0) };
  }
  const counts = { literature: 0, guideline: 0, material: 0, total: 0 };
  resourcesFor(product).forEach(item => {
    counts[item.type] = (counts[item.type] || 0) + 1;
    counts.total += 1;
  });
  return counts;
}

function productUpdated(product) {
  if (!usingCmsData) return product.updated;
  return latestDate([
    product.updated,
    ...updatesFor(product).map(item => item.date),
    ...resourcesFor(product).map(item => item.date)
  ]);
}

function renderProductMenus() {
  document.getElementById("productMenu").innerHTML = products.map(product => `
    <button data-menu-product="${escapeHtml(product.id)}"><span class="menu-dot" style="--menu-accent:${product.accent}"></span>${escapeHtml(product.name)}</button>`).join("");
  document.getElementById("homeProductNames").innerHTML = products.map(product => `<button data-home-product="${escapeHtml(product.id)}">${escapeHtml(product.name)}</button>`).join("");
  bindProductLinks();
  updateHomeMetrics();
}

function bindProductLinks() {
  document.querySelectorAll("[data-menu-product],[data-home-product]").forEach(button => {
    button.addEventListener("click", () => openProduct(button.dataset.menuProduct || button.dataset.homeProduct));
  });
}

function updateHomeMetrics() {
  const count = String(products.length).padStart(2, "0");
  const productCount = document.querySelector(".hero-foot > div:first-child strong");
  const orbitCount = document.querySelector(".label-b b");
  if (productCount) productCount.textContent = count;
  if (orbitCount) orbitCount.textContent = `${count} MEDICAL HUBS`;
  const status = document.querySelector(".hero-foot > p");
  if (status) status.innerHTML = `<span class="live-dot"></span>${usingCmsData ? "已连接正式发布数据" : "演示资料框架 · 待接入正式数据"}`;
}

function updateMenuState(productId = null) {
  document.querySelectorAll(".menu-home").forEach(button => button.classList.toggle("active", !productId));
  document.querySelectorAll("[data-menu-product]").forEach(button => {
    const active = button.dataset.menuProduct === productId;
    button.classList.toggle("active", active);
    if (active) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
}

function openProduct(productId, updateHistory = true) {
  const product = products.find(item => item.id === productId);
  if (!product) return;
  activeProduct = product;
  homeView.hidden = true;
  productView.hidden = false;
  siteFooter.hidden = false;
  siteHeader.classList.add("detail-mode");
  populateProduct(product);
  setDetailTab("research");
  updateMenuState(product.id);
  window.scrollTo({ top: 0, behavior: "instant" });
  if (updateHistory) history.pushState({ productId }, "", `#product/${encodeURIComponent(product.id)}`);
}

function showHome(updateHistory = true) {
  activeProduct = null;
  homeView.hidden = false;
  productView.hidden = true;
  siteFooter.hidden = true;
  siteHeader.classList.remove("detail-mode");
  updateMenuState();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (updateHistory) history.pushState({}, "", location.pathname + location.search);
}

function populateProduct(product) {
  const counts = resourceCounts(product);
  const productUpdates = updatesFor(product);
  const productResources = resourcesFor(product);
  const updated = productUpdated(product);
  const hero = document.getElementById("detailHero");
  hero.style.setProperty("--detail-accent", product.accent);
  hero.style.setProperty("--detail-rgb", product.rgb);

  setText("breadcrumbProduct", product.name);
  setText("detailCode", product.code);
  setText("detailName", product.name);
  setText("detailGeneric", usingCmsData ? product.generic : "PRODUCT MEDICAL HUB · 演示专区");
  setText("detailDescription", product.description);
  document.getElementById("detailTotal").innerHTML = `${counts.total} <small>份${usingCmsData ? "" : "演示"}</small>`;
  setText("detailResearchCount", `${productUpdates.length} 项${usingCmsData ? "" : "演示"}`);
  setText("detailUpdated", updated);
  setText("sideCode", product.code);
  setText("sideName", product.name);
  setText("researchProductName", product.name);
  setText("researchSyncDate", updated);
  setText("welcomeName", product.name);
  setText("chartTotal", counts.total);
  setText("allCount", counts.total);
  setText("literatureCount", counts.literature || 0);
  setText("guidelineCount", counts.guideline || 0);
  setText("materialCount", counts.material || 0);
  setText("mechanism", product.mechanism);
  const researchNavCount = document.querySelector('[data-detail-tab="research"] span');
  if (researchNavCount) researchNavCount.textContent = productUpdates.length;
  renderResearchTimeline(product, productUpdates);
  renderResearchSpotlight(product, productUpdates);
  renderResearchSummary(productUpdates, productResources);
  renderFeatured(productResources.slice(0, 3));
  updateModeLabels();
}

function renderResearchTimeline(product, items) {
  const timeline = document.getElementById("researchTimeline");
  if (!items.length) {
    timeline.innerHTML = '<div class="resource-empty"><span>⌕</span><h3>暂无已发布研究进展</h3><p>请稍后查看更新。</p></div>';
    return;
  }
  timeline.innerHTML = items.map((item, index) => {
    const parts = dateParts(item.date);
    const title = usingCmsData ? item.title : `${product.name}：${item.title}`;
    const url = safeHttpUrl(item.url);
    return `
      <article class="research-update-row">
        <div class="timeline-date"><strong>${escapeHtml(parts.short)}</strong><small>${escapeHtml(parts.year)}</small></div>
        <div class="timeline-track"><i class="${index === 0 ? "current" : ""}"></i></div>
        <div class="timeline-content">
          <div><span>${escapeHtml(item.tag)}</span><b>${escapeHtml(item.badge)}</b></div>
          <h3>${escapeHtml(title)}</h3><p>${escapeHtml(item.text)}</p>
        </div>
        <button${url ? ` data-resource-url="${escapeHtml(url)}"` : ""} aria-label="${url ? "打开研究来源" : "研究来源暂无链接"}">↗</button>
      </article>`;
  }).join("");
  bindResourceOpeners(timeline);
}

function renderResearchSpotlight(product, items) {
  const item = items.find(update => update.featured) || items[0];
  setText("spotlightTitle", item ? (usingCmsData ? item.title : `${product.name}年度研究进展汇总`) : "暂无已发布研究进展");
  const copy = document.querySelector(".spotlight-copy");
  const description = copy?.querySelector(":scope > p");
  const label = copy?.querySelector(".spotlight-label");
  const meta = copy?.querySelector(".spotlight-meta");
  if (label) label.textContent = usingCmsData ? "FEATURED UPDATE · 已发布" : "FEATURED UPDATE · 演示内容";
  if (description) description.textContent = item?.text || "该产品暂未发布研究进展。";
  if (meta) {
    meta.innerHTML = `<span><i></i>${escapeHtml(item?.tag || "研究进展")}</span><span>资料状态：${usingCmsData ? "已发布" : "已审核"}</span><span>更新：${escapeHtml(item ? isoDate(item.date) : "—")}</span>`;
  }
}

function renderResearchSummary(items, productResources) {
  const ring = document.querySelector(".summary-ring strong");
  if (ring) ring.textContent = items.length;
  const rows = document.querySelectorAll(".research-summary-card .summary-row");
  const values = [
    [usingCmsData ? "已发布研究进展" : "新增研究资料", items.length],
    [usingCmsData ? "重点研究" : "持续跟踪项目", usingCmsData ? items.filter(item => item.featured).length : 2],
    [usingCmsData ? "关联医学资料" : "待医学审核", usingCmsData ? productResources.length : 1]
  ];
  rows.forEach((row, index) => {
    row.querySelector("span").textContent = values[index][0];
    row.querySelector("strong").textContent = values[index][1];
  });
}

function renderFeatured(items) {
  const box = document.getElementById("featuredResources");
  if (!items.length) {
    box.innerHTML = '<div class="resource-empty"><span>⌕</span><h3>暂无已发布资料</h3><p>请稍后查看更新。</p></div>';
    return;
  }
  box.innerHTML = items.map(item => {
    const info = typeInfo[item.type] || fallbackTypeInfo;
    const url = safeHttpUrl(item.url);
    return `
      <article class="featured-card"${url ? ` data-resource-url="${escapeHtml(url)}" tabindex="0"` : ""}>
        <div class="resource-type"><span class="type-badge ${item.type}">${escapeHtml(info.label)}</span><time>${escapeHtml(item.date || "—")}</time></div>
        <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.source)}<br>${escapeHtml(item.meta)}</p><span>${url ? "打开资料" : "查看资料"} →</span>
      </article>`;
  }).join("");
  bindResourceOpeners(box);
}

function updateModeLabels() {
  const modeText = usingCmsData ? "已发布内容" : "演示内容";
  const researchIntro = document.querySelector(".research-heading p");
  if (researchIntro) researchIntro.textContent = usingCmsData ? "以下内容来自已发布研究进展，并按发布日期更新。" : "以下内容为界面演示，接入正式数据后可按发布日期自动更新。";
  const demoBadge = document.querySelector(".demo-badge");
  if (demoBadge) demoBadge.textContent = usingCmsData ? "已发布数据" : "演示数据";
  const summaryNote = document.querySelector(".research-summary-card > p");
  if (summaryNote) summaryNote.textContent = usingCmsData ? "统计基于当前已发布内容。" : "正式数据接入后，统计将根据研究状态实时计算。";
  const verified = document.querySelector(".verified-label");
  if (verified) verified.textContent = `✓ ${modeText}`;
  const evidenceSmall = document.querySelector(".evidence-card .card-top small");
  if (evidenceSmall) evidenceSmall.textContent = usingCmsData ? "基于已发布资料" : "基于演示资料";
  const infoSmall = document.querySelector(".key-info-card .card-top small");
  if (infoSmall) infoSmall.textContent = usingCmsData ? "已发布产品信息" : "等待正式配置";
  const resourceStatus = document.querySelector(".resource-summary > div");
  if (resourceStatus) resourceStatus.innerHTML = `<i class="status-dot"></i>${usingCmsData ? "当前仅显示已发布医学资料" : "演示内容，非正式医学资料"}`;
  const footerText = document.querySelector(".site-footer > p");
  if (footerText) footerText.textContent = usingCmsData ? "仅限内部使用 · 当前显示已发布内容" : "仅限内部使用 · 当前均为演示数据 · 医学内容须经审核后发布";
}

function setDetailTab(tab) {
  if (!activeProduct) return;
  activeTab = tab;
  document.querySelectorAll("[data-detail-tab]").forEach(button => button.classList.toggle("active", button.dataset.detailTab === tab));
  document.getElementById("researchPanel").hidden = tab !== "research";
  document.getElementById("overviewPanel").hidden = tab !== "overview";
  const resourcesPanel = document.getElementById("resourcesPanel");
  const resourceTab = ["all", "literature", "guideline", "material"].includes(tab);
  resourcesPanel.hidden = !resourceTab;
  if (resourceTab) {
    const labels = { all: "全部资料", literature: "临床文献", guideline: "指南共识", material: "医学材料" };
    setText("resourcePanelTitle", labels[tab]);
    setText("resourcePanelSubtitle", `集中查看${activeProduct.name}关联的${labels[tab]}。`);
    document.getElementById("resourceSearch").value = "";
    renderYearOptions(resourcesFor(activeProduct));
    renderDetailResources();
  }
}

function renderYearOptions(items) {
  const select = document.getElementById("resourceYear");
  const years = [...new Set(items.map(item => item.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  select.innerHTML = '<option value="all">全部年份</option>' + years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join("");
}

function renderDetailResources() {
  if (!activeProduct) return;
  const query = document.getElementById("resourceSearch").value.trim().toLowerCase();
  const year = document.getElementById("resourceYear").value;
  const sort = document.getElementById("resourceSort").value;
  let visibleResources = resourcesFor(activeProduct).filter(item => {
    const typeMatch = activeTab === "all" || item.type === activeTab;
    const yearMatch = year === "all" || item.year === year;
    const queryMatch = !query || `${item.title} ${item.source} ${item.meta}`.toLowerCase().includes(query);
    return typeMatch && yearMatch && queryMatch;
  });
  visibleResources.sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") : b.date.localeCompare(a.date));
  setText("resourceResult", `当前展示 ${visibleResources.length} 份${usingCmsData ? "已发布" : "演示"}资料`);
  const list = document.getElementById("detailResourceList");
  const empty = document.getElementById("resourceEmpty");
  list.hidden = visibleResources.length === 0;
  empty.hidden = visibleResources.length > 0;
  list.innerHTML = visibleResources.map(item => {
    const info = typeInfo[item.type] || fallbackTypeInfo;
    const url = safeHttpUrl(item.url);
    return `
      <article class="detail-resource-card">
        <div class="detail-resource-icon ${item.type}">${info.icon}</div>
        <div class="detail-resource-copy"><span>${escapeHtml(info.label.toUpperCase())} · ${usingCmsData ? "已发布" : "演示"}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.source)}　·　${escapeHtml(item.meta)}</p></div>
        <div class="resource-card-end"><time>更新于 ${escapeHtml(item.date || "—")}</time><button${url ? ` data-resource-url="${escapeHtml(url)}"` : ""} aria-label="${url ? "打开资料" : "资料暂无链接"}">↗</button></div>
      </article>`;
  }).join("");
  bindResourceOpeners(list);
}

function bindResourceOpeners(root) {
  root.querySelectorAll("[data-resource-url]").forEach(element => {
    const open = () => {
      const url = safeHttpUrl(element.dataset.resourceUrl);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };
    element.addEventListener("click", open);
    if (element.matches("article")) element.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

function setText(id, value) {
  document.getElementById(id).textContent = value ?? "";
}

// Navigation
document.querySelectorAll("[data-home]").forEach(button => button.addEventListener("click", event => { event.preventDefault(); showHome(); }));
document.querySelectorAll("[data-detail-tab]").forEach(button => button.addEventListener("click", () => setDetailTab(button.dataset.detailTab)));
document.querySelector("[data-show-all]").addEventListener("click", () => setDetailTab("all"));
document.querySelector("[data-open-resources]").addEventListener("click", () => setDetailTab("literature"));
document.getElementById("resourceSearch").addEventListener("input", renderDetailResources);
document.getElementById("resourceYear").addEventListener("change", renderDetailResources);
document.getElementById("resourceSort").addEventListener("change", renderDetailResources);
document.getElementById("chooseProduct").addEventListener("click", () => {
  const bar = document.getElementById("productMenuBar");
  bar.classList.remove("menu-pulse");
  void bar.offsetWidth;
  bar.classList.add("menu-pulse");
  document.querySelector("[data-menu-product]")?.focus();
});

// Global search
const searchOverlay = document.getElementById("searchOverlay");
const globalSearchInput = document.getElementById("globalSearchInput");
function openSearch() {
  searchOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  renderGlobalSearch("");
  setTimeout(() => globalSearchInput.focus(), 30);
}
function closeSearch() {
  searchOverlay.hidden = true;
  document.body.style.overflow = "";
  globalSearchInput.value = "";
}
function renderGlobalSearch(query) {
  const clean = query.trim().toLowerCase();
  document.getElementById("quickProducts").innerHTML = products.map(product => `<button class="quick-product" data-quick-product="${escapeHtml(product.id)}"><span>${escapeHtml(product.code)}</span><div>${escapeHtml(product.name)}<small>产品医学资料专区</small></div></button>`).join("");
  document.querySelectorAll("[data-quick-product]").forEach(button => button.addEventListener("click", () => { closeSearch(); openProduct(button.dataset.quickProduct); }));
  const resultBox = document.getElementById("globalResults");
  if (!clean) { resultBox.innerHTML = ""; return; }
  const matches = [];
  products.forEach(product => resourcesFor(product).forEach(resource => {
    if (`${product.name} ${resource.title} ${resource.source} ${resource.meta}`.toLowerCase().includes(clean)) matches.push({ product, resource });
  }));
  resultBox.innerHTML = matches.slice(0, 6).map(({ product, resource }) => {
    const info = typeInfo[resource.type] || fallbackTypeInfo;
    return `<button class="global-result" data-result-product="${escapeHtml(product.id)}"><span>${info.icon}</span><div><strong>${escapeHtml(resource.title)}</strong><small>${escapeHtml(info.label)} · ${escapeHtml(resource.source)}</small></div><span>↗</span></button>`;
  }).join("") || `<div class="global-result"><span>⌕</span><div><strong>没有找到相关${usingCmsData ? "已发布" : "演示"}资料</strong><small>请尝试输入产品名称</small></div></div>`;
  document.querySelectorAll("[data-result-product]").forEach(button => button.addEventListener("click", () => { closeSearch(); openProduct(button.dataset.resultProduct); setDetailTab("all"); }));
}

document.getElementById("globalSearchTrigger").addEventListener("click", openSearch);
document.getElementById("heroSearch").addEventListener("click", openSearch);
document.getElementById("closeSearch").addEventListener("click", closeSearch);
globalSearchInput.addEventListener("input", () => renderGlobalSearch(globalSearchInput.value));
searchOverlay.addEventListener("click", event => { if (event.target === searchOverlay) closeSearch(); });
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
  if (event.key === "Escape" && !searchOverlay.hidden) closeSearch();
});

window.addEventListener("popstate", () => routeFromHash(false));
function routeFromHash(updateHistory = false) {
  const match = location.hash.match(/^#product\/(.+)$/);
  let productId = null;
  try { productId = match ? decodeURIComponent(match[1]) : null; } catch { productId = null; }
  if (productId && products.some(product => product.id === productId)) openProduct(productId, updateHistory);
  else showHome(updateHistory);
}

async function loadCmsData() {
  if (!window.medAtlasCms?.isConfigured()) {
    console.info("[MedAtlas] Supabase 未配置，使用 Demo 数据。");
    return;
  }
  try {
    const payload = await window.medAtlasCms.loadPublishedContent();
    if (!payload.products.length) {
      console.info("[MedAtlas] Supabase 暂无有效产品，使用 Demo 数据。");
      return;
    }
    const previousProductId = activeProduct?.id;
    const previousTab = activeTab;
    products = normalizeProducts(payload.products);
    researchUpdates = normalizeResearchUpdates(payload.researchUpdates);
    resources = normalizeResources(payload.resources);
    usingCmsData = true;
    renderProductMenus();
    renderGlobalSearch("");
    updateModeLabels();
    const nextProduct = products.find(product => product.id === previousProductId);
    if (nextProduct) {
      openProduct(nextProduct.id, false);
      setDetailTab(previousTab);
    } else {
      routeFromHash(false);
    }
  } catch (error) {
    console.info(`[MedAtlas] 在线内容不可用，使用 Demo 数据。${error instanceof Error ? ` ${error.message}` : ""}`);
  }
}

renderProductMenus();
renderGlobalSearch("");
updateModeLabels();
routeFromHash(false);
loadCmsData();
