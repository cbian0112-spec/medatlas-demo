const products = [
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
  updated: `2025.05.${String(16 - index).padStart(2, "0")}`,
  description: `${product.name}产品医学资料专区，用于集中管理最新研究进展、临床文献、指南共识和医学材料。当前内容均为界面演示。`
}));

const baseResources = [
  { type: "literature", year: "2025", date: "2025.05.16", title: "年度研究进展汇总（演示）", source: "Medical Information", meta: "研究进展 · 演示资料" },
  { type: "literature", year: "2025", date: "2025.05.12", title: "关键临床研究长期随访资料（演示）", source: "Clinical Research Update", meta: "长期随访 · 演示资料" },
  { type: "guideline", year: "2025", date: "2025.05.09", title: "临床实践指南更新追踪（演示）", source: "Guideline Intelligence", meta: "指南追踪 · 演示资料" },
  { type: "material", year: "2025", date: "2025.05.06", title: "核心医学信息与标准应答（演示）", source: "Medical Information", meta: "内部材料 · 演示版本" },
  { type: "literature", year: "2024", date: "2025.04.29", title: "真实世界研究文献追踪（演示）", source: "Evidence Review", meta: "真实世界研究 · 演示资料" },
  { type: "literature", year: "2024", date: "2025.04.22", title: "最新学术会议摘要合集（演示）", source: "Congress Update", meta: "会议摘要 · 演示资料" },
  { type: "guideline", year: "2024", date: "2025.04.15", title: "治疗管理专家共识（演示）", source: "Consensus Monitor", meta: "专家共识 · 演示资料" },
  { type: "material", year: "2023", date: "2025.04.08", title: "医学沟通培训材料（演示）", source: "Medical Affairs", meta: "培训材料 · 演示版本" }
];

const researchUpdates = [
  { date: "05.16", tag: "研究更新", title: "年度研究进展汇总完成更新", text: "展示研究背景、设计、关键终点和结果摘要的结构化内容。", status: "NEW" },
  { date: "05.12", tag: "长期随访", title: "关键研究长期随访资料收录", text: "支持关联原始文献、研究编号、随访时间和医学解读。", status: "新增" },
  { date: "05.09", tag: "指南追踪", title: "相关临床实践指南完成追踪", text: "可记录推荐章节、证据等级、版本变化和适用人群。", status: "更新" },
  { date: "04.29", tag: "真实世界", title: "真实世界研究证据完成标引", text: "按研究类型、数据来源和患者特征建立检索标签。", status: "收录" },
  { date: "04.22", tag: "学术会议", title: "近期学术会议摘要完成整理", text: "集中呈现会议名称、摘要编号、主要结果和资料入口。", status: "跟踪中" },
  { date: "04.15", tag: "医学审核", title: "研究摘要进入医学审核流程", text: "内容通过审核后方可作为正式医学资料在专区发布。", status: "审核中" }
];

const typeInfo = {
  literature: { label: "临床文献", icon: "▤" },
  guideline: { label: "指南共识", icon: "◇" },
  material: { label: "医学材料", icon: "▱" }
};

const homeView = document.getElementById("homeView");
const productView = document.getElementById("productView");
const siteHeader = document.getElementById("siteHeader");
const siteFooter = document.getElementById("siteFooter");
let activeProduct = null;
let activeTab = "research";

function resourcesFor(product) {
  return baseResources.map((item, index) => ({ ...item, id: `${product.id}-r${index + 1}`, title: `${product.name}：${item.title}` }));
}

function renderProductMenus() {
  document.getElementById("productMenu").innerHTML = products.map(product => `
    <button data-menu-product="${product.id}"><span class="menu-dot" style="--menu-accent:${product.accent}"></span>${product.name}</button>`).join("");
  document.getElementById("homeProductNames").innerHTML = products.map(product => `<button data-home-product="${product.id}">${product.name}</button>`).join("");
  bindProductLinks();
}

function bindProductLinks() {
  document.querySelectorAll("[data-menu-product],[data-home-product]").forEach(button => {
    button.addEventListener("click", () => openProduct(button.dataset.menuProduct || button.dataset.homeProduct));
  });
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
  if (updateHistory) history.pushState({ productId }, "", `#product/${productId}`);
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
  const total = product.stats.reduce((sum, value) => sum + value, 0);
  const [literature, guideline, material] = product.stats;
  const hero = document.getElementById("detailHero");
  hero.style.setProperty("--detail-accent", product.accent);
  hero.style.setProperty("--detail-rgb", product.rgb);

  setText("breadcrumbProduct", product.name);
  setText("detailCode", product.code);
  setText("detailName", product.name);
  setText("detailGeneric", "PRODUCT MEDICAL HUB · 演示专区");
  setText("detailDescription", product.description);
  document.getElementById("detailTotal").innerHTML = `${total} <small>份演示</small>`;
  setText("detailUpdated", product.updated);
  setText("sideCode", product.code);
  setText("sideName", product.name);
  setText("researchProductName", product.name);
  setText("researchSyncDate", product.updated);
  setText("spotlightTitle", `${product.name}年度研究进展汇总`);
  setText("welcomeName", product.name);
  setText("chartTotal", total);
  setText("allCount", total);
  setText("literatureCount", literature);
  setText("guidelineCount", guideline);
  setText("materialCount", material);
  renderResearchTimeline(product);
  renderFeatured(resourcesFor(product).slice(0, 3));
}

