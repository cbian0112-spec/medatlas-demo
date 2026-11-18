"use strict";

(() => {
  const ALLOWED_ROLES = new Set(["admin", "editor", "reviewer"]);
  const PUBLISH_ROLES = new Set(["admin", "reviewer"]);
  const STATUS_LABELS = { draft: "草稿", review: "审核中", published: "已发布", archived: "已归档" };
  const ROLE_LABELS = { admin: "管理员", editor: "编辑", reviewer: "审核者" };
  const RESOURCE_TYPE_LABELS = { literature: "临床文献", guideline: "指南共识", material: "医学材料", slide: "演示文稿", other: "其他" };
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = new Set(["pdf", "ppt", "pptx", "doc", "docx"]);
  const OFFICE_EXTENSIONS = new Set(["ppt", "pptx", "doc", "docx"]);
  const BUCKET = "medical-documents";

  const state = {
    client: null,
    session: null,
    user: null,
    profile: null,
    activeView: "dashboard",
    products: [],
    research: [],
    resources: [],
    documents: [],
    profiles: [],
    form: null,
    confirmResolver: null,
    authSubscription: null
  };

  const byId = id => document.getElementById(id);
  const text = (node, value) => { if (node) node.textContent = value == null ? "" : String(value); };
  const clear = node => { while (node.firstChild) node.removeChild(node.firstChild); };
  const create = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  };
  const appendTextPair = (parent, primary, secondary) => {
    const wrapper = create("div");
    wrapper.append(create("strong", "", primary), create("small", "", secondary));
    parent.append(wrapper);
    return wrapper;
  };
  const formatDate = (value, includeTime = false) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", includeTime ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  };
  const formatBytes = bytes => {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 ** 2).toFixed(1)} MB`;
  };
  const initials = value => {
    const clean = String(value || "MA").trim();
    if (!clean) return "MA";
    const words = clean.split(/[\s@._-]+/).filter(Boolean);
    return words.length > 1 ? `${words[0][0]}${words[1][0]}`.toUpperCase() : clean.slice(0, 2).toUpperCase();
  };
  const debounce = (fn, delay = 220) => {
    let timer;
    return (...args) => { window.clearTimeout(timer); timer = window.setTimeout(() => fn(...args), delay); };
  };
  const normalizedError = error => {
    if (!error) return "发生未知错误，请稍后重试。";
    const message = String(error.message || error.error_description || error);
    const known = [
      [/invalid login credentials/i, "邮箱或密码不正确。"],
      [/email not confirmed/i, "邮箱尚未确认，请先完成邮箱验证。"],
      [/failed to fetch/i, "无法连接服务器，请检查网络和 Supabase 配置。"],
      [/row-level security/i, "当前账号没有执行此操作的数据库权限。"],
      [/duplicate key/i, "该标识或记录已存在，请更换后重试。"],
      [/violates foreign key/i, "该记录仍有关联内容，请先处理关联内容。"],
      [/jwt expired/i, "登录已过期，请重新登录。"]
    ];
    const matched = known.find(([pattern]) => pattern.test(message));
    return matched ? matched[1] : message;
  };
  const validHttpUrl = value => {
    if (!value) return null;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  };
  const extensionOf = value => {
    const clean = String(value || "").split(/[?#]/)[0];
    return clean.includes(".") ? clean.split(".").pop().toLowerCase() : "";
  };
  const canPublish = () => PUBLISH_ROLES.has(state.profile?.role);
  const canDelete = () => state.profile?.role === "admin";

  function setBusy(show, message = "正在加载…") {
    text(byId("loadingText"), message);
    byId("loadingOverlay").hidden = !show;
  }

  function toast(message, type = "success", duration = 4200) {
    const item = create("div", `toast ${type}`);
    item.setAttribute("role", type === "error" ? "alert" : "status");
    const dot = create("i");
    const copy = create("span", "", message);
    const closeButton = create("button", "", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "关闭通知");
    closeButton.addEventListener("click", () => item.remove());
    item.append(dot, copy, closeButton);
    byId("toastRegion").append(item);
    window.setTimeout(() => item.remove(), duration);
  }

  function emptyState(container, title, message) {
    clear(container);
    container.append(create("span", "", "⌕"), create("h3", "", title), create("p", "", message));
  }

  function statusBadge(status) {
    const displayLabels = { ...STATUS_LABELS, active: "已启用", inactive: "已停用" };
    return create("span", `status-badge status-${status}`, displayLabels[status] || status || "未知");
  }

  function actionButton(label, action, id, className = "") {
    const button = create("button", `table-button ${className}`.trim(), label);
    button.type = "button";
    button.dataset.action = action;
    if (id != null) button.dataset.id = String(id);
    return button;
  }

  function setLoginMessage(message = "") {
    const node = byId("loginMessage");
    text(node, message);
    node.hidden = !message;
  }

  async function initialize() {
    bindEvents();
    updateClock();
    if (!window.medAtlasSupabase || typeof window.medAtlasSupabase.auth?.getSession !== "function") {
      byId("bootScreen").hidden = true;
      byId("loginScreen").hidden = false;
      setLoginMessage("Supabase 尚未初始化。请确认根目录 supabase-config.js 已创建，并设置 window.medAtlasSupabase。管理员页面不会使用 service_role key。");
      byId("loginForm").querySelectorAll("input,button").forEach(control => { control.disabled = true; });
      return;
    }

    state.client = window.medAtlasSupabase;
    const { data: { session }, error } = await state.client.auth.getSession();
    if (error) {
      showLogin();
      setLoginMessage(normalizedError(error));
    } else if (session) {
      await authorizeSession(session);
    } else {
      showLogin();
    }

    const { data } = state.client.auth.onAuthStateChange((event, sessionValue) => {
      if (event === "SIGNED_OUT") showLogin();
      if (event === "TOKEN_REFRESHED" && sessionValue) {
        state.session = sessionValue;
        state.user = sessionValue.user;
      }
    });
    state.authSubscription = data.subscription;
  }

  function showLogin() {
    state.session = null;
    state.user = null;
    state.profile = null;
    byId("bootScreen").hidden = true;
    byId("adminApp").hidden = true;
    byId("loginScreen").hidden = false;
    byId("loginPassword").value = "";
  }

  async function authorizeSession(session) {
    state.session = session;
    state.user = session.user;
    try {
      const { data, error } = await state.client.from("profiles")
        .select("user_id,email,display_name,role,is_active,created_at,updated_at")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("未找到当前账号的成员档案，请联系管理员。 ");
      if (!data.is_active) throw new Error("当前账号已停用，请联系管理员。 ");
      if (!ALLOWED_ROLES.has(data.role)) throw new Error("当前账号没有后台访问权限。 ");
      state.profile = data;
      await showApp();
    } catch (error) {
      await state.client.auth.signOut();
      showLogin();
      setLoginMessage(normalizedError(error));
    }
  }

  async function showApp() {
    byId("bootScreen").hidden = true;
    byId("loginScreen").hidden = true;
    byId("adminApp").hidden = false;
    setLoginMessage("");
    const displayName = state.profile.display_name || state.profile.email || state.user.email;
    text(byId("userName"), displayName);
    text(byId("welcomeUser"), state.profile.display_name || "内容成员");
    text(byId("userRole"), ROLE_LABELS[state.profile.role] || state.profile.role);
    text(byId("userInitials"), initials(displayName));
    byId("teamNav").hidden = state.profile.role !== "admin";
    await refreshProducts();
    await switchView("dashboard");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginMessage("");
    const email = byId("loginEmail").value.trim();
    const password = byId("loginPassword").value;
    const emailError = byId("loginForm").querySelector('[data-error-for="email"]');
    const passwordError = byId("loginForm").querySelector('[data-error-for="password"]');
    text(emailError, ""); text(passwordError, "");
    byId("loginEmail").removeAttribute("aria-invalid");
    byId("loginPassword").removeAttribute("aria-invalid");
    let valid = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      text(emailError, "请输入有效的邮箱地址。");
      byId("loginEmail").setAttribute("aria-invalid", "true"); valid = false;
    }
    if (password.length < 6) {
      text(passwordError, "密码至少需要 6 个字符。");
      byId("loginPassword").setAttribute("aria-invalid", "true"); valid = false;
    }
    if (!valid) return;
    const button = byId("loginButton");
    button.disabled = true; text(button.querySelector("span"), "正在验证…");
    const { data, error } = await state.client.auth.signInWithPassword({ email, password });
    button.disabled = false; text(button.querySelector("span"), "登录");
    if (error) { setLoginMessage(normalizedError(error)); return; }
    await authorizeSession(data.session);
  }

  async function handleLogout() {
    setBusy(true, "正在安全退出…");
    const { error } = await state.client.auth.signOut();
    setBusy(false);
    if (error) toast(normalizedError(error), "error");
    else showLogin();
  }

  async function refreshProducts() {
    const { data, error } = await state.client.from("products")
      .select("id,slug,code,name,description,accent,accent_rgb,display_order,is_active,created_at,updated_at")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    state.products = data || [];
    updateProductFilters();
  }

  function updateProductFilters() {
    [byId("researchProductFilter"), byId("resourceProductFilter")].forEach(select => {
      const current = select.value || "all";
      clear(select);
      const all = create("option", "", "全部产品"); all.value = "all"; select.append(all);
      state.products.forEach(product => { const option = create("option", "", product.name); option.value = product.id; select.append(option); });
      select.value = Array.from(select.options).some(option => option.value === current) ? current : "all";
    });
  }

  async function switchView(view) {
    if (view === "team" && state.profile.role !== "admin") { toast("只有管理员可以访问团队成员。", "error"); return; }
    state.activeView = view;
    document.querySelectorAll("[data-panel]").forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
    document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    const headings = {
      dashboard: ["OVERVIEW", "工作台"], products: ["PRODUCT PORTFOLIO", "产品管理"],
      research: ["RESEARCH UPDATES", "研究进展"], resources: ["RESOURCE LIBRARY", "资源管理"], team: ["ACCESS CONTROL", "团队成员"]
    };
    text(byId("pageEyebrow"), headings[view][0]); text(byId("pageTitle"), headings[view][1]);
    closeSidebar();
    setBusy(true, "正在读取最新数据…");
    try {
      if (view === "dashboard") await loadDashboard();
      if (view === "products") { await refreshProducts(); renderProducts(); }
      if (view === "research") await loadResearch();
      if (view === "resources") await loadResources();
      if (view === "team") await loadProfiles();
    } catch (error) { toast(normalizedError(error), "error", 6500); }
    finally { setBusy(false); }
  }

  async function loadDashboard() {
    await refreshProducts();
    const [researchResult, resourcesResult, documentsResult] = await Promise.all([
      state.client.from("research_updates").select("id,title,status,updated_at,created_at", { count: "exact" }).order("updated_at", { ascending: false }),
      state.client.from("resources").select("id,title,status,updated_at,created_at", { count: "exact" }).order("updated_at", { ascending: false }),
      state.client.from("documents").select("id", { count: "exact", head: true })
    ]);
    [researchResult, resourcesResult, documentsResult].forEach(result => { if (result.error) throw result.error; });
    const allContent = [...(researchResult.data || []).map(item => ({ ...item, kind: "研究" })), ...(resourcesResult.data || []).map(item => ({ ...item, kind: "资源" }))];
    allContent.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    const statuses = { draft: 0, review: 0, published: 0, archived: 0 };
    allContent.forEach(item => { if (Object.hasOwn(statuses, item.status)) statuses[item.status] += 1; });
    renderStats([
      ["产品专区", state.products.length, `${state.products.filter(item => item.is_active).length} 个已启用`, "#66dec5"],
      ["研究进展", researchResult.count || 0, "全部研究动态", "#6aa6ff"],
      ["资源记录", resourcesResult.count || 0, "外部链接与资料", "#c8f26b"],
      ["已存文件", documentsResult.count || 0, "medical-documents", "#ff9a79"]
    ]);
    renderWorkflow(statuses);
    renderRecent(allContent.slice(0, 6));
    renderDashboardProducts();
  }

  function renderStats(items) {
    const grid = byId("statGrid"); clear(grid);
    items.forEach(([label, count, note, color]) => {
      const card = create("article", "stat-card"); card.style.setProperty("--stat-color", color);
      card.append(create("span", "", label), create("strong", "", count), create("small", "", note), create("i"));
      grid.append(card);
    });
  }

  function renderWorkflow(statuses) {
    const container = byId("workflowChart"); clear(container);
    const total = Math.max(1, Object.values(statuses).reduce((sum, count) => sum + count, 0));
    const colors = { draft: "#90a29f", review: "#d99a39", published: "#20a482", archived: "#b66b6b" };
    Object.entries(STATUS_LABELS).forEach(([key, label]) => {
      const row = create("div", "workflow-row"); row.append(create("span", "", label));
      const track = create("div", "workflow-track"); const bar = create("i");
      bar.style.width = `${Math.max(3, statuses[key] / total * 100)}%`; bar.style.setProperty("--bar-color", colors[key]); track.append(bar);
      row.append(track, create("strong", "", statuses[key])); container.append(row);
    });
  }

  function renderRecent(items) {
    const list = byId("recentList"); clear(list);
    if (!items.length) { emptyState(list, "暂无更新", "新建内容后，最近活动会显示在这里。"); return; }
    items.forEach(item => {
      const row = create("div", "recent-item"); row.append(create("span", "", item.kind === "研究" ? "◉" : "▤"));
      appendTextPair(row, item.title, `${item.kind} · ${STATUS_LABELS[item.status] || item.status}`);
      row.append(create("time", "", formatDate(item.updated_at || item.created_at))); list.append(row);
    });
  }

  function renderDashboardProducts() {
    const container = byId("dashboardProducts"); clear(container);
    if (!state.products.length) { emptyState(container, "暂无产品", "请先在产品管理中创建产品专区。"); return; }
    state.products.slice(0, 8).forEach(product => {
      const card = create("div", "snapshot-card"); card.style.setProperty("--accent", /^#[0-9a-f]{6}$/i.test(product.accent || "") ? product.accent : "#66dec5");
      card.append(create("span", "snapshot-code", product.code || "—")); appendTextPair(card, product.name, product.is_active ? "已启用" : "已停用"); container.append(card);
    });
  }

  function renderProducts() {
    const query = byId("productSearch").value.trim().toLowerCase();
    const active = byId("productActiveFilter").value;
    const items = state.products.filter(product => {
      const queryMatch = !query || `${product.name} ${product.code} ${product.slug}`.toLowerCase().includes(query);
      const activeMatch = active === "all" || (active === "active") === Boolean(product.is_active);
      return queryMatch && activeMatch;
    });
    const body = byId("productsBody"); clear(body); byId("productsEmpty").hidden = Boolean(items.length);
    if (!items.length) { emptyState(byId("productsEmpty"), "没有匹配的产品", "请调整筛选条件，或新建一个产品。"); return; }
    items.forEach(product => {
      const row = create("tr");
      const sortCell = create("td"); const controls = create("div", "sort-controls");
      const index = state.products.findIndex(item => item.id === product.id);
      const up = actionButton("↑", "sort-up", product.id); const down = actionButton("↓", "sort-down", product.id);
      up.disabled = index <= 0; down.disabled = index >= state.products.length - 1;
      controls.append(up, create("strong", "", product.display_order ?? index + 1), down); sortCell.append(controls);
      const productCell = create("td"); const entity = create("div", "entity-cell");
      const code = create("span", "entity-code", product.code || "—");
      if (/^#[0-9a-f]{6}$/i.test(product.accent || "")) { code.style.color = product.accent; code.style.backgroundColor = `${product.accent}1f`; }
      entity.append(code); appendTextPair(entity, product.name, product.description || "暂无描述"); productCell.append(entity);
      const slugCell = create("td"); appendTextPair(slugCell, product.slug, product.code || "—");
      const statusCell = create("td"); statusCell.append(statusBadge(product.is_active ? "active" : "inactive"));
      const actions = create("td", "actions-cell");
      if (canPublish() || !product.is_active) actions.append(actionButton("编辑", "edit-product", product.id));
      if (canDelete()) actions.append(actionButton("删除", "delete-product", product.id, "danger"));
      row.append(sortCell, productCell, slugCell, statusCell, create("td", "", formatDate(product.updated_at)), actions); body.append(row);
    });
  }

  async function sortProduct(id, direction) {
    const index = state.products.findIndex(item => String(item.id) === String(id));
    const otherIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || otherIndex < 0 || otherIndex >= state.products.length) return;
    const current = state.products[index]; const other = state.products[otherIndex];
    const currentOrder = Number(current.display_order ?? index + 1); const otherOrder = Number(other.display_order ?? otherIndex + 1);
    setBusy(true, "正在更新显示顺序…");
    try {
      const first = await state.client.from("products").update({ display_order: otherOrder, updated_at: new Date().toISOString() }).eq("id", current.id);
      if (first.error) throw first.error;
      const second = await state.client.from("products").update({ display_order: currentOrder, updated_at: new Date().toISOString() }).eq("id", other.id);
      if (second.error) throw second.error;
      await refreshProducts(); renderProducts(); toast("产品顺序已更新。");
    } catch (error) { await refreshProducts(); renderProducts(); toast(normalizedError(error), "error"); }
    finally { setBusy(false); }
  }

  async function loadResearch() {
    await refreshProducts();
    const { data, error } = await state.client.from("research_updates")
      .select("id,product_id,title,summary,category,status,event_date,is_featured,source_name,source_url,published_at,created_by,updated_by,created_at,updated_at")
      .order("event_date", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
    if (error) throw error;
    state.research = data || []; renderResearch();
  }

  function renderResearch() {
    const query = byId("researchSearch").value.trim().toLowerCase(); const productFilter = byId("researchProductFilter").value; const statusFilter = byId("researchStatusFilter").value;
    const items = state.research.filter(item => (!query || `${item.title} ${item.summary || ""} ${item.source_name || ""}`.toLowerCase().includes(query)) && (productFilter === "all" || String(item.product_id) === productFilter) && (statusFilter === "all" || item.status === statusFilter));
    const body = byId("researchBody"); clear(body); byId("researchEmpty").hidden = Boolean(items.length);
    if (!items.length) { emptyState(byId("researchEmpty"), "没有匹配的研究进展", "请调整筛选条件，或创建一条研究进展。"); return; }
    items.forEach(item => {
      const row = create("tr"); const main = create("td"); const entity = create("div", "entity-cell"); entity.append(create("span", "entity-icon", "◉")); appendTextPair(entity, item.title, item.source_name || item.summary || "暂无来源"); main.append(entity);
      const productCell = create("td"); appendTextPair(productCell, productName(item.product_id), item.category || "未分类");
      const statusCell = create("td"); statusCell.append(statusBadge(item.status));
      const featuredCell = create("td", item.is_featured ? "featured-mark" : "", item.is_featured ? "★" : "—");
      const actions = create("td", "actions-cell");
      if (item.source_url) actions.append(actionButton("预览", "preview-research", item.id));
      if (canPublish() && item.status !== "published") actions.append(actionButton("发布", "publish-research", item.id, "publish"));
      if (canPublish() || item.status !== "published") actions.append(actionButton("编辑", "edit-research", item.id));
      if (canDelete()) actions.append(actionButton("删除", "delete-research", item.id, "danger"));
      row.append(main, productCell, statusCell, create("td", "", formatDate(item.event_date)), featuredCell, actions); body.append(row);
    });
  }

  async function loadResources() {
    await refreshProducts();
    const [resourcesResult, researchResult, documentsResult] = await Promise.all([
      state.client.from("resources").select("id,product_id,title,summary,resource_type,status,source_name,source_url,year,display_order,published_at,created_by,updated_by,created_at,updated_at").order("display_order", { ascending: true }).order("updated_at", { ascending: false }),
      state.client.from("research_updates").select("id,product_id,title,status,event_date").order("event_date", { ascending: false, nullsFirst: false }),
      state.client.from("documents").select("id,product_id,resource_id,research_update_id,file_name,storage_path,mime_type,file_size,version_label,uploaded_by,created_at").order("created_at", { ascending: false })
    ]);
    [resourcesResult, researchResult, documentsResult].forEach(result => { if (result.error) throw result.error; });
    state.resources = resourcesResult.data || []; state.research = researchResult.data || []; state.documents = documentsResult.data || [];
    renderResources(); renderDocuments();
  }

  function renderResources() {
    const query = byId("resourceSearch").value.trim().toLowerCase(); const productFilter = byId("resourceProductFilter").value; const statusFilter = byId("resourceStatusFilter").value;
    const items = state.resources.filter(item => (!query || `${item.title} ${item.summary || ""} ${item.source_name || ""}`.toLowerCase().includes(query)) && (productFilter === "all" || String(item.product_id) === productFilter) && (statusFilter === "all" || item.status === statusFilter));
    const body = byId("resourcesBody"); clear(body); byId("resourcesEmpty").hidden = Boolean(items.length);
    if (!items.length) { emptyState(byId("resourcesEmpty"), "没有匹配的资源", "请调整筛选条件，或创建一条资源记录。"); return; }
    items.forEach(item => {
      const row = create("tr"); const main = create("td"); const entity = create("div", "entity-cell"); entity.append(create("span", "entity-icon", "▤")); appendTextPair(entity, item.title, item.source_name || item.summary || "暂无来源"); main.append(entity);
      const productCell = create("td"); appendTextPair(productCell, productName(item.product_id), RESOURCE_TYPE_LABELS[item.resource_type] || item.resource_type || "其他");
      const statusCell = create("td"); statusCell.append(statusBadge(item.status));
      const orderCell = create("td"); appendTextPair(orderCell, item.year || "—", `顺序 ${item.display_order ?? 0}`);
      const linkCell = create("td", item.source_url ? "link-state" : "", item.source_url ? "可预览" : "无外链");
      const actions = create("td", "actions-cell");
      if (item.source_url) actions.append(actionButton("预览", "preview-resource", item.id));
      if (canPublish() || item.status !== "published") actions.append(actionButton("上传", "upload-resource", item.id));
      if (canPublish() && item.status !== "published") actions.append(actionButton("发布", "publish-resource", item.id, "publish"));
      if (canPublish() || item.status !== "published") actions.append(actionButton("编辑", "edit-resource", item.id));
      if (canDelete()) actions.append(actionButton("删除", "delete-resource", item.id, "danger"));
      row.append(main, productCell, statusCell, orderCell, linkCell, actions); body.append(row);
    });
  }

  function renderDocuments() {
    const body = byId("documentsBody"); clear(body); text(byId("documentCount"), `${state.documents.length} 个文件`); byId("documentsEmpty").hidden = Boolean(state.documents.length);
    if (!state.documents.length) { emptyState(byId("documentsEmpty"), "暂无文件资料", "上传 PDF 或 Office 文件后会显示在这里。"); return; }
    state.documents.forEach(item => {
      const row = create("tr"); const main = create("td"); const entity = create("div", "entity-cell"); entity.append(create("span", "entity-icon", extensionOf(item.file_name).toUpperCase() || "DOC")); appendTextPair(entity, item.file_name, item.mime_type || "未知类型"); main.append(entity);
      const related = documentRelation(item); const relationCell = create("td"); appendTextPair(relationCell, related.label, related.type);
      const actions = create("td", "actions-cell");
      actions.append(actionButton("预览", "preview-document", item.id));
      if (canDelete()) actions.append(actionButton("删除文件", "delete-document", item.id, "danger"));
      row.append(main, relationCell, create("td", "", item.version_label || "—"), create("td", "", formatBytes(item.file_size)), create("td", "", formatDate(item.created_at, true)), actions); body.append(row);
    });
  }

  function documentRelation(item) {
    if (item.resource_id) return { type: "资源", label: state.resources.find(value => String(value.id) === String(item.resource_id))?.title || "已删除资源" };
    if (item.research_update_id) return { type: "研究进展", label: state.research.find(value => String(value.id) === String(item.research_update_id))?.title || "已删除进展" };
    if (item.product_id) return { type: "产品", label: productName(item.product_id) };
    return { type: "未关联", label: "—" };
  }

  async function loadProfiles() {
    if (state.profile.role !== "admin") return;
    const { data, error } = await state.client.from("profiles").select("user_id,email,display_name,role,is_active,created_at,updated_at").order("created_at", { ascending: false });
    if (error) throw error; state.profiles = data || []; renderProfiles();
  }

  function renderProfiles() {
    const body = byId("profilesBody"); clear(body); byId("profilesEmpty").hidden = Boolean(state.profiles.length);
    if (!state.profiles.length) { emptyState(byId("profilesEmpty"), "暂无团队成员", "使用邀请按钮添加第一位成员。"); return; }
    state.profiles.forEach(profile => {
      const row = create("tr"); const main = create("td"); const entity = create("div", "entity-cell"); entity.append(create("span", "entity-code", initials(profile.display_name || profile.email))); appendTextPair(entity, profile.display_name || "未设置姓名", profile.email || "—"); main.append(entity);
      const statusCell = create("td"); statusCell.append(statusBadge(profile.is_active ? "active" : "inactive"));
      row.append(main, create("td", "", ROLE_LABELS[profile.role] || profile.role), statusCell, create("td", "", formatDate(profile.created_at)), create("td", "", formatDate(profile.updated_at))); body.append(row);
    });
  }

  function productName(id) { return state.products.find(product => String(product.id) === String(id))?.name || "未关联产品"; }

  function openEntityForm(type, record = null) {
    state.form = { type, record };
    clear(byId("formFields")); text(byId("formError"), ""); byId("formError").hidden = true;
    const titles = {
      product: [record ? "EDIT PRODUCT" : "NEW PRODUCT", record ? "编辑产品" : "新建产品"],
      research: [record ? "EDIT RESEARCH" : "NEW RESEARCH", record ? "编辑研究进展" : "新建研究进展"],
      resource: [record ? "EDIT RESOURCE" : "NEW RESOURCE", record ? "编辑资源" : "新建资源"],
      invite: ["INVITE MEMBER", "邀请团队成员"]
    };
    text(byId("formModalEyebrow"), titles[type][0]); text(byId("formModalTitle"), titles[type][1]); text(byId("saveEntityButton"), type === "invite" ? "发送邀请" : "保存");
    if (type === "product") buildProductFields(record);
    if (type === "research") buildResearchFields(record);
    if (type === "resource") buildResourceFields(record);
    if (type === "invite") buildInviteFields();
    openModal("formModal");
  }

  function field(config) {
    const label = create("label", `field${config.full ? " full" : ""}`); label.append(create("span", "", `${config.label}${config.required ? " *" : ""}`));
    let input;
    if (config.type === "textarea") input = create("textarea");
    else if (config.type === "select") {
      input = create("select");
      (config.options || []).forEach(optionData => {
        const option = create("option", "", optionData.label); option.value = String(optionData.value);
        if (optionData.disabled) option.disabled = true;
        input.append(option);
      });
    } else { input = create("input"); input.type = config.type || "text"; }
    input.name = config.name;
    if (config.required) input.required = true;
    if (config.placeholder) input.placeholder = config.placeholder;
    if (config.maxLength) input.maxLength = config.maxLength;
    if (config.min != null) input.min = String(config.min);
    if (config.max != null) input.max = String(config.max);
    if (config.step != null) input.step = String(config.step);
    if (config.pattern) input.pattern = config.pattern;
    if (config.value != null) input.value = String(config.value);
    label.append(input);
    if (config.help) label.append(create("small", "", config.help));
    byId("formFields").append(label);
    return input;
  }

  function checkbox(name, labelText, checked) {
    const label = create("label", "checkbox-field"); const input = create("input"); input.type = "checkbox"; input.name = name; input.checked = Boolean(checked); label.append(input, create("span", "", labelText)); byId("formFields").append(label); return input;
  }

  function productOptions() { return state.products.map(product => ({ value: product.id, label: `${product.name} (${product.code})` })); }
  function statusOptions(current) {
    return Object.entries(STATUS_LABELS).filter(([value]) => canPublish() || value !== "published" || current === "published").map(([value, label]) => ({ value, label, disabled: !canPublish() && value === "published" }));
  }

  function buildProductFields(record) {
    field({ name: "name", label: "产品名称", required: true, maxLength: 120, value: record?.name, placeholder: "例如：百泽安" });
    field({ name: "code", label: "产品编码", required: true, maxLength: 30, value: record?.code, placeholder: "例如：BZA" });
    field({ name: "slug", label: "URL 标识", required: true, maxLength: 100, pattern: "[a-z0-9]+(?:-[a-z0-9]+)*", value: record?.slug, placeholder: "例如：baizean", help: "仅限小写字母、数字和连字符" });
    field({ name: "display_order", label: "显示顺序", type: "number", required: true, min: 0, step: 1, value: record?.display_order ?? state.products.length + 1 });
    const accent = field({ name: "accent", label: "主题色", type: "color", required: true, value: record?.accent || "#66dec5" });
    const rgb = field({ name: "accent_rgb", label: "主题色 RGB", required: true, maxLength: 30, value: record?.accent_rgb || "102,222,197", placeholder: "102,222,197", help: "格式：R,G,B" });
    accent.addEventListener("input", () => { const hex = accent.value.slice(1); rgb.value = [0, 2, 4].map(index => parseInt(hex.slice(index,index + 2),16)).join(","); });
    field({ name: "description", label: "产品描述", type: "textarea", full: true, maxLength: 2000, value: record?.description, placeholder: "输入产品医学资料专区简介…" });
    const activeInput = checkbox("is_active", "启用该产品专区", record ? record.is_active : canPublish());
    if (!canPublish()) {
      activeInput.disabled = true;
      activeInput.title = "只有审核者或管理员可以启用产品专区";
    }
  }

  function buildResearchFields(record) {
    field({ name: "product_id", label: "关联产品", type: "select", required: true, value: record?.product_id, options: productOptions() });
    field({ name: "category", label: "分类", required: true, maxLength: 80, value: record?.category, placeholder: "例如：长期随访" });
    field({ name: "title", label: "标题", required: true, full: true, maxLength: 300, value: record?.title, placeholder: "输入研究进展标题" });
    field({ name: "summary", label: "摘要", type: "textarea", required: true, full: true, maxLength: 5000, value: record?.summary, placeholder: "输入研究设计、关键结果或医学解读摘要…" });
    field({ name: "status", label: "内容状态", type: "select", required: true, value: record?.status || "draft", options: statusOptions(record?.status) });
    field({ name: "event_date", label: "事件日期", type: "date", required: true, value: record?.event_date?.slice(0,10) || new Date().toISOString().slice(0,10) });
    field({ name: "source_name", label: "来源名称", maxLength: 200, value: record?.source_name, placeholder: "期刊、会议或机构名称" });
    field({ name: "source_url", label: "来源链接", type: "url", maxLength: 2000, value: record?.source_url, placeholder: "https://…" });
    checkbox("is_featured", "设为重点研究进展", record?.is_featured);
  }

  function buildResourceFields(record) {
    field({ name: "product_id", label: "关联产品", type: "select", required: true, value: record?.product_id, options: productOptions() });
    field({ name: "resource_type", label: "资源类型", type: "select", required: true, value: record?.resource_type || "literature", options: Object.entries(RESOURCE_TYPE_LABELS).map(([value,label]) => ({ value,label })) });
    field({ name: "title", label: "标题", required: true, full: true, maxLength: 300, value: record?.title, placeholder: "输入资源标题" });
    field({ name: "summary", label: "摘要", type: "textarea", full: true, maxLength: 5000, value: record?.summary, placeholder: "输入资源内容摘要…" });
    field({ name: "status", label: "内容状态", type: "select", required: true, value: record?.status || "draft", options: statusOptions(record?.status) });
    field({ name: "year", label: "年份", type: "number", min: 1900, max: 2200, step: 1, value: record?.year || new Date().getFullYear() });
    field({ name: "source_name", label: "来源名称", maxLength: 200, value: record?.source_name, placeholder: "期刊、机构或资料来源" });
    field({ name: "display_order", label: "显示顺序", type: "number", required: true, min: 0, step: 1, value: record?.display_order ?? state.resources.length + 1 });
    field({ name: "source_url", label: "外部链接", type: "url", full: true, maxLength: 2000, value: record?.source_url, placeholder: "https://…", help: "可填写 PDF、Office 文件或网页的公开 URL" });
  }

  function buildInviteFields() {
    field({ name: "email", label: "工作邮箱", type: "email", required: true, maxLength: 254, placeholder: "name@company.com" });
    field({ name: "display_name", label: "成员姓名", required: true, maxLength: 100, placeholder: "输入姓名" });
    field({ name: "role", label: "分配角色", type: "select", required: true, options: Object.entries(ROLE_LABELS).map(([value,label]) => ({ value,label })) });
    const note = create("p", "form-message full", "邀请将由 invite-user Edge Function 安全处理。浏览器不会接触 service_role key。"); note.style.color = "#52716b"; note.style.background = "#f0f8f6"; note.style.borderColor = "#c6e2dc"; byId("formFields").append(note);
  }

  function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }

  function validateEntity(type, values) {
    const required = type === "product" ? ["name","code","slug","display_order","accent","accent_rgb"] : type === "research" ? ["product_id","category","title","summary","status","event_date"] : type === "resource" ? ["product_id","resource_type","title","status","display_order"] : ["email","display_name","role"];
    if (required.some(name => !String(values[name] ?? "").trim())) return "请填写所有必填字段。";
    if (type === "product" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) return "URL 标识只能包含小写字母、数字和连字符。";
    if (type === "product" && !/^#[0-9a-f]{6}$/i.test(values.accent)) return "主题色必须是有效的十六进制颜色。";
    if (type === "product" && !/^(?:25[0-5]|2[0-4]\d|1?\d?\d),(?:25[0-5]|2[0-4]\d|1?\d?\d),(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(values.accent_rgb.replace(/\s/g,""))) return "主题色 RGB 格式应为 R,G,B，且每项介于 0 到 255。";
    if (["research","resource"].includes(type) && values.source_url && !validHttpUrl(values.source_url)) return "来源链接必须是有效的 HTTP 或 HTTPS 地址。";
    if (type === "invite" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return "请输入有效的邮箱地址。";
    return "";
  }

  async function saveEntity(event) {
    event.preventDefault();
    const { type, record } = state.form; const values = formValues(event.currentTarget); const errorMessage = validateEntity(type, values);
    const errorNode = byId("formError"); text(errorNode, errorMessage); errorNode.hidden = !errorMessage;
    if (errorMessage) return;
    const button = byId("saveEntityButton"); button.disabled = true; text(button, type === "invite" ? "正在发送…" : "正在保存…");
    try {
      if (type === "invite") await inviteMember(values);
      else {
        const payload = payloadFor(type, values, record);
        const table = type === "product" ? "products" : type === "research" ? "research_updates" : "resources";
        let result;
        if (record) result = await state.client.from(table).update(payload).eq("id", record.id).select().single();
        else result = await state.client.from(table).insert(payload).select().single();
        if (result.error) throw result.error;
        toast(record ? "内容已保存。" : "内容已创建。");
      }
      closeModal("formModal");
      const destination = type === "invite" ? "team" : type === "product" ? "products" : type === "resource" ? "resources" : "research";
      await switchView(destination);
    } catch (error) { text(errorNode, normalizedError(error)); errorNode.hidden = false; }
    finally { button.disabled = false; text(button, type === "invite" ? "发送邀请" : "保存"); }
  }

  function payloadFor(type, values, record) {
    const now = new Date().toISOString();
    if (type === "product") return {
      slug: values.slug.trim(), code: values.code.trim(), name: values.name.trim(), description: values.description?.trim() || null,
      accent: values.accent, accent_rgb: values.accent_rgb.replace(/\s/g,""), display_order: Number(values.display_order), is_active: values.is_active === "on", updated_at: now
    };
    const selectedStatus = !canPublish() && record?.status === "published" ? "published" : values.status;
    const common = { product_id: values.product_id, title: values.title.trim(), summary: values.summary?.trim() || null, status: selectedStatus, source_name: values.source_name?.trim() || null, source_url: values.source_url?.trim() || null, updated_by: state.user.id, updated_at: now };
    if (!record) common.created_by = state.user.id;
    if (selectedStatus === "published") common.published_at = record?.published_at || now;
    else if (record?.status === "published") common.published_at = null;
    if (type === "research") return { ...common, category: values.category.trim(), event_date: values.event_date, is_featured: values.is_featured === "on" };
    return { ...common, resource_type: values.resource_type, year: values.year ? Number(values.year) : null, display_order: Number(values.display_order) };
  }

  async function inviteMember(values) {
    if (state.profile.role !== "admin") throw new Error("只有管理员可以邀请成员。");
    const { data, error } = await state.client.functions.invoke("invite-user", { body: { email: values.email.trim().toLowerCase(), display_name: values.display_name.trim(), role: values.role } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    toast("邀请已发送，成员角色已分配。");
  }

  async function publishEntity(type, id) {
    if (!canPublish()) { toast("当前角色没有发布权限。", "error"); return; }
    const confirmed = await confirmAction("确认发布", "发布后内容将对前台可见。请确认医学与合规审核已经完成。", "确认发布", false);
    if (!confirmed) return;
    const table = type === "research" ? "research_updates" : "resources";
    setBusy(true, "正在发布内容…");
    const { error } = await state.client.from(table).update({ status: "published", published_at: new Date().toISOString(), updated_by: state.user.id, updated_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) toast(normalizedError(error), "error"); else { toast("内容已发布。"); await switchView(type); }
  }

  async function deleteEntity(type, id) {
    const table = type === "product" ? "products" : type === "research" ? "research_updates" : "resources";
    const labels = { product: "产品", research: "研究进展", resource: "资源" };
    const confirmed = await confirmAction(`删除${labels[type]}`, `此操作会永久删除该${labels[type]}记录，且无法撤销。有关联文件时，请先删除文件。请再次确认。`, "确认删除", true);
    if (!confirmed) return;
    setBusy(true, `正在删除${labels[type]}…`);
    const { error } = await state.client.from(table).delete().eq("id", id);
    setBusy(false);
    if (error) toast(normalizedError(error), "error");
    else {
      toast(`${labels[type]}已删除。`);
      await switchView(type === "product" ? "products" : type === "resource" ? "resources" : "research");
    }
  }

  async function openUpload(defaultType = "resource", defaultId = "") {
    if (!state.products.length) await refreshProducts();
    if (!state.resources.length || !state.research.length) {
      const [resourcesResult, researchResult] = await Promise.all([
        state.client.from("resources").select("id,product_id,title,status").order("title"),
        state.client.from("research_updates").select("id,product_id,title,status").order("title")
      ]);
      if (resourcesResult.error) throw resourcesResult.error; if (researchResult.error) throw researchResult.error;
      state.resources = resourcesResult.data || []; state.research = researchResult.data || [];
    }
    byId("uploadForm").reset(); byId("uploadError").hidden = true; byId("uploadProgress").hidden = true;
    byId("documentRelationType").value = defaultType; updateRelationOptions(defaultId); openModal("uploadModal");
  }

  function updateRelationOptions(selectedId = "") {
    const type = byId("documentRelationType").value; const select = byId("documentRelationId"); clear(select);
    const sourceRecords = type === "product" ? state.products : type === "research" ? state.research : state.resources;
    const records = canPublish() ? sourceRecords : sourceRecords.filter(item => type === "product" ? !item.is_active : item.status !== "published");
    records.forEach(item => { const option = create("option", "", type === "product" ? item.name : `${item.title} · ${productName(item.product_id)}`); option.value = item.id; select.append(option); });
    if (selectedId && Array.from(select.options).some(option => String(option.value) === String(selectedId))) select.value = String(selectedId);
    if (!records.length) { const option = create("option", "", "暂无可关联内容"); option.value = ""; select.append(option); }
  }

  async function uploadDocument(event) {
    event.preventDefault();
    const file = byId("documentFile").files[0]; const type = byId("documentRelationType").value; const relationId = byId("documentRelationId").value;
    const errorNode = byId("uploadError"); let message = "";
    if (!file) message = "请选择要上传的文件。";
    else if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) message = "仅支持 PDF、PPT、PPTX、DOC、DOCX 文件。";
    else if (file.size > MAX_FILE_SIZE) message = "文件大小不能超过 50MB。";
    else if (!relationId) message = "请选择文件要关联的内容。";
    text(errorNode, message); errorNode.hidden = !message; if (message) return;
    const button = byId("uploadSubmitButton"); button.disabled = true; text(button, "正在上传…"); byId("uploadProgress").hidden = false;
    const extension = extensionOf(file.name); const uuid = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${state.user.id}/${new Date().toISOString().slice(0,10)}/${uuid}.${extension}`;
    try {
      const upload = await state.client.storage.from(BUCKET).upload(storagePath, file, { cacheControl: "3600", upsert: false, contentType: file.type || mimeForExtension(extension) });
      if (upload.error) throw upload.error;
      const values = formValues(event.currentTarget);
      const payload = { product_id: null, resource_id: null, research_update_id: null, file_name: file.name, storage_path: storagePath, mime_type: file.type || mimeForExtension(extension), file_size: file.size, version_label: values.version_label?.trim() || null, uploaded_by: state.user.id };
      if (type === "product") payload.product_id = relationId;
      if (type === "resource") payload.resource_id = relationId;
      if (type === "research") payload.research_update_id = relationId;
      const insert = await state.client.from("documents").insert(payload);
      if (insert.error) { await state.client.storage.from(BUCKET).remove([storagePath]); throw insert.error; }
      closeModal("uploadModal"); toast("文件已上传并写入资料记录。"); await switchView("resources");
    } catch (error) { text(errorNode, normalizedError(error)); errorNode.hidden = false; }
    finally { button.disabled = false; text(button, "上传并保存"); byId("uploadProgress").hidden = true; }
  }

  function mimeForExtension(extension) {
    return { pdf: "application/pdf", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }[extension] || "application/octet-stream";
  }

  async function deleteDocument(id) {
    const documentRecord = state.documents.find(item => String(item.id) === String(id)); if (!documentRecord) return;
    const confirmed = await confirmAction("删除文件资料", `将永久删除“${documentRecord.file_name}”的存储对象和数据库记录，且无法恢复。请再次确认。`, "确认删除文件", true);
    if (!confirmed) return;
    setBusy(true, "正在删除文件与记录…");
    try {
      const storageResult = await state.client.storage.from(BUCKET).remove([documentRecord.storage_path]); if (storageResult.error) throw storageResult.error;
      const databaseResult = await state.client.from("documents").delete().eq("id", documentRecord.id); if (databaseResult.error) throw databaseResult.error;
      toast("文件和资料记录已删除。"); await switchView("resources");
    } catch (error) { toast(`删除未完全完成：${normalizedError(error)}`, "error", 7000); }
    finally { setBusy(false); }
  }

  async function previewDocument(id) {
    const record = state.documents.find(item => String(item.id) === String(id)); if (!record) return;
    const { data, error } = await state.client.storage.from(BUCKET).createSignedUrl(record.storage_path, 3600);
    if (error) { toast(normalizedError(error), "error", 6500); return; }
    const signedUrl = validHttpUrl(data?.signedUrl);
    if (!signedUrl) { toast("无法生成临时预览地址，请检查文件权限。", "error", 6500); return; }
    openPreview(record.file_name, signedUrl, extensionOf(record.file_name));
  }

  function openPreview(title, sourceUrl, knownExtension = "") {
    const safeUrl = validHttpUrl(sourceUrl); if (!safeUrl) { toast("预览地址无效，仅允许 HTTP 或 HTTPS 链接。", "error"); return; }
    const ext = knownExtension || extensionOf(safeUrl); let previewUrl = safeUrl; let notice = "";
    if (OFFICE_EXTENSIONS.has(ext)) { previewUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(safeUrl)}`; notice = "Office 在线预览要求该文件可通过公网 URL 访问。若加载失败，请在新窗口中打开。"; }
    else if (ext && ext !== "pdf") notice = "该外部页面可能禁止嵌入显示。若加载失败，请在新窗口中打开。";
    text(byId("previewTitle"), title); byId("previewFrame").src = previewUrl; byId("previewOpenLink").href = safeUrl;
    text(byId("previewNotice"), notice); byId("previewNotice").hidden = !notice; openModal("previewModal");
  }

  function openModal(id) { byId(id).hidden = false; document.body.style.overflow = "hidden"; window.setTimeout(() => byId(id).querySelector("input,select,textarea,button")?.focus(), 20); }
  function closeModal(id) { byId(id).hidden = true; if (id === "previewModal") { byId("previewFrame").src = "about:blank"; byId("previewOpenLink").href = "#"; } if (!document.querySelector(".modal-layer:not([hidden])")) document.body.style.overflow = ""; }

  function confirmAction(titleValue, message, acceptLabel = "确认", danger = true) {
    text(byId("confirmTitle"), titleValue); text(byId("confirmMessage"), message); text(byId("confirmAccept"), acceptLabel);
    byId("confirmAccept").className = danger ? "danger-button" : "primary-button"; openModal("confirmModal");
    return new Promise(resolve => { state.confirmResolver = resolve; });
  }
  function resolveConfirm(value) { closeModal("confirmModal"); if (state.confirmResolver) state.confirmResolver(value); state.confirmResolver = null; }

  function closeSidebar() { document.querySelector(".sidebar").classList.remove("open"); byId("drawerBackdrop").hidden = true; }

  function updateClock() {
    const now = new Date(); const hour = now.getHours();
    text(byId("greeting"), hour < 6 ? "夜深了" : hour < 12 ? "上午好" : hour < 18 ? "下午好" : "晚上好");
    text(byId("currentDate"), new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now));
  }

  async function handleTableAction(event) {
    const button = event.target.closest("[data-action]"); if (!button) return;
    const { action, id } = button.dataset;
    try {
      if (action === "sort-up" || action === "sort-down") await sortProduct(id, action === "sort-up" ? "up" : "down");
      if (action === "edit-product") openEntityForm("product", state.products.find(item => String(item.id) === id));
      if (action === "delete-product") await deleteEntity("product", id);
      if (action === "edit-research") openEntityForm("research", state.research.find(item => String(item.id) === id));
      if (action === "delete-research") await deleteEntity("research", id);
      if (action === "publish-research") await publishEntity("research", id);
      if (action === "preview-research") { const item = state.research.find(value => String(value.id) === id); openPreview(item.title, item.source_url); }
      if (action === "edit-resource") openEntityForm("resource", state.resources.find(item => String(item.id) === id));
      if (action === "delete-resource") await deleteEntity("resource", id);
      if (action === "publish-resource") await publishEntity("resources", id);
      if (action === "preview-resource") { const item = state.resources.find(value => String(value.id) === id); openPreview(item.title, item.source_url); }
      if (action === "upload-resource") await openUpload("resource", id);
      if (action === "preview-document") await previewDocument(id);
      if (action === "delete-document") await deleteDocument(id);
    } catch (error) { setBusy(false); toast(normalizedError(error), "error", 6500); }
  }

  function bindEvents() {
    byId("loginForm").addEventListener("submit", handleLogin);
    byId("togglePassword").addEventListener("click", () => { const input = byId("loginPassword"); const show = input.type === "password"; input.type = show ? "text" : "password"; text(byId("togglePassword"), show ? "隐藏" : "显示"); byId("togglePassword").setAttribute("aria-label", show ? "隐藏密码" : "显示密码"); });
    byId("logoutButton").addEventListener("click", handleLogout);
    byId("refreshButton").addEventListener("click", () => switchView(state.activeView));
    document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
    document.querySelectorAll("[data-go-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.goView)));
    byId("menuToggle").addEventListener("click", () => { document.querySelector(".sidebar").classList.add("open"); byId("drawerBackdrop").hidden = false; });
    byId("drawerBackdrop").addEventListener("click", closeSidebar);
    byId("addProductButton").addEventListener("click", () => openEntityForm("product"));
    byId("addResearchButton").addEventListener("click", () => state.products.length ? openEntityForm("research") : toast("请先创建产品。", "warning"));
    byId("addResourceButton").addEventListener("click", () => state.products.length ? openEntityForm("resource") : toast("请先创建产品。", "warning"));
    byId("inviteMemberButton").addEventListener("click", () => openEntityForm("invite"));
    byId("uploadDocumentButton").addEventListener("click", () => openUpload().catch(error => toast(normalizedError(error), "error")));
    byId("entityForm").addEventListener("submit", saveEntity);
    byId("uploadForm").addEventListener("submit", uploadDocument);
    byId("documentRelationType").addEventListener("change", () => updateRelationOptions());
    document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
    document.querySelectorAll(".modal-layer").forEach(layer => layer.addEventListener("mousedown", event => { if (event.target === layer && layer.id !== "confirmModal") closeModal(layer.id); }));
    byId("confirmCancel").addEventListener("click", () => resolveConfirm(false));
    byId("confirmAccept").addEventListener("click", () => resolveConfirm(true));
    [byId("productsBody"),byId("researchBody"),byId("resourcesBody"),byId("documentsBody")].forEach(body => body.addEventListener("click", handleTableAction));
    byId("productSearch").addEventListener("input", debounce(renderProducts)); byId("productActiveFilter").addEventListener("change", renderProducts);
    byId("researchSearch").addEventListener("input", debounce(renderResearch)); byId("researchProductFilter").addEventListener("change", renderResearch); byId("researchStatusFilter").addEventListener("change", renderResearch);
    byId("resourceSearch").addEventListener("input", debounce(renderResources)); byId("resourceProductFilter").addEventListener("change", renderResources); byId("resourceStatusFilter").addEventListener("change", renderResources);
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!byId("confirmModal").hidden) resolveConfirm(false);
      else { const open = Array.from(document.querySelectorAll(".modal-layer:not([hidden])")).pop(); if (open) closeModal(open.id); else closeSidebar(); }
    });
  }

  window.addEventListener("beforeunload", () => state.authSubscription?.unsubscribe());
  initialize().catch(error => { byId("bootScreen").hidden = true; byId("loginScreen").hidden = false; setLoginMessage(normalizedError(error)); });
})();
