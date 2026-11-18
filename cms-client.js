(() => {
  "use strict";

  const PUBLISHED_STATUS = "published";
  const DEFAULT_DOCUMENT_BUCKET = "medical-documents";

  function getClient() {
    if (!window.medAtlasSupabase) {
      throw new Error("Supabase 未配置");
    }
    return window.medAtlasSupabase;
  }

  async function runQuery(label, query) {
    try {
      const { data, error } = await query;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label}读取失败：${message}`);
    }
  }

  async function getActiveProducts() {
    const client = getClient();
    return runQuery(
      "产品",
      client
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
    );
  }

  async function getPublishedResearchUpdates(productId) {
    const client = getClient();
    let query = client
      .from("research_updates")
      .select("*")
      .eq("status", PUBLISHED_STATUS)
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false });
    if (productId) query = query.eq("product_id", productId);
    return runQuery("研究进展", query);
  }

  async function getPublishedResources(productId) {
    const client = getClient();
    let query = client
      .from("resources")
      .select("*")
      .eq("status", PUBLISHED_STATUS)
      .order("display_order", { ascending: true })
      .order("published_at", { ascending: false });
    if (productId) query = query.eq("product_id", productId);
    return runQuery("医学资料", query);
  }

  async function getPublishedDocuments(resourceIds) {
    if (Array.isArray(resourceIds) && resourceIds.length === 0) return [];
    const client = getClient();
    let query = client
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (Array.isArray(resourceIds)) query = query.in("resource_id", resourceIds);
    const documents = await runQuery("资料文件", query);

    return Promise.all(documents.map(async document => {
      const bucket = document.bucket_name || document.storage_bucket || DEFAULT_DOCUMENT_BUCKET;
      const path = document.storage_path || document.file_path || document.path;
      let publicUrl = null;
      if (bucket && path) {
        const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);
        if (!error) publicUrl = data?.signedUrl || null;
      }
      return { ...document, public_url: publicUrl };
    }));
  }

  async function loadPublishedContent() {
    const [products, researchUpdates, resources] = await Promise.all([
      getActiveProducts(),
      getPublishedResearchUpdates(),
      getPublishedResources()
    ]);
    const resourceIds = resources.map(resource => resource.id).filter(Boolean);
    const documents = await getPublishedDocuments(resourceIds);
    const documentsByResource = new Map();

    documents.forEach(document => {
      const current = documentsByResource.get(document.resource_id) || [];
      current.push(document);
      documentsByResource.set(document.resource_id, current);
    });

    return {
      products,
      researchUpdates,
      resources: resources.map(resource => ({
        ...resource,
        documents: documentsByResource.get(resource.id) || []
      })),
      documents
    };
  }

  window.medAtlasCms = Object.freeze({
    isConfigured: () => Boolean(window.medAtlasSupabase),
    getActiveProducts,
    getPublishedResearchUpdates,
    getPublishedResources,
    getPublishedDocuments,
    loadPublishedContent
  });
})();