function renderResearchTimeline(product) {
  document.getElementById("researchTimeline").innerHTML = researchUpdates.map((item, index) => `
    <article class="research-update-row">
      <div class="timeline-date"><strong>${item.date}</strong><small>2025</small></div>
      <div class="timeline-track"><i class="${index === 0 ? "current" : ""}"></i></div>
      <div class="timeline-content">
        <div><span>${item.tag}</span><b>${item.status}</b></div>
        <h3>${product.name}：${item.title}</h3><p>${item.text}</p>
      </div>
      <button aria-label="查看进展详情">↗</button>
    </article>`).join("");
}

function renderFeatured(resources) {
  document.getElementById("featuredResources").innerHTML = resources.map(item => `
    <article class="featured-card">
      <div class="resource-type"><span class="type-badge ${item.type}">${typeInfo[item.type].label}</span><time>${item.date}</time></div>
      <h3>${item.title}</h3><p>${item.source}<br>${item.meta}</p><span>查看资料 →</span>
    </article>`).join("");
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
    document.getElementById("resourceYear").value = "all";
    renderDetailResources();
  }
}

function renderDetailResources() {
  if (!activeProduct) return;
  const query = document.getElementById("resourceSearch").value.trim().toLowerCase();
  const year = document.getElementById("resourceYear").value;
  const sort = document.getElementById("resourceSort").value;
  let resources = resourcesFor(activeProduct).filter(item => {
    const typeMatch = activeTab === "all" || item.type === activeTab;
    const yearMatch = year === "all" || item.year === year;
    const queryMatch = !query || `${item.title} ${item.source} ${item.meta}`.toLowerCase().includes(query);
    return typeMatch && yearMatch && queryMatch;
  });
  resources.sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") : b.date.localeCompare(a.date));
  setText("resourceResult", `当前展示 ${resources.length} 份演示资料`);
  const list = document.getElementById("detailResourceList");
  const empty = document.getElementById("resourceEmpty");
  list.hidden = resources.length === 0;
  empty.hidden = resources.length > 0;
  list.innerHTML = resources.map(item => `
    <article class="detail-resource-card">
      <div class="detail-resource-icon ${item.type}">${typeInfo[item.type].icon}</div>
      <div class="detail-resource-copy"><span>${typeInfo[item.type].label.toUpperCase()} · 演示</span><h3>${item.title}</h3><p>${item.source}　·　${item.meta}</p></div>
      <div class="resource-card-end"><time>更新于 ${item.date}</time><button aria-label="打开资料">↗</button></div>
    </article>`).join("");
}

function setText(id, value) { document.getElementById(id).textContent = value; }

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
  document.getElementById("quickProducts").innerHTML = products.map(product => `<button class="quick-product" data-quick-product="${product.id}"><span>${product.code}</span><div>${product.name}<small>产品医学资料专区</small></div></button>`).join("");
  document.querySelectorAll("[data-quick-product]").forEach(button => button.addEventListener("click", () => { closeSearch(); openProduct(button.dataset.quickProduct); }));
  const resultBox = document.getElementById("globalResults");
  if (!clean) { resultBox.innerHTML = ""; return; }
  const matches = [];
  products.forEach(product => resourcesFor(product).forEach(resource => {
    if (`${product.name} ${resource.title} ${resource.source} ${resource.meta}`.toLowerCase().includes(clean)) matches.push({ product, resource });
  }));
  resultBox.innerHTML = matches.slice(0, 6).map(({ product, resource }) => `<button class="global-result" data-result-product="${product.id}"><span>${typeInfo[resource.type].icon}</span><div><strong>${resource.title}</strong><small>${typeInfo[resource.type].label} · ${resource.source}</small></div><span>↗</span></button>`).join("") || `<div class="global-result"><span>⌕</span><div><strong>没有找到相关演示资料</strong><small>请尝试输入产品名称</small></div></div>`;
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
  if (match && products.some(product => product.id === match[1])) openProduct(match[1], updateHistory);
  else showHome(updateHistory);
}

renderProductMenus();
renderGlobalSearch("");
routeFromHash(false);
