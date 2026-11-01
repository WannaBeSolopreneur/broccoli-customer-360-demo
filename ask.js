// Plain English question to one metric. A port of c360/ask.py. Keyword matching, no LLM.
(function (root) {
  const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const BENCH = ["peer", "benchmark", "compare to others", "other contractors"];
  function tenantWords(tenants) {
    const w = {};
    for (const t of tenants) {
      const ws = t.name.toLowerCase().replace(/&/g, "").split(/\s+/).filter(Boolean);
      w[ws.slice(0, 2).join(" ")] = t.id;
      if (!(ws[0] in w)) w[ws[0]] = t.id;
    }
    w["lonestar"] = "tnt_lonestar";
    return w;
  }
  const words = s => new Set((s.toLowerCase().match(/[a-z0-9]+/g) || []));
  function findTenant(ql, tw) {
    for (const k of Object.keys(tw).sort((a, b) => b.length - a.length)) if (ql.includes(k)) return tw[k];
    return null;
  }
  function plan(question, D) {
    const ql = question.toLowerCase();
    const tw = tenantWords(D.tenants);
    if (BENCH.some(w => ql.includes(w))) return { metric: "peer_benchmarks", tenant: findTenant(ql, tw), by: [], month: null };
    let best = null, bestScore = 0;
    for (const [name, m] of Object.entries(D.metrics)) {
      let score = 0;
      for (const syn of [...m.synonyms, m.label.toLowerCase(), name.replace(/_/g, " ")]) {
        const s = syn.toLowerCase();
        if (ql.includes(s)) score = Math.max(score, 10 + s.length);
        else {
          const sw = words(s), qw = words(ql);
          let ov = 0; for (const x of sw) if (qw.has(x)) ov++;
          score = Math.max(score, ov === sw.size ? ov * 2 : ov);
        }
      }
      if (score > bestScore) { best = name; bestScore = score; }
    }
    if (!best) return null;
    const tenant = findTenant(ql, tw);
    let month = null;
    MONTHS.forEach((mn, i) => { if (ql.includes(mn)) month = `${i >= 9 ? 2025 : 2026}-${String(i + 1).padStart(2, "0")}-01`; });
    const by = [];
    if (["by month", "per month", "each month", "trend"].some(w => ql.includes(w))) by.push("month");
    if (tenant === null && ["each", "by tenant", "compare", "per contractor"].some(w => ql.includes(w))) by.unshift("tenant_id");
    for (const dim of D.metrics[best].dimensions) {
      if (ql.includes("by " + dim.replace(/_/g, " ")) || ql.includes("by " + dim.split("_")[0])) by.push(dim);
    }
    return { metric: best, tenant, by, month, score: bestScore };
  }
  function round0(v) { return Math.round(v); }
  function fmt(v, kind) {
    if (v === null || v === undefined) return "n/a";
    v = Number(v);
    const c = (x, d) => x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    switch (kind) {
      case "percent": return c(v * 100, 1) + "%";
      case "currency": return "$" + c(v, 0);
      case "seconds": return c(v, 0) + " sec";
      case "hours": return c(v, 1) + " h";
      case "integer": return c(v, 0);
      default: return c(v, 2);
    }
  }
  // Answer from precomputed tables. tenant: the contractor to use when the question names none.
  function answer(question, D, selected) {
    const p = plan(question, D);
    if (!p) return null;
    if (p.metric === "peer_benchmarks") {
      const t = p.tenant || selected;
      const rows = (D.benchmarks[t] || []).map(r => {
        const m = D.metrics[r.metric];
        const better = (r.my_value === null || r.peer_median === null) ? null : ((Number(r.my_value) > Number(r.peer_median)) === m.higher_is_better);
        const word = (better === null || r.my_value === r.peer_median) ? "same" : (better ? "better" : "worse");
        return { label: m.label, display: `${fmt(r.my_value, m.format)} vs peer median ${fmt(r.peer_median, m.format)} (${word}, ${r.n_tenants} contractors)` };
      });
      return { plan: p, tenant: t, label: "Peer benchmarks", definition: "Your value next to the median of all contractors. Aggregates only, 5 or more contractors.", rows };
    }
    const m = D.metrics[p.metric], V = D.values[p.metric];
    const allTenants = p.by[0] === "tenant_id";
    const t = allTenants ? null : (p.tenant || selected);
    const names = Object.fromEntries(D.tenants.map(x => [x.id, x.name]));
    let rows;
    const dim = p.by.find(b => b !== "tenant_id" && b !== "month");
    if (p.month && !p.by.includes("month")) {
      rows = V.month.filter(r => r.tenant_id === t && String(r.month).startsWith(p.month)).map(r => ({ label: names[t], value: r.value }));
    } else if (p.by.includes("month")) {
      rows = V.month.filter(r => allTenants || r.tenant_id === t).sort((a, b) => String(a.month).localeCompare(String(b.month)))
        .map(r => ({ label: (allTenants ? names[r.tenant_id] + ", " : "") + String(r.month).slice(0, 10), value: r.value }));
    } else if (dim) {
      rows = V[dim].filter(r => allTenants || r.tenant_id === t).sort((a, b) => String(a[dim]).localeCompare(String(b[dim])))
        .map(r => ({ label: (allTenants ? names[r.tenant_id] + ", " : "") + String(r[dim]), value: r.value }));
    } else {
      rows = V.total.filter(r => allTenants || r.tenant_id === t).sort((a, b) => a.tenant_id.localeCompare(b.tenant_id))
        .map(r => ({ label: names[r.tenant_id], value: r.value }));
    }
    rows.forEach(r => r.display = fmt(r.value, m.format));
    return { plan: p, tenant: t, allTenants, label: m.label, definition: m.description, rows };
  }
  const api = { plan, answer, fmt };
  if (typeof module !== "undefined") module.exports = api; else root.C360Ask = api;
})(this);
