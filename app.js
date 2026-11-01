(async function () {
  const D = await (await fetch("data.json")).json();
  const A = window.C360Ask, fmt = A.fmt;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NAMES = Object.fromEntries(D.tenants.map(t => [t.id, t.name]));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mlabel = m => { const [y, mo] = String(m).split("-"); return MONTHS[+mo - 1] + " " + y.slice(2); };
  const KPIS = ["speed_to_lead_median_sec", "call_answer_rate", "lead_to_booking_rate", "booked_revenue", "after_hours_booked_revenue",
    "missed_calls", "membership_renewal_rate", "revenue_per_customer", "leads_received", "repeat_customers_found_by_matching",
    "ticket_resolution_median_hours", "invoice_collection_rate"];
  const SHORT = { speed_to_lead_median_sec: "Speed to lead (median)", ticket_resolution_median_hours: "Support resolution time (median)" };
  let tenant = "tnt_alpine", trendMetric = "booked_revenue", custKey = null;
  const compact = (v, kind) => {
    const a = Math.abs(v), unit = kind === "currency" ? "$" : "";
    if (kind === "percent") return (v * 100).toFixed(0) + "%";
    if (a >= 1e6) return unit + (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return unit + (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
    return unit + (kind === "hours" ? v.toFixed(1) : Math.round(v));
  };
  const total = (m, t) => (D.values[m].total.find(r => r.tenant_id === t) || {}).value;
  const R = D.run, rc = R.row_counts;
  const rawRows = ["raw.calls", "raw.leads", "raw.jobs", "raw.invoices", "raw.tickets"].reduce((a, k) => a + rc[k], 0);

  // header facts
  const fact = (b, s) => `<div class="fact"><b>${b}</b><span>${s}</span></div>`;
  $("facts").innerHTML = fact("10", "contractors in 4 trades") + fact(rawRows.toLocaleString("en-US"), "raw rows over 12 months")
    + fact((D.er.precision * 100).toFixed(1) + "%", "matching precision") + fact((D.er.recall * 100).toFixed(1) + "%", "matching recall")
    + fact(Math.round(R.make_all_sec) + " sec", "to build and test it all");
  $("runfacts").innerHTML = fact(Math.round(R.make_all_sec) + " sec", "one command, start to finish")
    + fact(R.tests_passed, "tests passed") + fact(`${R.quality.passed} of ${R.quality.total}`, "data quality checks passed")
    + fact(`${R.policy_ok} of ${R.policy_checks}`, "isolation checks on ClickHouse " + R.server_version)
    + fact(rc["er.identity_records"].toLocaleString("en-US"), "records matched") + fact(Object.keys(D.metrics).length, "metric definitions");
  $("kmin").textContent = D.benchmark_min_tenants;

  // picker
  $("tenant").innerHTML = D.tenants.map(t => `<option value="${t.id}">${esc(t.name)} (${t.trade}, ${t.city})</option>`).join("");
  $("tenant").addEventListener("change", e => setTenant(e.target.value));

  function setTenant(t) {
    tenant = t; $("tenant").value = t; custKey = null; $("q-cust").value = "";
    const pc = D.policy_checks.filter(c => c.tenant === t);
    const rows = pc.reduce((a, c) => a + c.rows_seen, 0), other = pc.reduce((a, c) => a + c.other_tenant_rows, 0);
    $("isolation").innerHTML = `Everything below is only ${esc(NAMES[t])}. In the isolation test this login saw ${rows.toLocaleString("en-US")} of its own rows across ${pc.length} tables and <b>${other} rows from other contractors</b>.`;
    renderKpis(); renderTrend(); renderBench(); renderCustList(); renderLeads();
  }

  function benchFor(m) { return (D.benchmarks[tenant] || []).find(b => b.metric === m); }
  function renderKpis() {
    $("kpis").innerHTML = KPIS.map(m => {
      const M = D.metrics[m], v = total(m, tenant), b = benchFor(m);
      let p = "";
      if (b && b.peer_median !== null) {
        const better = (Number(b.my_value) > Number(b.peer_median)) === M.higher_is_better;
        p = `<div class="p">Peer median ${fmt(b.peer_median, M.format)} <span class="${better ? "up" : "down"}">${better ? "better" : "worse"}</span></div>`;
      }
      return `<button class="kpi${m === trendMetric ? " on" : ""}" data-m="${m}"><div class="l">${esc(SHORT[m] || M.label)}</div><div class="v">${fmt(v, M.format)}</div>${p}</button>`;
    }).join("");
    document.querySelectorAll(".kpi").forEach(b => b.addEventListener("click", () => { trendMetric = b.dataset.m; renderKpis(); renderTrend(); }));
  }

  function svgBars(items, kind, opts = {}) {
    const W = Math.max(320, opts.w || 1000), narrow = W < 640, H = narrow ? 260 : 340, L = narrow ? 44 : 64, B = narrow ? 40 : 46, T = 30;
    const fs = narrow ? 12 : 15;
    const vals = items.map(i => Number(i.value) || 0), max = Math.max(...vals) * 1.15 || 1;
    const bw = (W - L - 10) / items.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "chart")}">`;
    for (let g = 0; g <= 4; g++) {
      const y = T + (H - T - B) * (1 - g / 4);
      s += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="#E3EAF3"/><text x="${L - 8}" y="${y + 5}" text-anchor="end" font-size="${fs}" fill="#55657d">${compact(max * g / 4, kind)}</text>`;
    }
    items.forEach((it, i) => {
      const v = Number(it.value) || 0, h = (H - T - B) * v / max, x = L + i * bw + bw * 0.15, y = H - B - h;
      s += `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${h}" rx="5" fill="${i === items.length - 1 ? "#1B2A41" : "#A7C7E7"}"><title>${esc(it.label)}: ${fmt(v, kind)}</title></rect>`;
      s += `<text x="${x + bw * 0.35}" y="${H - B + 20}" text-anchor="middle" font-size="${fs}" fill="#1B2A41">${esc(narrow ? (i % 3 === 0 ? it.label : "") : it.label)}</text>`;
      if (narrow ? (i === items.length - 1) : (i % 2 === 0 || i === items.length - 1)) s += `<text x="${Math.min(x + bw * 0.35, W - 40)}" y="${y - 8}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#1B2A41">${narrow ? compact(v, kind) : fmt(v, kind)}</text>`;
    });
    return s + "</svg>";
  }
  function renderTrend() {
    const M = D.metrics[trendMetric];
    const rows = D.values[trendMetric].month.filter(r => r.tenant_id === tenant).sort((a, b) => String(a.month).localeCompare(String(b.month)));
    $("trend-title").textContent = `${SHORT[trendMetric] || M.label} by month`;
    $("trend-metric").textContent = trendMetric;
    $("trend").innerHTML = svgBars(rows.map(r => ({ label: mlabel(r.month), value: r.value })), M.format, { label: M.label + " by month", w: $("trend").clientWidth });
    $("trend-def").textContent = "Definition: " + M.description;
  }

  function renderBench() {
    const rows = D.benchmarks[tenant] || [];
    if (!rows.length) { $("bench").innerHTML = `<p class="empty">Not enough contractors in the peer group, so nothing is shown.</p>`; return; }
    let h = `<div class="legend"><span><i style="background:#A7C7E7"></i>middle half of peers (p25 to p75)</span><span><i style="background:#1B2A41;width:4px"></i>peer median</span><span><i style="background:#fff;border:3px solid #1B2A41;border-radius:50%;width:14px;height:14px"></i>${esc(NAMES[tenant])}</span></div>`;
    for (const b of rows) {
      const M = D.metrics[b.metric];
      const band = D.benchmark_bands.find(x => x.metric === b.metric);
      const pts = [b.my_value, b.peer_p25, b.peer_p75, b.peer_median].map(Number);
      let lo = Math.min(...pts), hi = Math.max(...pts); const pad = (hi - lo) * 0.25 || 1; lo -= pad; hi += pad;
      const pos = v => ((Number(v) - lo) / (hi - lo) * 100).toFixed(1) + "%";
      const better = (Number(b.my_value) > Number(b.peer_median)) === M.higher_is_better;
      h += `<div class="bench-row"><div class="name">${esc(SHORT[b.metric] || M.label)}<div class="def">${M.higher_is_better ? "Higher is better" : "Lower is better"}</div></div>
        <div class="band"><div class="iqr" style="left:${pos(b.peer_p25)};width:calc(${pos(b.peer_p75)} - ${pos(b.peer_p25)})"></div><div class="med" style="left:${pos(b.peer_median)}"></div><div class="me" style="left:${pos(b.my_value)}" title="${fmt(b.my_value, M.format)}"></div></div>
        <div class="nums"><b>${fmt(b.my_value, M.format)}</b> <span class="${better ? "up" : "down"}">${better ? "better" : "worse"}</span><br>median ${fmt(b.peer_median, M.format)}, ${b.n_tenants} contractors</div></div>`;
    }
    $("bench").innerHTML = h;
  }

  // entity resolution
  const er = D.er;
  const sc = (b, s) => `<div class="score"><b>${b}</b><span>${s}</span></div>`;
  $("scores").innerHTML = sc((er.precision * 100).toFixed(1) + "%", "Precision. When two records are joined, how often they really are one person.")
    + sc((er.recall * 100).toFixed(1) + "%", "Recall. How many true pairs it found.") + sc((er.f1 * 100).toFixed(1) + "%", "F1. Both in one number.")
    + sc(er.people_fully_resolved_pct + "%", `of ${er.true_people.toLocaleString("en-US")} people end up as exactly one customer`)
    + sc(er.cross_tenant_key_leaks, "customers that span two contractors");
  $("ablation").innerHTML = `<p class="def">Scored against the generator's hidden truth, across ${er.records.toLocaleString("en-US")} records. Each row adds rules to the one above.</p><table><tr><th>Rules</th><th class="n">Precision</th><th class="n">Recall</th><th class="n">F1</th></tr>`
    + D.ablation.map(a => `<tr><td>${esc(a.rules)}</td><td class="n">${(a.precision * 100).toFixed(1)}%</td><td class="n">${(a.recall * 100).toFixed(1)}%</td><td class="n">${(a.f1 * 100).toFixed(1)}%</td></tr>`).join("") + "</table>";

  function renderCustList() {
    const q = $("q-cust").value.trim().toLowerCase();
    const list = D.customers.filter(c => c.tenant_id === tenant && (!q || c.name.toLowerCase().includes(q) || c.records.some(r => (r.name || "").toLowerCase().includes(q))));
    if (!custKey || !list.find(c => c.key === custKey)) custKey = (list.find(c => c.key === D.featured_customer) || list[0] || {}).key || null;
    $("cust-list").innerHTML = list.length ? list.slice(0, 30).map(c => `<button class="chip${c.key === custKey ? " on" : ""}" data-k="${c.key}">${esc(c.name)} · ${c.records.length} records</button>`).join("")
      : `<p class="empty">No customer by that name in this sample of ${esc(NAMES[tenant])}. Search only looks inside the contractor you picked.</p>`;
    document.querySelectorAll("#cust-list .chip").forEach(b => b.addEventListener("click", () => { custKey = b.dataset.k; renderCustList(); }));
    renderCust();
  }
  $("q-cust").addEventListener("input", renderCustList);

  function renderCust() {
    const c = D.customers.find(x => x.key === custKey);
    if (!c) { $("cust").innerHTML = ""; return; }
    const names = new Set(c.records.map(r => r.name).filter(Boolean)), phones = new Set(c.records.map(r => r.phone).filter(Boolean));
    const emails = new Set(c.records.map(r => r.email).filter(Boolean)), srcs = new Set(c.records.map(r => r.source));
    const truth = c.true_people === 1
      ? `<div class="truth ok">Hidden truth: these ${c.records.length} records are 1 real person. Matching got it right.</div>`
      : `<div class="truth no">Hidden truth: these records are ${c.true_people} different people. This is one of the ${er.customers_mixing_people} customers where matching joined people it should not have. Red edges mark the second person.</div>`;
    const recs = c.records.map(r => `<div class="rec${r.person > 1 ? " p2" : ""}"><div class="top"><span class="src">${r.source}</span><span class="when">${r.at.replace(" ", " at ")}</span></div>
      <div class="who">${r.name ? esc(r.name) : '<span class="empty">no name</span>'}</div>
      <div class="meta">${esc(r.phone)}${r.email ? "<br>" + esc(r.email) : ""}${r.street ? "<br>" + esc(r.street) : ""}</div>
      ${r.detail ? `<div class="det">${esc(r.detail)}</div>` : ""}</div>`).join("");
    const tl = c.records.map(r => `<li><b>${r.at.slice(0, 10)}</b> ${r.source}: ${esc(r.detail || "")}</li>`).join("");
    $("cust").innerHTML = truth + `<div class="merge"><div><h3>${c.records.length} raw records</h3><p class="def">${names.size} ways to write the name, ${phones.size} phone formats, ${emails.size} email spellings, ${srcs.size} source systems.</p><div class="recs">${recs}</div></div>
      <div class="arrow" aria-hidden="true">→</div>
      <div><div class="golden"><h4>${esc(c.name)}</h4><div class="k">${c.key}</div>
      <dl><dt>Phone</dt><dd>${esc(c.phone)}</dd><dt>Email</dt><dd>${esc(c.email)}</dd><dt>Address</dt><dd>${esc(c.street)} ${esc(c.zip)}</dd>
      <dt>Completed jobs</dt><dd>${c.completed_jobs}${c.completed_jobs >= 2 && c.max_jobs_one_st_id < 2 ? " (a repeat customer the field service system misses)" : ""}</dd><dt>First seen</dt><dd>${c.first_seen}</dd><dt>Last seen</dt><dd>${c.last_seen}</dd></dl>
      <b>Timeline</b><ul class="timeline">${tl}</ul></div></div></div>`;
  }

  // leads
  function renderLeads() {
    const L = D.lead_compare, tot = L.reduce((a, x) => a + x.leads, 0);
    const ido = L.reduce((a, x) => a + x.leads * x.by_lead_id_only, 0) / tot, mat = L.reduce((a, x) => a + x.leads * x.with_entity_resolution, 0) / tot;
    const me = L.find(x => x.tenant_id === tenant);
    $("lead-big").innerHTML = `<div><span>${esc(NAMES[tenant])}, id only</span><b>${(me.by_lead_id_only * 100).toFixed(1)}%</b></div><div class="m"><span>${esc(NAMES[tenant])}, matched</span><b>${(me.with_entity_resolution * 100).toFixed(1)}%</b></div>`
      + `<div><span>All ${tot.toLocaleString("en-US")} leads</span><b style="font-size:26px">${(ido * 100).toFixed(1)}% → ${(mat * 100).toFixed(1)}%</b><span>True rate ${(me.ground_truth * 100).toFixed(1)}% here</span></div>`;
    const rows = [...L].sort((a, b) => b.with_entity_resolution - a.with_entity_resolution);
    const W = Math.max(320, $("lead-chart").clientWidth || 1000), narrow = W < 640;
    const rh = narrow ? 62 : 46, top = narrow ? 18 : 0, H = rows.length * rh + 40, x0 = narrow ? 0 : 260, sc = (W - x0 - 70) / 0.6;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lead to booking rate, id only vs matched"><text x="${x0}" y="18" font-size="15" fill="#55657d">■ id only</text><text x="${x0 + 100}" y="18" font-size="15" fill="#1B2A41">■ matched</text>`;
    rows.forEach((r, i) => {
      const y = 34 + i * rh + top, on = r.tenant_id === tenant;
      s += narrow ? `<text x="0" y="${y - 4}" font-size="15" font-weight="${on ? 800 : 400}" fill="#1B2A41">${esc(NAMES[r.tenant_id])}</text>`
        : `<text x="${x0 - 12}" y="${y + 24}" text-anchor="end" font-size="17" font-weight="${on ? 800 : 400}" fill="#1B2A41">${esc(NAMES[r.tenant_id])}</text>`;
      s += `<rect x="${x0}" y="${y + 2}" width="${sc * r.with_entity_resolution}" height="18" rx="4" fill="${on ? "#1B2A41" : "#A7C7E7"}"/><text x="${x0 + sc * r.with_entity_resolution + 8}" y="${y + 17}" font-size="15" font-weight="700" fill="#1B2A41">${(r.with_entity_resolution * 100).toFixed(1)}%</text>`;
      s += `<rect x="${x0}" y="${y + 22}" width="${sc * r.by_lead_id_only}" height="14" rx="4" fill="#9AA9BD"/><text x="${x0 + sc * r.by_lead_id_only + 8}" y="${y + 34}" font-size="13" fill="#55657d">${(r.by_lead_id_only * 100).toFixed(1)}%</text>`;
    });
    $("lead-chart").innerHTML = s + "</svg>";
  }

  // ask
  $("ask-chips").innerHTML = D.sample_questions.map(q => `<button class="chip" type="button">${esc(q)}</button>`).join("");
  document.querySelectorAll("#ask-chips .chip").forEach(b => b.addEventListener("click", () => { $("ask-q").value = b.textContent; ask(b.textContent); }));
  $("ask-form").addEventListener("submit", e => { e.preventDefault(); ask($("ask-q").value); });
  function ask(q) {
    if (!q.trim()) return;
    const a = A.answer(q, D, tenant);
    if (!a) { $("ask-out").innerHTML = `<div class="answer"><p>I could not match that to a metric. Try words like leads, missed calls, revenue, renewal or speed to lead.</p></div>`; return; }
    if (a.tenant && a.tenant !== tenant) setTenant(a.tenant);
    const who = a.allTenants ? "All contractors (Broccoli staff view)" : NAMES[a.tenant];
    const one = a.rows.length === 1;
    const body = !a.rows.length ? `<p class="empty">No rows for this question.</p>` : one ? `<div class="val">${a.rows[0].display}</div>`
      : `<table>${a.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="n"><b>${r.display}</b></td></tr>`).join("")}</table>`;
    const p = a.plan, parts = [];
    if (p.month && !p.by.includes("month")) parts.push("month " + mlabel(p.month));
    if (p.by.length) parts.push("broken down by " + p.by.join(", ").replace(/_/g, " "));
    $("ask-out").innerHTML = `<div class="answer"><div class="q">${esc(q)}</div><p class="def">${esc(who)}${parts.length ? ", " + parts.join(", ") : ""}</p>${body}
      <div class="why">Metric used: <code>${p.metric}</code> (${esc(a.label)})<br>Definition from metrics.yml: ${esc(a.definition)}</div></div>`;
  }

  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { renderTrend(); renderLeads(); }, 150); });
  setTenant(tenant);
  ask(D.sample_questions[0]);
})();
