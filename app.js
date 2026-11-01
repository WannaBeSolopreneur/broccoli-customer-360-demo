(async function () {
  const D = await (await fetch("data.json")).json();
  const A = window.C360Ask, fmt = A.fmt;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = v => "$" + Math.round(v).toLocaleString("en-US");
  const bigMoney = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1e4 ? "$" + Math.round(v / 1e3) + "K" : money(v);
  const pct = v => (v * 100).toFixed(1) + "%";
  const secs = s => s < 120 ? Math.round(s) + " sec" : (s / 60).toFixed(1) + " min";
  const day = at => new Date(at.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // 1 and 2. Donna Silva, from the real records.
  const dn = D.donna, R = dn.records;
  const lead = R.find(r => r.source === "leads" && r.name !== dn.name);
  const job = R.find(r => r.source === "jobs" && r.at.slice(0, 10) === lead.at.slice(0, 10));
  const amt = r => Number((r.detail.match(/\$(\d+)/) || [0, 0])[1]);
  const inv = R.find(r => r.source === "invoices" && r.at > job.at && amt(r) === amt(job));
  const mark = (v, base) => v === base ? esc(v) : `<span class="diff">${esc(v)}</span>`;
  const card = (src, r, what) => `<div class="rec"><div class="src">${src}</div>
    <div class="nm">${mark(r.name, dn.name)}</div><div class="ph">${mark(r.phone, dn.phone)}</div>
    <div class="dt">${what}</div></div>`;
  $("messy").innerHTML =
    card("Web lead", lead, day(lead.at)) +
    card("Job", job, `${esc(job.detail.split(",")[0])}, ${money(amt(job))}`) +
    card("Invoice", inv, `${money(amt(inv))} paid`);
  const jobs = R.filter(r => r.source === "jobs" && /Completed/.test(r.detail));
  const jobTotal = jobs.reduce((a, r) => a + amt(r), 0);
  const p = dn.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
  const C = D.chain, mins = Math.round((new Date(C.call.started_at.replace(" ", "T")) - new Date(C.lead.received_at.replace(" ", "T"))) / 60000);
  $("merged").innerHTML = `<div class="merged">
    <div class="nm">${esc(dn.name)}</div><div class="sub">One customer. ${esc(p)}</div>
    <div class="flow">
      <div><b>1. Web lead</b><br>${day(C.lead.received_at)}</div>
      <div><b>2. AI calls back</b><br>${mins} minutes later and books</div>
      <div><b>3. Job done</b><br>${esc(job.detail.split(",")[0])}, ${money(C.job.rev)}</div>
      <div><b>4. Invoice paid</b><br>${day(inv.at)}, ${money(amt(inv))}</div>
    </div>
    <div class="money"><span class="badge">Attributed to Broccoli</span> ${money(amt(inv))}</div>
    <div class="sub">All her history: ${R.length} records, ${jobs.length} jobs, ${money(jobTotal)}</div></div>`;
  const sum = k => D.attr.reduce((s, r) => s + r[k], 0);
  const gap = Math.abs(sum("with_matching") - sum("truth")) / sum("truth") * 100;
  $("er-line").textContent = `Across ${D.er.records.toLocaleString("en-US")} records, ${(D.er.precision * 100).toFixed(0)}% of matches were correct. Attributed lead revenue lands within ${gap < 0.1 ? "0.1" : gap.toFixed(1)}% of the true answer.`;

  // 3. Demo
  const sel = $("tenant");
  sel.innerHTML = D.tenants.map(t => `<option value="${t.id}">${esc(t.name)}, ${esc(t.city)}</option>`).join("");
  const tot = (m, t) => (D.values[m].total.find(r => r.tenant_id === t) || {}).value;
  const name = t => D.tenants.find(x => x.id === t).name;
  const QS = ["How much booked revenue did Broccoli bring in July?", "How many missed calls did we have?",
    "How much did the AI book after hours?", "How many repeat customers were found only by matching?"];
  let q = null;
  function draw() {
    const t = sel.value, sb = D.speed_bench[t], lc = D.lead_compare.find(r => r.tenant_id === t), iso = D.isolation[t];
    $("iso").textContent = `You only see this contractor's data. Tested on ${iso.rows_seen.toLocaleString("en-US")} rows: ${iso.other_tenant_rows} from other contractors.`;
    const n = (v, l, c) => `<div class="num"><div class="v">${v}</div><div class="l">${l}</div>${c ? `<div class="c">${c}</div>` : ""}</div>`;
    const at = D.attr.find(r => r.tenant_id === t);
    $("nums").innerHTML =
      n(bigMoney(tot("booked_revenue", t)), "Revenue attributed to Broccoli AI", "Completed jobs the AI booked, last 12 months") +
      n(bigMoney(at.with_matching), "Lead revenue attributed with matching", `ID only finds ${bigMoney(at.id_only)}. True: ${bigMoney(at.truth)}`) +
      n(pct(lc.with_entity_resolution), "Leads that became jobs", `ID only: ${pct(lc.by_lead_id_only)}`) +
      n(secs(sb.my_value), "Time to reply to a new lead", `Typical contractor: ${secs(sb.peer_median)}`);
    answer();
  }
  function answer() {
    document.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c.dataset.q === q));
    if (!q) { $("answer").innerHTML = ""; return; }
    const a = A.answer(q, D, sel.value), r = a && a.rows[0];
    $("answer").innerHTML = r ? `<div class="a"><div class="v">${esc(r.display)}</div>${esc(a.label)} at ${esc(name(a.tenant))}${a.plan.month ? ", " + new Date(a.plan.month + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" }) : ""}</div>`
      : `<div class="a">No answer for that one.</div>`;
  }
  $("chips").innerHTML = QS.map(x => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join("");
  $("chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) { q = b.dataset.q; answer(); } });
  $("rule").textContent = "Rule: a lead gets credit for the first job the same customer books within 14 days. Only completed jobs count. AI revenue uses the job\u0027s booking source.";
  sel.addEventListener("change", draw);
  draw();

  // Technical tags. Numbers come from data.json.
  const R0 = D.run, E = D.er, f1 = (x, d) => (x * 100).toFixed(d) + "%";
  const tags = (id, list) => $(id).innerHTML = list.map(x => `<li>${esc(x)}</li>`).join("");
  tags("tags1", ["No shared key across sources", "Identity fragmentation", "Broken lead to revenue attribution", "5 sources: calls, web leads, jobs, invoices, tickets"]);
  tags("tags2", ["Entity resolution", "Exact + fuzzy SQL match rules", "Blocking on house number",
    "Jaro-Winkler + n-gram distance", "Household phone guard", `Connected components (label propagation, ${R0.er_rounds} rounds)`,
    "Golden record with stable customer_key", "Lead to job to invoice chain", `Precision ${f1(E.precision, 1)} / recall ${f1(E.recall, 1)} / F1 ${E.f1.toFixed(3)} on labeled ground truth`]);
  tags("tags3", ["Rule-based attribution, 14 day window, first job after the lead", "Validated against ground truth", "Multi-tenant ClickHouse", `Row-level security with row policies (${R0.policy_ok}/${R0.policy_checks} checks pass)`,
    `Semantic layer: metrics.yml, ${R0.metrics} governed metrics`, `Peer benchmarks with k-anonymity (min ${R0.min_tenants} tenants)`,
    "Questions map to metrics by keyword. No LLM."]);
  tags("stack", ["ClickHouse (chDB)", "Python", "SQL models: raw, staging, intermediate, marts", `dim_customer + ${R0.fact_tables} fact tables`,
    "Idempotent lead ingestion API (OpenAPI 3.1, dedupe on externalLeadId)",
    `${R0.quality_passed}/${R0.quality_total} data quality checks: freshness, not null, unique, accepted values, relationships, reconciliation`,
    `${R0.tests_passed} tests pass`, `Full rebuild in ${Math.round(R0.make_all_sec)} sec`, `${R0.raw_rows.toLocaleString("en-US")} synthetic rows, ${D.tenants.length} tenants`,
    "Code available on request"]);
})();
